// Procedural WebAudio. Lazy-init on first user gesture.

let audioCtx = null;

export function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 60;
    const g = audioCtx.createGain();
    g.gain.value = 0.012;
    osc.connect(g).connect(audioCtx.destination);
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
  osc.connect(g).connect(audioCtx.destination);
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
  s.connect(g).connect(audioCtx.destination);
  s.start();
}
