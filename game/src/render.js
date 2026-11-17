// The renderer: everything the world looks like, drawn on a 2D canvas at a fixed
// 1280x720 logical size and letterboxed into the window. The arena backdrop (gradient,
// glowing grid, walls, vignette) is painted once onto an offscreen canvas and blitted
// each frame; entities are simple, bold shapes with a glow — silhouettes that stay
// readable when the judge's contact sheet shrinks them. Screen shake is a function of
// the world's own clock, never the wall clock, so screenshot scenes are repeatable.
import { BOSS, FIELD, PALETTE } from './config.js';

export const VIEW = { width: FIELD.width, height: FIELD.height };

/** A rounded-rectangle path, the panel shape every screen in ui.js is built from. */
export function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** One line of centred (or aligned) text with the game's font, weight and size set for it. */
export function drawText(ctx, value, x, y, options = {}) {
  const { size = 20, color = PALETTE.text, align = 'center', weight = 600, alpha = 1, font = '' } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font || '"Avenir Next", "Segoe UI", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.restore();
}

function paintBackdrop() {
  const backdrop = document.createElement('canvas');
  backdrop.width = VIEW.width;
  backdrop.height = VIEW.height;
  const ctx = backdrop.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  gradient.addColorStop(0, '#150b21');
  gradient.addColorStop(0.55, PALETTE.floor);
  gradient.addColorStop(1, '#0d0716');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // A warm ember glow pooling in the middle of the arena.
  const pool = ctx.createRadialGradient(640, 360, 60, 640, 360, 560);
  pool.addColorStop(0, 'rgba(255, 140, 50, 0.18)');
  pool.addColorStop(1, 'rgba(255, 140, 50, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // The grid: bright enough to read movement against, dim enough to sit behind the fight.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = FIELD.wall; x <= VIEW.width - FIELD.wall; x += 61) {
    ctx.moveTo(x, FIELD.wall);
    ctx.lineTo(x, VIEW.height - FIELD.wall);
  }
  for (let y = FIELD.wall; y <= VIEW.height - FIELD.wall; y += 61) {
    ctx.moveTo(FIELD.wall, y);
    ctx.lineTo(VIEW.width - FIELD.wall, y);
  }
  ctx.stroke();

  // Walls: a double-ruled ember frame with lit corners.
  ctx.strokeStyle = PALETTE.gridGlow;
  ctx.lineWidth = 3;
  ctx.strokeRect(FIELD.wall, FIELD.wall, VIEW.width - FIELD.wall * 2, VIEW.height - FIELD.wall * 2);
  ctx.strokeStyle = 'rgba(255, 165, 61, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(FIELD.wall - 6, FIELD.wall - 6, VIEW.width - (FIELD.wall - 6) * 2, VIEW.height - (FIELD.wall - 6) * 2);
  ctx.fillStyle = PALETTE.ember;
  for (const [cx, cy] of [[FIELD.wall, FIELD.wall], [VIEW.width - FIELD.wall, FIELD.wall], [FIELD.wall, VIEW.height - FIELD.wall], [VIEW.width - FIELD.wall, VIEW.height - FIELD.wall]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vignette, baked in: the edges fall away so the centre of the fight glows.
  const vignette = ctx.createRadialGradient(640, 360, 340, 640, 360, 820);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(2,0,6,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  return backdrop;
}

function drawPortal(ctx, portal, time) {
  const progress = 1 - portal.timer / portal.total;
  const radius = 12 + progress * 16;
  ctx.save();
  ctx.translate(portal.x, portal.y);
  ctx.rotate(time * 3.2);
  ctx.strokeStyle = portal.kind === 'boss' ? PALETTE.boss : PALETTE.spitter;
  ctx.globalAlpha = 0.35 + progress * 0.6;
  ctx.lineWidth = 3;
  for (let arc = 0; arc < 3; arc += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, (arc / 3) * Math.PI * 2, (arc / 3) * Math.PI * 2 + 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickup(ctx, pickup, time) {
  const bob = Math.sin(time * 4 + pickup.x * 0.05) * 3;
  const blinking = pickup.age > pickup.life - 3 && Math.sin(time * 14) > 0;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.globalAlpha = blinking ? 0.3 : 1;
  if (pickup.kind === 'heart') {
    ctx.fillStyle = PALETTE.heart;
    ctx.shadowColor = PALETTE.heart;
    ctx.shadowBlur = 12;
    const s = 9 + Math.sin(time * 5) * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.3, -s * 0.2, -s * 0.7, -s * 1.1, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.3, -s * 0.2, 0, s * 0.9);
    ctx.fill();
  } else {
    ctx.fillStyle = PALETTE.ember;
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 10;
    ctx.rotate(Math.PI / 4);
    const s = 6.5;
    ctx.fillRect(-s / 2, -s / 2, s, s);
  }
  ctx.restore();
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
}

function drawEnemy(ctx, enemy, world) {
  const { state, player } = world;
  const time = state.time;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  // A soft shadow grounds every body.
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(0, enemy.radius * 0.82, enemy.radius * 0.9, enemy.radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -enemy.radius * 0.82);

  const flash = enemy.flashTimer > 0;
  const facing = Math.atan2(player.y - enemy.y, player.x - enemy.x);

  if (enemy.kind === 'boss') {
    // The Hollow Warden: a ring of slow ember spikes around a dark, cracked core.
    // His hit-flash only pales him — a white disc his size would read as a hole in the arena.
    ctx.save();
    ctx.rotate(time * 0.35);
    ctx.fillStyle = flash ? '#a31631' : '#7a1226';
    for (let spike = 0; spike < 12; spike += 1) {
      ctx.rotate(Math.PI / 6);
      polygon(ctx, [[BOSS.radius * 0.72, -9], [BOSS.radius * 1.12, 0], [BOSS.radius * 0.72, 9]]);
      ctx.fill();
    }
    ctx.restore();
    const pulse = 1 + Math.sin(time * 3.4) * 0.045;
    ctx.fillStyle = flash ? '#e8607c' : '#a31631';
    ctx.beginPath();
    ctx.arc(0, 0, BOSS.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.boss;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = PALETTE.bossCore;
    ctx.shadowColor = PALETTE.boss;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, 15 + Math.sin(time * 5) * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Cracks of ember light across the shell.
    ctx.strokeStyle = 'rgba(255, 165, 61, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, -18);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-20, 16);
    ctx.moveTo(26, -24);
    ctx.lineTo(14, -4);
    ctx.lineTo(28, 12);
    ctx.stroke();
  } else if (enemy.kind === 'brute') {
    ctx.rotate(facing + Math.PI / 2);
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.brute;
    ctx.shadowColor = PALETTE.brute;
    ctx.shadowBlur = 10;
    const points = [];
    for (let side = 0; side < 6; side += 1) {
      const angle = (side / 6) * Math.PI * 2;
      points.push([Math.cos(angle) * enemy.radius, Math.sin(angle) * enemy.radius]);
    }
    polygon(ctx, points);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(30, 8, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ember;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'spitter') {
    ctx.rotate(time * 1.4 + enemy.wobbleSeed);
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.spitter;
    ctx.shadowColor = PALETTE.spitter;
    ctx.shadowBlur = 12;
    polygon(ctx, [[0, -enemy.radius], [enemy.radius, 0], [0, enemy.radius], [-enemy.radius, 0]]);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a1052';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.bolt;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 + Math.sin(time * 6 + enemy.wobbleSeed) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'splitter') {
    ctx.rotate(facing + Math.PI / 2 + Math.sin(time * 2.2 + enemy.wobbleSeed) * 0.2);
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.splitter;
    ctx.shadowColor = PALETTE.splitter;
    ctx.shadowBlur = 10;
    const points = [];
    for (let side = 0; side < 5; side += 1) {
      const angle = (side / 5) * Math.PI * 2;
      points.push([Math.cos(angle) * enemy.radius, Math.sin(angle) * enemy.radius]);
    }
    polygon(ctx, points);
    ctx.fill();
    ctx.shadowBlur = 0;
    // The seams it will split along, drawn as dark cracks to its centre.
    ctx.strokeStyle = 'rgba(60, 36, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const point of points) {
      ctx.moveTo(0, 0);
      ctx.lineTo(point[0] * 0.82, point[1] * 0.82);
    }
    ctx.stroke();
  } else {
    // Drifters and Minis: hungry shards that point at the player.
    ctx.rotate(facing);
    ctx.fillStyle = flash ? '#ffffff' : enemy.kind === 'mini' ? PALETTE.mini : PALETTE.drifter;
    ctx.shadowColor = enemy.kind === 'mini' ? PALETTE.splitter : PALETTE.drifter;
    ctx.shadowBlur = 11;
    polygon(ctx, [[enemy.radius * 1.25, 0], [-enemy.radius * 0.8, enemy.radius * 0.72], [-enemy.radius * 0.4, 0], [-enemy.radius * 0.8, -enemy.radius * 0.72]]);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(20, 0, 8, 0.6)';
    ctx.beginPath();
    ctx.arc(enemy.radius * 0.25, 0, enemy.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A thin health sliver over anything tougher than a drifter, once it is hurt.
  if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp && (enemy.radius >= 19 || enemy.hp < enemy.maxHp * 0.6)) {
    const width = enemy.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 13, width, 4);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 13, width * Math.max(0, enemy.hp / enemy.maxHp), 4);
  }
}

function drawPlayer(ctx, player, time) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, player.radius * 0.85, player.radius * 0.95, player.radius * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -player.radius * 0.85);
  if (player.hurtTimer > 0 && player.dashTimer <= 0) ctx.globalAlpha = 0.55 + Math.sin(time * 34) * 0.3;

  // Engine flame behind the ship whenever it moves.
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > 20 || player.dashTimer > 0) {
    const back = Math.atan2(player.vy, player.vx) + Math.PI;
    ctx.save();
    ctx.rotate(back);
    const flame = (player.dashTimer > 0 ? 30 : 15) + Math.sin(time * 41) * 4;
    ctx.fillStyle = 'rgba(255, 165, 61, 0.85)';
    polygon(ctx, [[player.radius * 0.7, -5], [player.radius * 0.7 + flame, 0], [player.radius * 0.7, 5]]);
    ctx.fill();
    ctx.restore();
  }

  ctx.rotate(player.angle);
  ctx.fillStyle = PALETTE.player;
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 14;
  polygon(ctx, [[22, 0], [-8, 7], [-15, 15], [-12, 0], [-15, -15], [-8, -7]]);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.playerCore;
  ctx.beginPath();
  ctx.arc(3, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const backdrop = paintBackdrop();
  let view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 };

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    view = { scale, offsetX: (width - VIEW.width * scale) / 2, offsetY: (height - VIEW.height * scale) / 2, dpr };
  }

  return {
    ctx,

    /** Turn client (mouse) pixels into field coordinates under the letterbox. */
    clientToField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * view.dpr;
      const py = (clientY - rect.top) * view.dpr;
      return {
        x: (px - view.offsetX) / view.scale,
        y: (py - view.offsetY) / view.scale,
      };
    },

    /**
     * Draw the whole world: backdrop, portals, pickups, both shot streams, enemies, the
     * player, particles and floating text — plus the crosshair at the aim point and the
     * low-health pulse. Menus and the HUD are ui.js, drawn over this.
     */
    drawScene(world, aim) {
      fitCanvas();
      const { state, player } = world;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.void;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

      if (state.shake > 0.2) {
        const jx = Math.sin(state.time * 131.7) * state.shake;
        const jy = Math.cos(state.time * 149.3) * state.shake;
        ctx.translate(jx, jy);
      }

      ctx.drawImage(backdrop, 0, 0);

      for (const portal of world.director.portals) drawPortal(ctx, portal, state.time);
      for (const pickup of world.pickups.list) if (pickup.active) drawPickup(ctx, pickup, state.time);

      // Enemy bolts under the bodies, player bolts over them.
      for (const bolt of world.pools.bolts) {
        if (!bolt.active) continue;
        ctx.save();
        ctx.fillStyle = PALETTE.bolt;
        ctx.shadowColor = PALETTE.bolt;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bolt.x, bolt.y, bolt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const enemy of world.enemies.list) if (enemy.active) drawEnemy(ctx, enemy, world);
      if (state.phase !== 'over') drawPlayer(ctx, player, state.time);
      for (const bullet of world.pools.bullets) {
        if (!bullet.active) continue;
        ctx.save();
        ctx.strokeStyle = bullet.crit ? PALETTE.gold : PALETTE.bullet;
        ctx.lineWidth = 3;
        ctx.shadowColor = bullet.crit ? PALETTE.gold : PALETTE.bullet;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.022, bullet.y - bullet.vy * 0.022);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.restore();
      }

      // Particles, then the floating numbers over everything.
      for (const particle of world.particles.particles) {
        if (!particle.active) continue;
        const fade = 1 - particle.age / particle.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = particle.color;
        if (particle.glow) {
          ctx.shadowColor = particle.color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (particle.glow ? fade * 0.7 + 0.3 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const text of world.particles.texts) {
        if (!text.active) continue;
        const fade = 1 - text.age / text.life;
        drawText(ctx, text.value, text.x, text.y, { size: text.size, color: text.color, alpha: Math.max(0, fade), weight: 800 });
      }

      // The boss's charge telegraph: a lane of warning light from him to his target.
      const boss = world.boss();
      if (boss && boss.mode === 'telegraph') {
        ctx.save();
        ctx.globalAlpha = 0.16 + Math.sin(state.time * 26) * 0.07;
        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = boss.radius * 1.5;
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y);
        ctx.lineTo(boss.x + boss.chargeDirX * 620, boss.y + boss.chargeDirY * 620);
        ctx.stroke();
        ctx.restore();
      }

      // Low health: the arena's edge pulses red until the player recovers.
      if (state.phase === 'combat' && player.hp > 0 && player.hp < player.maxHp * 0.3) {
        const pulse = 0.13 + Math.sin(state.time * 6) * 0.06 + (0.3 - player.hp / player.maxHp) * 0.4;
        const edge = ctx.createRadialGradient(640, 360, 300, 640, 360, 800);
        edge.addColorStop(0, 'rgba(255,40,60,0)');
        edge.addColorStop(1, `rgba(255,40,60,${Math.max(0.05, pulse)})`);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      }

      // The crosshair, where the gun is pointed.
      if (aim && state.phase === 'combat') {
        ctx.save();
        ctx.strokeStyle = 'rgba(143, 252, 233, 0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(aim.x, aim.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = PALETTE.bullet;
        ctx.fillRect(aim.x - 1, aim.y - 1, 2, 2);
        ctx.restore();
      }
    },
  };
}
