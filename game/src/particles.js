// Particles and floating combat text: one pooled system for sparks, ember motes, dash
// trails and damage numbers. Everything is pre-allocated, so a busy boss fight never
// allocates in the hot loop; the renderer reads the live lists and draws what it finds.

const MAX_PARTICLES = 900;
const MAX_TEXTS = 48;

function makeParticle() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0, size: 2, color: '#ffffff', drag: 1, gravity: 0, glow: false };
}

function makeText() {
  return { active: false, x: 0, y: 0, vy: 0, life: 0, age: 0, value: '', color: '#ffffff', size: 15 };
}

export function createParticleSystem(random) {
  const particles = [];
  const texts = [];
  for (let index = 0; index < MAX_PARTICLES; index += 1) particles.push(makeParticle());
  for (let index = 0; index < MAX_TEXTS; index += 1) texts.push(makeText());
  let cursor = 0;
  let textCursor = 0;

  function spawn(x, y, vx, vy, life, size, color, options = {}) {
    const particle = particles[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    particle.active = true;
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.age = 0;
    particle.size = size;
    particle.color = color;
    particle.drag = options.drag ?? 1;
    particle.gravity = options.gravity ?? 0;
    particle.glow = options.glow ?? false;
  }

  return {
    particles,
    texts,

    /** A radial burst of sparks, the workhorse effect for hits and deaths. */
    burst(x, y, color, count, speed, size = 3, life = 0.45) {
      for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const pace = speed * (0.25 + random() * 0.95);
        spawn(x, y, Math.cos(angle) * pace, Math.sin(angle) * pace, life * (0.5 + random() * 0.8), size * (0.6 + random() * 0.9), color, { drag: 3.2, glow: true });
      }
    },

    /** A soft ring of slow embers, for pickups, upgrades and the boss dying. */
    bloom(x, y, color, count = 16) {
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + random() * 0.3;
        spawn(x, y, Math.cos(angle) * 120, Math.sin(angle) * 120, 0.7, 3.5, color, { drag: 2.4, glow: true });
      }
    },

    /** One fading ghost of the player, left behind while dashing. */
    trail(x, y, radius, color) {
      spawn(x, y, 0, 0, 0.28, radius, color, { drag: 0 });
    },

    /** A drifting background ember for the arena air; the world keeps a fixed count alive. */
    mote(x, y) {
      spawn(x, y, (random() - 0.5) * 14, -12 - random() * 22, 3.5 + random() * 3, 1.6 + random() * 1.8, '#ffa53d', { drag: 0, glow: true });
    },

    /** A floating damage or score number that rises and fades. */
    floatText(x, y, value, color, size = 15) {
      const text = texts[textCursor];
      textCursor = (textCursor + 1) % MAX_TEXTS;
      text.active = true;
      text.x = x + (random() - 0.5) * 14;
      text.y = y - 6;
      text.vy = -56;
      text.life = 0.75;
      text.age = 0;
      text.value = value;
      text.color = color;
      text.size = size;
    },

    update(dt) {
      for (const particle of particles) {
        if (!particle.active) continue;
        particle.age += dt;
        if (particle.age >= particle.life) {
          particle.active = false;
          continue;
        }
        const dragFactor = Math.max(0, 1 - particle.drag * dt);
        particle.vx *= dragFactor;
        particle.vy = particle.vy * dragFactor + particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      for (const text of texts) {
        if (!text.active) continue;
        text.age += dt;
        if (text.age >= text.life) {
          text.active = false;
          continue;
        }
        text.y += text.vy * dt;
        text.vy *= Math.max(0, 1 - 2.2 * dt);
      }
    },

    clear() {
      for (const particle of particles) particle.active = false;
      for (const text of texts) text.active = false;
    },
  };
}
