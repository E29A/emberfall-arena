// Waves: the ten-wave script of the run and the director that stages it. Each wave is a
// composition of enemy kinds; the director shuffles it into a spawn queue, then feeds the
// arena through glowing portals that telegraph half a second before an enemy steps out —
// nothing ever simply appears on top of the player. Wave 10 is the Hollow Warden, with a
// slow trickle of Drifters while he lives so his fight never goes quiet.
import { randomEdgePoint } from './random.js';
import { countActiveEnemies, KIND_BOSS, KIND_BRUTE, KIND_DRIFTER, KIND_SPITTER, KIND_SPLITTER, spawnBoss, spawnEnemy } from './enemies.js';

export const LAST_WAVE = 10;

const COMPOSITIONS = [
  { drifter: 6 },
  { drifter: 9, splitter: 2 },
  { drifter: 8, spitter: 3, splitter: 2 },
  { drifter: 12, brute: 2, splitter: 3 },
  { drifter: 10, spitter: 5, brute: 2, splitter: 4 },
  { drifter: 14, spitter: 4, brute: 3, splitter: 5 },
  { drifter: 16, spitter: 6, brute: 3, splitter: 6 },
  { drifter: 18, spitter: 6, brute: 4, splitter: 6 },
  { drifter: 20, spitter: 8, brute: 5, splitter: 8 },
  { boss: 1 },
];

const KIND_BY_NAME = { drifter: KIND_DRIFTER, spitter: KIND_SPITTER, brute: KIND_BRUTE, splitter: KIND_SPLITTER, boss: KIND_BOSS };
const PORTAL_SECONDS = 0.55;
const MAX_ALIVE = 42;

export function createWaveDirector(random) {
  return {
    random,
    queue: [],
    portals: [],
    spawnTimer: 0,
    trickleTimer: 11,
    wave: 0,

    /** Load a wave's composition into the spawn queue, shuffled so no two runs open alike. */
    startWave(wave) {
      this.wave = wave;
      this.queue = [];
      this.portals = [];
      this.spawnTimer = 0.9;
      this.trickleTimer = 11;
      const composition = COMPOSITIONS[wave - 1] ?? COMPOSITIONS[COMPOSITIONS.length - 1];
      for (const [name, count] of Object.entries(composition)) {
        for (let index = 0; index < count; index += 1) this.queue.push(KIND_BY_NAME[name]);
      }
      for (let index = this.queue.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(this.random() * (index + 1));
        [this.queue[index], this.queue[swap]] = [this.queue[swap], this.queue[index]];
      }
      // The Warden enters alone, from the top, never lost inside the shuffle.
      const bossIndex = this.queue.indexOf(KIND_BOSS);
      if (bossIndex > 0) {
        this.queue.splice(bossIndex, 1);
        this.queue.unshift(KIND_BOSS);
      }
    },

    /** Enemies still to come this wave: queued, stepping through portals, or alive. */
    remaining(world) {
      return this.queue.length + this.portals.length + countActiveEnemies(world.enemies);
    },

    update(world, dt) {
      const { state, player } = world;

      // Portals mature into enemies.
      for (let index = this.portals.length - 1; index >= 0; index -= 1) {
        const portal = this.portals[index];
        portal.timer -= dt;
        if (portal.timer > 0) continue;
        this.portals.splice(index, 1);
        if (portal.kind === KIND_BOSS) {
          spawnBoss(world.enemies, portal.x, portal.y);
          state.events.push('bossenter');
          state.shake = Math.max(state.shake, 9);
        } else {
          spawnEnemy(world.enemies, portal.kind, portal.x, portal.y, state.wave, this.random);
        }
        world.particles.burst(portal.x, portal.y, '#b388ff', 10, 130, 2.6, 0.35);
      }

      // While the Warden lives, his arena refills a little at a time.
      if (this.wave === LAST_WAVE && this.queue.length === 0) {
        this.trickleTimer -= dt;
        if (this.trickleTimer <= 0) {
          this.trickleTimer = 11;
          if (countActiveEnemies(world.enemies) < 11) {
            this.queue.push(KIND_DRIFTER, KIND_DRIFTER);
          }
        }
      }

      this.spawnTimer -= dt;
      if (this.spawnTimer > 0 || this.queue.length === 0) return;
      if (this.portals.length >= 6 || countActiveEnemies(world.enemies) >= MAX_ALIVE) return;
      this.spawnTimer = this.wave >= 7 ? 0.38 : 0.52;
      const kind = this.queue.shift();
      const point = kind === KIND_BOSS
        ? { x: 640, y: 118 }
        : randomEdgePoint(this.random, player.x, player.y, 340);
      this.portals.push({ kind, x: point.x, y: point.y, timer: PORTAL_SECONDS, total: PORTAL_SECONDS });
    },

    clear() {
      this.queue = [];
      this.portals = [];
    },
  };
}
