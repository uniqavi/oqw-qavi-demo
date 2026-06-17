// One-shot sound effects. Companion to music.js, but for short non-looping
// clips (hits, gunfire, game-over, pickups). Drop files in /public/sfx/ with
// the names below and they just work. Missing files fail silently.
//
// Public API:
//   loadSfx()              — call once on game start (preloads all clips)
//   playSfx(name, opts)    — fire-and-forget one-shot; overlapping plays OK
//   setSfxMuted(bool)      — respects the same 'oqw-audio' flag as the music
//
// Why this is separate from music.js: that module keeps ONE looping track
// alive and crossfades between tracks. SFX are the opposite — many short,
// overlapping, non-looping plays — so each play clones the preloaded element.

import { getMasterVolume } from './audio.js';

const SFX = {
  hit:           '/sfx/player-hit.mp3',     // player takes damage
  gameOver:      '/sfx/game-over.mp3',      // level failed
  heal:          '/sfx/heal.mp3',           // good pickup / powerup
  gun:           '/sfx/gun-shot.mp3',       // single-shot enemy fires (gun avatar)
  burst:         '/sfx/burst-fire.mp3',     // multi-shot enemy volley (search bar)
  // ── Level 2 (dashboard) — drop matching files in /public/sfx/ ──
  crusherSlam:   '/sfx/crusher-slam.mp3',   // bar piston hits the floor
  boulderLaunch: '/sfx/boulder-launch.mp3', // pie chart detaches and drops
  boulderRoll:   '/sfx/boulder-roll.mp3',   // continuous tire rolling (looped via playSfxLoop)
  laserCharge:   '/sfx/laser-charge.mp3',   // gauge winding up to fire
  laserFire:     '/sfx/laser-fire.mp3',     // gauge beam fires
  mineBoom:      '/sfx/mine-boom.mp3',      // spreadsheet mine detonates
  docScan:       '/sfx/doc-scan.mp3',       // hold-SPACE doc capture completes
  hostileAlert:  '/sfx/hostile-alert.mp3',  // widget activation / turns red
  exportReady:   '/sfx/export-ready.mp3',   // EXPORTING complete / exit opens
  docScanLoop:   '/sfx/DOC_Scan_WHEN_SPACE_PRESSED.mp3', // played (looped) while HOLD SPACE captures
  desktopClick:  '/sfx/meme_Mouse_click.mp3',            // desktop icon / window click
};

const clips = {};
let muted = false;
const SFX_MIX = 0.6;      // SFX sit a bit above music in the master mix

export function loadSfx() {
  if (Object.keys(clips).length > 0) return; // already loaded
  muted = localStorage.getItem('oqw-audio') === 'off';
  for (const [name, path] of Object.entries(SFX)) {
    const el = new Audio(path);
    el.preload = 'auto';
    // Suppress 404 console spam if a clip isn't present
    el.addEventListener('error', () => {});
    clips[name] = el;
  }
}

export function setSfxMuted(value) {
  muted = !!value;
}

// Fire a one-shot. Clones the preloaded element so rapid/overlapping plays
// (e.g. several hits in a row) don't cut each other off.
export function playSfx(name, opts = {}) {
  if (muted) return;
  const base = clips[name];
  if (!base) return;
  const el = base.cloneNode();
  el.volume = Math.max(0, Math.min(1, (opts.volume ?? 1) * SFX_MIX * getMasterVolume()));
  // play() can reject before the first user gesture (autoplay policy) — ignore.
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
}

// Looping SFX — for continuous sounds (boulder rolling, alarm hum). Returns
// a handle with .stop() and .setVolume(v). One loop per name at a time; calling
// playSfxLoop with the same name returns the existing handle (no-op restart).
const loops = {};
export function playSfxLoop(name, opts = {}) {
  if (loops[name]) return loops[name];
  const base = clips[name];
  if (!base) return { stop: () => {}, setVolume: () => {} };
  const el = base.cloneNode();
  el.loop = true;
  const baseVol = opts.volume ?? 1;
  el.volume = muted ? 0 : Math.max(0, Math.min(1, baseVol * SFX_MIX * getMasterVolume()));
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
  const handle = {
    el, baseVol,
    setVolume(v) { this.baseVol = v; el.volume = muted ? 0 : Math.max(0, Math.min(1, v * SFX_MIX * getMasterVolume())); },
    stop() {
      // quick fade-out (60ms) to avoid clicky cutoff
      const startVol = el.volume, t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 60);
        el.volume = startVol * (1 - t);
        if (t < 1) requestAnimationFrame(tick);
        else { el.pause(); el.currentTime = 0; }
      };
      requestAnimationFrame(tick);
      delete loops[name];
    },
  };
  loops[name] = handle;
  return handle;
}
export function stopAllSfxLoops() {
  for (const name of Object.keys(loops)) loops[name].stop();
}
