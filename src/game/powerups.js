// Powerup pickups — spawn occasionally below the viewport and drift up.
// On player overlap, they grant a 5-second buff (size / speed / immune).
// Effect duration is tracked on `state.player.buffs[type]` (counts down per
// frame); zero = inactive.
import { PW, POWERUP } from '../config.js';
import { effectiveSize } from './playerSize.js';

const TYPES = {
  size:   { color: '#9b59b6', label: 'SIZE+',  w: 44, h: 44 },
  speed:  { color: '#2D8659', label: 'FAST',   w: 44, h: 44 },
  immune: { color: '#F4D35E', label: 'SHIELD', w: 44, h: 44 },
};
const TYPE_KEYS = Object.keys(TYPES);

function spawn(state, type, camY, viewH) {
  const def = TYPES[type];
  if (!def) return;
  state.powerups.push({
    type, def,
    wx: 60 + Math.random() * Math.max(60, PW - def.w - 120),
    wy: camY + viewH + 30 + Math.random() * 80,
    w: def.w, h: def.h,
    vy: -POWERUP.riseSpeed,    // drift up slowly so the player has time to catch
    age: 0,
    taken: false,
  });
}

export function tick(state, dt, viewH) {
  // ── Spawn cadence (rare) ──
  state.powerupSpawnT -= dt;
  if (state.powerupSpawnT <= 0) {
    const t = TYPE_KEYS[Math.floor(Math.random() * TYPE_KEYS.length)];
    spawn(state, t, state.scrollY, viewH);
    state.powerupSpawnT = POWERUP.startInterval + (Math.random() - 0.5) * 2 * POWERUP.intervalJitter;
  }

  // ── Update active pickups ──
  const p = state.player;
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const pu = state.powerups[i];
    pu.wy += pu.vy * dt;
    pu.age += dt;
    // Cull when fully above the viewport
    if (pu.wy + pu.h < state.scrollY - 40) { state.powerups.splice(i, 1); continue; }
    // Player overlap → grant buff
    const s = effectiveSize(p), ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    const overlapping =
      pu.wx < px + s && pu.wx + pu.w > px &&
      pu.wy < py + ph && pu.wy + pu.h > py;
    if (overlapping && !pu.taken) {
      pu.taken = true;
      p.buffs[pu.type] = POWERUP.duration;
      state.powerups.splice(i, 1);
    }
  }

  // ── Tick down buff timers ──
  if (p.buffs.size   > 0) p.buffs.size   = Math.max(0, p.buffs.size   - dt);
  if (p.buffs.speed  > 0) p.buffs.speed  = Math.max(0, p.buffs.speed  - dt);
  if (p.buffs.immune > 0) p.buffs.immune = Math.max(0, p.buffs.immune - dt);
}

export function draw(ctx, state) {
  for (const pu of state.powerups) {
    if (pu.taken) continue;
    const pulse = 0.7 + Math.sin(state.time * 6 + pu.age * 4) * 0.3;
    ctx.save();
    // Halo glow (slightly bigger soft outline)
    ctx.globalAlpha = 0.35 * pulse;
    ctx.fillStyle = pu.def.color;
    ctx.fillRect(pu.wx - 6, pu.wy - 6, pu.w + 12, pu.h + 12);
    ctx.globalAlpha = 1;
    // Solid core
    ctx.fillStyle = pu.def.color;
    ctx.fillRect(pu.wx, pu.wy, pu.w, pu.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(pu.wx, pu.wy, pu.w, pu.h);
    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.def.label, pu.wx + pu.w / 2, pu.wy + pu.h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
