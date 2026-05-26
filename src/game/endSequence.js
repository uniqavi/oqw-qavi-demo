// L1 ending sequence — malware install → top-to-bottom kill sweep.
//
// Replaces the previous arcs-from-SUBSCRIBE approach. The new design is a
// horizontal "scan band" that slides from y=0 down to y=PH across the
// page. As it crosses each enemy's vertical position, that enemy is
// marked as shorted (dim + sparking). After the sweep completes, control
// returns to GameScene which switches state.status to 'won'.
//
// State machine (es.phase):
//   'install' — brief DOM progress bar (1.0s) sets up the "malware is
//               installing" narrative beat
//   'sweep'   — world-space scan band descends from top to bottom (3.5s)
//   'done'    — sequence finished; GameScene flips state.status to 'won'

import { PH, PW } from '../config.js';
import { beep, noise } from './audio.js';

export const PHASE_DURATIONS = {
  install: 1.6,    // pause + camera pans from player position up to top
  sweep:   4.5,    // top-to-bottom kill wave; camera follows sweep line
};

// Height of the trailing "corrupted" band behind the sweep line.
// Bigger = more dramatic glitch trail.
const BAND_HEIGHT = 90;

// Collect all enemy targets and sort them by Y so the sweep hits them
// in vertical order. Coordinates derived live from agent state so the
// sweep works even if agents have moved from their idle positions.
export function collectTargets(state) {
  const layout = state.layout;
  const a = state.agents;
  const targets = [
    { name: 'search',  x: layout.search.x  + layout.search.w  / 2, y: layout.search.y  + layout.search.h  / 2, ref: a.shootingSearch },
    { name: 'avatar',  x: a.gunShooter.baseX,                       y: a.gunShooter.baseY + 14,                 ref: a.gunShooter },
    { name: 'rec1',    x: a.chasingRecs[0].x + a.chasingRecs[0].w / 2, y: a.chasingRecs[0].y + a.chasingRecs[0].h / 2, ref: a.chasingRecs[0] },
    { name: 'like',    x: layout.likeBtn.x + layout.likeBtn.w / 2, y: layout.likeBtn.y + layout.likeBtn.h / 2, ref: a.explodingLike },
    { name: 'rec2',    x: a.chasingRecs[1].x + a.chasingRecs[1].w / 2, y: a.chasingRecs[1].y + a.chasingRecs[1].h / 2, ref: a.chasingRecs[1] },
    { name: 'comment', x: a.fallingComment.x + 290,                 y: a.fallingComment.y + 44,                 ref: a.fallingComment },
    { name: 'cookie',  x: layout.cookie.x  + layout.cookie.w  / 2, y: layout.cookie.y  + layout.cookie.h  / 2, ref: a.crushingCookie },
  ];
  // Sort top → bottom so the sweep kills them in vertical order
  targets.sort((a, b) => a.y - b.y);
  // Initialize per-target kill flag
  for (const t of targets) t.killed = false;
  return targets;
}

export function startEndSequence(state) {
  return {
    phase: 'install',
    t: 0,
    targets: collectTargets(state),
    sweepY: 0,
    audioPlayed: { install: false, sweepStart: false, sweepEnd: false },
    glitchSeed: 0,
  };
}

export function updateEndSequence(es, dt, state) {
  es.t += dt;
  es.glitchSeed += dt;

  if (es.phase === 'install') {
    if (!es.audioPlayed.install) {
      es.audioPlayed.install = true;
      beep(880, 0.06, 'square', 0.05);
      setTimeout(() => beep(1100, 0.06, 'square', 0.05), 200);
      setTimeout(() => beep(1320, 0.06, 'square', 0.05), 400);
    }
    if (es.t >= PHASE_DURATIONS.install) {
      es.phase = 'sweep';
      es.t = 0;
      es.sweepY = 0;
    }
  } else if (es.phase === 'sweep') {
    if (!es.audioPlayed.sweepStart) {
      es.audioPlayed.sweepStart = true;
      noise(0.4, 0.12);
      beep(160, 0.6, 'sawtooth', 0.07);
      setTimeout(() => beep(220, 0.4, 'sawtooth', 0.05), 200);
    }

    // Eased descent — slow start, accelerate through the middle, soft stop.
    const tRaw = Math.min(1, es.t / PHASE_DURATIONS.sweep);
    const eased = tRaw < 0.5
      ? 2 * tRaw * tRaw
      : 1 - Math.pow(-2 * tRaw + 2, 2) / 2;
    es.sweepY = PH * eased;

    // Mark enemies as killed when the sweep crosses their y position
    for (const target of es.targets) {
      if (target.killed) continue;
      if (es.sweepY >= target.y) {
        target.killed = true;
        if (target.ref) target.ref.shorted = true;
        // Burst of sparks at the kill point
        for (let i = 0; i < 18; i++) {
          state.sparks.push({
            x: target.x + (Math.random() - 0.5) * 50,
            y: target.y + (Math.random() - 0.5) * 24,
            life: 0.7, hit: true,
            vx: (Math.random() - 0.5) * 320,
            vy: (Math.random() - 0.5) * 320,
          });
        }
        // Per-kill sound — short electric zap
        beep(1700 + Math.random() * 500, 0.045, 'square', 0.06);
        beep(190, 0.1, 'sawtooth', 0.05);
      }
    }

    if (es.t >= PHASE_DURATIONS.sweep) {
      if (!es.audioPlayed.sweepEnd) {
        es.audioPlayed.sweepEnd = true;
        beep(440, 0.25, 'sine', 0.08);
      }
      es.phase = 'done';
      return true;
    }
  }
  return false;
}

