// Input: the keyboard and mouse, read as game-shaped state. The main loop asks each frame
// for the move axes, whether the gun is firing, and whether a dash was pressed; discrete
// presses (Enter, P, M, 1/2/3, clicks) are queued as edges so a fast tap between frames is
// never lost. Mouse positions are kept in client pixels — the renderer owns the letterbox
// maths that turns them into field coordinates.

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressedEdges = [];
  const clicks = [];
  const mouse = { x: 0, y: 0, down: false };
  let dashQueued = false;
  let gestureSeen = false;

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) {
      held.add(event.code);
      pressedEdges.push(event.code);
      gestureSeen = true;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') dashQueued = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('mousedown', (event) => {
    gestureSeen = true;
    if (event.button === 0) {
      mouse.down = true;
      clicks.push({ x: event.clientX, y: event.clientY });
    }
    if (event.button === 2) dashQueued = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  return {
    mouse,

    /** True once the player has pressed or clicked anything: the audio unlock gesture. */
    get gestureSeen() { return gestureSeen; },

    /** The movement axes from WASD and the arrow keys, each in [-1, 1]. */
    moveAxes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },

    /** The gun fires while the mouse is held or Space is down. */
    firing() {
      return mouse.down || held.has('Space');
    },

    /** A dash press since the last call: Shift, or a right mouse click. */
    consumeDash() {
      const dash = dashQueued;
      dashQueued = false;
      return dash;
    },

    /** The key presses since the last call, as KeyboardEvent codes, oldest first. */
    takePressed() {
      return pressedEdges.splice(0, pressedEdges.length);
    },

    /** The mouse clicks since the last call, in client pixels, oldest first. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
