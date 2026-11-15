// rounds.js — the match: rounds, phases, the economy and the buy menu's
// rules. A match is first to 5 rounds (at most 9); the player attacks as a
// Raider for rounds 1-4 and defends as a Sentinel from round 5. One buyItem
// serves the player's buy menu and the bots' shopping alike, so both sides
// play by the same money.

import { SPAWNS } from './mapdata.js';
import { WEAPONS, EQUIPMENT } from './weapons.js';
import { switchWeapon } from './player.js';
import { createBots, assignRoundRoles } from './bots.js';
import {
  makeFighter, pushEvent, aliveFighters, enemyTeam,
  attackingTeam, defendingTeam, BUY_TIME, ROUND_TIME, END_TIME, MATCH_WINS,
  HALFTIME_ROUND, ECONOMY,
} from './state.js';

const MAX_MONEY = 16000;

export function startMatch(state) {
  state.score = { raider: 0, sentinel: 0 };
  state.lossStreak = { raider: 0, sentinel: 0 };
  state.round = 1;
  state.matchWinner = null;
  state.roundWinner = null;
  state.kills = [];
  state.callouts = [];
  // Fresh fighters: the player plus five bots a side. The fifth bot of the
  // player's team sits out each round, keeping it 5v5.
  const player = makeFighter('player', 'YOU', 'raider', true);
  const bots = createBots(state);
  state.fighters = [player, ...bots];
  state.player = player;
  startRound(state);
}

function activeBotsThisRound(state) {
  return state.fighters.filter((f) => {
    if (f.isPlayer) return true;
    // bot-<team>-4 sits out when the player is on that team.
    if (f.team === state.playerTeam && f.id.endsWith('-4')) return false;
    return true;
  });
}

export function startRound(state) {
  state.playerTeam = state.round <= HALFTIME_ROUND ? 'raider' : 'sentinel';
  state.player.team = state.playerTeam;
  state.phase = 'buy';
  state.phaseTime = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.grenades = [];
  state.smokes = [];
  state.noises = [];
  state.kills = [];
  state.callouts = [];
  state.bomb = {
    state: 'carried', site: null, x: 0, z: 0, fuse: 0, carrierId: null,
    plantProgress: 0, defuseProgress: 0, planterId: null, defuserId: null,
  };

  // Spawn the active fighters on their team's points.
  const active = activeBotsThisRound(state);
  for (const f of state.fighters) {
    f.alive = active.includes(f);
    f.channel = null;
  }
  for (const team of ['raider', 'sentinel']) {
    const members = active.filter((f) => f.team === team);
    members.forEach((f, i) => {
      const s = SPAWNS[team][i % SPAWNS[team].length];
      f.x = s.x;
      f.z = s.z;
      f.y = 0;
      f.yaw = s.yaw;
      f.pitch = 0;
      f.vx = 0;
      f.vz = 0;
      f.vy = 0;
      f.hp = 100;
      f.crouch = false;
      f.ads = false;
      f.bloom = 0;
      f.fireCooldown = 0;
      f.reloading = 0;
      f.carryingBomb = false;
      f._mags = {};
      // Restock: keep the total ammunition, refill the magazine.
      const w = WEAPONS[f.weapon];
      const total = Math.max(w.mag, f.mag + f.reserve);
      f.mag = w.mag;
      f.reserve = total - w.mag;
      if (f.ai) {
        f.ai.target = null;
        f.ai.path = [];
        f.ai.pathIndex = 0;
        f.ai.state = 'move';
        f.ai.investigate = null;
        f.ai.lastSeen = null;
      }
    });
  }

  assignRoundRoles(state);
  botShop(state);
  pushEvent(state, { type: 'roundStart', round: state.round });
}

