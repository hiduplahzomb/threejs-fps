// BLACKWATER — a round-based tactical FPS in three.js.
//
// Design brief. The fantasy: a night raid on a decommissioned dam. Two
// teams of five, short rounds, one charge to plant or stop. The player
// attacks first as a Raider, defends after halftime as a Sentinel; first to
// five rounds takes the match. Money won each round buys better guns in the
// buy menu; accuracy beats speed, because spread grows with movement and
// fire, and a headshot ends a duel. Bots run team plans (a picked route to
// a picked site), hold positions, rotate on radio callouts, and react to
// what they see and hear. The map is one original dam: a long crest road
// (mid), a riverside west lane, a service tunnel east, and two bomb sites —
// the Turbine Hall and the Gatehouse.
//
// Architecture. One state object (state.js) holds the whole game. The
// simulation runs on a fixed 60 Hz step, apart from rendering: main.js
// accumulates real time and steps the sim in TICK slices, then the frame
// copies state onto meshes (world.js), DOM (hud.js) and sound (audio.js).
// Events flow one way: the sim pushes them, the frame drains them once.
// Modules own one job each; bots and the player shoot through the same
// combat code, and buy through the same buyItem.
//
// How to play: node serve.ts, open http://localhost:8080, click to play.

import * as THREE from 'three';
import { createState, drainEvents, TICK } from './state.js';
import { updatePlayer, updateCamera, updateViewmodel } from './player.js';
import { updateBots } from './bots.js';
import { updateGrenades, updateBombChannels } from './combat.js';
import { startMatch, updateRounds, buyItem } from './rounds.js';
import { createWorld, syncFighters, syncBomb, menuCamera } from './world.js';
import { createHud, updateHud } from './hud.js';
import { createInput } from './input.js';
import { createEffects, updateEffects } from './effects.js';
import { initAudio, sfx } from './audio.js';

const state = createState();
const world = createWorld(document.getElementById('game'));
const fx = createEffects(world.scene, world.camera);

const hud = createHud(state, {
  onPlay: () => {
    initAudio();
    if (state.phase === 'menu' || state.phase === 'matchEnd') {
      startMatch(state);
      hud.hideOverlay();
      input.requestLock();
    } else if (state.paused) {
      state.paused = false;
      hud.hideOverlay();
      input.requestLock();
    }
  },
  onBuy: (id) => {
    if (buyItem(state, state.player, id)) {
      sfx.buy();
      hud.refreshBuy();
    } else {
      sfx.denied();
    }
  },
});
hud._buyItem = (id) => {
  if (buyItem(state, state.player, id)) {
    sfx.buy();
    hud.refreshBuy();
  } else {
    sfx.denied();
  }
};

const input = createInput(world.renderer.domElement, (locked) => {
  if (locked) {
    hadLock = true;
    if (state.paused) {
      state.paused = false;
      hud.hideOverlay();
    }
    return;
  }
  // Lock lost mid-round (Esc): pause, unless the buy menu took the mouse.
  if ((state.phase === 'live' || state.phase === 'buy') && !hud.buyOpen && !state.paused) {
    state.paused = true;
    hud.showOverlay('Paused', 'The round is waiting. Click to jump back in.', 'Resume');
  }
});

// The buy menu needs the mouse, so it drops the pointer lock while open and
// takes it back when it closes. Wrap the HUD's toggle to do both.
const setBuyOpen = hud.setBuyOpen;
hud.setBuyOpen = (open) => {
  setBuyOpen(open);
  if (open) {
    input.exitLock();
  } else if (state.phase === 'buy') {
    // Closed by the player (B key or button): a gesture is in flight, so the
    // re-lock is allowed.
    input.requestLock();
  } else if (state.phase === 'live' && !state.paused) {
    // Auto-closed as the round went live: no gesture is in flight, so a
    // re-lock would be refused — pause at once and let the player click
    // back in through the overlay instead of playing a live round with no
    // mouse for the 750 ms the stranded guard would need.
    state.paused = true;
    hud.showOverlay('Paused', 'The round is live. Click to jump back in.', 'Resume');
  }
};

// Whether the lock has engaged at least once this match. The frame loop
// uses it to tell "the first lock is still on its way" from "the lock was
// refused and the player is stranded without a mouse".
let hadLock = false;
// When the stranded-unlocked state first appeared (0 = not stranded).
let strandedSince = 0;

// --- one fixed simulation step ---
function stepGame(dt) {
  state.time += dt;
  updatePlayer(state, input, dt);
  updateBots(state, dt);
  updateGrenades(state, dt);
  updateBombChannels(state, dt);
  updateRounds(state, dt);
}

