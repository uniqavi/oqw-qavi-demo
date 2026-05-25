// L1 ending sequence — malware install → short-circuit arcs → enemies fried.
// The DOM-side animations (progress bar, glitch sweep) live in style.css and are
// triggered from GameScene; this module owns the canvas-space drawing for
// electrical arcs and the per-enemy "shorted" overlay.
//
// State machine (state.endSeq.phase):
//   'install'   — DOM progress bar fills 0→100% over ~1.6s
//   'arcing'    — arcs propagate from SUBSCRIBE button to each enemy in turn
//   'wipe'      — DOM glitch scanline sweeps top→bottom (0.9s)
//   'done'      — switch state.status to 'won' so the results screen shows
//
// All durations tuned to feel like ~5-6s of climax before results.

import { beep, noise } from './audio.js';

export const PHASE_DURATIONS = {
  install: 1.7,   // matches DOM transition; user reads the line
  arcing:  2.4,   // 6 enemies, ~0.4s between arc hits
  wipe:    0.9,   // matches CSS glitch-wipe keyframes
};

// Enemy targets for the arc propagation, in the order they get fried.
// Coordinates are derived live from agent state so we don't hardcode pixels.
export function collectArcTargets(state) {
  const layout = state.layout;
  const a = state.agents;
  return [
    { name: 'search',   x: layout.search.x + layout.search.w / 2,   y: layout.search.y + layout.search.h / 2,   ref: a.shootingSearch },
    { name: 'like',     x: layout.likeBtn.x + layout.likeBtn.w / 2, y: layout.likeBtn.y + layout.likeBtn.h / 2, ref: a.explodingLike },
    { name: 'comment',  x: a.fallingComment.x + 290,                 y: a.fallingComment.y + 44,                 ref: a.fallingComment },
    { name: 'cookie',   x: layout.cookie.x + layout.cookie.w / 2,   y: layout.cookie.y + layout.cookie.h / 2,   ref: a.crushingCookie },
    { name: 'rec1',     x: a.chasingRecs[0].x + a.chasingRecs[0].w / 2, y: a.chasingRecs[0].y + a.chasingRecs[0].h / 2, ref: a.chasingRecs[0] },
    { name: 'rec2',     x: a.chasingRecs[1].x + a.chasingRecs[1].w / 2, y: a.chasingRecs[1].y + a.chasingRecs[1].h / 2, ref: a.chasingRecs[1] },
    { name: 'avatar',   x: a.gunShooter.baseX,                       y: a.gunShooter.baseY,                       ref: a.gunShooter },
  ];
}

// Start the sequence. Caller (GameScene) should:
//  - set state.endSeq = startEndSequence(state)
//  - show #end-sequence and #malware-install DOM
//  - let update() drive phase transitions
export function startEndSequence(state) {
  return {
    phase: 'install',
    t: 0,
    targets: collectArcTargets(state),
    arcsFired: [],   // {fromX,fromY,toX,toY,startT,life,targetIdx}
    nextArcIdx: 0,
    sourceX: state.layout.subscribe.x + state.layout.subscribe.w / 2,
    sourceY: state.layout.subscribe.y + state.layout.subscribe.h / 2,
    audioPlayed: { install: false, wipe: false },
  };
}

// Per-frame tick. Returns true if the whole sequence is done.
export function updateEndSequence(es, dt, state) {
  es.t += dt;

  if (es.phase === 'install') {
    if (!es.audioPlayed.install) {
      es.audioPlayed.install = true;
      beep(880, 0.06, 'square', 0.05);
      setTimeout(() => beep(1100, 0.06, 'square', 0.05), 200);
      setTimeout(() => beep(1320, 0.06, 'square', 0.05), 400);
    }
    if (es.t >= PHASE_DURATIONS.install) {
      es.phase = 'arcing';
      es.t = 0;
      // First arc fires immediately
      fireNextArc(es, state);
    }
  } else if (es.phase === 'arcing') {
    // Fire arcs at evenly-spaced intervals
    const interval = PHASE_DURATIONS.arcing / es.targets.length;
    while (es.nextArcIdx < es.targets.length && es.t >= es.nextArcIdx * interval) {
      fireNextArc(es, state);
    }
    // Decay existing arcs
    for (const a of es.arcsFired) a.life -= dt;
    es.arcsFired = es.arcsFired.filter((a) => a.life > 0);
    if (es.t >= PHASE_DURATIONS.arcing && es.arcsFired.length === 0) {
      es.phase = 'wipe';
      es.t = 0;
    }
  } else if (es.phase === 'wipe') {
    if (!es.audioPlayed.wipe) {
      es.audioPlayed.wipe = true;
      noise(0.4, 0.18);
      beep(220, 0.18, 'sawtooth', 0.12);
    }
    if (es.t >= PHASE_DURATIONS.wipe) {
      es.phase = 'done';
      return true;
    }
  }
  return false;
}

