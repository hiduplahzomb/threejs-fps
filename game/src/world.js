// world.js — the Three.js scene: the map built from mapdata's boxes, the
// night sky, the bot bodies and the player's viewmodel gun. Meshes are a
// view of the state: syncFighters copies fighter positions onto the bot
// groups once per frame, and nothing here writes back into the state.

import * as THREE from 'three';
import { BOXES, LIGHTS, SITES } from './mapdata.js';
import { COLORS, makeTextures, makeMaterials, makeGeometries, siteLetterTexture } from './palette.js';

function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = '#e9e6df';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.009);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera); // the camera carries the viewmodel and the flash light

  // Moonlight (the only shadow caster) + a cold hemisphere fill.
  const hemi = new THREE.HemisphereLight(0x2a3b5c, 0x1a1512, 0.75);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(COLORS.moon, 0.55);
  moon.position.set(30, 45, -25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -55;
  moon.shadow.camera.right = 55;
  moon.shadow.camera.top = 55;
  moon.shadow.camera.bottom = -55;
  moon.shadow.camera.far = 120;
  moon.shadow.bias = -0.0004;
  scene.add(moon);

  const tex = makeTextures();
  const mat = makeMaterials(tex);
  const geo = makeGeometries();

  buildGround(scene, mat, geo);
  buildBoxes(scene, mat, geo);
  buildDecor(scene, mat, geo);
  for (const l of LIGHTS) {
    const light = new THREE.PointLight(l.color, l.intensity, l.distance, 1.8);
    light.position.set(l.x, l.y, l.z);
    scene.add(light);
  }

  const viewmodel = buildViewmodel(mat, geo);
  camera.add(viewmodel);
  // A short-range lamp riding with the camera: it keeps the viewmodel gun
  // readable at night and lifts the ground right in front of the player.
  const lamp = new THREE.PointLight(0xffe0b3, 2.0, 4.5, 2);
  lamp.position.set(0.3, 0.2, 0);
  camera.add(lamp);

  const bomb = buildBomb(mat, geo);
  scene.add(bomb.group);

  const world = {
    renderer, scene, camera, mat, geo,
    viewmodel, bomb,
    botMeshes: new Map(),
    clock: new THREE.Timer(),
  };
  world.clock.connect(document);
  return world;
}

function buildGround(scene, mat, geo) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(94, 66), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  // Dark apron beyond the walls so the eye never finds the void.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.06, 0);
  scene.add(apron);
  // The reservoir beyond the north parapet, and the hills behind it.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), mat.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -4, -92);
  scene.add(water);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x141c2a, roughness: 1 });
  for (const [x, z, r, h] of [[-70, -80, 40, 26], [-10, -95, 55, 34], [60, -85, 45, 28], [110, -70, 35, 20]]) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat);
    hill.position.set(x, h / 2 - 4, z);
    scene.add(hill);
  }
  // Stars.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.15 + Math.random() * 1.2;
    const r = 220;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8ee, size: 0.7, sizeAttenuation: false, fog: false,
  }));
  scene.add(stars);
  // The moon: a pale disc high in the north.
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false }),
  );
  moonDisc.position.set(40, 90, -180);
  moonDisc.lookAt(0, 0, 0);
  scene.add(moonDisc);
}

function boxMesh(geo, mat, kind, b) {
  const mesh = new THREE.Mesh(geo.box, mat[kind] ?? mat.concrete);
  mesh.scale.set(b.w, b.h, b.d);
  mesh.position.set(b.x, (b.y0 ?? 0) + b.h / 2, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBoxes(scene, mat, geo) {
  for (const b of BOXES) {
    if (b.kind === 'turbine') {
      const body = new THREE.Mesh(geo.cylinder, mat.steel);
      body.scale.set(3, b.h, 3);
      body.position.set(b.x, b.h / 2, b.z);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);
      const cap = new THREE.Mesh(geo.box, mat.rust);
      cap.scale.set(1.2, 0.3, 1.2);
      cap.position.set(b.x, b.h + 0.15, b.z);
      cap.castShadow = true;
      scene.add(cap);
      continue;
    }
    scene.add(boxMesh(geo, mat, b.kind, b));
  }

  // Painted site letters on the floor, and hazard strips at the doors.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: siteLetterTexture(key), transparent: true, depthWrite: false,
      }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.center.x, 0.02, site.center.z);
    scene.add(decal);
  }
  const hazardSpots = [
    { x: -28, z: -13.6, w: 4 }, { x: -39.4, z: -20, w: 4, rot: true },
    { x: 30, z: -11.6, w: 4 },
  ];
  for (const h of hazardSpots) {
    const strip = new THREE.Mesh(geo.box, mat.hazard);
    strip.scale.set(h.rot ? 0.5 : h.w, 0.04, h.rot ? h.w : 0.5);
    strip.position.set(h.x, 0.02, h.z);
    scene.add(strip);
  }

  // Signs: the map names itself.
  const signs = [
    { text: 'TURBINE HALL', x: -28, y: 3.6, z: -13.9, ry: 0 },
    { text: 'GATEHOUSE', x: 33.6, y: 3.2, z: -20, ry: Math.PI / 2 },
    { text: 'BLACKWATER DAM', x: 0, y: 6.4, z: -0.8, ry: 0 },
  ];
  for (const s of signs) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.1),
      new THREE.MeshBasicMaterial({ map: signTexture(s.text) }),
    );
    sign.position.set(s.x, s.y, s.z);
    sign.rotation.y = s.ry;
    scene.add(sign);
  }
}

