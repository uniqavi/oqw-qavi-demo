// Story-progression storage — one place that knows every progression key.
//
// DESIGN (requested): a fresh page load ALWAYS starts the campaign from the
// beginning (Toto's intro chat). Scene changes never reload the page, so
// progression flows normally during a play session; refreshing the browser
// (or clearing site data) resets it. resetProgress() is called once per page
// load from BootScene.
//
// PERSISTENT keys (never touched here, so the future global-leaderboard
// wiring stays intact):
//   oqw-leaderboard   — TOP AGENTS high-score board
//   oqw-difficulty    — player preference
//   oqw-volume / oqw-audio — audio settings

export const PROGRESS_KEYS = [
  'oqw-briefing-read',    // intro chat + briefing done → Quiet Window (1.1) unlocked
  'oqw-level1-cleared',   // 1.1 home feed beaten
  'oqw-level12-ready',    // Toto's post-1.1 chat done → Quiet Window 1.2 unlocked
  'oqw-level2-cleared',   // 1.2 runner beaten → encrypted intel lands
  'oqw-decrypted',        // intel_02 decryption minigame solved
  'oqw-level2-ready',     // Toto's post-decrypt chat done → The Quiet: Hush unlocked
  'oqw-level3-cleared',   // dashboard beaten (campaign complete)
  'oqw-epilogue-done',    // Toto's wrap-up chat after the campaign
  // per-run speedrun clocks (feed one TOP AGENTS submission, then reset)
  'oqw-time-l1', 'oqw-time-l2', 'oqw-time-l3',
  'oqw-accum-l1', 'oqw-accum-l2', 'oqw-accum-l3',
];

export function resetProgress() {
  try {
    PROGRESS_KEYS.forEach((k) => localStorage.removeItem(k));
    // first-time onboarding tips are part of a fresh start too
    const tips = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('oqw-tip-')) tips.push(key);
    }
    tips.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Could not reset progression', e);
  }
}
