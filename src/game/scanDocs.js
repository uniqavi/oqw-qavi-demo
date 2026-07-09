// Hold-to-scan document collection — shared across every level.
//
// Docs are no longer collected by touch: the player parks the window over a
// doc and HOLDS SPACE. A progress ring fills; on completion the doc is
// collected. Interrupting (releasing SPACE or stepping off) decays the
// progress instead of wiping it, so a graze from an enemy doesn't feel like
// a total reset.
//
//   updateScan(doc, overlapping, scanHeld, dt [, duration])
//     → true exactly once, on the frame the scan completes.
//   drawScanPrompt(ctx, doc, x, y [, opts])
//     → "HOLD SPACE TO SCAN" chip + progress bar, drawn in world coords.
//
// Docs get two transient fields: `scanP` (0..1 progress) and `scanActive`
// (true while the player is actively scanning it this frame).

import { beep } from './audio.js';

// Fast enough that the pause is a beat of tension, not a chore. The risk is
// standing still — the duration just needs to be long enough to matter.
export const SCAN_DURATION = 0.65;

export function updateScan(doc, overlapping, scanHeld, dt, duration = SCAN_DURATION) {
  if (doc.scanP === undefined) doc.scanP = 0;
  doc.scanActive = false;
  if (doc.taken) return false;

  if (overlapping && scanHeld) {
    doc.scanActive = true;
    doc.scanP = Math.min(1, doc.scanP + dt / duration);
    // soft geiger-tick feedback while scanning
    if (Math.random() < 0.28) beep(1400 + doc.scanP * 800, 0.008, 'square', 0.02);
    if (doc.scanP >= 1) return true;
  } else {
    // decay, don't wipe — half-speed rewind
    doc.scanP = Math.max(0, doc.scanP - dt / (duration * 2));
  }
  return false;
}

// Small dark chip + progress bar. (x, y) is the doc centre in world coords.
export function drawScanPrompt(ctx, doc, x, y, opts = {}) {
  const above = opts.above ?? 34;          // px above the doc centre
  const scale = opts.scale ?? 1;
  const p = doc.scanP || 0;
  ctx.save();
  ctx.translate(x, y - above);
  ctx.scale(scale, scale);

  const label = doc.scanActive ? 'SCANNING…' : 'Hold SPACE to scan';
  ctx.font = 'bold 11px ui-monospace, monospace';
  const tw = ctx.measureText(label).width;
  const w = Math.max(tw + 20, 96), h = 18;

  // chip
  ctx.fillStyle = 'rgba(10,12,20,0.88)';
  ctx.strokeStyle = doc.scanActive ? 'rgba(122,208,235,0.95)' : 'rgba(244,211,94,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 4);
  else ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = doc.scanActive ? '#7ad0eb' : '#F4D35E';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0.5);

  // progress bar under the chip (only once started)
  if (p > 0) {
    const bw = w - 8;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-bw / 2, h / 2 + 3, bw, 4);
    ctx.fillStyle = '#7ad0eb';
    ctx.fillRect(-bw / 2, h / 2 + 3, bw * p, 4);
  }
  ctx.restore();
}
