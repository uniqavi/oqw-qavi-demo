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

import { getMasterVolume, audioCtx, masterGain, initAudio } from './audio.js';

const SFX = {
  hit:           '/sfx/player-hit.mp3',
  gameOver:      '/sfx/game-over.mp3',
  heal:          '/sfx/heal.mp3',
  gun:           '/sfx/gun-shot.mp3',
  burst:         '/sfx/burst-fire.mp3',
  crusherSlam:   '/sfx/crusher-slam.mp3',
  boulderLaunch: '/sfx/boulder-launch.mp3',
  boulderRoll:   '/sfx/boulder-roll.mp3',
  laserCharge:   '/sfx/laser-charge.mp3',
  laserFire:     '/sfx/laser-fire.mp3',
  mineBoom:      '/sfx/mine-boom.mp3',
  docScan:       '/sfx/doc-scan.mp3',
  hostileAlert:  '/sfx/hostile-alert.mp3',
  exportReady:   '/sfx/export-ready.mp3',
  docScanLoop:   '/sfx/DOC_Scan_WHEN_SPACE_PRESSED.mp3',
  desktopClick:  '/sfx/meme_Mouse_click.mp3',
};

const clips = {}; // AudioBuffers
let muted = false;
const SFX_MIX = 0.6;

export async function loadSfx() {
  if (Object.keys(clips).length > 0) return;
  muted = localStorage.getItem('oqw-audio') === 'off';
  initAudio();
  
  if (!audioCtx) return;

  const loadPromises = Object.entries(SFX).map(async ([name, path]) => {
    try {
      const response = await fetch(path);
      if (!response.ok) return; // fail silently like the original
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      clips[name] = audioBuffer;
    } catch (e) {
      // suppress errors for missing files
    }
  });
  
  await Promise.all(loadPromises);
}

export function setSfxMuted(value) {
  muted = !!value;
}

export function playSfx(name, opts = {}) {
  if (muted || !audioCtx) return;
  const buffer = clips[name];
  if (!buffer) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(1, (opts.volume ?? 1) * SFX_MIX * getMasterVolume()));
  
  source.connect(gainNode).connect(masterGain || audioCtx.destination);
  source.start(0);
}

const loops = {};
export function playSfxLoop(name, opts = {}) {
  if (loops[name]) return loops[name];
  if (!audioCtx) return { stop: () => {}, setVolume: () => {} };
  
  const buffer = clips[name];
  if (!buffer) return { stop: () => {}, setVolume: () => {} };
  
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  
  const baseVol = opts.volume ?? 1;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = muted ? 0 : Math.max(0, Math.min(1, baseVol * SFX_MIX * getMasterVolume()));
  
  source.connect(gainNode).connect(masterGain || audioCtx.destination);
  source.start(0);
  
  const handle = {
    source, gainNode, baseVol,
    setVolume(v) { 
      this.baseVol = v; 
      gainNode.gain.value = muted ? 0 : Math.max(0, Math.min(1, v * SFX_MIX * getMasterVolume())); 
    },
    stop() {
      const startVol = gainNode.gain.value;
      const t0 = audioCtx.currentTime;
      gainNode.gain.setValueAtTime(startVol, t0);
      gainNode.gain.linearRampToValueAtTime(0, t0 + 0.06);
      source.stop(t0 + 0.06);
      delete loops[name];
    },
  };
  loops[name] = handle;
  return handle;
}

export function stopAllSfxLoops() {
  for (const name of Object.keys(loops)) loops[name].stop();
}
