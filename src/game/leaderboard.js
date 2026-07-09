// Speedrun leaderboard — total time (seconds) to clear all three levels.
// Per-level times land in localStorage as each level is beaten; beating the
// final level (the Dashboard) sums them, asks for a name, and stores the
// top 3 runs. The desktop (MenuScene) shows them in the TOP AGENTS widget.

const KEY = 'oqw-leaderboard';
export const TIME_KEYS = { l1: 'oqw-time-l1', l2: 'oqw-time-l2', l3: 'oqw-time-l3' };

export function saveLevelTime(level, seconds) {
  try { localStorage.setItem(TIME_KEYS[level], String(seconds)); } catch (e) {}
}

// Total run time across all three levels, or null if any level is missing.
export function getTotalRunTime() {
  const parts = Object.values(TIME_KEYS).map(k => parseFloat(localStorage.getItem(k)));
  if (parts.some(v => isNaN(v))) return null;
  return parts.reduce((a, b) => a + b, 0);
}

const DEFAULT_BOARD = [
  { name: 'ShadowX', time: 154.56 },
  { name: 'NightHawk', time: 192.78 },
  { name: 'GhostRider', time: 225.23 }
];

export function getLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_BOARD;
  } catch (e) { return DEFAULT_BOARD; }
}

// Insert a run and keep the 3 fastest. Returns the new board.
export function submitScore(name, time) {
  const board = getLeaderboard();
  board.push({ name: String(name).slice(0, 12) || 'AGENT', time });
  board.sort((a, b) => a.time - b.time);
  const top = board.slice(0, 3);
  try { localStorage.setItem(KEY, JSON.stringify(top)); } catch (e) {}
  return top;
}

export function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}
