// bots.js — the nine bots. Each bot is a fighter with an `ai` brain: a
// state machine (move, hold, engage, plant, defuse, rotate) fed by
// perception (a vision cone with line of sight, and hearing) and by the
// round's team plan. Attackers pick a plan per round (a route to a site);
// defenders hold assigned spots and rotate on callouts. Bots shoot with the
// same fireShot the player uses, so their aim, spread and damage are the
// same rules, only their reaction time and aim error differ.

import { NODES, EDGES, ATTACK_PLANS, DEFEND_SPOTS, siteAt } from './mapdata.js';
import { hasLOS, resolveCircle } from './collision.js';
import { fireShot, startReload, segmentInSmoke, eyeHeight } from './combat.js';
import { WEAPONS } from './weapons.js';
import {
  makeFighter, BOT_NAMES, attackingTeam, defendingTeam, enemyTeam,
  aliveFighters,
} from './state.js';

// Adjacency list, built once from EDGES.
const ADJ = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i].x - x;
    const dz = NODES[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first path over the waypoint graph. Returns node ids, start
// excluded, goal included; [] when already there or unreachable.
export function findPath(from, to) {
  if (from === to) return [];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const next of ADJ[cur]) {
      if (prev[next] === -1) {
        prev[next] = cur;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return [];
  const path = [];
  let cur = to;
  while (cur !== from) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

export function areaName(x, z) {
  const site = siteAt(x, z);
  if (site === 'A') return 'Turbine Hall';
  if (site === 'B') return 'Gatehouse';
  if (x < -30) return 'West Lane';
  if (x > 30) return 'East Lane';
  if (z < -8) return 'North Mid';
  if (z > 15) return 'South Road';
  return 'Mid';
}

export function createBots(state) {
  const bots = [];
  for (const team of ['raider', 'sentinel']) {
    for (let i = 0; i < 5; i++) {
      const f = makeFighter(`bot-${team}-${i}`, BOT_NAMES[team][i], team, false);
      f.ai = {
        state: 'hold',
        path: [],
        pathIndex: 0,
        target: null,
        lastSeen: null,
        lastSeenTime: 0,
        reactAt: 0,
        nextThink: Math.random() * 0.12,
        holdNode: 0,
        watchNode: 0,
        burstLeft: 0,
        burstPauseUntil: 0,
        strafeDir: 1,
        strafeUntil: 0,
        stuckSince: 0,
        lastX: 0,
        lastZ: 0,
        investigate: null,
        calloutAt: 0,
        // Skill: reaction 0.35-0.7 s, aim error 0.012-0.032 rad.
        reaction: 0.35 + Math.random() * 0.35,
        aimError: 0.012 + Math.random() * 0.02,
        burstLen: 3 + Math.floor(Math.random() * 3),
      };
      f.aimError = f.ai.aimError;
      bots.push(f);
    }
  }
  return bots;
}

function botSay(state, bot, text) {
  if (state.time < bot.ai.calloutAt) return;
  bot.ai.calloutAt = state.time + 6;
  state.callouts.unshift({ text: `${bot.name}: ${text}`, team: bot.team, time: state.time });
  if (state.callouts.length > 5) state.callouts.length = 5;
}

// Called each round start: picks the attack plan, assigns defence spots,
// picks the carrier, and lets bots spend their (simulated) money.
export function assignRoundRoles(state) {
  const atk = attackingTeam(state);
  const def = defendingTeam(state);
  const plan = ATTACK_PLANS[Math.floor(Math.random() * ATTACK_PLANS.length)];
  state.plan = plan;
  const attackers = state.fighters.filter((f) => f.team === atk && f.alive);
  const defenders = state.fighters.filter((f) => f.team === def && f.alive);

  // Carrier: the player carries when attacking; otherwise a random bot.
  let carrier = null;
  if (state.player.team === atk) {
    carrier = state.player;
  } else {
    const bots = attackers.filter((f) => !f.isPlayer);
    carrier = bots[Math.floor(Math.random() * bots.length)];
  }
  carrier.carryingBomb = true;
  state.bomb.state = 'carried';
  state.bomb.carrierId = carrier.id;

  // Attackers follow the plan's path; the carrier walks it, the others take
  // nearby lanes by starting from their own nearest node.
  for (const f of attackers) {
    if (f.isPlayer) continue;
    const start = nearestNode(f.x, f.z);
    const goal = plan.site === 'A' ? 11 : 23;
    f.ai.path = findPath(start, goal);
    f.ai.pathIndex = 0;
    f.ai.state = 'move';
    f.ai.target = null;
    f.ai.investigate = null;
  }
  // Defenders take their spots.
  defenders.forEach((f, i) => {
    if (f.isPlayer) return;
    const spot = DEFEND_SPOTS[i % DEFEND_SPOTS.length];
    const start = nearestNode(f.x, f.z);
    f.ai.path = findPath(start, spot.node);
    f.ai.pathIndex = 0;
    f.ai.holdNode = spot.node;
    f.ai.watchNode = spot.watch;
    f.ai.state = 'move';
    f.ai.target = null;
    f.ai.investigate = null;
  });

  // Bot shopping happens in rounds.js (botShop), with the same buyItem rules
  // and the same money the player uses — no free gear for either side.
}

function angleTo(f, x, z) {
  return Math.atan2(-(x - f.x), -(z - f.z));
}

function turnToward(f, targetYaw, dt, rate = 6) {
  let diff = targetYaw - f.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  f.yaw += step;
  return Math.abs(diff) < 0.1;
}

function think(state, bot) {
  const ai = bot.ai;
  const enemies = aliveFighters(state, enemyTeam(bot.team));
  const eyeY = bot.y + eyeHeight(bot);

  // --- vision: nearest enemy in the cone with a clear line of sight ---
  let seen = null;
  let seenDist = Infinity;
  for (const e of enemies) {
    const dx = e.x - bot.x;
    const dz = e.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 55 || dist >= seenDist) continue;
    const wantYaw = Math.atan2(-dx, -dz);
    let diff = wantYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.15) continue; // ~132 degree field of view
    if (!hasLOS(bot.x, eyeY, bot.z, e.x, e.y + 1.2, e.z)) continue;
    if (segmentInSmoke(bot.x, eyeY, bot.z, e.x, e.y + 1.2, e.z, state)) continue;
    seen = e;
    seenDist = dist;
  }

  if (seen) {
    if (ai.target !== seen) {
      ai.target = seen;
      ai.reactAt = state.time + ai.reaction;
      botSay(state, bot, `Enemy at ${areaName(seen.x, seen.z)}!`);
    }
    ai.lastSeen = { x: seen.x, z: seen.z };
    ai.lastSeenTime = state.time;
    ai.state = 'engage';
    ai.investigate = null;
  } else if (ai.target) {
    // Lost sight: hunt the last known position for a few seconds.
    if (state.time - ai.lastSeenTime > 2.5) {
      ai.target = null;
      ai.state = ai.holdNode ? 'move' : 'move';
      if (ai.lastSeen) {
        ai.investigate = { x: ai.lastSeen.x, z: ai.lastSeen.z };
        ai.lastSeen = null;
      }
    }
  }

  // --- hearing: enemy noise nearby draws an investigation ---
  if (!ai.target) {
    for (const n of state.noises) {
      if (state.time > n.until) continue;
      if (n.team === bot.team) continue;
      const dx = n.x - bot.x;
      const dz = n.z - bot.z;
      if (dx * dx + dz * dz < n.radius * n.radius) {
        if (!ai.investigate) {
          ai.investigate = { x: n.x, z: n.z };
          botSay(state, bot, `Heard shots at ${areaName(n.x, n.z)}`);
        }
        break;
      }
    }
  }

  // --- bomb duties override the plan ---
  const bomb = state.bomb;
  if (bomb.state === 'planted' && bot.team === defendingTeam(state) && !ai.target) {
    // Defenders rotate to the planted site; the first there defuses.
    if (ai.state !== 'defuse') {
      const goal = nearestNode(bomb.x, bomb.z);
      if (ai.state !== 'rotate' || ai.rotateGoal !== goal) {
        ai.path = findPath(nearestNode(bot.x, bot.z), goal);
        ai.pathIndex = 0;
        ai.state = 'rotate';
        ai.rotateGoal = goal;
      }
      const dx = bot.x - bomb.x;
      const dz = bot.z - bomb.z;
      if (dx * dx + dz * dz < 2.0 * 2.0) {
        ai.state = 'defuse';
        botSay(state, bot, 'Defusing!');
      }
    }
  } else if (bomb.state === 'dropped' && bot.team === attackingTeam(state) && !ai.target) {
    // Nearest living attacker recovers the dropped bomb.
    const attackers = aliveFighters(state, attackingTeam(state)).filter((f) => !f.isPlayer);
    let nearest = null;
    let nd = Infinity;
    for (const a of attackers) {
      const d = (a.x - bomb.x) ** 2 + (a.z - bomb.z) ** 2;
      if (d < nd) { nd = d; nearest = a; }
    }
    if (nearest === bot) {
      const goal = nearestNode(bomb.x, bomb.z);
      if (ai.state !== 'pickup') {
        ai.path = findPath(nearestNode(bot.x, bot.z), goal);
        ai.pathIndex = 0;
        ai.state = 'pickup';
      }
      const dx = bot.x - bomb.x;
      const dz = bot.z - bomb.z;
      if (dx * dx + dz * dz < 1.4 * 1.4) {
        bot.carryingBomb = true;
        bomb.state = 'carried';
        bomb.carrierId = bot.id;
        ai.state = 'move';
        const goalNode = state.plan.site === 'A' ? 11 : 23;
        ai.path = findPath(nearestNode(bot.x, bot.z), goalNode);
        ai.pathIndex = 0;
        botSay(state, bot, 'Got the charge, heading to site');
      }
    }
  } else if (bot.carryingBomb && siteAt(bot.x, bot.z) === state.plan.site && !ai.target) {
    ai.state = 'plant';
  }
}

function moveAlongPath(state, bot, dt, speed) {
  const ai = bot.ai;
  if (ai.pathIndex >= ai.path.length) return true; // arrived
  const node = NODES[ai.path[ai.pathIndex]];
  const dx = node.x - bot.x;
  const dz = node.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.3) {
    ai.pathIndex += 1;
    return ai.pathIndex >= ai.path.length;
  }
  const wantYaw = Math.atan2(-dx, -dz);
  turnToward(bot, wantYaw, dt, 7);
  // Stuck detection: barely moved while trying to walk.
  if (state.time - ai.stuckSince > 1.2) {
    const moved = Math.hypot(bot.x - ai.lastX, bot.z - ai.lastZ);
    if (moved < 0.3) {
      ai.strafeDir = -ai.strafeDir;
      ai.strafeUntil = state.time + 0.6;
    }
    ai.stuckSince = state.time;
    ai.lastX = bot.x;
    ai.lastZ = bot.z;
  }
  const strafing = state.time < ai.strafeUntil;
  const mx = strafing ? Math.cos(bot.yaw) * ai.strafeDir : -Math.sin(bot.yaw);
  const mz = strafing ? -Math.sin(bot.yaw) * ai.strafeDir : -Math.cos(bot.yaw);
  const oldX = bot.x;
  const oldZ = bot.z;
  bot.x += mx * speed * dt;
  bot.z += mz * speed * dt;
  resolveCircle(bot, 0.35);
  bot.vx = (bot.x - oldX) / dt;
  bot.vz = (bot.z - oldZ) / dt;
  return false;
}

