// Boot and the one loop. The world advances in fixed 1/60 s steps (several in a slow
// frame, none in a fast one) while the renderer paints whatever the world holds; this
// file owns the screens the world does not — title, pause, victory, game over — and
// routes every input and every world event to the screen, the sound and the announcer
// it belongs to.
//
// ?seed=N fixes the run's random pattern. ?shot=play|title|boss|victory (with &seed=N)
// stages that screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot harness.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, PHASE_COMBAT, PHASE_OVER, PHASE_UPGRADE, PHASE_VICTORY } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import {
  drawBanner, drawGameOver, drawHUD, drawPause, drawTitle, drawUpgradeCards, drawVictory,
  SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, upgradeCardRect,
} from './ui.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, seed);
  let aim = null;
  for (const candidate of world.enemies.list) {
    if (candidate.active) {
      aim = { x: candidate.x, y: candidate.y };
      break;
    }
  }
  let painted = 0;
  function paint() {
    renderer.drawScene(world, scene.screen === SCREEN_PLAY ? aim : null);
    const ctx = renderer.ctx;
    if (scene.screen === SCREEN_TITLE) drawTitle(ctx, world, scene.best);
    else if (scene.screen === SCREEN_VICTORY) drawVictory(ctx, world, scene.best);
    else {
      drawHUD(ctx, world, scene.best);
      drawBanner(ctx, world);
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let paused = false;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let audioStarted = false;

  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.startRun();
    screen = SCREEN_PLAY;
    paused = false;
    audio.startMusic();
    announce(`Playing. Wave 1 of 10. Score ${world.state.score}.`);
  }

  function finishRun(finalScreen) {
    screen = finalScreen;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(finalScreen === SCREEN_VICTORY
      ? `Victory. Final score ${world.state.score}. Best ${best}.`
      : `Game over on wave ${world.state.wave}. Score ${world.state.score}. Best ${best}.`);
  }

  function currentAim() {
    return renderer.clientToField(input.mouse.x, input.mouse.y);
  }

  function hoveredCard() {
    if (screen !== SCREEN_PLAY || world.state.phase !== PHASE_UPGRADE) return -1;
    const aim = currentAim();
    for (let index = 0; index < world.state.choices.length; index += 1) {
      const rect = upgradeCardRect(index);
      if (aim.x >= rect.x && aim.x <= rect.x + rect.width && aim.y >= rect.y && aim.y <= rect.y + rect.height) return index;
    }
    return -1;
  }

  function handlePressed() {
    for (const code of input.takePressed()) {
      if (code === 'KeyM') {
        audio.ensure();
        announce(audio.toggleMute() ? 'Muted.' : 'Sound on.');
        continue;
      }
      if (screen === SCREEN_TITLE && (code === 'Enter' || code === 'Space')) {
        startRun();
      } else if ((screen === SCREEN_VICTORY || screen === SCREEN_OVER) && code === 'Enter') {
        startRun();
      } else if (screen === SCREEN_PLAY && world.state.phase === PHASE_UPGRADE && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
        world.chooseUpgrade(Number(code.slice(-1)) - 1);
      } else if (screen === SCREEN_PLAY && (code === 'KeyP' || code === 'Escape')) {
        paused = !paused;
        announce(paused ? 'Paused.' : 'Playing.');
      }
    }
  }

  function handleClicks() {
    for (const click of input.takeClicks()) {
      if (screen === SCREEN_TITLE || screen === SCREEN_VICTORY || screen === SCREEN_OVER) {
        startRun();
      } else if (screen === SCREEN_PLAY && paused) {
        paused = false;
      } else if (screen === SCREEN_PLAY && world.state.phase === PHASE_UPGRADE) {
        const aim = renderer.clientToField(click.x, click.y);
        for (let index = 0; index < world.state.choices.length; index += 1) {
          const rect = upgradeCardRect(index);
          if (aim.x >= rect.x && aim.x <= rect.x + rect.width && aim.y >= rect.y && aim.y <= rect.y + rect.height) {
            world.chooseUpgrade(index);
            break;
          }
        }
      }
    }
  }

  function drainEvents() {
    for (const name of world.state.events) audio.play(name);
    world.state.events.length = 0;
  }

  function stepWorld(inputState) {
    world.step(STEP, inputState);
    if (screen === SCREEN_PLAY && world.state.phase === PHASE_VICTORY) finishRun(SCREEN_VICTORY);
    else if (screen === SCREEN_PLAY && world.state.phase === PHASE_OVER) finishRun(SCREEN_OVER);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!audioStarted && input.gestureSeen) {
      audioStarted = true;
      audio.ensure();
      audio.startMusic();
    }
    audio.updateMusic();

    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    handlePressed();
    handleClicks();

    const axes = input.moveAxes();
    const aim = currentAim();
    const inputState = {
      moveX: axes.x,
      moveY: axes.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash: input.consumeDash(),
    };

    if (!paused) {
      while (accumulator >= STEP) {
        if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) stepWorld(inputState);
        else world.step(STEP, inputState); // Victory / game over: let the sparks settle.
        accumulator -= STEP;
        if (paused) break;
      }
    } else {
      accumulator = 0;
    }
    drainEvents();

    renderer.drawScene(world, screen === SCREEN_PLAY && !paused ? aim : null);
    const ctx = renderer.ctx;
    if (screen === SCREEN_TITLE) drawTitle(ctx, world, best);
    else if (screen === SCREEN_VICTORY) drawVictory(ctx, world, best);
    else if (screen === SCREEN_OVER) drawGameOver(ctx, world, best);
    else {
      drawHUD(ctx, world, best);
      drawBanner(ctx, world);
      if (world.state.phase === PHASE_UPGRADE) drawUpgradeCards(ctx, world, hoveredCard());
      if (paused) drawPause(ctx);
    }
  }

  // Leaving the tab pauses a running fight rather than letting it run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY && world.state.phase === PHASE_COMBAT) {
      paused = true;
      announce('Paused.');
    }
  });

  announce('Emberfall Arena. Click or press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
