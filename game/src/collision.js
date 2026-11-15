// collision.js — the map's geometry as math. Movement collides a circle
// (the fighter's feet) against the boxes' XZ footprints; shots and sight use
// full 3D rays against the boxes (with y0, so roofs and beams only block
// what flies above the ground). All functions take plain numbers and write
// into scratch objects the caller owns, so the hot loops allocate nothing.

import { BOXES } from './mapdata.js';

// Precomputed box bounds, built once. y0 defaults to 0 (ground-based).
const SOLIDS = BOXES.map((b) => ({
  minX: b.x - b.w / 2,
  maxX: b.x + b.w / 2,
  minZ: b.z - b.d / 2,
  maxZ: b.z + b.d / 2,
  y0: b.y0 ?? 0,
  y1: (b.y0 ?? 0) + b.h,
  kind: b.kind,
}));

// Boxes that block walking: ground-based and at least knee-high.
const WALKERS = SOLIDS.filter((b) => b.y0 < 1.0 && b.y1 >= 1.0);

export const MAP_BOUNDS = { minX: -45, maxX: 45, minZ: -31, maxZ: 31 };

// Push a circle (x, z, radius) out of every walker box it overlaps, then
// clamp it to the map. pos is {x, z} and is corrected in place. Returns true
// when a push happened (the caller uses it to kill velocity into the wall).
export function resolveCircle(pos, radius) {
  let pushed = false;
  for (let i = 0; i < WALKERS.length; i++) {
    const b = WALKERS[i];
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pl = pos.x - b.minX + radius;
      const pr = b.maxX - pos.x + radius;
      const pn = pos.z - b.minZ + radius;
      const ps = b.maxZ - pos.z + radius;
      const m = Math.min(pl, pr, pn, ps);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pn) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
    pushed = true;
  }
  if (pos.x < MAP_BOUNDS.minX + radius) { pos.x = MAP_BOUNDS.minX + radius; pushed = true; }
  if (pos.x > MAP_BOUNDS.maxX - radius) { pos.x = MAP_BOUNDS.maxX - radius; pushed = true; }
  if (pos.z < MAP_BOUNDS.minZ + radius) { pos.z = MAP_BOUNDS.minZ + radius; pushed = true; }
  if (pos.z > MAP_BOUNDS.maxZ - radius) { pos.z = MAP_BOUNDS.maxZ - radius; pushed = true; }
  return pushed;
}

// Ray vs one box (slab test). Returns the distance along the ray, or -1.
// Origin and direction are plain {x, y, z}; direction must be normalised.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv;
    let t2 = (b.maxX - ox) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.y0 || oy > b.y1) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (b.y0 - oy) * inv;
    let t2 = (b.y1 - oy) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv;
    let t2 = (b.maxZ - oz) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Nearest map hit along a ray, or -1. out (optional {x,y,z}) takes the point.
export function rayMap(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = -1;
  for (let i = 0; i < SOLIDS.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, SOLIDS[i], maxDist);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  if (best >= 0 && out) {
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
  }
  return best;
}

// True when the segment a->b meets no box. Used for bot sight and sound.
export function hasLOS(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const t = rayMap(ax, ay, az, dx / len, dy / len, dz / len, len - 0.01, null);
  return t < 0;
}

// Ray vs sphere. Returns the distance, or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const t = tca - Math.sqrt(r2 - d2);
  if (t < 0 || t > maxDist) return -1;
  return t;
}

// A fighter's hurtboxes: head sphere + body box, both derived from the feet
// position. Standing eye is 1.62 m, crouched 1.15 m; the head sits 0.22 m
// below the eye, the body spans hip to shoulders.
export function hitTestFighter(ox, oy, oz, dx, dy, dz, maxDist, f) {
  const crouch = f.crouch ? 0.45 : 0;
  const headY = f.y + 1.52 - crouch;
  const head = raySphere(ox, oy, oz, dx, dy, dz, f.x, headY, f.z, 0.24, maxDist);
  // Body as a vertical box: reuse the slab test with a scratch box.
  const body = {
    minX: f.x - 0.32, maxX: f.x + 0.32,
    minZ: f.z - 0.32, maxZ: f.z + 0.32,
    y0: f.y + 0.15, y1: f.y + 1.32 - crouch,
  };
  const bodyT = rayBox(ox, oy, oz, dx, dy, dz, body, maxDist);
  if (head >= 0 && (bodyT < 0 || head <= bodyT)) return { dist: head, part: 'head' };
  if (bodyT >= 0) {
    // Below the waist counts as legs: less damage, same as the real game.
    const hitY = oy + dy * bodyT;
    return { dist: bodyT, part: hitY < f.y + 0.75 - crouch ? 'legs' : 'body' };
  }
  return null;
}
