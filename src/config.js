// World dimensions (page logical size — viewport scales to fit).
// PW stays as the playable width. PH is effectively INFINITE for the runner
// rework — the camera scrolls forever. We use a huge number rather than
// Infinity so a few legacy clamps that compare against PH still behave.
export const PW = 960;
export const PH = 1e9;

// Per-difficulty multipliers. Applied at agent update time. Tuned so EASY
// is genuinely forgiving for new players, NORMAL is "as designed,"
// HARD is for repeat players. Picked at the difficulty menu.
//
// Note: in addition to these, GameScene grants a SAFE_INTRO window where
// the most lethal agent (gun shooter) won't trigger for N seconds — see
// AGENTS.gunShooter.startGracePeriod below.
export const DIFFICULTY = {
  // EASY is the default and is tuned to be genuinely gentle — this is a
  // discovery game first, a reflex game a distant second (see docs/LEVEL1.md).
  easy:   { agentSpeed: 0.55, agentDamage: 0.45, triggerRange: 0.65, gunGrace: 16 },
  normal: { agentSpeed: 0.85, agentDamage: 0.8,  triggerRange: 0.9,  gunGrace: 8  },
  hard:   { agentSpeed: 1.15, agentDamage: 1.1,  triggerRange: 1.1,  gunGrace: 4  },
};

export function getDifficulty() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('oqw-difficulty')) || 'easy';
  return DIFFICULTY[key] || DIFFICULTY.easy;
}

// ── Level 1 accessibility pass (see docs/LEVEL1.md §8) ──────────────────────
// L1 runs a REDUCED enemy set so first-time / non-gamer players can learn the
// core scanning loop without being overwhelmed. "Disabled" enemies aren't
// removed — they simply never leave idle state, so they still render as normal
// harmless page components (the search bar still shows, it just won't shoot).
// Later levels re-enable more of them for escalating difficulty.
// NOTE: with the auto-scroll shooter rework, the level uses the new
// wave-spawn enemy system (src/game/waveEnemies.js). All of the original
// static page-element agents are now disabled — they still render as
// inert page chrome (search bar, account avatar) so the page still LOOKS
// right, they just never wake up. Re-enable per-flag if a specific one is
// useful in the wave model.
export const L1 = {
  activeChasingRecs: 0,
  gunShooter:     false,
  shootingSearch: false,
  fallingComment: false,
  explodingLike:  false,
  crushingCookie: false,
  gazeEnforcer:   false,
};

// Player
export const PLAYER = {
  startX: 80,             // top-left corner
  startY: 80,             // top-left corner
  startSize: 56,           // smaller window = harder to graze enemies (runner difficulty)
  maxSize: 200,
  deathSize: 25,
  baseSpeed: 360,          // bumped — needed for dodging in a scroller
  invulnDuration: 0.85,
  hitFlashDuration: 0.3,
  // Discrete-hits damage model: every level gives the window 3 hits
  // (see p.useHits in combat.js); glass cracks show the damage.
  // SHIFT boosts the PLAYER's movement speed only (the scroll is unaffected).
  boostMul: 1.9,
};

// Auto-scroll model (Subway-Surfers-style piecewise ramp). The first stretch
// is intentionally slow — the player should clear the YouTube page chrome
// (~1100px tall) in 12-15s so the world feels "calm" before it escalates.
// After the chill phase, base speed ramps linearly up to a max.
// SHIFT is the ONLY input that pushes scroll faster — DOWN is purely player
// movement (towards viewport bottom = closer to enemy spawn = riskier dodge).
export const SCROLL = {
  // Overall slower than before so SHIFT-boosted player movement actually
  // feels effective (the relative speed-up against the page is bigger).
  // Phase 3 rebalance: shorter calm phase + faster ramp/top speed so the
  // level can't be brute-forced by idling through it.
  slowSpeed:    90,    // px/sec for the first `slowDuration` seconds (very calm)
  fastSpeed:    225,   // max base speed after the ramp completes
  slowDuration: 12,    // seconds of calm intro before ramp begins
  rampDuration: 26,    // seconds over which speed ramps slow → fast
  // NOTE: SHIFT no longer affects the scroll — it only boosts the player's
  // own movement (see PLAYER.boostMul). The scroll ramps purely on time.
};

// Wave-enemy tuning. Enemies spawn just below the viewport and fly UP toward
// the player — opposite direction to the auto-scroll, so they always meet
// the player even if the player is hugging the top edge. Spawn rate is
// gentle at start, tightens with depth (capped to keep it survivable).
export const WAVE = {
  // Phase 3 rebalance: slightly denser waves so weaving matters more than
  // tanking (pairs with the tighter SCROLL ramp above).
  startInterval:  2.6,   // seconds between spawns at depth = 0
  minInterval:    0.95,  // tightest spawn rate at max depth
  rampDepth:      8000,  // depth (scrollY) at which we hit minInterval (spawn rate only)
  // Enemy upward speed is CONSTANT and slow — only the scroll speed ramps, so
  // the closing speed grows over time without the enemies themselves getting
  // faster (keeps them dodgeable).
  speed:          85,    // px/sec, fixed
  // Homing: enemies track the player's x only briefly after spawning, then go
  // straight up their own way (no more tracking).
  homingX:        90,    // horizontal nudge toward player x while homing (px/sec)
  homeDuration:   1.0,   // seconds of homing before they stop tracking
};

