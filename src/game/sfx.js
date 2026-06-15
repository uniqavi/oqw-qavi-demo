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
  hit:      '/sfx/player-hit.mp3',  // player takes damage
  gameOver: '/sfx/game-over.mp3',   // level failed
  heal:     '/sfx/heal.mp3',        // good pickup / powerup
  gun:      '/sfx/gun-shot.mp3',    // single-shot enemy fires (gun avatar)
  burst:    '/sfx/burst-fire.mp3',  // multi-shot enemy volley (search bar)
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
