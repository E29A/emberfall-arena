// The world: every system wired together and the one fixed-step update that runs the
// game. It owns the player, the enemy pool, both projectile pools, the pickups, the
// particles, the wave director and the run's bookkeeping (score, kills, time, banners,
// screen shake, hit-stop). Collisions live here because this is the only place that can
// see both sides of them. Nothing in this file touches the DOM or audio: the step takes
// a plain input object and reports what happened as event names on state.events, which
// keeps the whole simulation runnable — and testable — under Node.
import { DROPS, FIELD, PALETTE, PLAYER, WEAPON } from './config.js';
import { randomRange } from './random.js';
import { createPlayer, isInvulnerable, resetPlayer, updatePlayer } from './player.js';
import { createParticleSystem } from './particles.js';
import { clearProjectiles, createProjectilePools, fireBullet, updateProjectiles } from './projectiles.js';
import { clearPickups, createPickups, PICKUP_HEART, spawnPickup, updatePickups } from './pickups.js';
import {
  clearEnemies, countActiveEnemies, createEnemyPool, findBoss, KIND_BOSS, KIND_BRUTE, KIND_MINI,
  KIND_SPLITTER, separateEnemies, spawnEnemy, updateEnemies,
} from './enemies.js';
import { createWaveDirector, LAST_WAVE } from './waves.js';
import { applyUpgrade, rollUpgradeChoices } from './upgrades.js';

export const PHASE_COMBAT = 'combat';
export const PHASE_UPGRADE = 'upgrade';
export const PHASE_VICTORY = 'victory';
export const PHASE_OVER = 'over';
export const PHASE_ATTRACT = 'attract';

const ENEMY_COLORS = {
  drifter: PALETTE.drifter, spitter: PALETTE.spitter, brute: PALETTE.brute,
  splitter: PALETTE.splitter, mini: PALETTE.mini, boss: PALETTE.boss,
};

