// Pickups: the hearts and ember motes enemies drop. Embers drift where they fall until
// the player comes within magnet range, then fly to the ship and cash in as score; hearts
// stay put and heal on touch. Both expire, blinking first, so a drop is a small decision —
// dive for it now or lose it — rather than permanent litter.
import { DROPS } from './config.js';

const MAX_PICKUPS = 160;

export const PICKUP_HEART = 'heart';
export const PICKUP_EMBER = 'ember';

function makePickup() {
  return { active: false, kind: PICKUP_EMBER, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 9, magnetised: false };
}

export function createPickups() {
  const list = [];
  for (let index = 0; index < MAX_PICKUPS; index += 1) list.push(makePickup());
  return { list, cursor: 0 };
}

export function spawnPickup(pickups, kind, x, y, random) {
  const pickup = pickups.list[pickups.cursor];
  pickups.cursor = (pickups.cursor + 1) % pickups.list.length;
  pickup.active = true;
  pickup.kind = kind;
  pickup.x = x;
  pickup.y = y;
  const angle = random() * Math.PI * 2;
  const pace = 30 + random() * 70;
  pickup.vx = Math.cos(angle) * pace;
  pickup.vy = Math.sin(angle) * pace;
  pickup.age = 0;
  pickup.life = kind === PICKUP_HEART ? 12 : 9;
  pickup.magnetised = false;
}

/**
 * Advance the drops one step against the player. Returns what was collected this step as
 * { hearts, embers } so the world can heal, score and make the right noises.
 */
export function updatePickups(pickups, player, dt) {
  const collected = { hearts: 0, embers: 0 };
  for (const pickup of pickups.list) {
    if (!pickup.active) continue;
    pickup.age += dt;
    if (pickup.age >= pickup.life) {
      pickup.active = false;
      continue;
    }
    const dx = player.x - pickup.x;
    const dy = player.y - pickup.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (pickup.kind === PICKUP_EMBER && distance < player.magnetRadius) pickup.magnetised = true;
    if (pickup.magnetised) {
      pickup.vx = (dx / distance) * DROPS.magnetSpeed;
      pickup.vy = (dy / distance) * DROPS.magnetSpeed;
    } else {
      pickup.vx *= Math.max(0, 1 - 3 * dt);
      pickup.vy *= Math.max(0, 1 - 3 * dt);
    }
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    if (distance < player.radius + 13) {
      pickup.active = false;
      if (pickup.kind === PICKUP_HEART) collected.hearts += 1;
      else collected.embers += 1;
    }
  }
  return collected;
}

export function clearPickups(pickups) {
  for (const pickup of pickups.list) pickup.active = false;
  pickups.cursor = 0;
}
