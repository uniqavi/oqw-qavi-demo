// Procedural WebAudio. Lazy-init on first user gesture.
//
// Master volume: this module owns the single source of truth for the game's
// master volume (0..1, persisted in localStorage 'oqw-volume'). The synth
// (beep/noise/hum) routes through a master GainNode set to that value. The
// HTMLAudio-based modules (music/sfx/voice) can't share the WebAudio graph, so
// they read getMasterVolume() and subscribe via onMasterVolumeChange() to scale
// their own element volumes. One slider therefore drives everything.

export let audioCtx = null;
export let masterGain = null;

const VOL_KEY = 'oqw-volume';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function readStoredVolume() {
  const raw = typeof localStorage !== 'undefined' ? parseFloat(localStorage.getItem(VOL_KEY)) : NaN;
  return isNaN(raw) ? 0.7 : clamp01(raw);
}
let masterVolume = readStoredVolume();
const volumeListeners = [];

export function getMasterVolume() { return masterVolume; }

export function setMasterVolume(v) {
  masterVolume = clamp01(v);
  try { localStorage.setItem(VOL_KEY, String(masterVolume)); } catch (e) {}
  if (masterGain && audioCtx) masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
  volumeListeners.forEach((cb) => { try { cb(masterVolume); } catch (e) {} });
}

// Subscribe to master-volume changes. Fires immediately with the current value
// so subscribers can sync on registration.
export function onMasterVolumeChange(cb) {
  volumeListeners.push(cb);
  try { cb(masterVolume); } catch (e) {}
}

export function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Master gain — everything synthesised here flows through it.
    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 60;
    const g = audioCtx.createGain();
    g.gain.value = 0.012;
    osc.connect(g).connect(masterGain);
    osc.start();
  } catch (e) {}
}

export function beep(freq, dur, type = 'sine', vol = 0.08) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  osc.connect(g).connect(masterGain || audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur + 0.02);
}

export function noise(dur, vol = 0.1) {
  if (!audioCtx) return;
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audioCtx.createBufferSource();
  s.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = vol;
  s.connect(g).connect(masterGain || audioCtx.destination);
  s.start();
}

// Auto-resume / initialize audio on first user gesture (click, keypress, touch)
if (typeof window !== 'undefined') {
  const resumeAudio = () => {
    initAudio();
    if (audioCtx) {
      if (audioCtx.state === 'running') {
        cleanup();
      } else {
        audioCtx.addEventListener('statechange', function onStateChange() {
          if (audioCtx.state === 'running') {
            cleanup();
            audioCtx.removeEventListener('statechange', onStateChange);
          }
        });
      }
    }
  };
  const cleanup = () => {
    window.removeEventListener('click', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
    window.removeEventListener('touchstart', resumeAudio);
  };
  window.addEventListener('click', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
  window.addEventListener('touchstart', resumeAudio);
}

