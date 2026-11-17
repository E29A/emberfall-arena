// Emberfall Arena — every tuning number and colour in one place. The arena is a fixed
// 1280x720 logical field; the renderer letterboxes it into the window, so no rule below
// depends on the size of the screen the game happens to open on.

export const FIELD = { width: 1280, height: 720, wall: 30 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  maxHp: 100,
  speed: 268,
  /** Seconds of invulnerability after any hit lands, so one crowd cannot melt the player in a frame. */
  hurtGrace: 0.6,
  dashTime: 0.16,
  dashSpeed: 980,
  dashCooldown: 2.1,
  dashGrace: 0.12,
};

export const WEAPON = {
  damage: 12,
  fireRate: 6.5,
  bulletSpeed: 740,
  bulletRadius: 4,
  bulletLife: 0.95,
  spreadStep: 0.085,
  critDamage: 2,
};

/** Enemy kinds: hit points, pace, size, touch damage and score, all before the per-wave scaling. */
export const ENEMIES = {
  drifter: { hp: 22, speed: 108, radius: 15, damage: 12, score: 50 },
  spitter: { hp: 30, speed: 92, radius: 16, damage: 10, score: 80, boltSpeed: 250, boltDamage: 10, fireEvery: 2.3, keepNear: 250, keepFar: 350 },
  brute: { hp: 175, speed: 54, radius: 31, damage: 22, score: 150 },
  splitter: { hp: 34, speed: 86, radius: 19, damage: 12, score: 70 },
  mini: { hp: 9, speed: 178, radius: 9, damage: 8, score: 25 },
};

export const BOSS = {
  name: 'THE HOLLOW WARDEN',
  hp: 2300,
  radius: 54,
  speed: 62,
  damage: 26,
  score: 2000,
  boltSpeed: 265,
  burstEvery: 3.1,
  burstBolts: 14,
  chargeEvery: 5.2,
  chargeSpeed: 540,
  summonEvery: 7.5,
};

/** How much tougher each wave's enemies are than the last wave's. */
export const WAVE_SCALING = { hpPerWave: 0.13, speedPerWave: 0.012 };

export const DROPS = {
  heartChance: 0.055,
  bruteHeartChance: 0.4,
  heartHeal: 26,
  embersPerKill: 2,
  emberScore: 10,
  magnetSpeed: 520,
};

export const PALETTE = {
  void: '#0b0710',
  floor: '#171021',
  floorEdge: '#241533',
  grid: '#352152',
  gridGlow: '#3d2560',
  player: '#3fe8c8',
  playerCore: '#d8fff6',
  bullet: '#8ffce9',
  bolt: '#ff9d5c',
  drifter: '#ff5470',
  spitter: '#b388ff',
  brute: '#ff8a3d',
  splitter: '#ffd23d',
  mini: '#ffe89a',
  boss: '#ff3d5e',
  bossCore: '#ffb3c1',
  heart: '#ff6b9d',
  ember: '#ffa53d',
  text: '#f4ecff',
  muted: '#a794c4',
  danger: '#ff4757',
  gold: '#ffd23d',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall-arena.best';
