// The player: a small ember-skimmer with a twin-stick gun. This file owns the player's
// state — position, health, dash and the weapon stats the upgrade system stacks onto —
// and its per-step movement. Firing and damage live in the world, which can see both
// sides of every collision.
import { FIELD, PLAYER, WEAPON } from './config.js';

export function createPlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    hurtTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashCooldownMax: PLAYER.dashCooldown,
    dashDirX: 1,
    dashDirY: 0,
    fireTimer: 0,
    // Weapon stats: the base gun, plus everything the upgrade cards have stacked on it.
    damage: WEAPON.damage,
    fireRate: WEAPON.fireRate,
    bulletSpeed: WEAPON.bulletSpeed,
    multishot: 1,
    pierce: 0,
    critChance: 0.05,
    magnetRadius: 74,
    upgradesTaken: [],
  };
}

export function resetPlayer(player) {
  const fresh = createPlayer();
  for (const key of Object.keys(fresh)) player[key] = fresh[key];
}

/** True while the player cannot be hurt: mid-dash, in the dash's wake, or just after a hit. */
export function isInvulnerable(player) {
  return player.dashTimer > 0 || player.hurtTimer > 0;
}

/** Begin a dash in the movement direction (or the aim direction when standing still). */
export function startDash(player) {
  if (player.dashCooldown > 0 || player.dashTimer > 0) return false;
  let dirX = player.vx;
  let dirY = player.vy;
  const length = Math.hypot(dirX, dirY);
  if (length < 1) {
    dirX = Math.cos(player.angle);
    dirY = Math.sin(player.angle);
  } else {
    dirX /= length;
    dirY /= length;
  }
  player.dashDirX = dirX;
  player.dashDirY = dirY;
  player.dashTimer = PLAYER.dashTime;
  player.dashCooldown = player.dashCooldownMax ?? PLAYER.dashCooldown;
  return true;
}

/**
 * Advance the player one step. `input` is { moveX, moveY, aimX, aimY, dash } with the
 * move axes in [-1, 1]; the aim point sets the facing the renderer draws and the gun uses.
 */
export function updatePlayer(player, input, dt) {
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.fireTimer > 0) player.fireTimer -= dt;

  player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);

  if (input.dash) startDash(player);

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    player.x += player.dashDirX * PLAYER.dashSpeed * dt;
    player.y += player.dashDirY * PLAYER.dashSpeed * dt;
  } else {
    let moveX = input.moveX;
    let moveY = input.moveY;
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }
    player.vx = moveX * player.speed;
    player.vy = moveY * player.speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }

  const wall = FIELD.wall + player.radius;
  player.x = Math.min(FIELD.width - wall, Math.max(wall, player.x));
  player.y = Math.min(FIELD.height - wall, Math.max(wall, player.y));
}