function fireNextArc(es, state) {
  if (es.nextArcIdx >= es.targets.length) return;
  const target = es.targets[es.nextArcIdx];
  es.arcsFired.push({
    fromX: es.sourceX, fromY: es.sourceY,
    toX: target.x, toY: target.y,
    life: 0.5,
    targetIdx: es.nextArcIdx,
  });
  // Mark the agent as shorted so its draw functions can show the dark/sparking variant.
  // We add a `.shorted` flag (existing draw code ignores it harmlessly).
  if (target.ref) target.ref.shorted = true;
  // Electrical sound
  beep(1800 + Math.random() * 400, 0.04, 'square', 0.06);
  beep(220, 0.08, 'sawtooth', 0.05);
  // Sparks at the impact
  for (let i = 0; i < 14; i++) {
    state.sparks.push({
      x: target.x, y: target.y, life: 0.6, hit: true,
      vx: (Math.random() - 0.5) * 280,
      vy: (Math.random() - 0.5) * 280,
    });
  }
  es.nextArcIdx++;
}

// ----- Drawing (called from GameScene.render, inside the world transform) -----

export function drawArcs(ctx, es, state) {
  if (!es) return;
  for (const a of es.arcsFired) {
    const t = 1 - a.life / 0.5;
    drawLightning(ctx, a.fromX, a.fromY, a.toX, a.toY, t);
  }
  // Pulsing source glow at SUBSCRIBE
  if (es.phase === 'arcing' || es.phase === 'install') {
    const pulse = 18 + Math.sin(state.time * 22) * 6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(es.sourceX, es.sourceY, 0, es.sourceX, es.sourceY, pulse * 2);
    grad.addColorStop(0, 'rgba(255, 240, 100, 0.85)');
    grad.addColorStop(0.4, 'rgba(230, 57, 70, 0.4)');
    grad.addColorStop(1, 'rgba(230, 57, 70, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(es.sourceX, es.sourceY, pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Jagged lightning bolt between two points. t=0..1 controls bloom/fade.
function drawLightning(ctx, x1, y1, x2, y2, t) {
  const segments = 14;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;   // perpendicular
  const jitter = 16 * (1 - t * 0.4);

  // Outer glow pass
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 240, 120, ' + (0.6 * (1 - t)) + ')';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segments; i++) {
    const p = i / segments;
    const ox = (Math.random() - 0.5) * jitter;
    const oy = (Math.random() - 0.5) * jitter;
    ctx.lineTo(x1 + dx * p + nx * ox + ox * 0.3, y1 + dy * p + ny * oy + oy * 0.3);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();

  // Inner bright core
  ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.95 * (1 - t * 0.7)) + ')';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segments; i++) {
    const p = i / segments;
    const ox = (Math.random() - 0.5) * jitter * 0.7;
    const oy = (Math.random() - 0.5) * jitter * 0.7;
    ctx.lineTo(x1 + dx * p + nx * ox, y1 + dy * p + ny * oy);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// Small flickering overlay for "shorted" enemies — called by GameScene after
// the normal enemy render. Just adds soot, faint sparks, and dim.
export function drawShortedOverlay(ctx, x, y, w, h, state) {
  // Dim the area
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, w, h);
  // Occasional spark
  if (Math.random() < 0.18) {
    const sx = x + Math.random() * w;
    const sy = y + Math.random() * h;
    ctx.fillStyle = 'rgba(255, 220, 100, 0.85)';
    ctx.fillRect(sx, sy, 2, 2);
  }
  // Soot vignette
  ctx.strokeStyle = 'rgba(40, 20, 20, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}