// Powerup tuning. Four runtime types:
//   • HP+    — PERMANENT +HP boost on pickup (no timer). If HP is already
//              max, shows a floating "HP MAX" message at the pickup point.
//   • FAST   — 5s player-speed buff.
//   • SHIELD — long, RARE damage immunity.
//   • MAGNET — long, RARE doc magnet.
// Spawn cadence is the same for all; per-type weights make shield/magnet
// uncommon, and per-type durations make them long when they DO appear.
export const POWERUP = {
  startInterval: 10,     // seconds between spawns at start (was 7)
  intervalJitter: 4,     // ± random padding so spawns feel organic
  riseSpeed:      80,    // px/sec — pickups drift up gently
  speedMul:       1.55,  // FAST: player movement speed scaled
  hpHeal:         22,    // HP+: heals this much on pickup (permanent)
  sizeMul:        1.85,  // retained for the dev test panel only (not a runtime buff)
  // Per-type durations (seconds) — `0` means "instant effect, no timer".
  durations: { hp: 0, speed: 5, immune: 12, magnet: 12 },
  // Weighted spawn table — higher = more common.
  weights:   { hp: 6, speed: 5, immune: 1, magnet: 1 },
};

// Camera (zoom values overridden by resize fit-to-width)
export const CAMERA = {
  initialZoom: 2.0,
  followLerp: 4,
  zoomLerp: 6,
  minZoomMult: 0.6,
  maxZoomMult: 2.5,
  keyZoomFactor: 1.15,
  wheelZoomFactor: 1.12,
};

// Gaze meter + cursor enforcer
export const GAZE = {
  raisePerSec: 22,
  fallPerSec: 9,
  threshold: 100,
  cursorAccel: 240,
  cursorDamping: 0.94,
  cursorBornGrace: 0.4,
  cursorCatchRadiusMult: 0.42,
};

// Damage values
export const DAMAGE = {
  chasingRec: 25,
  fallingComment: 35,
  crushingCookie: 22,
  searchProjectile: 15,
  explodingDebris: 12,
  gunBullet: 75,
  fallingBell: 28,
  roadSpike: 25,
};

// Agent tuning (extracted directly from source)
export const AGENTS = {
  chasingRecs: {
    // Bumped from 180 — playtest: enemies felt dead until you were right on
    // them. Now wakes when the player gets within a clear "danger zone."
    triggerR: 280,
    accel: 380,
    damping: 0.93,
    awakenDuration: 0.4,
    chaseDuration: 7,
    knockMag: 40,
    instances: [{ recIdx: 1 }, { recIdx: 4 }],
  },
  shootingSearch: {
    triggerR: 220,
    chargeDuration: 0.7,
    shotsPerVolley: 5,
    fireInterval: 0.2,
    cooldownDuration: 4,
    projectileSpeed: 280,
    projectileLife: 3,
    yMaxTrigger: 200,
  },
  fallingComment: {
    commentIdx: 1,
    triggerR: 140,
    rumbleDuration: 0.8,
    gravity: 1100,
    knockY: 30,
  },
  explodingLike: {
    triggerR: 220,
    chargeDuration: 0.6,
    debrisCount: 20,
    debrisSpeedBase: 350,
    debrisSpeedSpread: 150,
    debrisLife: 2.5,
    debrisSize: 14,
    cooldownDuration: 5,
  },
  crushingCookie: {
    triggerR: 250,
    crushSpeed: 80,
    knockY: -50,
  },
  gunShooter: {
    baseX: 701,
    baseY: 26,
    // Bumped to 900 to ensure it wakes up when player is in comments
    triggerR: 900,
    awakenDuration: 0.45,
    aimDuration: 1.6,
    rotateSpeed: 60 * Math.PI / 180,
    armMaxLength: 55,
    armGrowSpeed: 90,
    armRetractSpeed: 70,
    bulletSpeed: 1500,
    bulletLife: 2.5,
    initialAngle: Math.atan2(1, -1),
    cooldownDuration: 4,
  },
  fallingBell: {
    triggerW: 30,
    rumbleDuration: 0.8,
    gravity: 1200,
    knockY: 25,
  },
};

// X-ray scanning — persistent reveal of the hidden truth under page text.
// While the window covers a fragment, `progress` fills; at 1 the reveal
// latches `scanned` and the truth stays on the page even after the window
// moves away (see docs/LEVEL1.md §1). Currently a free, optional discovery
// layer — it does not gate the win yet (that's the dossier/follow-lead step).
export const SCAN = {
  // Spatial model: the truth is revealed ONLY through the window (clipped to
  // its bounds), like an X-ray. We track which horizontal slices of an element
  // the window has swept; once enough of it has been covered, the reveal
  // latches persistent. No timers — coverage is purely spatial.
  coverThreshold: 0.85,    // fraction of the text width that must be swept to latch
  coverBucketPx:  8,       // width of each coverage bucket (smaller = finer)
  revealColor: '#E63946',  // persistent truth text, drawn on the page once latched
  xrayColor:   '#7ad0eb',  // in-window decode text (the live X-ray look)
  xrayBg:      '#110214',  // dark "glass" backdrop the window reveals
  glowColor:   '122,208,235', // rgb for the "something here" glow
};

// Pickups
export const PICKUPS = {
  docGrowth: 3,
  cookieGrowth: 120,
  cookieGrowDuration: 0.8,
  pickRadiusMult: 0.32,
  crumbGrowth: 5,
};

// Visual atmospherics
export const RENDER = {
  sparkSpawnRate: 4,
  crumbCount: 30,
  crumbGravity: 280,
  crumbColors: ['#8B5A2B', '#C68642', '#D2A679', '#A0522D'],
  bulletTrailLength: 8,
};

// Color palette
export const COLORS = {
  red: '#E63946',
  yellow: '#F4D35E',
  green: '#2D8659',
  blue: '#4A7BC8',
  purple: '#9b59b6',
  bgPage: '#f5f5f5',
  bgCanvas: '#181818',
  bgDark: '#0c0c0e',
  fg: '#1a1a1f',
};
