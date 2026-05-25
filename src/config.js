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
  easy:   { agentSpeed: 0.75, agentDamage: 0.7,  triggerRange: 0.85, gunGrace: 12 },
  normal: { agentSpeed: 1.0,  agentDamage: 1.0,  triggerRange: 1.0,  gunGrace: 6  },
  hard:   { agentSpeed: 1.25, agentDamage: 1.15, triggerRange: 1.15, gunGrace: 3  },
};

export function getDifficulty() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('oqw-difficulty')) || 'normal';
  return DIFFICULTY[key] || DIFFICULTY.normal;
}

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
    triggerR: 180,
    accel: 380,
    damping: 0.93,
    awakenDuration: 0.6,
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
    triggerR: 350,
    awakenDuration: 0.7,
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

// Pickups
export const PICKUPS = {
  docGrowth: 3,
  cookieGrowth: 120,
  cookieGrowDuration: 0.8,
  pickRadiusMult: 0.32,
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
