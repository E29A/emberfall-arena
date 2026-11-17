// A small seeded random generator (mulberry32) plus the range helpers the game uses.
// One generator drives every spawn, drop and crit roll, so the same seed always plays
// the same game — which is what makes the screenshot scenes and the smoke test repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) drawn from the game's generator. */
export function randomRange(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] drawn from the game's generator. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of a non-empty list, drawn from the game's generator. */
export function randomPick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A point on the arena wall ring, kept a fair distance from (x, y) so spawns never land on the player. */
export function randomEdgePoint(random, x, y, minDistance) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const side = randomInt(random, 0, 3);
    const px = side === 0 ? 60 : side === 1 ? 1220 : randomRange(random, 60, 1220);
    const py = side === 2 ? 60 : side === 3 ? 660 : randomRange(random, 60, 660);
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy >= minDistance * minDistance || attempt === 11) return { x: px, y: py };
  }
  return { x: 60, y: 60 };
}
