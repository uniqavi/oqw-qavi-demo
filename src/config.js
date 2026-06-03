// World dimensions (page logical size — viewport scales to fit)
export const PW = 960;
export const PH = 1200;

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
export const L1 = {
  activeChasingRecs: 1,    // 0..2 — how many sidebar cards actually chase
  gunShooter:     true,    // the signature threat — kept
  shootingSearch: false,   // deferred to later levels
  fallingComment: false,   // deferred
  explodingLike:  false,   // deferred
  crushingCookie: false,   // deferred
  gazeEnforcer:   false,   // the lethal cursor hunter — debuts in L2, off in L1
};

// Player
export const PLAYER = {
  startX: 100,
  startY: 100,
  startSize: 75,
  maxSize: 200,
  deathSize: 25,
  baseSpeed: 230,
  invulnDuration: 0.85,
  hitFlashDuration: 0.3,
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
  chasingRec: 15,
  fallingComment: 22,
  crushingCookie: 14,
  searchProjectile: 8,
  explodingDebris: 6,
  gunBullet: 60,
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
    triggerR: 90,
    chargeDuration: 0.6,
    debrisCount: 14,
    debrisSpeedBase: 200,
    debrisSpeedSpread: 100,
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
    baseX: 892,
    baseY: 26,
    // Bumped from 350 — the avatar should clock you "as you enter the room,"
    // not only when you're standing next to it. awakenDuration also tightened
    // (0.7→0.45) so the threat reads sooner.
    triggerR: 480,
    awakenDuration: 0.45,
    aimDuration: 1.6,
    rotateSpeed: 60 * Math.PI / 180,
    armMaxLength: 55,
    armGrowSpeed: 90,
    armRetractSpeed: 70,
    bulletSpeed: 1500,
    bulletLife: 2.5,
    initialAngle: Math.atan2(1, -1),
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