function buildDecor(scene, mat, geo) {
  // Floodlight poles at the outdoor lights.
  for (const l of LIGHTS) {
    if (l.y < 5) continue; // interior lights hang from the ceiling instead
    const pole = new THREE.Mesh(geo.cylinder, mat.steel);
    pole.scale.set(0.25, l.y, 0.25);
    pole.position.set(l.x, l.y / 2, l.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(geo.box, mat.lamp);
    head.scale.set(0.9, 0.25, 0.4);
    head.position.set(l.x, l.y, l.z);
    scene.add(head);
  }
  // Interior lamp bars.
  for (const l of LIGHTS) {
    if (l.y >= 5) continue;
    const bar = new THREE.Mesh(geo.box, mat.lampCool);
    bar.scale.set(2.2, 0.12, 0.3);
    bar.position.set(l.x, l.y, l.z);
    scene.add(bar);
  }
  // Pipes along the west wall.
  for (const [y, m] of [[2.0, 'steel'], [2.5, 'rust'], [3.0, 'steel']]) {
    const pipe = new THREE.Mesh(geo.cylinder, mat[m]);
    pipe.scale.set(0.35, 40, 0.35);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(-44.6, y, 0);
    scene.add(pipe);
  }
  // Tower cranes beyond the walls: silhouettes, no colliders.
  for (const [x, z, ry] of [[48, -10, 0.4], [-48, 12, -0.5]]) {
    const group = new THREE.Group();
    const mast = new THREE.Mesh(geo.box, mat.rust);
    mast.scale.set(1.2, 18, 1.2);
    mast.position.y = 9;
    group.add(mast);
    const jib = new THREE.Mesh(geo.box, mat.rust);
    jib.scale.set(16, 0.8, 0.8);
    jib.position.set(4, 17.5, 0);
    group.add(jib);
    const hook = new THREE.Mesh(geo.box, mat.steel);
    hook.scale.set(0.5, 3, 0.5);
    hook.position.set(10, 15.5, 0);
    group.add(hook);
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    scene.add(group);
  }
}

// The gun in the player's hands, built from boxes. It hangs off the camera;
// player.js animates it (bob, kick, reload dip, aim).
function buildViewmodel(mat, geo) {
  const gun = new THREE.Group();
  const add = (m, w, h, d, x, y, z) => {
    const part = new THREE.Mesh(geo.box, m);
    part.scale.set(w, h, d);
    part.position.set(x, y, z);
    gun.add(part);
    return part;
  };
  add(mat.gunMetal, 0.09, 0.12, 0.55, 0, 0, -0.1); // receiver
  add(mat.gunMetal, 0.05, 0.05, 0.35, 0, 0.02, -0.5); // barrel
  add(mat.gunAccent, 0.07, 0.18, 0.1, 0, -0.13, -0.05); // magazine
  add(mat.gunAccent, 0.08, 0.14, 0.22, 0, -0.02, 0.22); // stock
  add(mat.gunAccent, 0.03, 0.06, 0.08, 0, 0.09, -0.15); // sight
  gun.position.set(0.22, -0.21, -0.45);
  return gun;
}

function buildBomb(mat, geo) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo.box, mat.gunMetal);
  body.scale.set(0.42, 0.25, 0.3);
  body.position.y = 0.13;
  body.castShadow = true;
  group.add(body);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x220000, emissive: 0xff2200, emissiveIntensity: 2,
  });
  const lamp = new THREE.Mesh(geo.sphere, lampMat);
  lamp.scale.set(0.12, 0.12, 0.12);
  lamp.position.set(0, 0.3, 0);
  group.add(lamp);
  group.visible = false;
  return { group, lampMat };
}

