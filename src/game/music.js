// Background music system. Designed for drop-in MP3 / OGG files — drop the
// audio files in /public/music/ with the matching filename and they just
// work. If a file is missing, calls silently no-op (no error spam).
//
// Tracks live in /public/music/ so Vite serves them from the root.
// File names match the keys below — e.g. /public/music/menu.mp3
//
// Public API:
//   loadMusic()            — call once on game start (preloads all tracks)
//   playMusic(name, opts)  — play with optional fade-in (default 800ms)
//   stopMusic(opts)        — fade-out current track (default 600ms)
//   crossfadeTo(name)      — smooth swap between tracks
//   setMusicMuted(bool)    — respects oqw-audio localStorage flag
//
// Settings: hooks into existing localStorage 'oqw-audio' flag from MenuScene.

const TRACKS = {
  menu:    '/music/menu.mp3',          // main menu theme
  level1:  '/music/level1.mp3',        // L1 in-game loop
  level2:  '/music/level2.mp3',        // L2 SPYGRAM loop
  hale:    '/music/hale.mp3',          // L2 boss encounter sting/loop
  tension: '/music/tension.mp3',       // brief sting when enemy active
};

const audioElements = {};
let currentTrack = null;
let currentVolume = 0;
let masterVolume = 0.5;          // tune this — music shouldn't drown SFX
let muted = false;
let fadeRaf = null;

// Preload all tracks once. Missing files fail silently — the audio element
// just stays in an error state and play() will reject quietly.
export function loadMusic() {
  if (Object.keys(audioElements).length > 0) return; // already loaded
  muted = localStorage.getItem('oqw-audio') === 'off';
  for (const [name, path] of Object.entries(TRACKS)) {
    const el = new Audio(path);
    el.loop = true;
    el.volume = 0;
    el.preload = 'auto';
    // Suppress 404 console spam if a track file isn't present yet
    el.addEventListener('error', () => {
      // intentionally silent — teammate hasn't dropped the file in yet
    });
    audioElements[name] = el;
  }
}

export function setMusicMuted(value) {
  muted = !!value;
  // Apply immediately to current track
  if (currentTrack && audioElements[currentTrack]) {
    audioElements[currentTrack].volume = muted ? 0 : currentVolume * masterVolume;
  }
}

export function isMusicMuted() {
  return muted;
}

export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (currentTrack && audioElements[currentTrack] && !muted) {
    audioElements[currentTrack].volume = currentVolume * masterVolume;
  }
}

// Play a track. Fades from current volume to target over `fadeMs`.
// If `name` is the same as current track, no-op. If `name` is null, stops.
export function playMusic(name, opts = {}) {
  const fadeMs = opts.fadeMs ?? 800;
  const targetVol = opts.volume ?? 1.0;

  if (name === currentTrack) return;

  // Stop whatever's playing first (instant — playMusic doesn't crossfade,
  // call crossfadeTo() for that)
  if (currentTrack && audioElements[currentTrack]) {
    audioElements[currentTrack].pause();
    audioElements[currentTrack].currentTime = 0;
  }

  currentTrack = name;
  currentVolume = 0;
  if (!name) return;

  const el = audioElements[name];
  if (!el) return;
  el.currentTime = 0;
  el.volume = 0;
  // play() can reject if the user hasn't interacted yet — autoplay policy.
  // Catch and ignore; next user click will let the next playMusic() succeed.
  const p = el.play();
  if (p && p.catch) p.catch(() => {});

  // Fade in
  startFade(name, 0, muted ? 0 : targetVol, fadeMs);
  currentVolume = targetVol;
}

export function stopMusic(opts = {}) {
  if (!currentTrack) return;
  const fadeMs = opts.fadeMs ?? 600;
  const el = audioElements[currentTrack];
  const trackBeingStopped = currentTrack;
  if (!el) { currentTrack = null; return; }
  startFade(trackBeingStopped, el.volume, 0, fadeMs, () => {
    el.pause();
    el.currentTime = 0;
  });
  currentTrack = null;
}

// Smooth swap — old fades out as new fades in
export function crossfadeTo(name, opts = {}) {
  const fadeMs = opts.fadeMs ?? 1200;
  const targetVol = opts.volume ?? 1.0;

  if (name === currentTrack) return;
  const oldTrack = currentTrack;
  const oldEl = oldTrack ? audioElements[oldTrack] : null;

  // Start new track at 0 volume
  const newEl = audioElements[name];
  if (newEl) {
    newEl.currentTime = 0;
    newEl.volume = 0;
    const p = newEl.play();
    if (p && p.catch) p.catch(() => {});
    startFade(name, 0, muted ? 0 : targetVol, fadeMs);
  }

  // Fade out old track in parallel
  if (oldEl) {
    const fromVol = oldEl.volume;
    startFade(oldTrack, fromVol, 0, fadeMs, () => {
      oldEl.pause();
      oldEl.currentTime = 0;
    }, true);
  }

  currentTrack = name;
  currentVolume = targetVol;
}

// Internal: fade a single track's volume.
// `secondary` flag lets two fades coexist (one for old, one for new).
const activeFades = {};
function startFade(trackName, fromVol, toVol, durationMs, onDone, secondary) {
  const el = audioElements[trackName];
  if (!el) { if (onDone) onDone(); return; }
  const startT = performance.now();
  // Cancel any prior fade for this track
  if (activeFades[trackName]) cancelAnimationFrame(activeFades[trackName]);
  const tick = (now) => {
    const t = Math.min(1, (now - startT) / durationMs);
    const v = fromVol + (toVol - fromVol) * t;
    el.volume = muted ? 0 : v * masterVolume;
    if (t < 1) {
      activeFades[trackName] = requestAnimationFrame(tick);
    } else {
      delete activeFades[trackName];
      if (onDone) onDone();
    }
  };
  activeFades[trackName] = requestAnimationFrame(tick);
}
