// state.js — the game's one state object. Every system reads and writes this
// and nothing else; the renderer only copies it onto meshes. A fighter is a
// plain object (player and bots share the shape; bots add an `ai` field).
// Events are pushed here by the simulation and drained once per frame by the
// HUD and the audio, so feedback never runs inside the fixed step.

import { WEAPONS } from './weapons.js';

export const TICK = 1 / 60; // fixed simulation step, seconds
export const ROUND_TIME = 100; // live round length
export const BUY_TIME = 12; // buy phase at each round's start
export const END_TIME = 5; // banner time between rounds
export const BOMB_FUSE = 40;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 6;
export const DEFUSE_KIT_TIME = 3;
export const MATCH_WINS = 5; // first to 5 rounds takes the match
export const HALFTIME_ROUND = 4; // sides swap after round 4

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  loss: 1400,
  lossStreakBonus: 500,
  plant: 300,
};

export const TEAMS = {
  raider: { name: 'Raiders', color: 0xe8641c, css: '#e8641c', attack: true },
  sentinel: { name: 'Sentinels', color: 0x2fb8a6, css: '#2fb8a6', attack: false },
};

export const BOT_NAMES = {
  raider: ['VEX', 'JOLT', 'HAVOC', 'RUST', 'NOVA'],
  sentinel: ['WARDEN', 'SABLE', 'ORION', 'FABLE', 'KITE'],
};

export function makeFighter(id, name, team, isPlayer) {
  return {
    id, name, team, isPlayer,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    vx: 0, vz: 0, vy: 0, onGround: true,
    hp: 100, armor: 0, alive: true,
    crouch: false, ads: false,
    weapon: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    owned: { pistol: true, primary: null },
    grenades: { frag: 0, smoke: 0 },
    hasKit: false, carryingBomb: false,
    bloom: 0, recoil: 0, fireCooldown: 0, reloading: 0,
    money: ECONOMY.start, kills: 0, deaths: 0,
    ai: null, // bots only
    mesh: null, // renderer-owned view, set by world.js
    lastDamageFrom: null, lastDamageDir: 0,
  };
}

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | end | matchEnd
    phaseTime: 0,
    round: 1,
    score: { raider: 0, sentinel: 0 },
    lossStreak: { raider: 0, sentinel: 0 },
    playerTeam: 'raider', // the player attacks first, defends after halftime
    fighters: [],
    player: null,
    bomb: {
      state: 'carried', // carried | dropped | planted | exploded | defused
      site: null, x: 0, z: 0, fuse: 0, carrierId: null,
      plantProgress: 0, defuseProgress: 0, planterId: null, defuserId: null,
    },
    plan: null, // this round's attack plan (see mapdata ATTACK_PLANS)
    grenades: [], // live thrown grenades
    smokes: [], // active smoke clouds
    noises: [], // recent loud sounds bots can hear {x, z, radius, until}
    events: [], // drained once per frame
    kills: [], // killfeed entries {killer, victim, weapon, headshot, time}
    callouts: [], // radio lines {text, team, time}
    time: 0, // total simulation time
    roundWinner: null,
    roundReason: '',
    paused: false,
    matchWinner: null,
  };
}

export function pushEvent(state, evt) {
  state.events.push(evt);
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

export function aliveFighters(state, team) {
  return state.fighters.filter((f) => f.alive && (!team || f.team === team));
}

export function enemyTeam(team) {
  return team === 'raider' ? 'sentinel' : 'raider';
}

// The attacking team this round: Raiders attack rounds 1-4, Sentinels 5-9.
export function attackingTeam(state) {
  return state.round <= HALFTIME_ROUND ? 'raider' : 'sentinel';
}

export function defendingTeam(state) {
  return enemyTeam(attackingTeam(state));
}