// --- sounds and overlays driven by the sim's events ---
let lastBeep = 0;
function handleEvents(events) {
  const p = state.player;
  for (const e of events) {
    if (e.type === 'muzzle') {
      const d = p && e.fighter !== p
        ? Math.hypot(e.fighter.x - p.x, e.fighter.z - p.z)
        : 0;
      sfx.shot(e.weapon, d);
    } else if (e.type === 'reload' && e.fighter === p) {
      sfx.reload();
    } else if (e.type === 'hit' && e.attacker === p) {
      sfx.hit(e.headshot);
    } else if (e.type === 'hit' && e.victim === p) {
      sfx.hurt();
    } else if (e.type === 'kill' && e.attacker === p) {
      sfx.kill();
    } else if (e.type === 'bombPlanted') {
      sfx.plant();
    } else if (e.type === 'explosion' || e.type === 'bombExploded') {
      sfx.explosion();
    } else if (e.type === 'roundEnd') {
      sfx.roundWin(e.winner === p.team);
    } else if (e.type === 'matchEnd') {
      input.exitLock();
      const won = e.winner === p.team;
      hud.showOverlay(
        e.winner === 'draw' ? 'Draw' : won ? 'Victory' : 'Defeat',
        e.winner === 'draw'
          ? `Dead even at ${state.score.raider} : ${state.score.sentinel}.`
          : `${state.score.raider} : ${state.score.sentinel} — ${won ? 'the dam is yours.' : 'the dam holds. Run it back?'}`,
        'Play again',
      );
      if (p) sfx.roundWin(won);
    }
  }
  // The planted charge beeps faster as the fuse runs down.
  if (state.bomb.state === 'planted') {
    const interval = state.bomb.fuse > 10 ? 1.0 : state.bomb.fuse > 5 ? 0.5 : 0.25;
    if (state.time - lastBeep > interval) {
      lastBeep = state.time;
      sfx.beep(state.bomb.fuse < 10);
    }
  }
}

// --- the frame: step the sim, then render the state ---
let acc = 0;
let elapsed = 0;
world.renderer.setAnimationLoop(() => {
  world.clock.update();
  const dt = Math.min(Math.max(world.clock.getDelta(), 0), 0.1);
  elapsed += dt;

  const inGame = state.phase === 'buy' || state.phase === 'live' || state.phase === 'end';
  if (inGame && !state.paused) {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 5) {
      stepGame(TICK);
      acc -= TICK;
      steps += 1;
    }
    if (steps === 5) acc = 0; // drop the backlog after a stall, never spiral
  }

  const events = drainEvents(state);
  handleEvents(events);

  const hudEl = document.getElementById('hud');
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    menuCamera(world.camera, elapsed);
    world.viewmodel.visible = false;
    hudEl.style.visibility = 'hidden';
  } else {
    hudEl.style.visibility = 'visible';
    // The buy menu needs a free cursor. A lock request that was already in
    // flight when the menu opened can land after the exit, so keep dropping
    // the lock while the menu is open instead of relying on one exit.
    if (hud.buyOpen && input.locked) input.exitLock();
    // If a re-lock was refused (the browser's cooldown after a quick menu
    // close), no lockchange fires — catch the stranded state here and pause,
    // so the player can click back in instead of playing without a mouse.
    // The lock takes a moment to re-engage after the menu closes, so the
    // stranded state must persist for 750 ms before the pause lands — a
    // lock still in flight must not flash the pause overlay.
    if (hadLock && (state.phase === 'buy' || state.phase === 'live') && !input.locked && !hud.buyOpen && !state.paused) {
      if (!strandedSince) strandedSince = performance.now();
      else if (performance.now() - strandedSince > 750) {
        strandedSince = 0;
        state.paused = true;
        hud.showOverlay('Paused', 'The round is waiting. Click to jump back in.', 'Resume');
      }
    } else {
      strandedSince = 0;
    }
    updateCamera(state, world.camera, dt);
    // Camera shake from explosions, layered over the base camera.
    if (fx.shake > 0) {
      world.camera.rotation.x += (Math.random() - 0.5) * fx.shake * 0.05;
      world.camera.rotation.z += (Math.random() - 0.5) * fx.shake * 0.05;
    }
    updateViewmodel(world.viewmodel, state, dt);
    world.viewmodel.visible = !state.player.scoped;
    syncFighters(world, state, dt);
    syncBomb(world, state);
    updateHud(hud, state, input, dt, events);
    document.getElementById('dead-note').hidden = !(state.phase === 'live' && state.player && !state.player.alive);
  }
  updateEffects(fx, state, dt, events);
  world.renderer.render(world.scene, world.camera);
});

window.addEventListener('resize', () => {
  world.camera.aspect = window.innerWidth / window.innerHeight;
  world.camera.updateProjectionMatrix();
  world.renderer.setSize(window.innerWidth, window.innerHeight);
});

// Test hook for automated playtests and screenshots: move the player, aim
// the camera, read the state, step the sim by hand. It only inspects and
// drives the same public state the game itself uses.
window.__fps = {
  state,
  world,
  input,
  step(n) {
    for (let i = 0; i < n; i += 1) {
      if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'end') {
        stepGame(TICK);
      } else break;
    }
  },
  teleport(x, z, yaw) {
    const p = state.player;
    if (!p) return;
    p.x = x;
    p.z = z;
    p.y = 0;
    if (yaw !== undefined) p.yaw = yaw;
    p.vx = 0;
    p.vz = 0;
  },
  aimAt(x, y, z) {
    const p = state.player;
    if (!p) return;
    p.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    const d = Math.hypot(x - p.x, z - p.z);
    p.pitch = Math.atan2(y - (p.y + 1.62), d);
  },
  fighters: () => state.fighters.map((f) => ({
    id: f.id, name: f.name, team: f.team, alive: f.alive,
    x: +f.x.toFixed(1), z: +f.z.toFixed(1), hp: f.hp,
  })),
};
