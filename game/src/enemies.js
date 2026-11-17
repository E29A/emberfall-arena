// Enemies: five kinds with distinct silhouettes and one job each, plus the Hollow Warden.
// Drifters chase, Spitters keep their distance and shoot, Brutes soak damage and walk
// through the fight, Splitters burst into Minis when they die, and Minis are fast and
// fragile. The Warden is a state machine of his own: he stalks, breathes radial bursts of
// fire, telegraphs and charges, and calls Drifters to him as he weakens. This file moves
// enemies and fires their bolts; collisions and damage are the world's business.
import { BOSS, ENEMIES, FIELD, WAVE_SCALING } from './config.js';
import { fireBolt } from './projectiles.js';

export const KIND_DRIFTER = 'drifter';
export const KIND_SPITTER = 'spitter';
export const KIND_BRUTE = 'brute';
export const KIND_SPLITTER = 'splitter';
export const KIND_MINI = 'mini';
export const KIND_BOSS = 'boss';

const MAX_ENEMIES = 96;

function makeEnemy() {
  return {
    active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, radius: 15,
    hp: 1, maxHp: 1, speed: 0, damage: 0, score: 0, fireTimer: 0, strafeDir: 1, strafeTimer: 0,
    wobbleSeed: 0, flashTimer: 0, knockX: 0, knockY: 0, anchorX: 0, anchorY: 0,
    mode: '', modeTimer: 0, burstTimer: 0, chargeTimer: 0, summonTimer: 0, chargeDirX: 0, chargeDirY: 0, phase: 1,
  };
}

export function createEnemyPool() {
  const list = [];
  for (let index = 0; index < MAX_ENEMIES; index += 1) list.push(makeEnemy());
  return { list, cursor: 0 };
}

function claimEnemy(pool) {
  for (let index = 0; index < MAX_ENEMIES; index += 1) {
    pool.cursor = (pool.cursor + 1) % MAX_ENEMIES;
    if (!pool.list[pool.cursor].active) return pool.list[pool.cursor];
  }
  return null;
}

/** Bring one enemy of `kind` to life at (x, y), scaled for the wave it arrives in. */
export function spawnEnemy(pool, kind, x, y, wave, random) {
  const enemy = claimEnemy(pool);
  if (!enemy) return null;
  const base = ENEMIES[kind];
  const hpScale = 1 + (wave - 1) * WAVE_SCALING.hpPerWave;
  const speedScale = 1 + (wave - 1) * WAVE_SCALING.speedPerWave;
  enemy.active = true;
  enemy.kind = kind;
  enemy.x = x;
  enemy.y = y;
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.radius = base.radius;
  enemy.hp = Math.round(base.hp * hpScale);
  enemy.maxHp = enemy.hp;
  enemy.speed = base.speed * speedScale;
  enemy.damage = base.damage;
  enemy.score = base.score;
  enemy.fireTimer = 1 + random() * 1.4;
  enemy.strafeDir = random() < 0.5 ? -1 : 1;
  enemy.strafeTimer = 2 + random() * 2;
  enemy.wobbleSeed = random() * Math.PI * 2;
  enemy.flashTimer = 0;
  enemy.knockX = 0;
  enemy.knockY = 0;
  enemy.anchorX = x;
  enemy.anchorY = y;
  enemy.mode = '';
  return enemy;
}

/** Bring the Hollow Warden to life at the top of the arena. He is wave 10's whole argument. */
export function spawnBoss(pool, x, y) {
  const enemy = claimEnemy(pool);
  if (!enemy) return null;
  enemy.active = true;
  enemy.kind = KIND_BOSS;
  enemy.x = x;
  enemy.y = y;
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.radius = BOSS.radius;
  enemy.hp = BOSS.hp;
  enemy.maxHp = BOSS.hp;
  enemy.speed = BOSS.speed;
  enemy.damage = BOSS.damage;
  enemy.score = BOSS.score;
  enemy.flashTimer = 0;
  enemy.knockX = 0;
  enemy.knockY = 0;
  enemy.mode = 'enter';
  enemy.modeTimer = 0;
  enemy.burstTimer = 2.2;
  enemy.chargeTimer = BOSS.chargeEvery;
  enemy.summonTimer = BOSS.summonEvery;
  enemy.phase = 1;
  return enemy;
}

