// Projectiles: the player's ember bolts and the enemies' fire bolts, in two pre-allocated
// pools. A player bolt carries how many enemies it may still pierce and whether it was
// rolled as a critical; an enemy bolt is slower, fatter and unmistakably orange, so the
// two streams never read as each other on a crowded screen.
import { FIELD } from './config.js';

const MAX_BULLETS = 512;
const MAX_BOLTS = 320;

function makeShot(radius) {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, radius, life: 0, damage: 0, pierce: 0, crit: false, hitSet: new Set() };
}

export function createProjectilePools() {
  const bullets = [];
  const bolts = [];
  for (let index = 0; index < MAX_BULLETS; index += 1) bullets.push(makeShot(4));
  for (let index = 0; index < MAX_BOLTS; index += 1) bolts.push(makeShot(6));
  return { bullets, bolts, bulletCursor: 0, boltCursor: 0 };
}

function fire(pool, cursorKey, pools, x, y, angle, speed, damage, life, pierce, crit) {
  const shot = pool[pools[cursorKey]];
  pools[cursorKey] = (pools[cursorKey] + 1) % pool.length;
  shot.active = true;
  shot.x = x;
  shot.y = y;
  shot.vx = Math.cos(angle) * speed;
  shot.vy = Math.sin(angle) * speed;
  shot.damage = damage;
  shot.life = life;
  shot.pierce = pierce;
  shot.crit = crit;
  shot.hitSet.clear();
  return shot;
}

/** Fire one of the player's bolts from (x, y) along `angle`. */
export function fireBullet(pools, x, y, angle, speed, damage, life, pierce, crit) {
  return fire(pools.bullets, 'bulletCursor', pools, x, y, angle, speed, damage, life, pierce, crit);
}

/** Fire one enemy bolt from (x, y) along `angle`. */
export function fireBolt(pools, x, y, angle, speed, damage) {
  return fire(pools.bolts, 'boltCursor', pools, x, y, angle, speed, damage, 2.6, 0, false);
}

/** Move every live shot; a shot dies at the end of its life or when it leaves the arena. */
export function updateProjectiles(pools, dt) {
  for (const pool of [pools.bullets, pools.bolts]) {
    for (const shot of pool) {
      if (!shot.active) continue;
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.life <= 0 || shot.x < 8 || shot.x > FIELD.width - 8 || shot.y < 8 || shot.y > FIELD.height - 8) {
        shot.active = false;
      }
    }
  }
}

export function clearProjectiles(pools) {
  for (const pool of [pools.bullets, pools.bolts]) {
    for (const shot of pool) shot.active = false;
  }
  pools.bulletCursor = 0;
  pools.boltCursor = 0;
}
