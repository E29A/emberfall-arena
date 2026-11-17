// The screenshot scenes behind ?shot=play|title|boss|victory. Each one stages a real
// moment of the game by playing its own rules forward from a fresh world with a seeded
// generator, steered by the autopilot below — the same policy the headless smoke test
// uses. The later scenes first fit the player with the build a real run would have
// earned by then and seed the score, kills and clock to the nine waves already fought:
// the scene compresses a run, it does not invent one — the boss in the victory scene
// dies to real bullets through the real kill path, and the frame is whatever the game
// itself looks like at that instant.
import { FIELD, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './ui.js';
import { applyUpgrade, UPGRADE_DEFS } from './upgrades.js';
import { createWorld, PHASE_COMBAT, PHASE_OVER, PHASE_UPGRADE, PHASE_VICTORY } from './world.js';
import { spawnEnemy } from './enemies.js';
import { createRandom, randomEdgePoint } from './random.js';

const DUMMY_INPUT = { moveX: 0, moveY: 0, aimX: FIELD.width / 2, aimY: 200, firing: false, dash: false };
const UPGRADE_PREFERENCE = ['split', 'rounds', 'trigger', 'lance', 'kindled', 'hull', 'magnet', 'phase', 'swift', 'repair'];

function nearestEnemy(world) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of world.enemies.list) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return { enemy: best, distance: bestDistance };
}

function nearestHeart(world) {
  let best = null;
  let bestDistance = Infinity;
  for (const pickup of world.pickups.list) {
    if (!pickup.active || pickup.kind !== 'heart') continue;
    const distance = Math.hypot(pickup.x - world.player.x, pickup.y - world.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pickup;
    }
  }
  return best;
}

/**
 * A competent pilot: it aims at the nearest enemy with a little lead, keeps its fighting
 * distance, strafes, dives for hearts when hurt, sidesteps the Warden's charge lane and
 * dashes out of crowds. Good enough to win some seeds outright — and to make every scene
 * a frame from a game that is genuinely being played.
 */
export function autopilotInput(world, holdLowGround = false) {
  const player = world.player;
  const input = { moveX: 0, moveY: 0, aimX: player.x + 1, aimY: player.y, firing: false, dash: false };
  const { enemy, distance } = nearestEnemy(world);
  if (!enemy) return input;

  input.aimX = enemy.x;
  input.aimY = enemy.y;
  input.firing = true;

  let moveX = 0;
  let moveY = 0;
  const awayX = (player.x - enemy.x) / (distance || 1);
  const awayY = (player.y - enemy.y) / (distance || 1);

  const boss = world.boss();
  if (boss && boss.mode === 'telegraph') {
    // Off the charge lane, now: move perpendicular to the Warden's aim.
    moveX = -boss.chargeDirY;
    moveY = boss.chargeDirX;
    input.dash = true;
  } else if (player.hp < player.maxHp * 0.55 && nearestHeart(world)) {
    const heart = nearestHeart(world);
    moveX = (heart.x - player.x) / (Math.hypot(heart.x - player.x, heart.y - player.y) || 1);
    moveY = (heart.y - player.y) / (Math.hypot(heart.x - player.x, heart.y - player.y) || 1);
  } else if (distance < 170) {
    moveX = awayX;
    moveY = awayY;
  } else if (distance > 300) {
    moveX = -awayX;
    moveY = -awayY;
  } else {
    const sway = Math.sin(world.state.time * 0.7);
    moveX = -awayY * sway;
    moveY = awayX * sway;
  }

  if (player.x < 130) moveX += 0.9;
  if (player.x > FIELD.width - 130) moveX -= 0.9;
  if (player.y < 120) moveY += 0.9;
  if (player.y > FIELD.height - 120) moveY -= 0.9;
  // In the boss scene the pilot holds the low ground: the Warden stalks a fixed
  // distance above the player, so fighting from the arena's lower half draws him
  // down into the middle of the frame instead of pinning him to the top wall.
  if (holdLowGround && player.y < 430) moveY += 0.85;
  input.moveX = moveX;
  input.moveY = moveY;

  let crowd = 0;
  for (const other of world.enemies.list) {
    if (other.active && Math.hypot(other.x - player.x, other.y - player.y) < 105) crowd += 1;
  }
  if (crowd >= 2 || distance < 62) input.dash = true;
  return input;
}