export function countActiveEnemies(pool) {
  let count = 0;
  for (const enemy of pool.list) if (enemy.active) count += 1;
  return count;
}

export function findBoss(pool) {
  for (const enemy of pool.list) if (enemy.active && enemy.kind === KIND_BOSS) return enemy;
  return null;
}

function moveToward(enemy, targetX, targetY, speed, dt) {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  enemy.x += (dx / distance) * speed * dt;
  enemy.y += (dy / distance) * speed * dt;
  return distance;
}

/** The Warden's private choreography, one step of it. Returns nothing; fires through `world`. */
function updateBoss(world, boss, dt) {
  const { player, state } = world;
  const fraction = boss.hp / boss.maxHp;
  boss.phase = fraction > 0.66 ? 1 : fraction > 0.33 ? 2 : 3;

  if (boss.mode === 'enter') {
    if (moveToward(boss, FIELD.width / 2, 168, boss.speed * 1.7, dt) < 6) boss.mode = 'stalk';
    return;
  }
  if (boss.mode === 'telegraph') {
    boss.modeTimer -= dt;
    if (boss.modeTimer <= 0) {
      boss.mode = 'charge';
      boss.modeTimer = 0.55;
      state.events.push('bosscharge');
    }
    return;
  }
  if (boss.mode === 'charge') {
    boss.x += boss.chargeDirX * BOSS.chargeSpeed * dt;
    boss.y += boss.chargeDirY * BOSS.chargeSpeed * dt;
    boss.modeTimer -= dt;
    if (boss.modeTimer <= 0) boss.mode = 'stalk';
    return;
  }

  // Stalk: hover toward a point above the player, breathing fire on a timer.
  moveToward(boss, player.x, Math.max(140, player.y - 250), boss.speed * (boss.phase === 3 ? 1.35 : 1), dt);

  boss.burstTimer -= dt;
  if (boss.burstTimer <= 0) {
    const tempo = boss.phase === 3 ? 0.6 : boss.phase === 2 ? 0.8 : 1;
    boss.burstTimer = BOSS.burstEvery * tempo;
    const count = BOSS.burstBolts + (boss.phase - 1) * 4;
    const offset = state.time * 0.7;
    for (let index = 0; index < count; index += 1) {
      fireBolt(world.pools, boss.x, boss.y, offset + (index / count) * Math.PI * 2, BOSS.boltSpeed, 12);
    }
    if (boss.phase >= 2) {
      const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (const spread of [-0.16, 0, 0.16]) fireBolt(world.pools, boss.x, boss.y, aim + spread, BOSS.boltSpeed * 1.25, 12);
    }
    state.events.push('bossburst');
    state.shake = Math.max(state.shake, 5);
  }

  if (boss.phase >= 2) {
    boss.chargeTimer -= dt;
    if (boss.chargeTimer <= 0) {
      boss.chargeTimer = BOSS.chargeEvery * (boss.phase === 3 ? 0.75 : 1);
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const distance = Math.hypot(dx, dy) || 1;
      boss.chargeDirX = dx / distance;
      boss.chargeDirY = dy / distance;
      boss.mode = 'telegraph';
      boss.modeTimer = 0.6;
      state.events.push('bosstelegraph');
    }
  }

  if (boss.phase === 3) {
    boss.summonTimer -= dt;
    if (boss.summonTimer <= 0) {
      boss.summonTimer = BOSS.summonEvery;
      if (countActiveEnemies(world.enemies) < 14) {
        for (const side of [-1, 1]) {
          spawnEnemy(world.enemies, KIND_DRIFTER, boss.x + side * (boss.radius + 26), boss.y + 10, state.wave, world.random);
        }
        state.events.push('bosssummon');
      }
    }
  }
}