// One buy rule for the player and the bots. Returns true when the purchase
// went through. Only during the buy phase.
export function buyItem(state, fighter, itemId) {
  if (state.phase !== 'buy' || !fighter.alive) return false;
  if (WEAPONS[itemId]) {
    const w = WEAPONS[itemId];
    if (fighter.money < w.price) return false;
    if (w.slot === 'primary' && fighter.owned.primary === itemId) return false;
    fighter.money -= w.price;
    if (w.slot === 'primary') {
      fighter.owned.primary = itemId;
      switchWeapon(fighter, itemId, state);
    } else {
      switchWeapon(fighter, 'pistol', state);
    }
    fighter.mag = w.mag;
    fighter.reserve = w.reserve;
    fighter._mags = {};
    return true;
  }
  const e = EQUIPMENT[itemId];
  if (!e || fighter.money < e.price) return false;
  if (itemId === 'armor') {
    if (fighter.armor >= 100) return false;
    fighter.money -= e.price;
    fighter.armor = 100;
    return true;
  }
  if (itemId === 'kit') {
    if (fighter.hasKit) return false;
    fighter.money -= e.price;
    fighter.hasKit = true;
    return true;
  }
  if (itemId === 'frag' || itemId === 'smoke') {
    if (fighter.grenades[itemId] >= 1) return false;
    fighter.money -= e.price;
    fighter.grenades[itemId] += 1;
    return true;
  }
  return false;
}

// Bots shop with the same money and prices: rifles when they can afford
// them, armour and a grenade with what is left, a defuse kit for defenders.
function botShop(state) {
  for (const f of state.fighters) {
    if (f.isPlayer || !f.alive) continue;
    if (f.money >= WEAPONS.rifle.price && state.round >= 2) buyItem(state, f, 'rifle');
    else if (f.money >= WEAPONS.smg.price) buyItem(state, f, 'smg');
    if (f.money >= EQUIPMENT.armor.price && Math.random() < 0.7) buyItem(state, f, 'armor');
    if (f.money >= EQUIPMENT.frag.price && Math.random() < 0.4) buyItem(state, f, 'frag');
    if (f.team === defendingTeam(state) && f.money >= EQUIPMENT.kit.price && Math.random() < 0.5) {
      buyItem(state, f, 'kit');
    }
  }
}

function endRound(state, winner, reason) {
  const loser = enemyTeam(winner);
  state.score[winner] += 1;
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] += 1;
  for (const f of state.fighters) {
    if (f.team === winner) {
      f.money = Math.min(MAX_MONEY, f.money + ECONOMY.win);
    } else {
      const bonus = Math.min(3, state.lossStreak[loser] - 1) * ECONOMY.lossStreakBonus;
      f.money = Math.min(MAX_MONEY, f.money + ECONOMY.loss + bonus);
    }
  }
  state.roundWinner = winner;
  state.roundReason = reason;
  state.phase = 'end';
  state.phaseTime = END_TIME;
  pushEvent(state, { type: 'roundEnd', winner, reason, score: { ...state.score } });
}

export function updateRounds(state, dt) {
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  state.phaseTime -= dt;

  if (state.phase === 'buy') {
    if (state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = ROUND_TIME;
      pushEvent(state, { type: 'roundLive' });
    }
    return;
  }

  if (state.phase === 'end') {
    if (state.phaseTime <= 0) {
      if (state.score.raider >= MATCH_WINS || state.score.sentinel >= MATCH_WINS || state.round >= 9) {
        state.matchWinner = state.score.raider === state.score.sentinel
          ? 'draw'
          : state.score.raider > state.score.sentinel ? 'raider' : 'sentinel';
        state.phase = 'matchEnd';
        pushEvent(state, { type: 'matchEnd', winner: state.matchWinner });
      } else {
        state.round += 1;
        startRound(state);
      }
    }
    return;
  }

  // Live: the bomb decides first, then elimination, then the clock.
  const bomb = state.bomb;
  const atk = attackingTeam(state);
  const def = defendingTeam(state);
  if (bomb.state === 'exploded') {
    endRound(state, atk, 'The charge detonated');
    return;
  }
  if (bomb.state === 'defused') {
    endRound(state, def, 'The charge was defused');
    return;
  }
  const atkAlive = aliveFighters(state, atk).length;
  const defAlive = aliveFighters(state, def).length;
  if (bomb.state !== 'planted') {
    if (atkAlive === 0) { endRound(state, def, 'Raiders eliminated'); return; }
    if (defAlive === 0) { endRound(state, atk, 'Sentinels eliminated'); return; }
    if (state.phaseTime <= 0) { endRound(state, def, 'Time expired'); return; }
  } else {
    // Planted: elimination of the defenders ends it at once; elimination of
    // the attackers leaves the fuse running for the defuse.
    if (defAlive === 0) { endRound(state, atk, 'Sentinels eliminated'); return; }
  }
}
