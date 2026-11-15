// combat.js — everything that hurts: hitscan fire with headshots, reloads,
// grenades with bounce and fuse, and the bomb's plant/defuse channels. The
// simulation calls these; they push events (tracer, impact, kill, noise)
// that the HUD, the audio and the effects consume after the step.

import { rayMap, hitTestFighter, hasLOS } from './collision.js';
import { WEAPONS, GRENADE, currentSpread, damageFor } from './weapons.js';
import { pushEvent, defendingTeam, PLANT_TIME, DEFUSE_TIME, DEFUSE_KIT_TIME, BOMB_FUSE, ECONOMY } from './state.js';
import { BOXES } from './mapdata.js';

export function eyeHeight(f) {
  return f.crouch ? 1.12 : 1.62;
}

// Aim direction from yaw/pitch. yaw 0 faces north (-z); pitch up is positive.
export function aimDir(f, out) {
  const cp = Math.cos(f.pitch);
  out.x = -Math.sin(f.yaw) * cp;
  out.y = Math.sin(f.pitch);
  out.z = -Math.cos(f.yaw) * cp;
  return out;
}

const _dir = { x: 0, y: 0, z: 0 };
const _right = { x: 0, y: 0, z: 0 };
const _up = { x: 0, y: 0, z: 0 };
const _hit = { x: 0, y: 0, z: 0 };

