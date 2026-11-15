// hud.js — every DOM element the player sees: health, ammo, timer, score,
// the minimap, the killfeed, the radio callouts, the buy menu, the round
// banner, the scoreboard and the overlays. It reads the state once per
// frame and writes only the values that changed, so the DOM stays quiet.

import { WEAPONS, EQUIPMENT, currentSpread } from './weapons.js';
import { BOXES, SITES } from './mapdata.js';
import { TEAMS, attackingTeam, defendingTeam } from './state.js';
import { toggleMute } from './audio.js';

const $ = (id) => document.getElementById(id);

const BUY_KEYS = [
  { key: 'Digit1', id: 'smg' },
  { key: 'Digit2', id: 'rifle' },
  { key: 'Digit3', id: 'shotgun' },
  { key: 'Digit4', id: 'sniper' },
  { key: 'Digit5', id: 'frag' },
  { key: 'Digit6', id: 'smoke' },
  { key: 'Digit7', id: 'armor' },
  { key: 'Digit8', id: 'kit' },
];

export function createHud(state, cb) {
  const hud = {
    buyOpen: false,
    scoreOpen: false,
    last: {},
    hitUntil: 0,
    toastUntil: 0,
    lastHp: 100,
    damageUntil: 0,
  };

  // --- buy menu, built once from the arsenal tables ---
  const itemsEl = $('buy-items');
  for (const { key, id } of BUY_KEYS) {
    const def = WEAPONS[id] ?? EQUIPMENT[id];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-item';
    row.dataset.item = id;
    row.innerHTML = `<span class="buy-key">${key.replace('Digit', '')}</span>
      <span class="buy-name">${def.name}</span>
      <span class="buy-price">$${def.price}</span>`;
    row.addEventListener('click', () => cb.onBuy(id));
    itemsEl.appendChild(row);
  }
  $('buy-close').addEventListener('click', () => setBuyOpen(false));

  function setBuyOpen(open) {
    if (open && state.phase !== 'buy') return;
    hud.buyOpen = open;
    $('buy-menu').hidden = !open;
    if (open) refreshBuy();
  }
  hud.setBuyOpen = setBuyOpen;

  function refreshBuy() {
    const p = state.player;
    if (!p) return;
    $('buy-money').textContent = `$${p.money}`;
    for (const el of itemsEl.children) {
      const id = el.dataset.item;
      const def = WEAPONS[id] ?? EQUIPMENT[id];
      const owned = (WEAPONS[id] && p.owned.primary === id)
        || (id === 'armor' && p.armor >= 100)
        || (id === 'kit' && p.hasKit)
        || ((id === 'frag' || id === 'smoke') && p.grenades[id] >= 1);
      el.classList.toggle('afford', p.money >= def.price && !owned);
      el.classList.toggle('owned', !!owned);
    }
  }
  hud.refreshBuy = refreshBuy;

  hud.toast = (text) => {
    $('toast').textContent = text;
    $('toast').hidden = false;
    hud.toastUntil = state.time + 2;
  };

  hud.showOverlay = (title, copy, button) => {
    $('overlay-title').textContent = title;
    $('overlay-copy').textContent = copy;
    $('play').textContent = button;
    $('overlay').hidden = false;
  };
  hud.hideOverlay = () => { $('overlay').hidden = true; };
  $('play').addEventListener('click', () => cb.onPlay());

  return hud;
}

function setText(hud, id, value) {
  if (hud.last[id] !== value) {
    hud.last[id] = value;
    $(id).textContent = value;
  }
}

function setWidth(hud, id, pct) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  if (hud.last[id] !== v) {
    hud.last[id] = v;
    $(id).style.width = `${v}%`;
  }
}

