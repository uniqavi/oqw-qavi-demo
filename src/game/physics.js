// Pure geometry helpers. No Phaser, no state mutation.

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Player hit-box: width = size, height = size * 0.75, anchored on player.x/y center
export function playerBox(player) {
  const s = player.size;
  return { x: player.x - s / 2, y: player.y - s * 0.375, w: s, h: s * 0.75 };
}

// Deterministic per-seed jitter for hand-drawn rectangles
export function wob(seed, amp = 1.4) {
  const a = Math.sin(seed * 17.31 + 0.5) * 43.7;
  return (a - Math.floor(a) - 0.5) * 2 * amp;
}
