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

const FIREBASE_DB_URL = "https://quiet-window-default-rtdb.firebaseio.com/scores.json";

export function getLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

// Fetch global scores from Firebase, update local cache, and return top 10
export async function fetchGlobalLeaderboard() {
  try {
    const res = await fetch(FIREBASE_DB_URL);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    const list = [];
    if (data) {
      Object.keys(data).forEach(k => {
        if (data[k] && typeof data[k] === 'object' && data[k].name && typeof data[k].time === 'number') {
          list.push({ name: data[k].name, time: data[k].time });
        }
      });
    }
    list.sort((a, b) => a.time - b.time);
    const top10 = list.slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(top10)); } catch (e) {}
    return top10;
  } catch (e) {
    console.warn("Failed to fetch global leaderboard, using local cache:", e);
    return getLeaderboard();
  }
}

// One-time migration: purge stale mock entries left by older builds.
const MOCK_NAMES = new Set(['ShadowX', 'NightHawk', 'GhostRider']);
(function _purgeStaleMockData() {
  try {
    const board = getLeaderboard();
    if (board.length > 0 && board.every(r => MOCK_NAMES.has(r.name))) {
      localStorage.removeItem(KEY);
    }
  } catch (e) {}
})();

// Insert a run, POST to Firebase, and update local cache.
export function submitScore(name, time) {
  const sanitizedName = (String(name).slice(0, 12) || 'AGENT').toUpperCase();
  
  // 1. Update local cache immediately
  const board = getLeaderboard();
  board.push({ name: sanitizedName, time });
  board.sort((a, b) => a.time - b.time);
  const top = board.slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(top)); } catch (e) {}

  // 2. Post to Firebase in the background
  fetch(FIREBASE_DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: sanitizedName, time: time, timestamp: Date.now() })
  }).catch(err => console.warn("Failed to submit score to Firebase:", err));

  return top;
}

export function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}