function fmtTime(s) {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.floor(Math.max(0, s) % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function drawMinimap(state) {
  const cv = $('minimap');
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,12,20,0.82)';
  ctx.fillRect(0, 0, W, H);
  const sx = (x) => ((x + 46) / 92) * W;
  const sy = (z) => ((z + 32) / 64) * H;
  // Walls and cover.
  ctx.fillStyle = 'rgba(180,190,205,0.55)';
  for (const b of BOXES) {
    if ((b.y0 ?? 0) > 1) continue;
    ctx.fillRect(sx(b.x - b.w / 2), sy(b.z - b.d / 2), Math.max(1, (b.w / 92) * W), Math.max(1, (b.d / 64) * H));
  }
  // Sites.
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    ctx.fillStyle = 'rgba(255,179,71,0.9)';
    ctx.fillText(key, sx(s.center.x), sy(s.center.z));
  }
  // The bomb, when it is on the ground.
  const bomb = state.bomb;
  if (bomb.state === 'dropped' || bomb.state === 'planted') {
    ctx.fillStyle = bomb.state === 'planted' ? '#ff4444' : '#ff9a3c';
    ctx.beginPath();
    ctx.arc(sx(bomb.x), sy(bomb.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Teammates (never enemies: no wallhack).
  for (const f of state.fighters) {
    if (!f.alive || f.team !== state.player.team) continue;
    if (f.isPlayer) {
      // The player is a white arrow that turns with the view.
      ctx.save();
      ctx.translate(sx(f.x), sy(f.z));
      ctx.rotate(Math.atan2(Math.sin(f.yaw), -Math.cos(f.yaw)) + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = TEAMS[f.team].css;
      ctx.beginPath();
      ctx.arc(sx(f.x), sy(f.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function updateHud(hud, state, input, dt, events) {
  const p = state.player;
  if (!p) return;

  // --- one-press UI keys (buy menu, scoreboard, mute) ---
  for (const code of input.drainUiPressed()) {
    if (code === 'KeyB' && state.phase === 'buy') hud.setBuyOpen(!hud.buyOpen);
    else if (code === 'Tab') { hud.scoreOpen = true; $('scoreboard').hidden = false; }
    else if (code === 'KeyM') hud.toast(toggleMute() ? 'Sound muted' : 'Sound on');
    else if (hud.buyOpen) {
      const item = BUY_KEYS.find((b) => b.key === code);
      if (item) hud._buyItem?.(item.id);
    }
  }
  if (!input.keys.has('Tab') && hud.scoreOpen) {
    hud.scoreOpen = false;
    $('scoreboard').hidden = true;
  }
  if (state.phase !== 'buy' && hud.buyOpen) hud.setBuyOpen(false);
  if (state.phase === 'buy' && !hud.buyOpen && !state._buyShown) {
    state._buyShown = true;
    hud.setBuyOpen(true);
  }
  if (state.phase !== 'buy') state._buyShown = false;

  // --- events this frame ---
  for (const e of events) {
    if (e.type === 'hit' && e.attacker === p) {
      hud.hitUntil = state.time + 0.14;
      $('hitmarker').classList.toggle('head', e.headshot);
    }
    if (e.type === 'kill' && e.attacker === p) hud.toast(e.headshot ? 'Headshot kill +$300' : 'Kill +$300');
    if (e.type === 'bombPlanted') hud.toast(`Charge planted at site ${e.site}`);
    if (e.type === 'bombDefused') hud.toast('Charge defused');
    if (e.type === 'roundStart') hud.toast(`Round ${e.round} — buy phase`);
  }

  // --- damage feedback: vignette + direction arc ---
  if (p.hp < hud.lastHp) {
    hud.damageUntil = state.time + 0.7;
    const from = state.fighters.find((f) => f.id === p.lastDamageFrom);
    if (from) {
      const ang = Math.atan2(-(from.x - p.x), -(from.z - p.z)) - p.yaw;
      $('damage-dir').style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
      $('damage-dir').hidden = false;
    }
    $('damage-vignette').hidden = false;
  }
  hud.lastHp = p.hp;
  if (state.time > hud.damageUntil) {
    $('damage-vignette').hidden = true;
    $('damage-dir').hidden = true;
  }
  $('hitmarker').classList.toggle('on', state.time < hud.hitUntil);
  if (state.time > hud.toastUntil) $('toast').hidden = true;

  // --- readouts ---
  setText(hud, 'health-num', String(Math.max(0, p.hp)));
  setWidth(hud, 'health-bar', p.hp);
  setText(hud, 'armor-num', String(Math.round(p.armor)));
  setWidth(hud, 'armor-bar', p.armor);
  setText(hud, 'money', `$${p.money}`);
  const w = WEAPONS[p.weapon];
  setText(hud, 'weapon-name', w.name);
  setText(hud, 'ammo-mag', String(p.mag));
  setText(hud, 'ammo-reserve', `/ ${p.reserve}`);
  $('ammo').classList.toggle('empty', p.mag === 0);
  $('ammo').classList.toggle('reloading', p.reloading > 0);
  setText(hud, 'score-raider', String(state.score.raider));
  setText(hud, 'score-sentinel', String(state.score.sentinel));
  setText(hud, 'round-label', `ROUND ${state.round} / 9`);
  const timerText = state.phase === 'buy'
    ? `BUY ${fmtTime(state.phaseTime)}`
    : state.bomb.state === 'planted'
      ? `💣 ${fmtTime(state.bomb.fuse)}`
      : fmtTime(state.phaseTime);
  setText(hud, 'timer', timerText);
  $('timer').classList.toggle('urgent', state.phaseTime < 10 && state.phase === 'live');

  // Crosshair gap follows the live spread, so the player sees accuracy.
  const spread = currentSpread(w, Math.hypot(p.vx, p.vz), p.bloom, p.ads, p.crouch);
  const gap = 4 + spread * 900;
  document.documentElement.style.setProperty('--ch-gap', `${gap.toFixed(1)}px`);
  $('crosshair').style.display = p.scoped ? 'none' : 'block';
  $('scope-overlay').hidden = !p.scoped || !p.alive;

  // Bomb status line.
  let bombText = '';
  if (state.bomb.state === 'planted') bombText = `CHARGE PLANTED AT ${state.bomb.site} — ${fmtTime(state.bomb.fuse)}`;
  else if (p.carryingBomb) bombText = 'YOU CARRY THE CHARGE — PLANT AT A OR B';
  else if (state.bomb.state === 'dropped') bombText = 'CHARGE DROPPED — RECOVER IT';
  else if (p.team === attackingTeam(state)) bombText = 'PLANT THE CHARGE AT A OR B';
  else bombText = 'DEFEND THE SITES';
  setText(hud, 'bomb-status', bombText);
  $('bomb-status').classList.toggle('urgent', state.bomb.state === 'planted');

  // Interaction prompt + channel progress.
  const prompt = $('prompt');
  if (p.channel) {
    const prog = p.channel.type === 'plant' ? state.bomb.plantProgress : state.bomb.defuseProgress;
    $('prompt-text').textContent = p.channel.type === 'plant' ? 'Planting the charge…' : 'Defusing…';
    $('prompt-bar').style.width = `${Math.round(prog * 100)}%`;
    prompt.hidden = false;
  } else if (p.carryingBomb && state.phase === 'live') {
    const site = (() => {
      for (const key of ['A', 'B']) {
        const [x0, z0, x1, z1] = SITES[key].zone;
        if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) return key;
      }
      return null;
    })();
    if (site) {
      $('prompt-text').textContent = `Hold E to plant at site ${site}`;
      $('prompt-bar').style.width = '0%';
      prompt.hidden = false;
    } else prompt.hidden = true;
  } else if (state.bomb.state === 'planted' && p.team === defendingTeam(state)) {
    const dx = p.x - state.bomb.x;
    const dz = p.z - state.bomb.z;
    if (dx * dx + dz * dz < 2.2 * 2.2) {
      $('prompt-text').textContent = 'Hold E to defuse';
      $('prompt-bar').style.width = '0%';
      prompt.hidden = false;
    } else prompt.hidden = true;
  } else prompt.hidden = true;

  // Teammates.
  const mates = state.fighters.filter((f) => f.team === p.team);
  const matesEl = $('teammates');
  const matesHtml = mates.map((f) => `
    <div class="mate ${f.alive ? '' : 'dead'}">
      <span class="mate-name">${f.isPlayer ? 'YOU' : f.name}${f.carryingBomb ? ' 💣' : ''}</span>
      <span class="mate-hp"><i style="width:${Math.max(0, f.hp)}%"></i></span>
      <span class="mate-num">${f.alive ? Math.max(0, f.hp) : '✕'}</span>
    </div>`).join('');
  if (hud.last.mates !== matesHtml) {
    hud.last.mates = matesHtml;
    matesEl.innerHTML = matesHtml;
  }

  // Killfeed (last 6 s) and radio callouts (last 6 s).
  const feed = state.kills.filter((k) => state.time - k.time < 6).map((k) => `
    <div class="feed-line"><b style="color:${TEAMS[k.killerTeam]?.css ?? '#fff'}">${k.killer}</b>
    <span class="feed-weapon">${k.headshot ? '◉ ' : ''}${k.weapon}</span>
    <b style="color:${TEAMS[k.victimTeam]?.css ?? '#fff'}">${k.victim}</b></div>`).join('');
  if (hud.last.feed !== feed) {
    hud.last.feed = feed;
    $('killfeed').innerHTML = feed;
  }
  const calls = state.callouts.filter((c) => state.time - c.time < 6).map((c) => `
    <div class="call-line" style="color:${TEAMS[c.team].css}">📻 ${c.text}</div>`).join('');
  if (hud.last.calls !== calls) {
    hud.last.calls = calls;
    $('callouts').innerHTML = calls;
  }

  // Round banner.
  if (state.phase === 'end' && state.roundWinner) {
    $('banner-title').textContent = `${TEAMS[state.roundWinner].name} WIN THE ROUND`;
    $('banner-sub').textContent = `${state.roundReason} — ${state.score.raider} : ${state.score.sentinel}`;
    $('banner').hidden = false;
  } else {
    $('banner').hidden = true;
  }

  // Scoreboard (Tab).
  if (hud.scoreOpen) {
    const rows = (team) => state.fighters
      .filter((f) => f.team === team)
      .sort((a, b) => b.kills - a.kills)
      .map((f) => `<tr><td>${f.isPlayer ? 'YOU' : f.name}</td><td>${f.kills}</td><td>${f.deaths}</td><td>$${f.money}</td></tr>`)
      .join('');
    const html = `
      <h3 style="color:${TEAMS.raider.css}">Raiders — ${state.score.raider}</h3>
      <table><tr><th>Player</th><th>K</th><th>D</th><th>$</th></tr>${rows('raider')}</table>
      <h3 style="color:${TEAMS.sentinel.css}">Sentinels — ${state.score.sentinel}</h3>
      <table><tr><th>Player</th><th>K</th><th>D</th><th>$</th></tr>${rows('sentinel')}</table>`;
    if (hud.last.scoreboard !== html) {
      hud.last.scoreboard = html;
      $('scoreboard-body').innerHTML = html;
    }
  }

  if (hud.buyOpen) hud.refreshBuy();
  drawMinimap(state);
}
