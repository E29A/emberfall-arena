// The interface layer: the HUD that rides over the fight, the wave banners, and every
// full screen — title, the between-wave upgrade choice, pause, victory and game over.
// These are drawn on the same canvas over the renderer's scene, in the same palette, so
// a screenshot of any screen still shows the game itself behind the words. The upgrade
// cards' geometry lives here too, so what the player clicks is exactly what was drawn.
import { BOSS, FIELD, PALETTE } from './config.js';
import { drawText, roundRectPath } from './render.js';
import { describeBuild } from './upgrades.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const CENTRE_X = FIELD.width / 2;

export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function dimArena(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(5, 2, 10, ${alpha})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function panel(ctx, x, y, width, height, fill = 'rgba(16, 9, 28, 0.88)') {
  roundRectPath(ctx, x, y, width, height, 14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(179, 136, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** The fight's readouts: hull, wave, hostiles left, score — and the Warden's health. */
export function drawHUD(ctx, world, best) {
  const { state, player } = world;

  // Hull bar, top left, with the number inside it.
  const hullWidth = 300;
  const hullFraction = Math.max(0, player.hp / player.maxHp);
  drawText(ctx, 'HULL', 46, 40, { size: 13, color: PALETTE.muted, align: 'left', weight: 800 });
  roundRectPath(ctx, 46, 52, hullWidth, 20, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  if (hullFraction > 0) {
    roundRectPath(ctx, 46, 52, hullWidth * hullFraction, 20, 6);
    ctx.fillStyle = hullFraction > 0.3 ? PALETTE.player : PALETTE.danger;
    ctx.fill();
  }
  drawText(ctx, `${Math.ceil(player.hp)} / ${player.maxHp}`, 58, 63, { size: 13, align: 'left', weight: 800 });

  // Wave and hostiles, top centre.
  drawText(ctx, `WAVE ${state.wave} / 10`, CENTRE_X, 46, { size: 21, weight: 800 });
  drawText(ctx, `HOSTILES ${world.remaining()}`, CENTRE_X, 70, { size: 13, color: PALETTE.muted, weight: 700 });

  // Score, top right.
  drawText(ctx, 'SCORE', 1234, 40, { size: 13, color: PALETTE.muted, align: 'right', weight: 800 });
  drawText(ctx, String(state.score), 1234, 64, { size: 24, align: 'right', weight: 800, color: PALETTE.gold });
  if (best > 0) drawText(ctx, `BEST ${best}`, 1234, 88, { size: 12, color: PALETTE.muted, align: 'right' });

  // Dash charge, bottom left: a short bar that flashes READY when it refills.
  const dashFraction = 1 - Math.max(0, player.dashCooldown) / player.dashCooldownMax;
  drawText(ctx, dashFraction >= 1 ? 'DASH READY — SHIFT' : 'DASH', 46, 656, { size: 13, color: dashFraction >= 1 ? PALETTE.player : PALETTE.muted, align: 'left', weight: 800 });
  roundRectPath(ctx, 46, 666, 150, 10, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  if (dashFraction > 0) {
    roundRectPath(ctx, 46, 666, 150 * dashFraction, 10, 5);
    ctx.fillStyle = PALETTE.player;
    ctx.fill();
  }

  // The build so far, bottom right, as the cards' monograms.
  const build = describeBuild(player);
  if (build.length > 0) {
    drawText(ctx, build.join('  ·  '), 1234, 668, { size: 13, color: PALETTE.muted, align: 'right', weight: 600 });
  }

  // The Warden's health, a wide bar at the bottom centre while he lives — he fights
  // in the arena's top half, so his bar lives where his body never goes.
  const boss = world.boss();
  if (boss) {
    const width = 560;
    const x = CENTRE_X - width / 2;
    drawText(ctx, BOSS.name, CENTRE_X, 592, { size: 14, color: PALETTE.bossCore, weight: 800 });
    roundRectPath(ctx, x, 606, width, 12, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    roundRectPath(ctx, x, 606, width * Math.max(0, boss.hp / boss.maxHp), 12, 6);
    ctx.fillStyle = PALETTE.boss;
    ctx.fill();
  }
}

/** The big wave announcement that sweeps in and fades over the first seconds of a wave. */
export function drawBanner(ctx, world) {
  const { banner } = world.state;
  if (banner.timer <= 0 || !banner.title) return;
  const progress = 1 - banner.timer / banner.total;
  const alpha = progress < 0.15 ? progress / 0.15 : banner.timer < 0.6 ? banner.timer / 0.6 : 1;
  const rise = (1 - Math.min(1, progress * 3)) * 14;
  drawText(ctx, banner.title, CENTRE_X, 208 - rise, { size: 54, weight: 800, color: PALETTE.text, alpha });
  if (banner.sub) drawText(ctx, banner.sub, CENTRE_X, 248 - rise, { size: 19, color: PALETTE.ember, alpha, weight: 600 });
}

/** The title screen: the game's name over its own living arena, and how to play it. */
export function drawTitle(ctx, world, best) {
  dimArena(ctx, 0.42);
  const time = world.state.time;

  drawText(ctx, 'EMBERFALL', CENTRE_X, 168, { size: 92, weight: 800, color: PALETTE.ember });
  drawText(ctx, 'A R E N A', CENTRE_X, 232, { size: 44, weight: 800, color: PALETTE.player });
  drawText(ctx, 'A twin-stick survival shooter in a burning sky-arena', CENTRE_X, 282, { size: 20, color: PALETTE.text });

  panel(ctx, CENTRE_X - 330, 322, 660, 168);
  drawText(ctx, 'Survive 10 waves of Drifters, Spitters, Brutes and Splitters.', CENTRE_X, 356, { size: 18 });
  drawText(ctx, 'Choose an upgrade after every wave. Break the Hollow Warden in wave 10.', CENTRE_X, 384, { size: 18 });
  drawText(ctx, 'WASD / Arrows — move        Mouse — aim        Hold click / Space — shoot', CENTRE_X, 424, { size: 17, color: PALETTE.muted });
  drawText(ctx, 'SHIFT / Right-click — dash        P — pause        M — mute', CENTRE_X, 452, { size: 17, color: PALETTE.muted });

  const pulse = 0.65 + Math.sin(time * 3.2) * 0.35;
  drawText(ctx, 'CLICK OR PRESS ENTER TO START', CENTRE_X, 548, { size: 24, weight: 800, color: PALETTE.gold, alpha: pulse });
  if (best > 0) drawText(ctx, `BEST SCORE ${best}`, CENTRE_X, 592, { size: 16, color: PALETTE.muted });
  drawText(ctx, 'An original game in plain JavaScript — every shape, sound and note generated in code.', CENTRE_X, 676, { size: 13, color: PALETTE.muted });
}

const CARD_WIDTH = 302;
const CARD_HEIGHT = 216;
const CARD_GAP = 30;
const CARD_Y = 296;

/** Where the card at `index` is drawn — the same numbers the click test uses. */
export function upgradeCardRect(index) {
  const total = CARD_WIDTH * 3 + CARD_GAP * 2;
  return { x: CENTRE_X - total / 2 + index * (CARD_WIDTH + CARD_GAP), y: CARD_Y, width: CARD_WIDTH, height: CARD_HEIGHT };
}

/** The between-wave choice: three cards over the quiet arena, clicked or keyed 1/2/3. */
export function drawUpgradeCards(ctx, world, hoverIndex) {
  const { state } = world;
  dimArena(ctx, 0.6);
  drawText(ctx, `WAVE ${state.wave} CLEARED`, CENTRE_X, 168, { size: 44, weight: 800, color: PALETTE.player });
  drawText(ctx, `Score ${state.score} — choose one upgrade for the next wave`, CENTRE_X, 212, { size: 19, color: PALETTE.muted });

  state.choices.forEach((def, index) => {
    const rect = upgradeCardRect(index);
    const hovered = index === hoverIndex;
    panel(ctx, rect.x, rect.y, rect.width, rect.height, hovered ? 'rgba(38, 20, 62, 0.95)' : 'rgba(16, 9, 28, 0.92)');
    if (hovered) {
      roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 14);
      ctx.strokeStyle = PALETTE.ember;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // The monogram badge.
    ctx.save();
    ctx.fillStyle = 'rgba(255, 165, 61, 0.16)';
    ctx.beginPath();
    ctx.arc(rect.x + rect.width / 2, rect.y + 58, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawText(ctx, def.monogram, rect.x + rect.width / 2, rect.y + 59, { size: 21, weight: 800, color: PALETTE.ember });
    drawText(ctx, def.name, rect.x + rect.width / 2, rect.y + 116, { size: 23, weight: 800 });
    drawText(ctx, def.blurb, rect.x + rect.width / 2, rect.y + 148, { size: 16, color: PALETTE.muted });
    const owned = world.player.upgradesTaken.filter((id) => id === def.id).length;
    drawText(ctx, owned > 0 ? `Owned x${owned} — press ${index + 1}` : `Press ${index + 1} or click`, rect.x + rect.width / 2, rect.y + 184, { size: 14, color: PALETTE.muted });
  });
}

export function drawPause(ctx) {
  dimArena(ctx, 0.55);
  drawText(ctx, 'PAUSED', CENTRE_X, 320, { size: 52, weight: 800 });
  drawText(ctx, 'P or Esc to resume — the embers wait for no one, except now', CENTRE_X, 372, { size: 18, color: PALETTE.muted });
}

function drawStatsPanel(ctx, world, best, rows) {
  panel(ctx, CENTRE_X - 260, 300, 520, 196);
  rows.forEach((row, index) => {
    const y = 340 + index * 42;
    drawText(ctx, row[0], CENTRE_X - 220, y, { size: 17, color: PALETTE.muted, align: 'left' });
    drawText(ctx, row[1], CENTRE_X + 220, y, { size: 19, align: 'right', weight: 800 });
  });
  return best;
}

function drawBuildLine(ctx, world, y) {
  const build = describeBuild(world.player);
  if (build.length === 0) return;
  drawText(ctx, `BUILD — ${build.join('  ·  ')}`, CENTRE_X, y, { size: 14, color: PALETTE.muted });
}

/** Victory: the Warden is down, the arena is yours, and here is the run in numbers. */
export function drawVictory(ctx, world, best) {
  dimArena(ctx, 0.5);
  const { state } = world;
  drawText(ctx, 'VICTORY', CENTRE_X, 168, { size: 76, weight: 800, color: PALETTE.gold });
  drawText(ctx, 'The Hollow Warden has fallen. The emberfall ends.', CENTRE_X, 226, { size: 20 });
  drawStatsPanel(ctx, world, best, [
    ['Final score', String(state.score)],
    ['Best score', String(Math.max(best, state.score))],
    ['Enemies destroyed', String(state.kills)],
    ['Time in the arena', formatTime(state.timeSurvived)],
  ]);
  drawBuildLine(ctx, world, 536);
  const pulse = 0.65 + Math.sin(state.time * 3.2) * 0.35;
  drawText(ctx, 'PRESS ENTER OR CLICK — PLAY AGAIN', CENTRE_X, 592, { size: 22, weight: 800, color: PALETTE.player, alpha: pulse });
}

/** Game over: the wave that ended the run, the numbers it earned, and the way back in. */
export function drawGameOver(ctx, world, best) {
  dimArena(ctx, 0.58);
  const { state } = world;
  drawText(ctx, 'GAME OVER', CENTRE_X, 168, { size: 72, weight: 800, color: PALETTE.danger });
  drawText(ctx, `The arena went dark on wave ${state.wave} of 10.`, CENTRE_X, 226, { size: 20 });
  drawStatsPanel(ctx, world, best, [
    ['Final score', String(state.score)],
    ['Best score', String(Math.max(best, state.score))],
    ['Enemies destroyed', String(state.kills)],
    ['Time survived', formatTime(state.timeSurvived)],
  ]);
  drawBuildLine(ctx, world, 536);
  const pulse = 0.65 + Math.sin(state.time * 3.2) * 0.35;
  drawText(ctx, 'PRESS ENTER OR CLICK — TRY AGAIN', CENTRE_X, 592, { size: 22, weight: 800, color: PALETTE.player, alpha: pulse });
}