// ----- Drawing (world space — called inside the camera transform) -----

// Draw the active sweep line + trailing glitch band. Drawn in world coords
// so it correctly aligns with enemy positions on the page.
export function drawSweep(ctx, es, state) {
  if (!es) return;
  if (es.phase !== 'sweep') return;

  const y = es.sweepY;
  const w = PW;

  ctx.save();

  // 1) Dimmed/corrupted area behind the sweep line (the area it's already passed)
  //    Subtle dark tint shows what's been "killed" so far.
  ctx.fillStyle = 'rgba(20, 35, 50, 0.08)';
  ctx.fillRect(0, 0, w, y);

  // 2) Trailing glitch band — area immediately above the sweep line.
  //    Random rectangles + horizontal scanlines + cool tint.
  const bandTop = Math.max(0, y - BAND_HEIGHT);
  const bandH = y - bandTop;

  // Subtle blue-grey wash on the band
  ctx.fillStyle = 'rgba(35, 65, 85, 0.20)';
  ctx.fillRect(0, bandTop, w, bandH);

  // Random glitch rectangles — pseudo-random based on glitchSeed so they
  // shift each frame, giving a "data being corrupted" feel.
  const seed = Math.floor(es.glitchSeed * 40);
  for (let i = 0; i < 36; i++) {
    const r1 = ((seed + i * 7919) % 1000) / 1000;
    const r2 = ((seed + i * 1597) % 1000) / 1000;
    const r3 = ((seed + i * 2729) % 1000) / 1000;
    const gx = r1 * w;
    const gy = bandTop + r2 * bandH;
    const gw = 24 + r3 * 90;
    const gh = 1 + (r1 * r2) * 4;
    const cool = r3 > 0.4;
    const color = cool ? '95, 165, 200' : '210, 235, 250';
    const alpha = 0.15 + r2 * 0.35;
    ctx.fillStyle = 'rgba(' + color + ', ' + alpha + ')';
    ctx.fillRect(gx, gy, gw, gh);
  }

  // Horizontal scanlines in the band — denser near the leading edge
  for (let i = 0; i < bandH; i += 3) {
    const dist = bandH - i;            // distance from sweep line
    const a = 0.20 * (1 - dist / bandH);
    ctx.fillStyle = 'rgba(140, 200, 225, ' + a + ')';
    ctx.fillRect(0, bandTop + i, w, 1);
  }

  // 3) Active sweep line — bright leading edge
  ctx.globalCompositeOperation = 'lighter';

  // Outer cyan glow
  ctx.strokeStyle = 'rgba(100, 180, 215, 0.55)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();

  // Middle softer line
  ctx.strokeStyle = 'rgba(170, 225, 245, 0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();

  // Bright inner line (sharp white core)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();

  // 4) Glow ahead of the line (very subtle hint of what's coming)
  const gradAhead = ctx.createLinearGradient(0, y, 0, y + 30);
  gradAhead.addColorStop(0, 'rgba(170, 225, 245, 0.35)');
  gradAhead.addColorStop(1, 'rgba(170, 225, 245, 0)');
  ctx.fillStyle = gradAhead;
  ctx.fillRect(0, y, w, 30);

  ctx.restore();
}

// Backward-compat alias — GameScene currently imports drawArcs.
// Just forwards to drawSweep so existing call sites keep working.
export function drawArcs(ctx, es, state) {
  drawSweep(ctx, es, state);
}

// Small flickering overlay for "shorted" enemies — called by GameScene
// after the normal enemy render. Same behavior as before, just with the
// new cool-cyan accent color instead of yellow.
export function drawShortedOverlay(ctx, x, y, w, h, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, w, h);
  if (Math.random() < 0.18) {
    const sx = x + Math.random() * w;
    const sy = y + Math.random() * h;
    ctx.fillStyle = 'rgba(140, 210, 235, 0.85)';
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.strokeStyle = 'rgba(20, 40, 50, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}
