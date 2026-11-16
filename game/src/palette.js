// palette.js — the game's look in one place: colours, shared materials and
// procedural canvas textures. Nothing here loads a file: every texture is
// drawn at runtime, so the game makes no network request. Materials and
// geometries are created once and shared by every mesh that uses them.

import * as THREE from 'three';

// Night on a dam: cold blue concrete, amber sodium light, rust accents.
// Attackers (Raiders) read orange, defenders (Sentinels) read teal.
export const COLORS = {
  sky: 0x2b3d5c,
  fog: 0x1e2a3d,
  ground: 0x232830,
  concrete: 0x8a8f96,
  concreteDark: 0x565b63,
  wall: 0x6d7278,
  rust: 0xa8542c,
  amber: 0xffb347,
  sodium: 0xff9a3c,
  moon: 0x9db8e8,
  teal: 0x2fb8a6,
  orange: 0xe8641c,
  crate: 0x7a5c38,
  crateDark: 0x5d4630,
  containerBlue: 0x2e5f8a,
  containerGreen: 0x3d7a4e,
  containerRed: 0x8a3a2e,
  water: 0x0a2030,
  hazardYellow: 0xd8a928,
  hazardBlack: 0x141414,
};

// One canvas texture per surface type, drawn once and reused.
function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, base, flecks, n = 900) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = flecks[i % flecks.length];
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const asphalt = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#4a5058', ['#3e434b', '#565c66', '#34383f']);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const y = Math.random() * s;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 14, s * 0.6, y - 14, s, y + 6);
      ctx.stroke();
    }
  }, 24, 16);

  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#6d7278', ['#5d6268', '#7d8288', '#4e5359']);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  }, 6, 2);

  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d8a928';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#141414';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, s);
      ctx.lineTo(i + 16, s);
      ctx.lineTo(i + 16 + s, 0);
      ctx.lineTo(i + s, 0);
      ctx.fill();
    }
  }, 4, 1);

  const container = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, 0, 4, s);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 4, 0, 3, s);
    }
    speckle(ctx, s, 'rgba(0,0,0,0)', ['rgba(0,0,0,0.25)'], 300);
  }, 3, 1);

  return { asphalt, concrete, hazard, container };
}

// Ground decal: a big painted site letter ("A" / "B") on the floor.
export function siteLetterTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,179,71,0.9)';
  ctx.lineWidth = 14;
  ctx.strokeRect(18, 18, 220, 220);
  ctx.fillStyle = 'rgba(255,179,71,0.95)';
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 136);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Shared materials, built once from the textures above.
export function makeMaterials(tex) {
  return {
    ground: new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95, metalness: 0.0 }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9, metalness: 0.05 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: COLORS.concreteDark, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ map: tex.concrete, color: 0xbfc3c7, roughness: 0.9 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8 }),
    crate: new THREE.MeshStandardMaterial({ color: COLORS.crate, roughness: 0.85 }),
    crateDark: new THREE.MeshStandardMaterial({ color: COLORS.crateDark, roughness: 0.9 }),
    containerBlue: new THREE.MeshStandardMaterial({ map: tex.container, color: COLORS.containerBlue, roughness: 0.6, metalness: 0.35 }),
    containerGreen: new THREE.MeshStandardMaterial({ map: tex.container, color: COLORS.containerGreen, roughness: 0.6, metalness: 0.35 }),
    containerRed: new THREE.MeshStandardMaterial({ map: tex.container, color: COLORS.containerRed, roughness: 0.6, metalness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.45, metalness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ color: COLORS.rust, roughness: 0.8, metalness: 0.3 }),
    water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.12, metalness: 0.9 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: COLORS.sodium, emissiveIntensity: 2.2 }),
    lampCool: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xcfe4ff, emissiveIntensity: 2.0 }),
    raider: new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.7 }),
    sentinel: new THREE.MeshStandardMaterial({ color: COLORS.teal, roughness: 0.7 }),
    botDark: new THREE.MeshStandardMaterial({ color: 0x35383f, roughness: 0.8, emissive: 0x0c0d10, emissiveIntensity: 1 }),
    botVisor: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x66d9ff, emissiveIntensity: 1.4 }),
    gunMetal: new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.5, metalness: 0.45, emissive: 0x14161a, emissiveIntensity: 1 }),
    gunAccent: new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.55, metalness: 0.4, emissive: 0x22262b, emissiveIntensity: 1 }),
  };
}

// Shared unit geometries; meshes scale them, so the GPU holds one of each.
export function makeGeometries() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    sphere: new THREE.SphereGeometry(0.5, 10, 8),
    plane: new THREE.PlaneGeometry(1, 1),
  };
}
