// Powerup pickups — spawn occasionally below the viewport and drift up.
// On player overlap, they apply an instant effect (HP+) or grant a buff
// (FAST / SHIELD / MAGNET). Buff durations are PER-TYPE so SHIELD and MAGNET
// can be both rare AND long-lasting (see POWERUP.durations / weights).
import { PW, POWERUP } from '../config.js';
import { effectiveSize } from './playerSize.js';

const TYPES = {
  hp:     { color: '#E63946', label: 'HP+',    w: 44, h: 44 },
  speed:  { color: '#2D8659', label: 'FAST',   w: 44, h: 44 },
  immune: { color: '#F4D35E', label: 'SHIELD', w: 44, h: 44 },
  magnet: { color: '#9b59b6', label: 'MAGNET', w: 44, h: 44 },
};

// Build a weighted spawn table from POWERUP.weights once.
const SPAWN_BAG = (() => {
  const bag = [];
  for (const [k, w] of Object.entries(POWERUP.weights)) for (let i = 0; i < w; i++) bag.push(k);
  return bag;
})();

function spawn(state, type, camY, viewH) {
  const def = TYPES[type];
  if (!def) return;
  state.powerups.push({
    type, def,
    wx: 60 + Math.random() * Math.max(60, PW - def.w - 120),
    wy: camY + viewH + 30 + Math.random() * 80,
    w: def.w, h: def.h,
    vy: -POWERUP.riseSpeed,
    age: 0,
    taken: false,
  });
}

export function tick(state, dt, viewH) {
  // ── Spawn cadence (rarer now) ──
  state.powerupSpawnT -= dt;
  if (state.powerupSpawnT <= 0) {
    const t = SPAWN_BAG[Math.floor(Math.random() * SPAWN_BAG.length)];
    spawn(state, t, state.scrollY, viewH);
    state.powerupSpawnT = POWERUP.startInterval + (Math.random() - 0.5) * 2 * POWERUP.intervalJitter;
  }

  // ── Update active pickups ──
  const p = state.player;
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const pu = state.powerups[i];
    pu.wy += pu.vy * dt;
    pu.age += dt;
    if (pu.wy + pu.h < state.scrollY - 40) { state.powerups.splice(i, 1); continue; }
    const s = effectiveSize(p), ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    const overlapping =
      pu.wx < px + s && pu.wx + pu.w > px &&
      pu.wy < py + ph && pu.wy + pu.h > py;
    if (overlapping && !pu.taken) {
      pu.taken = true;
      applyEffect(state, pu);
      state.powerups.splice(i, 1);
    }
  }

  // ── Tick down buff timers (HP+ doesn't have one — it's instant) ──
  if (p.buffs.speed  > 0) p.buffs.speed  = Math.max(0, p.buffs.speed  - dt);
  if (p.buffs.immune > 0) p.buffs.immune = Math.max(0, p.buffs.immune - dt);
  if (p.buffs.magnet > 0) p.buffs.magnet = Math.max(0, p.buffs.magnet - dt);
}

function applyEffect(state, pu) {
  const p = state.player;
  if (pu.type === 'hp') {
    // Permanent heal. If HP is already max, float a "HP MAX" caption at the
    // pickup point so the player knows the pickup wasn't wasted by accident.
    if (p.hp >= p.maxHp) {
      pushFloat(state, pu, p.useHits ? 'GLASS INTACT' : 'HP MAX', '#9a9a9a');
    } else if (p.useHits) {
      // Discrete-hits model: repairs one hit (one crack cluster on the window)
      p.hp = Math.min(p.maxHp, p.hp + 1);
      pushFloat(state, pu, 'GLASS REPAIRED', '#6dc89e');
    } else {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + POWERUP.hpHeal);
      const gained = p.hp - before;
      pushFloat(state, pu, '+' + gained + ' HP', '#6dc89e');
    }
    return;
  }
  // Buff types — set the timer to this type's per-type duration.
  const dur = POWERUP.durations[pu.type] || 0;
  p.buffs[pu.type] = Math.max(p.buffs[pu.type] || 0, dur);
}

function pushFloat(state, pu, text, color) {
  state.floatingTexts.push({
    wx: pu.wx + pu.w / 2,
    wy: pu.wy + pu.h / 2,
    text, color,
    age: 0, life: 1.4,
  });
}

export function draw(ctx, state) {
  for (const pu of state.powerups) {
    if (pu.taken) continue;
    const pulse = 0.7 + Math.sin(state.time * 6 + pu.age * 4) * 0.3;
    ctx.save();
    ctx.globalAlpha = 0.35 * pulse;
    ctx.fillStyle = pu.def.color;
    ctx.fillRect(pu.wx - 6, pu.wy - 6, pu.w + 12, pu.h + 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pu.def.color;
    ctx.fillRect(pu.wx, pu.wy, pu.w, pu.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(pu.wx, pu.wy, pu.w, pu.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.def.label, pu.wx + pu.w / 2, pu.wy + pu.h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
