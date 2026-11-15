// audio.js — every sound is synthesized with the Web Audio API: no audio
// files, no network. Gunshots are filtered noise bursts with a low thump,
// UI sounds are short oscillator blips, and the bomb beeps accelerate as
// the fuse runs down. The context starts on the first user gesture (the
// browser requires it) and M mutes everything.

let ctx = null;
let master = null;
let muted = false;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  // One shared noise buffer; every burst reuses it.
  const len = ctx.sampleRate * 0.5;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function burst({ freq = 1200, q = 0.8, dur = 0.12, vol = 0.5, type = 'lowpass' }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone({ freq = 440, freqEnd = null, dur = 0.1, vol = 0.3, type = 'sine' }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function thump(vol = 0.5, dur = 0.14) {
  tone({ freq: 120, freqEnd: 40, dur, vol, type: 'sine' });
}

export const sfx = {
  shot(weaponId, dist = 0) {
    // Distant shots are quieter and duller, so firefights read by ear.
    const att = 1 / (1 + dist / 18);
    const pitch = { pistol: 1.15, smg: 1.35, rifle: 1.0, shotgun: 0.7, sniper: 0.55 }[weaponId] ?? 1;
    burst({ freq: 900 * pitch, dur: 0.1, vol: 0.5 * att });
    thump(0.45 * att, 0.12);
  },
  reload() {
    tone({ freq: 700, dur: 0.05, vol: 0.2, type: 'square' });
    setTimeout(() => tone({ freq: 500, dur: 0.06, vol: 0.22, type: 'square' }), 140);
  },
  empty() {
    tone({ freq: 1200, dur: 0.04, vol: 0.15, type: 'square' });
  },
  hit(headshot) {
    tone({ freq: headshot ? 1600 : 1100, dur: 0.06, vol: 0.25, type: 'triangle' });
  },
  kill() {
    tone({ freq: 880, freqEnd: 1320, dur: 0.12, vol: 0.25, type: 'triangle' });
  },
  hurt() {
    tone({ freq: 180, freqEnd: 90, dur: 0.12, vol: 0.3, type: 'sawtooth' });
  },
  plant() {
    tone({ freq: 660, dur: 0.12, vol: 0.3, type: 'square' });
    setTimeout(() => tone({ freq: 660, dur: 0.12, vol: 0.3, type: 'square' }), 180);
  },
  beep(urgent) {
    tone({ freq: urgent ? 1200 : 880, dur: 0.07, vol: 0.28, type: 'square' });
  },
  explosion() {
    burst({ freq: 300, dur: 0.9, vol: 0.9 });
    thump(0.9, 0.7);
  },
  roundWin(win) {
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.22, vol: 0.25, type: 'triangle' }), i * 130));
  },
  click() {
    tone({ freq: 900, dur: 0.04, vol: 0.18, type: 'square' });
  },
  buy() {
    tone({ freq: 1046, dur: 0.08, vol: 0.22, type: 'triangle' });
    setTimeout(() => tone({ freq: 1318, dur: 0.1, vol: 0.22, type: 'triangle' }), 80);
  },
  denied() {
    tone({ freq: 220, dur: 0.12, vol: 0.25, type: 'square' });
  },
};
