// Voice-over playback. Designed for drop-in MP3s — each dialogue line has
// a `voiceId` that maps to a file at /public/voice/<voiceId>.mp3. If the
// file is missing the call silently no-ops (no console spam).
//
// Public API:
//   playVoice(id)  — play a single line's audio clip (auto-stops any current)
//   stopVoice()    — cut whatever's playing
//   setVoiceMuted(bool)  — mirrors the audio toggle in settings
//
// Recommended generators (in README):
//   ElevenLabs (best quality), PlayHT, Murf
//
// Naming convention: <scene>-<speaker>-<##>.mp3
//   intro-toto-01.mp3
//   intro-you-03.mp3
//   memo-max-02.mp3
//   memo-intercept-01.mp3

import { getMasterVolume, onMasterVolumeChange } from './audio.js';

const VOICE_MIX = 0.9;          // voice's share of the master volume
let muted = false;
let currentClip = null;

function voiceVol() { return muted ? 0 : VOICE_MIX * getMasterVolume(); }

// Live-apply master-volume changes to the currently playing line.
onMasterVolumeChange(() => { if (currentClip) currentClip.volume = voiceVol(); });

export function setVoiceMuted(value) {
  muted = !!value;
  if (currentClip) currentClip.volume = voiceVol();
}

export function playVoice(id) {
  if (!id) return;
  stopVoice();
  const clip = new Audio('/voice/' + id + '.mp3');
  clip.volume = voiceVol();
  // Suppress 404 console spam if the voice file hasn't been generated yet
  clip.addEventListener('error', () => { /* file not present, no problem */ });
  const p = clip.play();
  if (p && p.catch) p.catch(() => {});
  currentClip = clip;
}

export function stopVoice() {
  if (currentClip) {
    try { currentClip.pause(); } catch (_) {}
    currentClip = null;
  }
}