// One bot body: boxes for legs, torso, head and gun, team-coloured chest.
// Built facing -z, so group.rotation.y = fighter yaw faces it correctly.
function buildBotBody(mat, geo, team) {
  const group = new THREE.Group();
  const chest = team === 'raider' ? mat.raider : mat.sentinel;
  const legGeo = geo.box;
  const legL = new THREE.Mesh(legGeo, mat.botDark);
  legL.scale.set(0.16, 0.8, 0.2);
  legL.position.set(-0.11, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, mat.botDark);
  legR.scale.set(0.16, 0.8, 0.2);
  legR.position.set(0.11, 0.4, 0);
  // Legs pivot at the hip: wrap each in a group at hip height.
  const hipL = new THREE.Group();
  hipL.position.set(-0.11, 0.82, 0);
  legL.position.set(0, -0.4, 0);
  hipL.add(legL);
  const hipR = new THREE.Group();
  hipR.position.set(0.11, 0.82, 0);
  legR.position.set(0, -0.4, 0);
  hipR.add(legR);
  const torso = new THREE.Mesh(geo.box, chest);
  torso.scale.set(0.52, 0.62, 0.3);
  torso.position.set(0, 1.13, 0);
  const head = new THREE.Mesh(geo.box, mat.botDark);
  head.scale.set(0.3, 0.28, 0.3);
  head.position.set(0, 1.6, 0);
  const visor = new THREE.Mesh(geo.box, mat.botVisor);
  visor.scale.set(0.24, 0.08, 0.02);
  visor.position.set(0, 1.62, -0.16);
  const gun = new THREE.Mesh(geo.box, mat.gunMetal);
  gun.scale.set(0.07, 0.1, 0.62);
  gun.position.set(0.14, 1.28, -0.32);
  for (const m of [legL, legR, torso, head, gun]) {
    m.castShadow = true;
  }
  group.add(hipL, hipR, torso, head, visor, gun);
  return { group, hipL, hipR, walkPhase: Math.random() * 6, deathAt: 0 };
}

export function syncFighters(world, state, dt) {
  for (const f of state.fighters) {
    if (f.isPlayer) continue;
    let entry = world.botMeshes.get(f.id);
    if (!entry) {
      entry = buildBotBody(world.mat, world.geo, f.team);
      world.botMeshes.set(f.id, entry);
      world.scene.add(entry.group);
    }
    const { group } = entry;
    if (!f.alive && entry.deathAt === 0 && state.phase !== 'menu') {
      entry.deathAt = state.time;
    }
    if (f.alive) {
      entry.deathAt = 0;
      group.visible = true;
      group.position.set(f.x, f.y, f.z);
      group.rotation.set(0, f.yaw, 0);
      // Walk cycle: legs swing with speed, torso bobs a touch.
      const speed = Math.hypot(f.vx, f.vz);
      entry.walkPhase += dt * speed * 2.2;
      const swing = Math.min(0.55, speed * 0.12) * Math.sin(entry.walkPhase);
      entry.hipL.rotation.x = swing;
      entry.hipR.rotation.x = -swing;
      group.position.y = f.y + Math.abs(Math.sin(entry.walkPhase)) * 0.02;
    } else if (entry.deathAt > 0) {
      // Fall flat, then sink away after a few seconds.
      const t = state.time - entry.deathAt;
      group.rotation.x = Math.max(-Math.PI / 2, group.rotation.x - dt * 6);
      if (t > 4) group.position.y -= dt * 0.4;
      if (t > 5.5) group.visible = false;
    } else {
      group.visible = false; // sitting this round out
    }
  }
}

export function syncBomb(world, state) {
  const bomb = state.bomb;
  const { group, lampMat } = world.bomb;
  if (bomb.state === 'dropped' || bomb.state === 'planted') {
    group.visible = true;
    group.position.set(bomb.x, 0, bomb.z);
    const urgent = bomb.state === 'planted' && bomb.fuse < 10;
    const blink = Math.sin(state.time * (urgent ? 18 : 7)) > 0;
    lampMat.emissiveIntensity = blink ? 3 : 0.2;
  } else {
    group.visible = false;
  }
}

// The menu's slow orbit over the dam, so the title screen shows the map.
export function menuCamera(camera, time) {
  const a = time * 0.05;
  camera.position.set(Math.sin(a) * 34, 16, Math.cos(a) * 34);
  camera.lookAt(0, 0, -4);
  if (Math.abs(camera.fov - 60) > 0.1) {
    camera.fov = 60;
    camera.updateProjectionMatrix();
  }
}