/**
 * Advance every enemy one step. `world` carries the player, the projectile pools, the
 * particle system and the shared state; in attract mode (the title screen) enemies wander
 * their anchors and never attack, so the arena lives behind the menu without a fight.
 */
export function updateEnemies(world, dt) {
  const { player, state } = world;
  for (const enemy of world.enemies.list) {
    if (!enemy.active) continue;
    if (enemy.flashTimer > 0) enemy.flashTimer -= dt;

    // Knockback from the hit that landed, spent quickly.
    enemy.x += enemy.knockX * dt;
    enemy.y += enemy.knockY * dt;
    enemy.knockX *= Math.max(0, 1 - 9 * dt);
    enemy.knockY *= Math.max(0, 1 - 9 * dt);

    if (enemy.kind === KIND_BOSS) {
      if (!state.attract) updateBoss(world, enemy, dt);
      continue;
    }

    if (state.attract) {
      const orbit = state.time * 0.24 + enemy.wobbleSeed;
      moveToward(enemy, enemy.anchorX + Math.cos(orbit) * 60, enemy.anchorY + Math.sin(orbit * 1.3) * 42, enemy.speed * 0.4, dt);
      continue;
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const towardX = dx / distance;
    const towardY = dy / distance;

    if (enemy.kind === KIND_SPITTER) {
      const base = ENEMIES.spitter;
      let moveX = 0;
      let moveY = 0;
      if (distance > base.keepFar) {
        moveX = towardX;
        moveY = towardY;
      } else if (distance < base.keepNear) {
        moveX = -towardX;
        moveY = -towardY;
      } else {
        enemy.strafeTimer -= dt;
        if (enemy.strafeTimer <= 0) {
          enemy.strafeTimer = 2 + world.random() * 2;
          enemy.strafeDir *= -1;
        }
        moveX = -towardY * enemy.strafeDir;
        moveY = towardX * enemy.strafeDir;
      }
      enemy.x += moveX * enemy.speed * dt;
      enemy.y += moveY * enemy.speed * dt;
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0 && distance < 580) {
        enemy.fireTimer = base.fireEvery * (0.85 + world.random() * 0.3);
        fireBolt(world.pools, enemy.x, enemy.y, Math.atan2(dy, dx), base.boltSpeed, base.boltDamage);
        state.events.push('spit');
      }
      continue;
    }

    // Chasers: drifters, brutes, splitters and minis all close in, each with its own wobble.
    const wobble = enemy.kind === KIND_DRIFTER || enemy.kind === KIND_MINI
      ? Math.sin(state.time * 3.1 + enemy.wobbleSeed) * 0.45
      : enemy.kind === KIND_SPLITTER
        ? Math.sin(state.time * 2.2 + enemy.wobbleSeed) * 0.3
        : 0;
    const moveX = towardX + -towardY * wobble;
    const moveY = towardY + towardX * wobble;
    const length = Math.hypot(moveX, moveY) || 1;
    enemy.x += (moveX / length) * enemy.speed * dt;
    enemy.y += (moveY / length) * enemy.speed * dt;
  }
}

/** Push overlapping enemies apart so a crowd reads as bodies, not one stacked sprite. */
export function separateEnemies(pool) {
  const list = pool.list;
  for (let first = 0; first < list.length; first += 1) {
    const a = list[first];
    if (!a.active || a.kind === KIND_BOSS) continue;
    for (let second = first + 1; second < list.length; second += 1) {
      const b = list[second];
      if (!b.active || b.kind === KIND_BOSS) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDistance = a.radius + b.radius - 2;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= 0.01 || distanceSq >= minDistance * minDistance) continue;
      const distance = Math.sqrt(distanceSq);
      const push = ((minDistance - distance) / distance) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
    }
  }
}

export function clearEnemies(pool) {
  for (const enemy of pool.list) enemy.active = false;
  pool.cursor = 0;
}
