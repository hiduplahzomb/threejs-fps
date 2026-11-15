// weapons.js — the arsenal as data. Every gun is one row: damage, magazine,
// fire rate, spread and recoil. Spread is an angle in radians added to the
// aim direction; recoil kicks the pitch up and recovers. The numbers are
// tuned so stopping to aim beats spraying on the move: movement adds more
// spread than a full magazine of bloom, and crouching cuts the base spread.

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 'sidearm', price: 0,
    damage: 34, headMult: 3.0, legMult: 0.75,
    mag: 12, reserve: 60, interval: 0.22, auto: false, reload: 1.6,
    spread: 0.011, spreadMove: 0.006, bloom: 0.004, bloomMax: 0.03,
    recoil: 0.011, range: 60, pellets: 1, adsMult: 0.6, pitch: 1.15,
  },
  smg: {
    id: 'smg', name: 'VK-9 Vector', slot: 'primary', price: 1200,
    damage: 26, headMult: 3.0, legMult: 0.75,
    mag: 30, reserve: 120, interval: 0.095, auto: true, reload: 2.1,
    spread: 0.016, spreadMove: 0.007, bloom: 0.004, bloomMax: 0.05,
    recoil: 0.009, range: 55, pellets: 1, adsMult: 0.65, pitch: 1.35,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Dervish', slot: 'primary', price: 2700,
    damage: 36, headMult: 3.2, legMult: 0.75,
    mag: 30, reserve: 90, interval: 0.11, auto: true, reload: 2.4,
    spread: 0.010, spreadMove: 0.008, bloom: 0.005, bloomMax: 0.045,
    recoil: 0.014, range: 80, pellets: 1, adsMult: 0.5, pitch: 1.0,
  },
  shotgun: {
    id: 'shotgun', name: 'M870 Breacher', slot: 'primary', price: 1100,
    damage: 11, headMult: 2.0, legMult: 0.75,
    mag: 6, reserve: 24, interval: 0.85, auto: false, reload: 2.8,
    spread: 0.055, spreadMove: 0.006, bloom: 0.01, bloomMax: 0.06,
    recoil: 0.05, range: 22, pellets: 8, adsMult: 0.7, pitch: 0.7,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Longbow', slot: 'primary', price: 4750,
    damage: 110, headMult: 2.0, legMult: 0.75,
    mag: 5, reserve: 15, interval: 1.45, auto: false, reload: 3.2,
    spread: 0.002, spreadMove: 0.03, bloom: 0.02, bloomMax: 0.06,
    recoil: 0.09, range: 120, pellets: 1, adsMult: 0.15, pitch: 0.55,
    scopedFov: 28,
  },
};

export const EQUIPMENT = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, key: '4' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, key: '5' },
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650, key: '6' },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, key: '7' },
};

export const GRENADE = {
  fragRadius: 7,
  fragDamage: 95,
  fragFuse: 1.6,
  smokeRadius: 4.5,
  smokeTime: 9,
  throwSpeed: 15,
  throwUp: 4.5,
};

// Spread for one shot: base, plus movement, plus bloom from recent fire,
// reduced by aiming down sights and by crouching. Returns radians.
export function currentSpread(weapon, speed, bloom, ads, crouch) {
  let s = weapon.spread + weapon.spreadMove * speed + bloom;
  if (ads) s *= weapon.adsMult;
  if (crouch) s *= 0.75;
  return s;
}

// Damage after the hit location and the target's armour. Armour absorbs half
// the damage and loses as much armour as it absorbs.
export function damageFor(weapon, part, target) {
  let dmg = weapon.damage;
  if (part === 'head') dmg *= weapon.headMult;
  else if (part === 'legs') dmg *= weapon.legMult;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, dmg * 0.5);
    target.armor -= absorbed;
    dmg -= absorbed;
  }
  return Math.round(dmg);
}