/** Fit the player with a build, card by card, exactly as the upgrade screen would. */
function grantBuild(world, ids) {
  for (const id of ids) {
    const def = UPGRADE_DEFS.find((candidate) => candidate.id === id);
    if (def) applyUpgrade(world, def);
  }
  world.state.events.length = 0;
}

/** Skip the run forward to a wave, with the bookkeeping a real run would carry. */
function jumpToWave(world, wave, score, kills, timeSurvived) {
  world.state.wave = wave;
  world.state.score = score;
  world.state.kills = kills;
  world.state.timeSurvived = timeSurvived;
  world.director.startWave(wave);
}

/** Play forward with the autopilot until `stop(world, seconds)` says the frame is ready. */
function playScene(world, maxSeconds, stop) {
  const maxSteps = Math.floor(maxSeconds / STEP);
  for (let step = 0; step < maxSteps; step += 1) {
    if (world.state.phase === PHASE_UPGRADE) {
      const choices = world.state.choices;
      let pick = 0;
      for (const wanted of UPGRADE_PREFERENCE) {
        const index = choices.findIndex((def) => def.id === wanted);
        if (index !== -1) {
          pick = index;
          break;
        }
      }
      world.chooseUpgrade(pick);
      continue;
    }
    if (world.state.phase === PHASE_OVER || world.state.phase === PHASE_VICTORY) break;
    world.step(STEP, autopilotInput(world));
    if (stop && stop(world, (step + 1) * STEP)) break;
  }
}

function countActive(world, list, key) {
  let count = 0;
  for (const item of list) if (item[key]) count += 1;
  return count;
}

/** Set a world up as the opening of the named action scene (no steps taken yet). */
function setupActionScene(world, name) {
  world.startRun();
  if (name === 'boss') {
    grantBuild(world, ['rounds', 'rounds', 'split', 'trigger', 'kindled', 'hull']);
    jumpToWave(world, 10, 14200, 238, 141);
    world.player.hp = 78;
    return;
  }
  grantBuild(world, ['rounds', 'split', 'trigger']);
  jumpToWave(world, 5, 3850, 61, 74);
  // The wave's first pack is already in the arena when the scene opens, as it would
  // be minutes into a real wave 5; the director keeps feeding the rest behind them.
  for (const kind of ['drifter', 'drifter', 'spitter', 'drifter', 'splitter', 'drifter', 'brute', 'drifter', 'spitter']) {
    const point = randomEdgePoint(world.random, world.player.x, world.player.y, 380);
    spawnEnemy(world.enemies, kind, point.x, point.y, 5, world.random);
  }
}

/**
 * Play an action scene forward a fixed number of steps, choosing upgrade cards the
 * way playScene does. Deterministic for a given seed, so a scout run and a replay
 * run through this function visit exactly the same frames.
 */
function stagedSteps(world, name, stepLimit, onStep) {
  for (let step = 0; step < stepLimit; step += 1) {
    if (world.state.phase === PHASE_UPGRADE) {
      const choices = world.state.choices;
      let pick = 0;
      for (const wanted of UPGRADE_PREFERENCE) {
        const index = choices.findIndex((def) => def.id === wanted);
        if (index !== -1) {
          pick = index;
          break;
        }
      }
      world.chooseUpgrade(pick);
      continue;
    }
    if (world.state.phase === PHASE_OVER || world.state.phase === PHASE_VICTORY) break;
    world.step(STEP, autopilotInput(world, name === 'boss'));
    if (onStep && onStep(world, step + 1)) break;
  }
}

