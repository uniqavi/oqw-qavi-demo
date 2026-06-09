// Wave-spawn enemy system for the runner-shooter rework.
//
// MODEL: enemies spawn JUST BELOW the visible viewport and fly UP at the
// player. Opposite direction to the auto-scroll, so they always meet the
// player. The closer the player rides to the viewport bottom, the less time
// they have to react — that's the design's risk/reward.
//
// Type catalog (start with one — `ytcard`; comment-shooters + grenade-throwers
// extend this later by adding new entries here).
import { PW, WAVE } from '../config.js';
import { effectiveSize } from './playerSize.js';

const TYPES = {
  ytcard: {
    w: 220, h: 70,
    color: '#E63946',
    speed: WAVE.speedUp,         // px/sec UPWARD
    homingX: WAVE.homingX,       // gentle horizontal nudge per second
    damage: 12,
    label: 'recommended',
  },
};

// Spawn one enemy of the given type at the BOTTOM of the player's viewport,
// at a random X position. Caller provides cam Y + viewport height.
export function spawn(state, type, camY, viewH) {
  const def = TYPES[type];
  if (!def) return;
  // X anywhere along the page width (with margin so cards don't half-clip)
  const wx = 40 + Math.random() * Math.max(40, PW - def.w - 80);
  // Y just below the viewport bottom so they rise into view
  const wy = camY + viewH + 40 + Math.random() * 60;
  state.waveEnemies.push({
    type,
    wx,
    wy,
    w: def.w, h: def.h,
    vx: 0,
    vy: -def.speed,              // negative = upward
    age: 0,
  });
}

// Per-frame update. Moves enemies UP, applies horizontal homing toward
// player, damages on overlap (with iframe), culls when they leave above
// the viewport top.
export function update(state, dt, viewH) {
  const p = state.player;
  const camY = state.scrollY;
  const list = state.waveEnemies;

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const def = TYPES[e.type];
    if (!def) { list.splice(i, 1); continue; }

    e.age += dt;
    // Horizontal homing toward the player — keeps lanes from feeling fixed
    const dx = p.x - (e.wx + e.w / 2);
    const homeStep = def.homingX * dt;
    if (Math.abs(dx) > 6) e.wx += Math.sign(dx) * Math.min(Math.abs(dx), homeStep);

    e.wx += e.vx * dt;
    e.wy += e.vy * dt;

    // Cull when enemy fully scrolls above the viewport top
    if (e.wy + e.h < camY - 80) {
      list.splice(i, 1);
      continue;
    }

    // Collision with player (AABB in world space). Immune buff skips damage.
    const s = effectiveSize(p), ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    const overlapping =
      e.wx < px + s && e.wx + e.w > px &&
      e.wy < py + ph && e.wy + e.h > py;
    if (overlapping && p.invuln <= 0 && p.buffs.immune <= 0) {
      p.hp = Math.max(0, p.hp - def.damage);
      p.invuln = 0.6;
      p.hitFlash = 0.25;
      // Push the enemy off so it can't drain HP continuously while overlapping
      e.vy += 280;     // sudden upward kick
      if (p.hp === 0) state.gameOver = true;
    }
  }
}

// Spawn cadence — gentle at start, tightens with scroll depth. Capped so
// it never becomes unsurvivable.
export function tickSpawner(state, dt, viewH) {
  state.waveSpawnT -= dt;
  if (state.waveSpawnT > 0) return false;
  const depthFactor = Math.min(1, state.scrollY / WAVE.rampDepth);
  const interval = WAVE.startInterval - (WAVE.startInterval - WAVE.minInterval) * depthFactor;
  state.waveSpawnT = Math.max(WAVE.minInterval, interval);
  spawn(state, 'ytcard', state.scrollY, viewH);
  return true;
}

// Draw enemies in world coords (camera transform already applied).
export function draw(ctx, state) {
  for (const e of state.waveEnemies) {
    const def = TYPES[e.type];
    if (!def) continue;
    // Red card with a darker thumbnail block on the left
    ctx.fillStyle = def.color;
    ctx.fillRect(e.wx, e.wy, e.w, e.h);
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(e.wx + 6, e.wy + 6, e.h - 12, e.h - 12);
    // Label + line bars
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(def.label, e.wx + e.h + 4, e.wy + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(e.wx + e.h + 4, e.wy + 26, e.w - e.h - 16, 4);
    ctx.fillRect(e.wx + e.h + 4, e.wy + 36, e.w - e.h - 36, 4);
    ctx.fillRect(e.wx + e.h + 4, e.wy + 46, e.w - e.h - 60, 4);
    // Pulsing white border so it reads as a threat
    const pulse = 0.5 + Math.sin(state.time * 8 + e.age * 3) * 0.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.4 + pulse * 0.4) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(e.wx, e.wy, e.w, e.h);
    // Direction arrow on top edge so it reads as "incoming" UP
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(e.wx + e.w / 2 - 8, e.wy + 2);
    ctx.lineTo(e.wx + e.w / 2 + 8, e.wy + 2);
    ctx.lineTo(e.wx + e.w / 2, e.wy - 6);
    ctx.closePath();
    ctx.fill();
  }
}