export function createWorld(random) {
  const state = {
    phase: PHASE_ATTRACT,
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    timeSurvived: 0,
    events: [],
    shake: 0,
    hitStop: 0,
    banner: { title: '', sub: '', timer: 0, total: 1 },
    choices: [],
    attract: true,
    motesTimer: 0,
  };

  const world = {
    random,
    state,
    player: createPlayer(),
    enemies: createEnemyPool(),
    pools: createProjectilePools(),
    pickups: createPickups(),
    particles: createParticleSystem(random),
    director: createWaveDirector(random),

    boss() {
      return findBoss(this.enemies);
    },

    remaining() {
      return this.director.remaining(this);
    },

    setBanner(title, sub, seconds = 2.2) {
      state.banner.title = title;
      state.banner.sub = sub;
      state.banner.timer = seconds;
      state.banner.total = seconds;
    },

    /** A fresh run: wave 1, a whole ship, an empty arena, and the first banner. */
    startRun() {
      resetPlayer(this.player);
      clearEnemies(this.enemies);
      clearProjectiles(this.pools);
      clearPickups(this.pickups);
      this.particles.clear();
      state.phase = PHASE_COMBAT;
      state.attract = false;
      state.wave = 1;
      state.score = 0;
      state.kills = 0;
      state.timeSurvived = 0;
      state.shake = 0;
      state.hitStop = 0;
      state.choices = [];
      this.director.startWave(1);
      this.setBanner('WAVE 1', 'Survive the emberfall');
      state.events.push('wave');
    },

    /** The title screen's living backdrop: a calm arena with enemies wandering it. */
    startAttract() {
      resetPlayer(this.player);
      clearEnemies(this.enemies);
      clearProjectiles(this.pools);
      clearPickups(this.pickups);
      this.particles.clear();
      state.phase = PHASE_ATTRACT;
      state.attract = true;
      state.wave = 0;
      const kinds = ['drifter', 'spitter', 'drifter', 'splitter', 'brute', 'drifter', 'spitter', 'drifter'];
      for (const kind of kinds) {
        const x = randomRange(random, 120, FIELD.width - 120);
        const y = randomRange(random, 110, FIELD.height - 110);
        if (Math.hypot(x - this.player.x, y - this.player.y) < 190) continue;
        spawnEnemy(this.enemies, kind, x, y, 1, random);
      }
    },

    /** Take the card at `index` from the between-wave choices and start the next wave. */
    chooseUpgrade(index) {
      if (state.phase !== PHASE_UPGRADE) return;
      const def = state.choices[index];
      if (!def) return;
      applyUpgrade(this, def);
      state.choices = [];
      state.wave += 1;
      this.director.startWave(state.wave);
      state.phase = PHASE_COMBAT;
      this.setBanner(`WAVE ${state.wave}`, state.wave === LAST_WAVE ? 'The Hollow Warden stirs below' : def.name + ' fitted');
      state.events.push('wave');
    },

    hurtPlayer(damage) {
      const player = this.player;
      if (isInvulnerable(player) || state.phase !== PHASE_COMBAT) return;
      player.hp -= damage;
      player.hurtTimer = PLAYER.hurtGrace;
      state.shake = Math.max(state.shake, 7);
      this.particles.burst(player.x, player.y, PALETTE.danger, 14, 240, 3, 0.4);
      this.particles.floatText(player.x, player.y - 20, `-${Math.round(damage)}`, PALETTE.danger, 16);
      state.events.push('hurt');
      if (player.hp <= 0) {
        player.hp = 0;
        state.phase = PHASE_OVER;
        state.shake = 14;
        state.hitStop = 0.09;
        this.particles.burst(player.x, player.y, PALETTE.player, 46, 380, 3.6, 0.8);
        this.particles.bloom(player.x, player.y, PALETTE.ember, 22);
        state.events.push('over');
      }
    },

    killEnemy(enemy) {
      enemy.active = false;
      state.score += enemy.score;
      state.kills += 1;
      const color = ENEMY_COLORS[enemy.kind];
      this.particles.burst(enemy.x, enemy.y, color, enemy.kind === KIND_BRUTE || enemy.kind === KIND_BOSS ? 34 : 16, 300, 3.2, 0.55);
      this.particles.floatText(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, PALETTE.gold, enemy.kind === KIND_BOSS ? 26 : 14);
      state.events.push('kill');
      if (enemy.kind === KIND_BRUTE) state.hitStop = Math.max(state.hitStop, 0.04);

      // Drops: a few embers every kill, a heart now and then, Brutes are generous.
      const embers = enemy.kind === KIND_BOSS ? 12 : enemy.kind === KIND_BRUTE ? 4 : random() < 0.6 ? 2 : 1;
      for (let index = 0; index < embers; index += 1) spawnPickup(this.pickups, 'ember', enemy.x, enemy.y, random);
      const heartChance = enemy.kind === KIND_BRUTE ? DROPS.bruteHeartChance : enemy.kind === KIND_MINI ? 0.01 : DROPS.heartChance;
      if (random() < heartChance) spawnPickup(this.pickups, PICKUP_HEART, enemy.x, enemy.y, random);

      if (enemy.kind === KIND_SPLITTER) {
        for (const side of [-1, 1]) {
          const mini = spawnEnemy(this.enemies, KIND_MINI, enemy.x + side * 16, enemy.y + (side * 7), state.wave, random);
          if (mini) {
            mini.knockX = side * 130;
            mini.knockY = -40;
          }
        }
        state.events.push('split');
      }

      if (enemy.kind === KIND_BOSS) {
        state.phase = PHASE_VICTORY;
        state.shake = 15;
        state.hitStop = 0.12;
        this.particles.bloom(enemy.x, enemy.y, PALETTE.boss, 30);
        this.particles.burst(enemy.x, enemy.y, PALETTE.ember, 60, 460, 4, 0.9);
        // The Warden's court dies with him: clear the field in sparks, for no score.
        for (const other of this.enemies.list) {
          if (other.active) {
            other.active = false;
            this.particles.burst(other.x, other.y, ENEMY_COLORS[other.kind], 10, 220, 2.6, 0.45);
          }
        }
        for (const bolt of this.pools.bolts) bolt.active = false;
        state.events.push('win');
      }
    },

    /** Fire the player's gun once: a centred fan of bolts, each rolled for a crit. */
    fireGuns() {
      const player = this.player;
      const shots = player.multishot;
      for (let index = 0; index < shots; index += 1) {
        const offset = (index - (shots - 1) / 2) * WEAPON.spreadStep;
        const crit = random() < player.critChance;
        fireBullet(
          this.pools,
          player.x + Math.cos(player.angle) * (player.radius + 6),
          player.y + Math.sin(player.angle) * (player.radius + 6),
          player.angle + offset,
          player.bulletSpeed,
          player.damage * (crit ? WEAPON.critDamage : 1),
          WEAPON.bulletLife,
          player.pierce,
          crit,
        );
      }
      player.fireTimer = 1 / player.fireRate;
      this.particles.burst(player.x + Math.cos(player.angle) * 24, player.y + Math.sin(player.angle) * 24, PALETTE.bullet, 2, 90, 2, 0.12);
      state.events.push('shoot');
    },

    collide() {
      const player = this.player;
      // Player bolts against enemies.
      for (const bullet of this.pools.bullets) {
        if (!bullet.active) continue;
        for (const enemy of this.enemies.list) {
          if (!enemy.active || bullet.hitSet.has(enemy)) continue;
          const dx = enemy.x - bullet.x;
          const dy = enemy.y - bullet.y;
          const reach = enemy.radius + bullet.radius;
          if (dx * dx + dy * dy > reach * reach) continue;
          bullet.hitSet.add(enemy);
          enemy.hp -= bullet.damage;
          enemy.flashTimer = 0.09;
          const resist = enemy.kind === KIND_BOSS ? 0.04 : enemy.kind === KIND_BRUTE ? 0.25 : 1;
          enemy.knockX += bullet.vx * 0.16 * resist;
          enemy.knockY += bullet.vy * 0.16 * resist;
          this.particles.burst(bullet.x, bullet.y, ENEMY_COLORS[enemy.kind], 4, 170, 2.2, 0.3);
          this.particles.floatText(enemy.x, enemy.y - enemy.radius - 4, String(Math.round(bullet.damage)), bullet.crit ? PALETTE.gold : PALETTE.text, bullet.crit ? 19 : 13);
          state.events.push(bullet.crit ? 'crit' : 'hit');
          if (enemy.hp <= 0) this.killEnemy(enemy);
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            bullet.active = false;
            break;
          }
        }
      }
      // Enemy bolts against the player.
      for (const bolt of this.pools.bolts) {
        if (!bolt.active) continue;
        const dx = player.x - bolt.x;
        const dy = player.y - bolt.y;
        const reach = player.radius + bolt.radius;
        if (dx * dx + dy * dy > reach * reach) continue;
        bolt.active = false;
        this.hurtPlayer(bolt.damage);
      }
      // Bodies against the player.
      if (state.phase === PHASE_COMBAT) {
        for (const enemy of this.enemies.list) {
          if (!enemy.active) continue;
          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y;
          const reach = player.radius + enemy.radius - 3;
          if (dx * dx + dy * dy > reach * reach) continue;
          if (!isInvulnerable(player)) {
            this.hurtPlayer(enemy.damage);
            enemy.knockX -= dx * 6;
            enemy.knockY -= dy * 6;
          }
        }
      }
    },

    /**
     * Advance the whole game one fixed step. `input` is
     * { moveX, moveY, aimX, aimY, firing, dash } — real controls in the browser, an
     * autopilot in the screenshot scenes and the smoke test.
     */
    step(dt, input) {
      state.time += dt;
      if (state.banner.timer > 0) state.banner.timer -= dt;
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);

      // Ambient embers drift up through the arena in every phase.
      state.motesTimer -= dt;
      if (state.motesTimer <= 0) {
        state.motesTimer = 0.14;
        this.particles.mote(randomRange(random, 40, FIELD.width - 40), FIELD.height - 30);
      }

      if (state.hitStop > 0) {
        state.hitStop -= dt;
        this.particles.update(dt * 0.3);
        return;
      }

      if (state.phase === PHASE_ATTRACT) {
        updateEnemies(this, dt);
        this.particles.update(dt);
        return;
      }

      if (state.phase !== PHASE_COMBAT) {
        // Upgrade, victory and game-over screens: the world holds still, sparks settle.
        this.particles.update(dt);
        return;
      }

      state.timeSurvived += dt;
      const wasDashing = this.player.dashTimer > 0;
      updatePlayer(this.player, input, dt);
      if (this.player.dashTimer > 0) {
        this.particles.trail(this.player.x, this.player.y, this.player.radius * 0.9, PALETTE.player);
        if (!wasDashing) state.events.push('dash');
      }
      if (input.firing && this.player.fireTimer <= 0) this.fireGuns();

      this.director.update(this, dt);
      updateEnemies(this, dt);
      separateEnemies(this.enemies);
      for (const enemy of this.enemies.list) {
        if (!enemy.active) continue;
        enemy.x = Math.min(FIELD.width - FIELD.wall - 6, Math.max(FIELD.wall + 6, enemy.x));
        enemy.y = Math.min(FIELD.height - FIELD.wall - 6, Math.max(FIELD.wall + 6, enemy.y));
      }
      updateProjectiles(this.pools, dt);
      this.collide();

      const collected = updatePickups(this.pickups, this.player, dt);
      if (collected.hearts > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + DROPS.heartHeal * collected.hearts);
        this.particles.floatText(this.player.x, this.player.y - 26, `+${DROPS.heartHeal * collected.hearts} HP`, PALETTE.heart, 16);
        state.events.push('heal');
      }
      if (collected.embers > 0) {
        state.score += DROPS.emberScore * collected.embers;
        state.events.push('pickup');
      }

      this.particles.update(dt);

      if (state.phase === PHASE_COMBAT && this.director.remaining(this) === 0) {
        if (state.wave >= LAST_WAVE) {
          // The Warden is down but his court was cleared with him: nothing left to fight.
          state.phase = PHASE_VICTORY;
        } else {
          state.phase = PHASE_UPGRADE;
          state.choices = rollUpgradeChoices(random, this.player);
          state.events.push('waveclear');
        }
      }
    },
  };

  world.startAttract();
  return world;
}

export { countActiveEnemies, LAST_WAVE };
