// Reusable in-game pause / audio overlay (the #pause-menu DOM in index.html).
// Opened with ESC from gameplay scenes. Holds a master-volume slider (the
// single source of truth lives in audio.js), a mute toggle, RESUME and
// MAIN MENU. Each scene passes an onQuit callback; resume just closes.
//
// Public API:
//   togglePauseMenu({ onResume, onQuit })  — ESC handler
//   openPauseMenu / closePauseMenu / isPauseOpen
//   resetPauseMenu()                        — hide without firing callbacks
//   wireVolumeControl({ slider, val, mute }) — bind a volume widget anywhere
//                                              (also used by the main menu)

import { getMasterVolume, setMasterVolume } from './audio.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Bind a slider + percentage label + mute button to the master volume. Returns
// a { sync } you can call to refresh the widget if the volume changes elsewhere.
// Reused by both the pause overlay and the main-menu settings so there is one
// behaviour everywhere.
export function wireVolumeControl(els, opts = {}) {
  let lastNonZero = getMasterVolume() || 0.7;
  const sync = (v) => {
    const pct = Math.round(v * 100);
    if (els.slider) els.slider.value = String(pct);
    if (els.val) els.val.textContent = pct + '%';
    if (els.mute) {
      els.mute.classList.toggle('muted', v <= 0);
      els.mute.innerHTML = v <= 0 ? '&#128263;' : '&#128266;'; // 🔇 / 🔊
    }
  };
  const set = (v) => {
    v = clamp01(v);
    if (v > 0) lastNonZero = v;
    setMasterVolume(v);
    sync(v);
  };
  const listenOpts = opts.signal ? { signal: opts.signal } : undefined;
  els.slider?.addEventListener('input', () => set(parseInt(els.slider.value, 10) / 100), listenOpts);
  els.mute?.addEventListener('click', (e) => {
    e.stopPropagation();
    set(getMasterVolume() > 0 ? 0 : (lastNonZero || 0.7));
  }, listenOpts);
  sync(getMasterVolume());
  return { sync };
}

let dom = null;
let volCtl = null;
let inited = false;
let opened = false;
let onResumeCb = null;
let onQuitCb = null;

function ensureInit() {
  if (inited) return;
  const wrap = document.getElementById('pause-menu');
  if (!wrap) return;          // DOM not on this page
  dom = {
    wrap,
    slider: document.getElementById('pause-volume'),
    val:    document.getElementById('pause-volume-val'),
    mute:   document.getElementById('pause-mute'),
    resume: document.getElementById('pause-resume'),
    quit:   document.getElementById('pause-quit'),
  };
  inited = true;

  volCtl = wireVolumeControl(dom);

  // Swallow ALL clicks inside the overlay so they never reach the scene's
  // document-level narration / intel click-to-advance handlers (the bug where
  // clicking pause buttons advanced the dialogue). Button handlers below run
  // first (target phase); this stops the bubble before it hits document.
  dom.wrap.addEventListener('click', (e) => e.stopPropagation());

  dom.resume?.addEventListener('click', () => closePauseMenu());
  dom.quit?.addEventListener('click', () => {
    const cb = onQuitCb;
    hide();
    onResumeCb = null; onQuitCb = null;
    if (cb) cb();
  });
}

function hide() {
  dom?.wrap?.classList.add('hidden');
  opened = false;
}

export function openPauseMenu(opts = {}) {
  ensureInit();
  if (!dom || !dom.wrap) return;
  onResumeCb = opts.onResume || null;
  onQuitCb = opts.onQuit || null;
  volCtl?.sync(getMasterVolume());     // reflect changes made elsewhere
  dom.wrap.classList.remove('hidden');
  opened = true;
}

export function closePauseMenu() {
  if (!opened) return;
  const cb = onResumeCb;
  hide();
  onResumeCb = null; onQuitCb = null;
  if (cb) cb();
}

export function togglePauseMenu(opts = {}) {
  if (opened) closePauseMenu();
  else openPauseMenu(opts);
}

export function isPauseOpen() { return opened; }

// Hide immediately without invoking resume/quit callbacks — for scene teardown.
export function resetPauseMenu() {
  onResumeCb = null; onQuitCb = null;
  hide();
}
