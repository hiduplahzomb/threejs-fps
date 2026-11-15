// mapdata.js — the Blackwater Dam map as data. One source of truth: the same
// boxes drive movement collision, line of sight, grenade bounces, the
// minimap and the meshes world.js builds. Nothing here touches three.js.
//
// Coordinates: metres, x east, z south, ground at y = 0. A box is centred at
// (x, z), spans w along x and d along z, and rises from y0 to y0 + h. Boxes
// with y0 > 1 are overhead (roofs, beams): they block shots and grenades but
// never movement, because a fighter walks under them.

// Every solid box on the map. kind picks the material in world.js.
export const BOXES = [
  // Perimeter. The north parapet is low on purpose: the reservoir and the
  // hills beyond it are the map's backdrop.
  { x: 0, z: -31.5, w: 94, d: 1, h: 1.2, kind: 'parapet' },
  { x: 0, z: 31.5, w: 94, d: 1, h: 4, kind: 'wall' },
  { x: -45.5, z: 0, w: 1, d: 64, h: 4, kind: 'wall' },
  { x: 45.5, z: 0, w: 1, d: 64, h: 4, kind: 'wall' },

  // Turbine Hall (site A), x -39..-21, z -26..-14. Two doors: south
  // (x -30..-26) and west (z -22..-18).
  { x: -30, z: -25.5, w: 18, d: 1, h: 5, kind: 'wall' },
  { x: -34.5, z: -14.5, w: 9, d: 1, h: 5, kind: 'wall' },
  { x: -23.5, z: -14.5, w: 5, d: 1, h: 5, kind: 'wall' },
  { x: -38.5, z: -24, w: 1, d: 4, h: 5, kind: 'wall' },
  { x: -38.5, z: -16, w: 1, d: 4, h: 5, kind: 'wall' },
  { x: -21.5, z: -20, w: 1, d: 12, h: 5, kind: 'wall' },
  { x: -30, z: -20, w: 18, d: 12, h: 0.5, y0: 5, kind: 'roof' },
  { x: -34, z: -23, w: 3, d: 3, h: 2.2, kind: 'turbine' },
  { x: -25, z: -17, w: 3, d: 3, h: 2.2, kind: 'turbine' },
  { x: -36, z: -16.5, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -24, z: -23.5, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },

  // Gatehouse (site B), x 34..42, z -26..-18, open to the west.
  { x: 38, z: -25.5, w: 8, d: 1, h: 4, kind: 'wall' },
  { x: 38, z: -18.5, w: 8, d: 1, h: 4, kind: 'wall' },
  { x: 41.5, z: -22, w: 1, d: 8, h: 4, kind: 'wall' },
  { x: 38, z: -22, w: 8, d: 8, h: 0.5, y0: 4, kind: 'roof' },

  // East warehouse: the block that makes the east lane a lane.
  { x: 29, z: 12, w: 6, d: 16, h: 5, kind: 'building' },
  { x: 29, z: 12, w: 6, d: 16, h: 0.5, y0: 5, kind: 'roof' },

  // Mid gantry: two pillars and a beam over the crest road.
  { x: -6, z: 0, w: 2, d: 2, h: 6, kind: 'pillar' },
  { x: 6, z: 0, w: 2, d: 2, h: 6, kind: 'pillar' },
  { x: 0, z: 0, w: 14, d: 1.5, h: 1, y0: 5.5, kind: 'beam' },

  // Free-standing pillars.
  { x: 0, z: -12, w: 1.5, d: 1.5, h: 5, kind: 'pillar' },
  { x: -16, z: -6, w: 1.5, d: 1.5, h: 5, kind: 'pillar' },
  { x: 16, z: 8, w: 1.5, d: 1.5, h: 5, kind: 'pillar' },

  // Containers (2.6 m: block sight and movement).
  { x: 26, z: -22, w: 6, d: 2.4, h: 2.6, kind: 'containerBlue' },
  { x: -8, z: -24, w: 6, d: 2.4, h: 2.6, kind: 'containerGreen' },
  { x: 12, z: 20, w: 6, d: 2.4, h: 2.6, kind: 'containerRed' },
  { x: -36, z: 18, w: 2.4, d: 6, h: 2.6, kind: 'containerBlue' },

  // Crates (1.1 m: block movement, can be shot over).
  { x: -42, z: 8, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -38, z: -4, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -14, z: 2, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 14, z: 3, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 0, z: 4, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 39, z: 12, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 38, z: 0, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 32, z: -2, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -10, z: 24, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 8, z: 25, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 24, z: 21, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -28, z: -8, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: 18, z: -10, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },
  { x: -4, z: -16, w: 1.1, d: 1.1, h: 1.1, kind: 'crate' },

  // Stacked crates (2.2 m: block sight).
  { x: -20, z: 27, w: 2.2, d: 2.2, h: 2.2, kind: 'crateBig' },
  { x: 27, z: -10, w: 2.2, d: 2.2, h: 2.2, kind: 'crateBig' },
  { x: -33, z: -12, w: 2.2, d: 2.2, h: 2.2, kind: 'crateBig' },

  // Concrete barriers (1.1 m: crouch cover).
  { x: -6, z: -3, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
  { x: 6, z: 3, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
  { x: 30, z: -2, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
  { x: -24, z: 6, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
  { x: 0, z: 14, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
  { x: -34, z: 0, w: 3, d: 0.6, h: 1.1, kind: 'barrier' },
];

// Spawn points. yaw 0 faces north (-z); yaw PI faces south.
export const SPAWNS = {
  raider: [
    { x: -38, z: 24, yaw: 0 },
    { x: -36, z: 26, yaw: 0 },
    { x: -40, z: 26, yaw: 0 },
    { x: -34, z: 24, yaw: 0 },
    { x: -38, z: 28, yaw: 0 },
  ],
  sentinel: [
    { x: 38, z: -24, yaw: Math.PI },
    { x: 36, z: -24, yaw: Math.PI },
    { x: 40, z: -24, yaw: Math.PI },
    { x: 34, z: -22, yaw: Math.PI },
    { x: 38, z: -20, yaw: Math.PI },
  ],
};

// Bomb sites. zone is the plantable rectangle (x0, z0, x1, z1).
export const SITES = {
  A: { name: 'Turbine Hall', letter: 'A', zone: [-36, -24, -24, -16], center: { x: -30, z: -20 } },
  B: { name: 'Gatehouse', letter: 'B', zone: [24, -24, 38, -12], center: { x: 30, z: -18 } },
};

// Waypoint graph for bot navigation. Every edge was checked against BOXES:
// no edge crosses a box, and every node stands in open ground.
export const NODES = [
  { x: -38, z: 24 }, // 0 attacker spawn
  { x: -30, z: 24 }, // 1
  { x: -16, z: 24 }, // 2
  { x: 0, z: 24 }, // 3
  { x: 20, z: 24 }, // 4
  { x: 34, z: 24 }, // 5
  { x: -40, z: 14 }, // 6 west lane
  { x: -40, z: 2 }, // 7
  { x: -38, z: -8 }, // 8
  { x: -40, z: -14 }, // 9
  { x: -40, z: -20 }, // 10 west door approach
  { x: -30, z: -20 }, // 11 site A
  { x: -18, z: 12 }, // 12
  { x: -20, z: 0 }, // 13 mid west
  { x: -9, z: -3 }, // 14
  { x: 0, z: 0 }, // 15 mid
  { x: 9, z: -3 }, // 16
  { x: 20, z: 0 }, // 17 mid east
  { x: -28, z: -12 }, // 18 A south door
  { x: -28, z: -20 }, // 19 site A south
  { x: 36, z: 14 }, // 20 east lane
  { x: 36, z: 2 }, // 21
  { x: 34, z: -6 }, // 22
  { x: 30, z: -14 }, // 23 site B
  { x: 26, z: -2 }, // 24 mid east connector
  { x: 30, z: -10 }, // 25
  { x: 38, z: -24 }, // 26 defender spawn
  { x: 34, z: -20 }, // 27 gatehouse door
  { x: 24, z: -20 }, // 28 B west
  { x: 10, z: -14 }, // 29 mid north
  { x: -10, z: -12 }, // 30
  { x: -20, z: -16 }, // 31 A east
  { x: -20, z: -10 }, // 32
  { x: -33, z: -17 }, // 33 A hold
  { x: 33, z: -16 }, // 34 B hold
  { x: 0, z: -6 }, // 35 mid hold
  { x: -36, z: -20 }, // 36 A corner hold
  { x: 38, z: -14 }, // 37 B corner hold
];

export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [0, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
  [2, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [15, 35],
  [13, 18], [18, 19], [19, 11], [13, 32], [32, 18],
  [5, 20], [20, 21], [21, 22], [22, 23],
  [17, 24], [24, 25], [25, 23], [24, 22],
  [26, 27], [27, 28], [28, 23], [28, 37], [27, 34],
  [28, 29], [29, 30], [30, 31], [31, 32],
  [11, 33], [11, 36], [19, 33],
  [23, 34], [23, 37],
  [14, 30], [16, 29], [17, 29], [13, 35], [35, 16],
];

// Attack routes: named plans the attacking team picks each round. Each is a
// list of waypoint ids from spawn to a site.
export const ATTACK_PLANS = [
  { name: 'A via West', site: 'A', path: [0, 6, 7, 8, 9, 10, 11] },
  { name: 'A via Mid', site: 'A', path: [2, 12, 13, 18, 19, 11] },
  { name: 'B via East', site: 'B', path: [5, 20, 21, 22, 23] },
  { name: 'B via Mid', site: 'B', path: [3, 4, 17, 24, 25, 23] },
  { name: 'Split A/B', site: 'A', path: [2, 12, 13, 14, 15, 29, 30, 31, 32, 18, 19, 11] },
];

// Defence assignments: where each defender holds at round start.
export const DEFEND_SPOTS = [
  { node: 33, watch: 19 }, // A hold, watches the south door
  { node: 36, watch: 10 }, // A corner, watches the west door
  { node: 34, watch: 23 }, // B hold, watches the plaza
  { node: 37, watch: 25 }, // B corner, watches the mid approach
  { node: 35, watch: 15 }, // mid, watches the crest road
];

// Floodlights. y is the lamp height; pole meshes are built from these.
export const LIGHTS = [
  { x: -30, y: 4.6, z: -20, color: 0xcfe4ff, intensity: 60, distance: 26 }, // hall
  { x: 38, y: 3.8, z: -22, color: 0xcfe4ff, intensity: 40, distance: 20 }, // gatehouse
  { x: 0, y: 6.2, z: 0, color: 0xff9a3c, intensity: 90, distance: 34 }, // gantry
  { x: -40, y: 5.5, z: 8, color: 0xff9a3c, intensity: 70, distance: 30 }, // west lane
  { x: 36, y: 5.5, z: 8, color: 0xff9a3c, intensity: 70, distance: 30 }, // east lane
  { x: -8, y: 5.5, z: 22, color: 0xff9a3c, intensity: 70, distance: 30 }, // south road
];

// Where the bomb may be planted: inside a site zone, on open ground.
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const [x0, z0, x1, z1] = SITES[key].zone;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return key;
  }
  return null;
}
