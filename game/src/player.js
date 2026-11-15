// player.js — the human fighter: movement with acceleration and crouching,
// mouse look, the camera and the viewmodel gun. The simulation calls
// updatePlayer once per fixed tick; updateCamera and updateViewmodel run once
// per rendered frame, so the view stays smooth between ticks.

import { resolveCircle } from './collision.js';
import { WEAPONS } from './weapons.js';
import { moveAxes } from './input.js';
import { fireShot, startReload, throwGrenade } from './combat.js';
import { siteAt } from './mapdata.js';
import { defendingTeam } from './state.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.2;
const ADS_SPEED = 2.6;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 26;
const GRAVITY = 15;
const JUMP_SPEED = 5.6;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const MOUSE_SENS = 0.0022;
const BASE_FOV = 75;

function moveToward(v, target, maxDelta) {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}

export function updatePlayer(state, input, dt) {
  const p = state.player;
  if (!p || !p.alive) {
    input.drainPressed(); // drop queued keys, so a dead round cannot fire into the next
    return;
  }
  const live = state.phase === 'live';
  const frozen = state.phase === 'buy' || state.phase === 'end' || state.phase === 'matchEnd';

  // Look: always allowed while locked, even during the buy freeze.
  const look = input.consumeLook();
  p.yaw -= look.dx * MOUSE_SENS;
  p.pitch -= look.dy * MOUSE_SENS;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));

  // Crouch is a hold; ADS is a hold on the right mouse button.
  p.crouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  p.ads = input.adsHeld && live;
  p.scoped = p.ads && p.weapon === 'sniper';

  // Timers tick down in every phase so a reload finishes through the freeze.
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.bloom = Math.max(0, p.bloom - dt * 0.06);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const w = WEAPONS[p.weapon];
      const need = w.mag - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take;
      p.reserve -= take;
    }
  }

  if (!live || frozen) {
    input.drainPressed(); // a press queued during the buy/end phase must not fire later
    p.vx = 0;
    p.vz = 0;
    p.channel = null;
    return;
  }

  // --- movement ---
  const axes = moveAxes(input);
  const speed = p.crouch ? CROUCH_SPEED : p.ads ? ADS_SPEED : WALK_SPEED;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // Forward is -z rotated by yaw; strafe is +x rotated by yaw.
  const wishX = (-sin * axes.f + cos * axes.s) * speed;
  const wishZ = (-cos * axes.f - sin * axes.s) * speed;
  const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
  p.vx = moveToward(p.vx, wishX, accel * dt);
  p.vz = moveToward(p.vz, wishZ, accel * dt);
  if (p.onGround && axes.f === 0 && axes.s === 0) {
    p.vx = moveToward(p.vx, 0, FRICTION * dt);
    p.vz = moveToward(p.vz, 0, FRICTION * dt);
  }

  // Jump (Space pressed this tick) and gravity.
  const pressed = input.drainPressed();
  for (const code of pressed) {
    if (code === 'Space' && p.onGround) {
      p.vy = JUMP_SPEED;
      p.onGround = false;
    } else if (code === 'KeyR') {
      startReload(p, state);
    } else if (code === 'Digit1' && p.owned.primary) {
      switchWeapon(p, p.owned.primary, state);
    } else if (code === 'Digit2') {
      switchWeapon(p, 'pistol', state);
    } else if (code === 'Digit4') {
      throwGrenade(p, state, 'frag');
    } else if (code === 'Digit5') {
      throwGrenade(p, state, 'smoke');
    }
  }

  p.vy -= GRAVITY * dt;
  const oldX = p.x;
  const oldZ = p.z;
  const oldY = p.y;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    if (!p.onGround && p.vy < -6) p.landDip = Math.min(0.12, -p.vy * 0.012);
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
  resolveCircle(p, 0.35);
  // Velocity from the actual displacement: kills the component that ran
  // into a wall and keeps the slide along it.
  p.vx = (p.x - oldX) / dt;
  p.vz = (p.z - oldZ) / dt;
  if (p.y !== oldY) p.vy = (p.y - oldY) / dt;

  // --- firing ---
  const w = WEAPONS[p.weapon];
  const wantFire = w.auto ? input.fireHeld : input.fireHeld && !p._wasFireHeld;
  p._wasFireHeld = input.fireHeld;
  if (wantFire && p.fireCooldown <= 0 && p.reloading <= 0) {
    if (p.mag > 0) {
      fireShot(p, state);
    } else {
      startReload(p, state);
    }
  }

  // --- plant / defuse channel (E held) ---
  p.channel = null;
  if (input.keys.has('KeyE')) {
    if (p.carryingBomb && siteAt(p.x, p.z)) {
      p.channel = { type: 'plant', site: siteAt(p.x, p.z) };
    } else if (state.bomb.state === 'planted' && p.team === defendingTeam(state)) {
      const dx = p.x - state.bomb.x;
      const dz = p.z - state.bomb.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) p.channel = { type: 'defuse' };
    }
  }
}

