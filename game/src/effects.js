// effects.js — everything that flashes, flies or fades: tracer lines,
// impact sparks, muzzle flashes, explosions and smoke. All pools are fixed
// size and allocated once; the update never creates an object. The pools
// live on the effects object the main loop owns.

import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 300;
const MAX_FLASHES = 8;

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,220,150,0.7)');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function puffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 16 + Math.random() * 32;
    const y = 16 + Math.random() * 32;
    const r = 8 + Math.random() * 12;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(200,200,205,0.5)');
    g.addColorStop(1, 'rgba(200,200,205,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createEffects(scene, camera) {
  const glow = glowTexture();
  const puff = puffTexture();

  // Tracer pool: lines with two points each.
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  // One Points cloud for every spark and puff of debris.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
    pPos[i * 3 + 1] = -100; // park unused particles underground
  }

  // Muzzle flash sprites (world-space, for bots) plus the player's own
  // flash light on the camera.
  const flashes = [];
  for (let i = 0; i < MAX_FLASHES; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glow, color: 0xffc46b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.55, 0.55, 1);
    spr.visible = false;
    scene.add(spr);
    flashes.push({ spr, life: 0 });
  }
  const flashLight = new THREE.PointLight(0xffb347, 0, 9, 2);
  camera.add(flashLight);
  flashLight.position.set(0.2, -0.15, -0.5);

  // Explosion: one reusable sphere + light.
  const boomMat = new THREE.MeshBasicMaterial({
    color: 0xff8a2a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7a20, 0, 40, 1.6);
  scene.add(boomLight);

  return {
    scene, camera, tracers, points, pPos, pCol, particles, pGeo,
    flashes, flashLight, boom, boomMat, boomLight, puff,
    tracerCursor: 0, particleCursor: 0, flashCursor: 0,
    boomLife: 0, shake: 0,
    smokeGroups: [], // {group, until}
  };
}

function spawnTracer(fx, from, to) {
  const t = fx.tracers[fx.tracerCursor];
  fx.tracerCursor = (fx.tracerCursor + 1) % MAX_TRACERS;
  const pos = t.line.geometry.attributes.position.array;
  pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
  pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.visible = true;
  t.line.material.opacity = 0.9;
  t.life = 0.07;
}

function spawnBurst(fx, x, y, z, r, g, b, count, speed, life) {
  for (let n = 0; n < count; n++) {
    const i = fx.particleCursor;
    fx.particleCursor = (fx.particleCursor + 1) % MAX_PARTICLES;
    const p = fx.particles[i];
    p.life = life * (0.6 + Math.random() * 0.7);
    p.maxLife = p.life;
    p.r = r; p.g = g; p.b = b;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = speed * (0.4 + Math.random() * 0.8);
    p.vx = Math.sin(ph) * Math.cos(th) * sp;
    p.vy = Math.abs(Math.cos(ph)) * sp * 0.9 + 1;
    p.vz = Math.sin(ph) * Math.sin(th) * sp;
    fx.pPos[i * 3] = x;
    fx.pPos[i * 3 + 1] = y;
    fx.pPos[i * 3 + 2] = z;
  }
}

function spawnFlash(fx, x, y, z) {
  const f = fx.flashes[fx.flashCursor];
  fx.flashCursor = (fx.flashCursor + 1) % MAX_FLASHES;
  f.spr.position.set(x, y, z);
  f.spr.visible = true;
  f.spr.material.opacity = 0.95;
  f.spr.material.rotation = Math.random() * Math.PI;
  f.life = 0.05;
}

function spawnSmoke(fx, x, z, until) {
  const group = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fx.puff, transparent: true, opacity: 0.55, depthWrite: false,
      color: 0xbfc3c9,
    });
    const spr = new THREE.Sprite(mat);
    const a = (i / 9) * Math.PI * 2;
    const r = 0.6 + Math.random() * 2.4;
    spr.position.set(x + Math.cos(a) * r, 0.8 + Math.random() * 1.6, z + Math.sin(a) * r);
    const s = 3 + Math.random() * 2.5;
    spr.scale.set(s, s, 1);
    group.add(spr);
  }
  fx.scene.add(group);
  fx.smokeGroups.push({ group, until });
}

