// Hidden-doc collectibles — the level's win-condition mechanic for the
// runner rework. Docs spawn from below the viewport at random X and drift
// UP (like the enemies and powerups), but they're invisible by default —
// only visible while the player's window is near (proximity-revealed, the
// "X-ray" idea). Touching a revealed doc collects it. After
// `state.docsTarget` (default 5) are collected, spawning stops and the
// scene flips into the "escape" state.
import { PW } from '../config.js';
import { effectiveSize } from './playerSize.js';

const DOC = {
  w: 36, h: 44,
  riseSpeed: 60,                // px/sec UP — slower than enemies so easier to catch
  spawnIntervalMin: 6,          // seconds between spawns (random in this range)
  spawnIntervalMax: 10,
  revealRange: 160,             // window center within this distance → doc becomes visible
};

function spawn(state, camY, viewH) {
  state.hiddenDocs.push({
    wx: 80 + Math.random() * Math.max(80, PW - DOC.w - 160),
    wy: camY + viewH + 30 + Math.random() * 80,
    w: DOC.w, h: DOC.h,
    vy: -DOC.riseSpeed,
    age: 0,
    reveal: 0,                  // 0..1 — proximity-driven visibility
    taken: false,
  });
}

export function tick(state, dt, viewH) {
  // Stop spawning once the target is hit
  if (state.docsCollected < state.docsTarget) {
    state.hiddenDocSpawnT -= dt;
    if (state.hiddenDocSpawnT <= 0) {
      spawn(state, state.scrollY, viewH);
      state.hiddenDocSpawnT = DOC.spawnIntervalMin +
        Math.random() * (DOC.spawnIntervalMax - DOC.spawnIntervalMin);
    }
  }

  const p = state.player;
  const s = effectiveSize(p), ph = s * 0.75;
  const px = p.x - s / 2, py = p.y - ph / 2;
  const pcx = p.x, pcy = p.y;

  for (let i = state.hiddenDocs.length - 1; i >= 0; i--) {
    const d = state.hiddenDocs[i];
    if (d.taken) { state.hiddenDocs.splice(i, 1); continue; }
    d.wy += d.vy * dt;
    d.age += dt;

    // Cull when fully above the viewport (uncollected docs just despawn)
    if (d.wy + d.h < state.scrollY - 60) { state.hiddenDocs.splice(i, 1); continue; }

    // Proximity reveal — distance from window center to doc center
    const dcx = d.wx + d.w / 2;
    const dcy = d.wy + d.h / 2;
    const distance = Math.hypot(pcx - dcx, pcy - dcy);
    const target = distance < DOC.revealRange
      ? (1 - distance / DOC.revealRange)
      : 0;
    // Smooth reveal so it fades in / out as you approach / leave
    d.reveal += (target - d.reveal) * Math.min(1, dt * 7);

    // Collision — AABB overlap collects the doc (no scan time required;
    // touching = collecting since the docs are moving targets)
    const overlapping =
      d.wx < px + s && d.wx + d.w > px &&
      d.wy < py + ph && d.wy + d.h > py;
    if (overlapping) {
      d.taken = true;
      state.docsCollected++;
      state.hiddenDocs.splice(i, 1);
    }
  }
}

export function draw(ctx, state) {
  for (const d of state.hiddenDocs) {
    if (d.taken) continue;
    const r = d.reveal;
    // Ambient hint — always faintly outlined, even at zero reveal, so you
    // can sometimes spot a doc just barely under your window when scanning
    const ambient = 0.08;
    const alpha = Math.max(ambient, r);
    ctx.save();
    // Soft halo grows with reveal
    if (r > 0.2) {
      ctx.globalAlpha = r * 0.55;
      ctx.fillStyle = '#F4D35E';
      ctx.fillRect(d.wx - 8, d.wy - 8, d.w + 16, d.h + 16);
    }
    ctx.globalAlpha = alpha;
    // Folded-document silhouette
    ctx.fillStyle = '#F4D35E';
    ctx.fillRect(d.wx, d.wy, d.w, d.h);
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(d.wx, d.wy, d.w, d.h);
    // Dog-ear corner
    ctx.fillStyle = '#d4b94a';
    ctx.beginPath();
    ctx.moveTo(d.wx + d.w - 10, d.wy);
    ctx.lineTo(d.wx + d.w, d.wy + 10);
    ctx.lineTo(d.wx + d.w - 10, d.wy + 10);
    ctx.closePath();
    ctx.fill();
    // Text lines
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(d.wx + 5, d.wy + 16, d.w - 10, 2);
    ctx.fillRect(d.wx + 5, d.wy + 22, d.w - 14, 2);
    ctx.fillRect(d.wx + 5, d.wy + 28, d.w - 8,  2);
    ctx.fillRect(d.wx + 5, d.wy + 34, d.w - 20, 2);
    // Pulsing border when fully revealed
    if (r > 0.6) {
      const pulse = 0.6 + Math.sin(state.time * 8 + d.age * 5) * 0.4;
      ctx.strokeStyle = 'rgba(244, 211, 94, ' + (0.5 + pulse * 0.5) + ')';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(d.wx - 2, d.wy - 2, d.w + 4, d.h + 4);
    }
    ctx.restore();
  }
}
