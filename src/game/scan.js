// Shared X-ray scan logic (used by GameScene + TutorialScene so they can't
// drift). The model is purely SPATIAL: hidden truth is revealed only through
// the window, and an element latches "scanned" only once the window has
// physically swept across (almost) its whole width — never on a timer.
//
// A fragment is any object with at least { hidden, font } plus a text anchor
// and a coverage span. The scene measures the visible text width once and
// stores `coverX` / `coverW` on the fragment; coverage is tracked against that
// span (so you sweep the text, not empty padding).

import { SCAN } from '../config.js';

// Make sure the fragment has measured its text span + a coverage bitmap.
// `ctx` is only needed for the one-time measureText; pass the scene's context.
function ensureCoverage(frag, ctx) {
  if (frag.coverW == null && ctx) {
    ctx.font = frag.font;
    const tw = ctx.measureText(frag.hidden).width;
    frag.coverW = tw + 6;
    frag.coverX = frag.tx;
  }
  const span = frag.coverW || frag.w || 1;
  if (!frag._cov || frag._covSpan !== span) {
    const total = Math.max(6, Math.ceil(span / SCAN.coverBucketPx));
    frag._cov = new Uint8Array(total);
    frag._covCount = 0;
    frag._covSpan = span;
  }
}

// Mark the buckets the window's x-span [winX, winX+winW] currently covers.
// Returns the covered fraction (0..1). Call every frame the window overlaps.
export function markScanCoverage(frag, winX, winW, ctx) {
  ensureCoverage(frag, ctx);
  const x0 = frag.coverX != null ? frag.coverX : frag.x;
  const span = frag._covSpan;
  const total = frag._cov.length;
  const bw = span / total;
  let start = Math.floor((winX - x0) / bw);
  let end = Math.floor((winX + winW - x0) / bw);
  start = Math.max(0, start);
  end = Math.min(total - 1, end);
  let gained = 0;
  for (let i = start; i <= end; i++) {
    if (!frag._cov[i]) { frag._cov[i] = 1; frag._covCount++; gained++; }
  }
  return { frac: frag._covCount / total, gained };
}

// Reset a fragment to un-scanned (clears its coverage bitmap + cached span).
export function resetScanFragment(frag) {
  frag._cov = null;
  frag._covCount = 0;
  frag._covSpan = 0;
  frag.coverW = null;
  frag.coverX = null;
  frag.progress = 0;
  frag.scanned = false;
}