export function switchWeapon(p, id, state) {
  if (p.weapon === id) return;
  // Stash the old weapon's magazine before switching away from it.
  const store = p._mags ?? (p._mags = {});
  store[p.weapon] = { mag: p.mag, reserve: p.reserve };
  p.weapon = id;
  p.reloading = 0;
  p.fireCooldown = Math.max(p.fireCooldown, 0.25);
  const w = WEAPONS[id];
  const saved = store[id];
  p.mag = saved ? saved.mag : w.mag;
  p.reserve = saved ? saved.reserve : w.reserve;
}

// Camera follows the head: eye height lerps with the crouch, the pitch
// carries the recoil the player must pull down against.
export function updateCamera(state, camera, dt) {
  const p = state.player;
  if (!p) return;
  const targetEye = !p.alive ? 0.4 : p.crouch ? EYE_CROUCH : EYE_STAND;
  p._eye = p._eye === undefined ? EYE_STAND : p._eye + (targetEye - p._eye) * Math.min(1, dt * 12);
  p.landDip = Math.max(0, (p.landDip ?? 0) - dt * 0.5);
  // Head bob: small, tied to horizontal speed, off while aiming.
  const speed = Math.hypot(p.vx, p.vz);
  p._bobPhase = (p._bobPhase ?? 0) + dt * speed * 1.6;
  const bob = p.onGround && speed > 0.5 && !p.ads ? Math.sin(p._bobPhase * 2) * 0.018 : 0;
  camera.position.set(p.x, p.y + p._eye + bob - (p.landDip ?? 0), p.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  camera.rotation.z = 0;
  const w = WEAPONS[p.weapon];
  const targetFov = p.scoped ? w.scopedFov : p.ads ? 58 : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
}

// Viewmodel: the gun in the player's hands. Bobs with the stride, kicks on
// every shot, dips on reload, centres when aiming down sights.
export function updateViewmodel(vm, state, dt) {
  const p = state.player;
  if (!vm || !p) return;
  const speed = Math.hypot(p.vx, p.vz);
  const t = state.time;
  const bobA = p.ads ? 0.002 : p.onGround ? Math.min(0.012, speed * 0.002) : 0;
  const bobX = Math.sin(t * 9) * bobA;
  const bobY = Math.abs(Math.cos(t * 9)) * bobA * 0.8;
  p._kick = Math.max(0, (p._kick ?? 0) - dt * 6);
  const reloadDip = p.reloading > 0 ? 0.12 : 0;
  const adsX = p.ads ? 0 : 0.22;
  const adsY = p.ads ? -0.16 : -0.21;
  vm.position.set(
    adsX + bobX,
    adsY + bobY - reloadDip,
    -0.45 - (p._kick ?? 0) * 0.12,
  );
  vm.rotation.set((p._kick ?? 0) * 0.12, 0, 0);
}