function updateBot(state, bot, dt) {
  const ai = bot.ai;
  if (!bot.alive) return;
  bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
  bot.bloom = Math.max(0, bot.bloom - dt * 0.06);
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) {
      const w = WEAPONS[bot.weapon];
      const need = w.mag - bot.mag;
      const take = Math.min(need, bot.reserve);
      bot.mag += take;
      bot.reserve -= take;
    }
  }
  bot.channel = null;

  if (state.phase !== 'live') {
    bot.vx = 0;
    bot.vz = 0;
    return;
  }

  if (state.time >= ai.nextThink) {
    ai.nextThink = state.time + 0.12;
    think(state, bot);
  }

  // --- act on the current state ---
  if (ai.state === 'engage' && ai.target && ai.target.alive) {
    const t = ai.target;
    // Face the target's chest; pitch aims slightly high at close range.
    const wantYaw = angleTo(bot, t.x, t.z);
    turnToward(bot, wantYaw, dt, 8);
    const dist = Math.hypot(t.x - bot.x, t.z - bot.z);
    const wantPitch = Math.atan2(t.y + 1.25 - (bot.y + eyeHeight(bot)), dist);
    bot.pitch += Math.max(-3 * dt, Math.min(3 * dt, wantPitch - bot.pitch));
    // Strafe slowly while fighting; never sprint into a duel.
    if (state.time > ai.strafeUntil) {
      ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
      ai.strafeUntil = state.time + 0.5 + Math.random() * 0.7;
    }
    const oldX = bot.x;
    const oldZ = bot.z;
    bot.x += Math.cos(bot.yaw) * ai.strafeDir * 1.3 * dt;
    bot.z += -Math.sin(bot.yaw) * ai.strafeDir * 1.3 * dt;
    resolveCircle(bot, 0.35);
    bot.vx = (bot.x - oldX) / dt;
    bot.vz = (bot.z - oldZ) / dt;
    // Burst fire once the reaction time has passed.
    if (state.time >= ai.reactAt && state.time >= ai.burstPauseUntil) {
      if (bot.mag <= 0) {
        startReload(bot, state);
      } else if (ai.burstLeft <= 0) {
        ai.burstLeft = ai.burstLen;
      } else if (bot.fireCooldown <= 0) {
        fireShot(bot, state);
        ai.burstLeft -= 1;
        if (ai.burstLeft <= 0) ai.burstPauseUntil = state.time + 0.35 + Math.random() * 0.45;
      }
    }
    return;
  }

  if (ai.state === 'plant') {
    if (bot.carryingBomb && siteAt(bot.x, bot.z)) {
      bot.channel = { type: 'plant', site: siteAt(bot.x, bot.z) };
      bot.vx = 0;
      bot.vz = 0;
      return;
    }
    ai.state = 'move';
  }

  if (ai.state === 'defuse') {
    bot.channel = { type: 'defuse' };
    bot.vx = 0;
    bot.vz = 0;
    return;
  }

  if (ai.state === 'hold' || (ai.state === 'move' && ai.pathIndex >= ai.path.length)) {
    // At the hold spot: watch the assigned direction, scanning slowly.
    if (ai.holdNode !== undefined && NODES[ai.watchNode]) {
      const w = NODES[ai.watchNode];
      const scan = Math.sin(state.time * 0.4 + bot.id.length) * 0.45;
      turnToward(bot, angleTo(bot, w.x, w.z) + scan, dt, 3);
    }
    bot.vx = 0;
    bot.vz = 0;
    ai.state = 'hold';
    // An investigation overrides holding.
    if (ai.investigate) {
      const goal = nearestNode(ai.investigate.x, ai.investigate.z);
      ai.path = findPath(nearestNode(bot.x, bot.z), goal);
      ai.pathIndex = 0;
      ai.state = 'move';
      ai.investigate = null;
    }
    return;
  }

  // move / rotate / pickup: walk the path.
  const arrived = moveAlongPath(state, bot, dt, 4.4);
  if (arrived) {
    if (ai.state === 'rotate') ai.state = 'hold';
    else if (ai.state === 'move') ai.state = bot.carryingBomb ? 'plant' : 'hold';
  }
}

export function updateBots(state, dt) {
  // Prune heard noises that expired.
  for (let i = state.noises.length - 1; i >= 0; i--) {
    if (state.time > state.noises[i].until) state.noises.splice(i, 1);
  }
  for (const f of state.fighters) {
    if (!f.isPlayer && f.ai) updateBot(state, f, dt);
  }
}