// Roughly gaussian in [-1, 1] from two uniforms: cheap and good enough for
// a spread cone.
function gauss() {
  return (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
}

export function fireShot(f, state) {
  const w = WEAPONS[f.weapon];
  if (f.mag <= 0) return;
  f.mag -= 1;
  f.fireCooldown = w.interval;
  f.bloom = Math.min(w.bloomMax, f.bloom + w.bloom);
  f.pitch = Math.min(1.45, f.pitch + w.recoil);
  f.yaw += gauss() * w.recoil * 0.35;
  f._kick = 1;

  const ex = f.x;
  const ey = f.y + eyeHeight(f);
  const ez = f.z;
  const speed = Math.hypot(f.vx, f.vz);
  const spread = currentSpread(w, speed, f.bloom, f.ads, f.crouch) + (f.aimError ?? 0);
  aimDir(f, _dir);

  // Right/up basis for the spread cone.
  _right.x = Math.cos(f.yaw);
  _right.y = 0;
  _right.z = -Math.sin(f.yaw);
  // Up = dir x right, for the spread cone's second axis.
  _up.x = _dir.y * _right.z - _dir.z * _right.y;
  _up.y = _dir.z * _right.x - _dir.x * _right.z;
  _up.z = _dir.x * _right.y - _dir.y * _right.x;

  pushEvent(state, { type: 'muzzle', fighter: f, weapon: w.id });
  // Shots are heard, not just seen: bots within range turn toward them.
  state.noises.push({ x: f.x, z: f.z, radius: 34, team: f.team, until: state.time + 0.6 });

  for (let p = 0; p < w.pellets; p++) {
    const ox = gauss() * spread;
    const oy = gauss() * spread;
    let dx = _dir.x + _right.x * ox + _up.x * oy;
    let dy = _dir.y + _right.y * ox + _up.y * oy;
    let dz = _dir.z + _right.z * ox + _up.z * oy;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    // Nearest hit wins: the map, or any fighter (teammates block shots but
    // take no damage: friendly fire is off).
    let bestDist = rayMap(ex, ey, ez, dx, dy, dz, w.range, _hit);
    let bestFighter = null;
    let bestPart = null;
    for (const t of state.fighters) {
      if (t === f || !t.alive) continue;
      const hit = hitTestFighter(ex, ey, ez, dx, dy, dz, w.range, t);
      if (hit && (bestDist < 0 || hit.dist < bestDist)) {
        bestDist = hit.dist;
        bestFighter = t;
        bestPart = hit.part;
      }
    }
    const endX = ex + dx * (bestDist >= 0 ? bestDist : w.range);
    const endY = ey + dy * (bestDist >= 0 ? bestDist : w.range);
    const endZ = ez + dz * (bestDist >= 0 ? bestDist : w.range);
    pushEvent(state, {
      type: 'tracer',
      from: { x: ex + dx * 0.6, y: ey - 0.12, z: ez + dz * 0.6 },
      to: { x: endX, y: endY, z: endZ },
    });
    if (!bestFighter) {
      if (bestDist >= 0) {
        pushEvent(state, { type: 'impact', x: endX, y: endY, z: endZ });
      }
      continue;
    }
    if (bestFighter.team === f.team) {
      pushEvent(state, { type: 'impact', x: endX, y: endY, z: endZ });
      continue;
    }
    const dmg = damageFor(w, bestPart, bestFighter);
    applyDamage(state, bestFighter, dmg, f, w.id, bestPart === 'head');
  }
}

export function startReload(f, state) {
  const w = WEAPONS[f.weapon];
  if (f.reloading > 0 || f.mag >= w.mag || f.reserve <= 0) return;
  f.reloading = w.reload;
  pushEvent(state, { type: 'reload', fighter: f });
}

export function throwGrenade(f, state, kind) {
  if (f.grenades[kind] <= 0 || f.reloading > 0) return;
  f.grenades[kind] -= 1;
  aimDir(f, _dir);
  const ex = f.x;
  const ey = f.y + eyeHeight(f);
  const ez = f.z;
  state.grenades.push({
    kind,
    x: ex + _dir.x * 0.5,
    y: ey - 0.1,
    z: ez + _dir.z * 0.5,
    vx: _dir.x * GRENADE.throwSpeed + f.vx * 0.5,
    vy: _dir.y * GRENADE.throwSpeed + GRENADE.throwUp,
    vz: _dir.z * GRENADE.throwSpeed + f.vz * 0.5,
    fuse: kind === 'frag' ? GRENADE.fragFuse : 1.2,
    thrower: f,
  });
  pushEvent(state, { type: 'throw', fighter: f, kind });
}

// Grenade flight: gravity, bounce off the ground and the boxes, fuse.
export function updateGrenades(state, dt) {
  const list = state.grenades;
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    g.fuse -= dt;
    g.vy -= 13 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y < 0.09) {
      g.y = 0.09;
      g.vy = Math.abs(g.vy) * 0.42;
      g.vx *= 0.7;
      g.vz *= 0.7;
    }
    // Bounce off boxes: push out along the smallest penetration and flip
    // that velocity component.
    for (const b of BOXES) {
      const y0 = b.y0 ?? 0;
      const minX = b.x - b.w / 2 - 0.09;
      const maxX = b.x + b.w / 2 + 0.09;
      const minZ = b.z - b.d / 2 - 0.09;
      const maxZ = b.z + b.d / 2 + 0.09;
      if (g.x < minX || g.x > maxX || g.z < minZ || g.z > maxZ) continue;
      if (g.y < y0 - 0.09 || g.y > y0 + b.h + 0.09) continue;
      const pl = g.x - minX;
      const pr = maxX - g.x;
      const pn = g.z - minZ;
      const ps = maxZ - g.z;
      const pt = g.y - (y0 - 0.09);
      const pb = y0 + b.h + 0.09 - g.y;
      const m = Math.min(pl, pr, pn, ps, pt, pb);
      if (m === pl) { g.x = minX; g.vx = -Math.abs(g.vx) * 0.45; }
      else if (m === pr) { g.x = maxX; g.vx = Math.abs(g.vx) * 0.45; }
      else if (m === pn) { g.z = minZ; g.vz = -Math.abs(g.vz) * 0.45; }
      else if (m === ps) { g.z = maxZ; g.vz = Math.abs(g.vz) * 0.45; }
      else if (m === pt) { g.y = y0 - 0.09; g.vy = -Math.abs(g.vy) * 0.45; }
      else { g.y = y0 + b.h + 0.09; g.vy = Math.abs(g.vy) * 0.45; }
    }
    if (g.fuse <= 0) {
      list.splice(i, 1);
      if (g.kind === 'frag') explodeFrag(state, g);
      else {
        state.smokes.push({ x: g.x, y: 0, z: g.z, radius: GRENADE.smokeRadius, until: state.time + GRENADE.smokeTime });
        pushEvent(state, { type: 'smoke', x: g.x, z: g.z });
      }
    }
  }
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    if (state.time > state.smokes[i].until) state.smokes.splice(i, 1);
  }
}