// Consume the frame's events, then animate every pool by dt.
export function updateEffects(fx, state, dt, events) {
  for (const e of events) {
    if (e.type === 'tracer') spawnTracer(fx, e.from, e.to);
    else if (e.type === 'impact') spawnBurst(fx, e.x, e.y, e.z, 1, 0.85, 0.5, 6, 2.5, 0.3);
    else if (e.type === 'hit') spawnBurst(fx, e.victim.x, e.victim.y + 1.2, e.victim.z, 0.8, 0.1, 0.1, 8, 2, 0.35);
    else if (e.type === 'muzzle') {
      const f = e.fighter;
      if (f.isPlayer) {
        fx.flashLight.intensity = 14;
      } else {
        const cp = Math.cos(f.pitch);
        spawnFlash(
          fx,
          f.x - Math.sin(f.yaw) * cp * 0.7,
          f.y + (f.crouch ? 1.12 : 1.62) - 0.15 + Math.sin(f.pitch) * 0.7,
          f.z - Math.cos(f.yaw) * cp * 0.7,
        );
      }
    } else if (e.type === 'explosion') {
      fx.boom.position.set(e.x, e.y + 0.5, e.z);
      fx.boomLight.position.set(e.x, e.y + 2, e.z);
      fx.boom.visible = true;
      fx.boomLife = 0.6;
      fx.shake = Math.max(fx.shake, 0.5);
      spawnBurst(fx, e.x, e.y, e.z, 1, 0.6, 0.2, 40, 7, 0.7);
    } else if (e.type === 'bombExploded') {
      fx.boom.position.set(state.bomb.x, 1, state.bomb.z);
      fx.boomLight.position.set(state.bomb.x, 3, state.bomb.z);
      fx.boom.visible = true;
      fx.boomLife = 1.2;
      fx.shake = 1;
      spawnBurst(fx, state.bomb.x, 1, state.bomb.z, 1, 0.55, 0.15, 60, 9, 1);
    } else if (e.type === 'smoke') {
      spawnSmoke(fx, e.x, e.z, state.time + 9);
    }
  }

  for (const t of fx.tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
    else t.line.material.opacity = (t.life / 0.07) * 0.9;
  }
  for (const f of fx.flashes) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) f.spr.visible = false;
    else f.spr.material.opacity = (f.life / 0.05) * 0.95;
  }
  fx.flashLight.intensity = Math.max(0, fx.flashLight.intensity - dt * 220);

  // Particles: integrate, fade by darkening (additive blending reads black
  // as transparent), park the dead underground.
  let anyAlive = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = fx.particles[i];
    if (p.life <= 0) continue;
    anyAlive = true;
    p.life -= dt;
    if (p.life <= 0) {
      fx.pPos[i * 3 + 1] = -100;
      fx.pCol[i * 3] = 0; fx.pCol[i * 3 + 1] = 0; fx.pCol[i * 3 + 2] = 0;
      continue;
    }
    p.vy -= 9 * dt;
    fx.pPos[i * 3] += p.vx * dt;
    fx.pPos[i * 3 + 1] += p.vy * dt;
    fx.pPos[i * 3 + 2] += p.vz * dt;
    if (fx.pPos[i * 3 + 1] < 0.03) fx.pPos[i * 3 + 1] = 0.03;
    const k = p.life / p.maxLife;
    fx.pCol[i * 3] = p.r * k;
    fx.pCol[i * 3 + 1] = p.g * k;
    fx.pCol[i * 3 + 2] = p.b * k;
  }
  if (anyAlive) {
    fx.pGeo.attributes.position.needsUpdate = true;
    fx.pGeo.attributes.color.needsUpdate = true;
  }

  if (fx.boomLife > 0) {
    fx.boomLife -= dt;
    const k = Math.max(0, fx.boomLife / 1.2);
    const s = 1 + (1 - k) * 9;
    fx.boom.scale.set(s, s, s);
    fx.boomMat.opacity = k * 0.85;
    fx.boomLight.intensity = k * 300;
    if (fx.boomLife <= 0) {
      fx.boom.visible = false;
      fx.boomLight.intensity = 0;
    }
  }
  fx.shake = Math.max(0, fx.shake - dt * 1.4);

  for (let i = fx.smokeGroups.length - 1; i >= 0; i--) {
    const s = fx.smokeGroups[i];
    const remain = s.until - state.time;
    if (remain <= 0) {
      fx.scene.remove(s.group);
      fx.smokeGroups.splice(i, 1);
      continue;
    }
    for (const spr of s.group.children) {
      spr.material.opacity = Math.min(0.55, remain * 0.12);
      spr.material.rotation += dt * 0.05;
    }
  }
}