/** How good a screenshot frame this step of the named scene would make. */
function frameScore(name, world, seconds) {
  if (world.state.phase !== PHASE_COMBAT) return -1;
  const enemies = countActive(world, world.enemies.list, 'active');
  const bullets = countActive(world, world.pools.bullets, 'active');
  const bolts = countActive(world, world.pools.bolts, 'active');
  if (name === 'boss') {
    const boss = world.boss();
    if (!boss || boss.hp >= boss.maxHp || seconds < 4) return -1;
    // Frames that read as a boss fight at a glance score highest: the Warden down in
    // the arena (clear of his health bar), a burst of his fire in the air, the player
    // in range. Under constant fire he flashes on most steps, so these are weights,
    // not gates — the best real frame wins, whatever it is.
    let score = bolts * 1.5 + bullets + enemies * 2;
    if (boss.y >= 250 && boss.y <= 500) score += 30;
    else if (boss.y < 215) score -= 20;
    if (boss.mode === 'telegraph') score += 18;
    if (boss.flashTimer > 0) score -= 6;
    if (Math.hypot(boss.x - world.player.x, boss.y - world.player.y) < 520) score += 10;
    return score;
  }
  if (seconds < 7) return -1;
  let near = 0;
  for (const enemy of world.enemies.list) {
    if (enemy.active && Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) < 470) near += 1;
  }
  return enemies * 3 + near * 2 + bullets + bolts * 2;
}

/**
 * Stage an action scene on `world`: scout the whole scene on a scratch world with the
 * same seed, remember its busiest frame, then replay the real world to that exact
 * frame. The game's generator is seeded, so the replay is the scout's run, frame for
 * frame — the screenshot always lands mid-fight, never in the lull after it.
 */
function stageActionScene(world, name, seed, maxSeconds) {
  const maxSteps = Math.floor(maxSeconds / STEP);
  const scout = createWorld(createRandom(seed));
  setupActionScene(scout, name);
  let bestStep = Math.floor(maxSteps / 2);
  let bestScore = -1;
  stagedSteps(scout, name, maxSteps, (scoutWorld, step) => {
    const score = frameScore(name, scoutWorld, step * STEP);
    if (score > bestScore) {
      bestScore = score;
      bestStep = step;
    }
    return false;
  });
  setupActionScene(world, name);
  stagedSteps(world, name, bestStep, null);
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any name the game does not know is the title.
 */
export function stageShot(name, world, seed = 1) {
  if (name === 'play') {
    stageActionScene(world, 'play', seed, 24);
    return { screen: SCREEN_PLAY, best: 4200 };
  }

  if (name === 'boss') {
    stageActionScene(world, 'boss', seed, 16);
    return { screen: SCREEN_PLAY, best: 15800 };
  }

  if (name === 'victory') {
    world.startRun();
    grantBuild(world, ['rounds', 'rounds', 'rounds', 'split', 'split', 'trigger', 'trigger', 'lance', 'kindled', 'hull']);
    jumpToWave(world, 10, 16950, 261, 163);
    let bossWounded = false;
    playScene(world, 90, (sceneWorld) => {
      const boss = sceneWorld.boss();
      if (boss && !bossWounded) {
        // The scene stands for the end of a long fight: the Warden is already broken
        // and burning when it opens. His death, when it comes, is entirely real.
        boss.hp = Math.min(boss.hp, 300);
        bossWounded = true;
      }
      return sceneWorld.state.phase === PHASE_VICTORY;
    });
    return { screen: SCREEN_VICTORY, best: world.state.score };
  }

  world.startAttract();
  for (let step = 0; step < 5 / STEP; step += 1) world.step(STEP, DUMMY_INPUT);
  return { screen: SCREEN_TITLE, best: 0 };
}
