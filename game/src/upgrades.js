// Upgrades: the cards offered between waves. Each definition knows its name, its pitch,
// the monogram its card wears, how many times it may stack, and what it does to the
// player when taken. Three distinct cards are rolled from whatever the build can still
// use, so every run bends a different way: split-shot glass cannon, piercing tank,
// dash-dancing crit build — the choice between waves is the game's second decision loop.

function stacksTaken(player, id) {
  return player.upgradesTaken.filter((taken) => taken === id).length;
}

export const UPGRADE_DEFS = [
  {
    id: 'rounds', monogram: 'DMG', name: 'Ember Rounds', blurb: 'Damage +25%', maxStacks: 6,
    apply(player) { player.damage *= 1.25; },
  },
  {
    id: 'trigger', monogram: 'RPM', name: 'Rapid Trigger', blurb: 'Fire rate +20%', maxStacks: 5,
    apply(player) { player.fireRate *= 1.2; },
  },
  {
    id: 'split', monogram: 'SPL', name: 'Split Barrel', blurb: '+1 projectile per shot', maxStacks: 3,
    apply(player) { player.multishot += 1; },
  },
  {
    id: 'lance', monogram: 'PIR', name: 'Lance Rounds', blurb: 'Shots pierce +1 enemy', maxStacks: 3,
    apply(player) { player.pierce += 1; },
  },
  {
    id: 'swift', monogram: 'SPD', name: 'Swift Thrusters', blurb: 'Move speed +12%', maxStacks: 4,
    apply(player) { player.speed *= 1.12; },
  },
  {
    id: 'hull', monogram: 'HUL', name: 'Reinforced Hull', blurb: '+25 max HP, heal 40', maxStacks: 6,
    apply(player) { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 40); },
  },
  {
    id: 'phase', monogram: 'DSH', name: 'Phase Boots', blurb: 'Dash recharges 22% faster', maxStacks: 3,
    apply(player) { player.dashCooldownMax = Math.max(0.7, player.dashCooldownMax * 0.78); },
  },
  {
    id: 'magnet', monogram: 'MAG', name: 'Ember Magnet', blurb: 'Pickup magnet +55%', maxStacks: 3,
    apply(player) { player.magnetRadius *= 1.55; },
  },
  {
    id: 'kindled', monogram: 'CRT', name: 'Kindled Sight', blurb: 'Crit chance +12% (crits hit x2)', maxStacks: 4,
    apply(player) { player.critChance += 0.12; },
  },
  {
    id: 'repair', monogram: 'FIX', name: 'Field Repair', blurb: 'Heal 55 HP right now', maxStacks: 99,
    apply(player) { player.hp = Math.min(player.maxHp, player.hp + 55); },
  },
];

/** The definitions this build can still take (a maxed stack leaves the pool). */
export function offerableUpgrades(player) {
  return UPGRADE_DEFS.filter((def) => stacksTaken(player, def.id) < def.maxStacks);
}

/** Roll three distinct upgrade cards for the player to choose between. */
export function rollUpgradeChoices(random, player) {
  const pool = offerableUpgrades(player);
  const choices = [];
  while (choices.length < 3 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}

/** Apply a chosen card and record it on the build, so its stack count is honest. */
export function applyUpgrade(world, def) {
  def.apply(world.player);
  world.player.upgradesTaken.push(def.id);
  world.particles.bloom(world.player.x, world.player.y, '#3fe8c8', 18);
  world.state.events.push('upgrade');
}

/** The player's current build as short labels, for the HUD and the end screens. */
export function describeBuild(player) {
  const labels = [];
  for (const def of UPGRADE_DEFS) {
    const count = stacksTaken(player, def.id);
    if (count > 0 && def.id !== 'repair') labels.push(count > 1 ? `${def.name} x${count}` : def.name);
  }
  return labels;
}