function explodeFrag(state, g) {
  pushEvent(state, { type: 'explosion', x: g.x, y: g.y, z: g.z });
  state.noises.push({ x: g.x, z: g.z, radius: 60, team: null, until: state.time + 1.0 });
  for (const t of state.fighters) {
    if (!t.alive || t.team === g.thrower.team) continue;
    const dx = t.x - g.x;
    const dz = t.z - g.z;
    const dy = (t.y + 1) - g.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > GRENADE.fragRadius) continue;
    if (!hasLOS(g.x, g.y + 0.3, g.z, t.x, t.y + 1, t.z)) continue;
    const dmg = Math.max(12, Math.round(GRENADE.fragDamage * (1 - dist / GRENADE.fragRadius)));
    applyDamage(state, t, dmg, g.thrower, 'frag', false);
  }
}

// True when the segment passes through any smoke cloud: smoke blocks sight
// for bots and the player's view of the enemy (the cloud is rendered too).
export function segmentInSmoke(ax, ay, az, bx, by, bz, state) {
  for (const s of state.smokes) {
    // Distance from the cloud centre to the segment, in 3D.
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((s.x - ax) * abx + (1.2 - ay) * aby + (s.z - az) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const dx = ax + abx * t - s.x;
    const dy = ay + aby * t - 1.2;
    const dz = az + abz * t - s.z;
    if (dx * dx + dy * dy + dz * dz < s.radius * s.radius) return true;
  }
  return false;
}

export function applyDamage(state, victim, dmg, attacker, weaponId, headshot) {
  if (!victim.alive) return;
  victim.hp -= dmg;
  victim.lastDamageFrom = attacker ? attacker.id : null;
  if (attacker) {
    pushEvent(state, { type: 'hit', attacker, victim, headshot });
  }
  if (victim.hp > 0) return;
  victim.hp = 0;
  victim.alive = false;
  victim.deaths += 1;
  victim.channel = null;
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.money += ECONOMY.kill;
  }
  if (victim.carryingBomb) {
    victim.carryingBomb = false;
    state.bomb.state = 'dropped';
    state.bomb.x = victim.x;
    state.bomb.z = victim.z;
    state.bomb.carrierId = null;
    pushEvent(state, { type: 'bombDropped', x: victim.x, z: victim.z });
  }
  state.kills.unshift({
    killer: attacker ? attacker.name : '—',
    killerTeam: attacker ? attacker.team : null,
    victim: victim.name,
    victimTeam: victim.team,
    weapon: weaponId,
    headshot,
    time: state.time,
  });
  if (state.kills.length > 6) state.kills.length = 6;
  pushEvent(state, { type: 'kill', attacker, victim, weapon: weaponId, headshot });
}

// Plant and defuse channels advance here, once per tick, from every
// fighter's current channel intent. Progress decays when nobody channels,
// so a channel must be held, not tapped.
export function updateBombChannels(state, dt) {
  const bomb = state.bomb;
  if (state.phase !== 'live') return;

  if (bomb.state === 'carried' || bomb.state === 'dropped') {
    let planter = null;
    for (const f of state.fighters) {
      if (f.alive && f.channel && f.channel.type === 'plant' && f.carryingBomb) {
        planter = f;
        break;
      }
    }
    if (planter) {
      bomb.plantProgress += dt / PLANT_TIME;
      bomb.planterId = planter.id;
      if (bomb.plantProgress >= 1) {
        bomb.state = 'planted';
        bomb.site = planter.channel.site;
        bomb.x = planter.x;
        bomb.z = planter.z;
        bomb.fuse = BOMB_FUSE;
        bomb.plantProgress = 0;
        planter.carryingBomb = false;
        planter.money += ECONOMY.plant;
        pushEvent(state, { type: 'bombPlanted', site: bomb.site, planter });
      }
    } else {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
      bomb.planterId = null;
    }
    return;
  }

  if (bomb.state === 'planted') {
    bomb.fuse -= dt;
    if (bomb.fuse <= 0) {
      bomb.state = 'exploded';
      bomb.fuse = 0;
      pushEvent(state, { type: 'bombExploded', site: bomb.site });
      return;
    }
    let defuser = null;
    for (const f of state.fighters) {
      if (f.alive && f.channel && f.channel.type === 'defuse' && f.team === defendingTeam(state)) {
        defuser = f;
        break;
      }
    }
    if (defuser) {
      const rate = defuser.hasKit ? DEFUSE_KIT_TIME : DEFUSE_TIME;
      bomb.defuseProgress += dt / rate;
      bomb.defuserId = defuser.id;
      if (bomb.defuseProgress >= 1) {
        bomb.state = 'defused';
        pushEvent(state, { type: 'bombDefused', defuser });
      }
    } else {
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 2);
      bomb.defuserId = null;
    }
  }
}
