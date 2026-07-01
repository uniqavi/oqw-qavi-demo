import { PH, PLAYER, CAMERA, AGENTS } from '../config.js';
import {
  recSlots,
  commentSlots,
  createLayout,
  createDocs,
  createCookieJar,
  createPropaganda,
  createTruth,
  createLooseCookies,
  createScanFragments,
} from './layout.js';

// Initial agent data. Each agent's update logic will live in src/game/agents/<name>.js
// (Phase 4); the data structures live here so resetState() can return them all to idle.
function createAgents() {
  const chasingRecs = AGENTS.chasingRecs.instances.map(({ recIdx }) => {
    const slot = recSlots[recIdx];
    return {
      recIdx,
      state: 'idle',
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      vx: 0, vy: 0,
      triggerR: AGENTS.chasingRecs.triggerR,
      life: 0,
    };
  });

  const fallingComment = {
    commentIdx: AGENTS.fallingComment.commentIdx,
    state: 'idle',
    x: 0, y: 0, w: 580, h: 88,
    vy: 0,
    triggerR: AGENTS.fallingComment.triggerR,
    life: 0,
  };
  const fcSlot = commentSlots[fallingComment.commentIdx];
  fallingComment.x = fcSlot.x;
  fallingComment.y = fcSlot.y;

  return {
    chasingRecs,
    shootingSearch: {
      state: 'idle',
      cooldown: 0,
      charge: 0,
      shotsLeft: 0,
      triggerR: AGENTS.shootingSearch.triggerR,
    },
    fallingComment,
    explodingLike: {
      state: 'idle',
      triggerR: AGENTS.explodingLike.triggerR,
      charge: 0,
    },
    crushingCookie: {
      state: 'idle',
      triggerR: AGENTS.crushingCookie.triggerR,
      vy: 0,
    },
    gunShooter: {
      state: 'idle',
      baseX: AGENTS.gunShooter.baseX,
      baseY: AGENTS.gunShooter.baseY,
      triggerR: AGENTS.gunShooter.triggerR,
      armLength: 0,
      currentAngle: AGENTS.gunShooter.initialAngle,
      awakenT: 0,
      aimT: 0,
      spentT: 0,
      rotateSpeed: AGENTS.gunShooter.rotateSpeed,
      awakenDuration: AGENTS.gunShooter.awakenDuration,
      aimDuration: AGENTS.gunShooter.aimDuration,
    },
    fallingBell: {
      state: 'idle',
      x: 0, y: 0,
      vy: 0,
      triggerW: AGENTS.fallingBell.triggerW,
      life: 0,
    },
  };
}

export function createState() {
  return {
    player: {
      x: PLAYER.startX, y: PLAYER.startY,
      size: PLAYER.startSize,
      invuln: 0, hitFlash: 0, growT: 0,
      hp: PLAYER.startHp,         // HP-bar damage model (replaces size shrink)
      maxHp: PLAYER.maxHp,
      useHp: true,                // GameScene uses the HP model in both phases
      // Active buff timers — each decremented per frame, drives effect.
      // (`size` retained for backwards-compat with the test panel; no
      // runtime powerup grants it anymore.)
      buffs: { size: 0, speed: 0, immune: 0, magnet: 0 },
      // Testing-mode toggles (no time limit) — driven by the dev test panel.
      test: { immune: false, size: false, magnet: false },
    },
    cam: {
      x: 0, y: 0,
      zoom: CAMERA.initialZoom,
      targetZoom: CAMERA.initialZoom,
      baseZoom: CAMERA.initialZoom,
      minZoom: 1.0,
      maxZoom: 4.0,
      initialized: false,
    },
    cursor: null,
    gaze: 0,
    docsCollected: 0,
    cookieCollected: false,
    status: 'menu',
    lostReason: '',
    keys: {},
    mouse: { x: 0, y: 0, sx: 0, sy: 0, down: false },
    time: 0,
    sparks: [],
    crumbs: [],
    projectiles: [],
    bullets: [],
    debris: [],
    stats: {
      damageTaken: 0,
      hitsReceived: 0,
      gazeMaxed: false,
      endedAt: 0,
    },
    // First-time intel reveal: when the player drags the propaganda off the
    // CLASSIFIED memo, an in-game dialog plays once and pauses gameplay.
    intelRevealed: false,
    intelDialog: null,   // { idx, charT, typing } when active
    truthExposedT: 0,    // seconds of continuous uncovered truth (debounce trigger)
    gunGraceUntil: 6,    // gun shooter doesn't fire before this game-time (set per difficulty in GameScene)
    tipShowing: false,   // true while an onboarding tip modal is on-screen (pauses game)
    // Auto-scroll model: scrollY is the camera's vertical "world" position; it
    // monotonically increases. scrollSpeed is the current px/sec rate.
    scrollY: 0,
    scrollSpeed: 0,
    // Wave-spawn system — enemies fly UP from below the viewport.
    // Initial spawn delay (2.5s) gives the player a chance to read the screen
    // before the first threat appears.
    waveEnemies: [],
    waveSpawnT: 2.5,
    // Powerups — same shape, drift up; collide → grant buff (or heal HP).
    powerups: [],
    powerupSpawnT: 4,           // first powerup ~4s in
    // Floating world-space captions ("+22 HP", "HP MAX") that rise + fade.
    floatingTexts: [],
    // Hidden docs — the runner's WIN condition. Spawn from bottom, proximity-
    // revealed, collect 5 to escape.
    hiddenDocs: [],
    hiddenDocSpawnT: 10,        // first hidden doc ~10s in
    docsTarget: 5,
    // Run state for the new game over flow.
    gameOver: false,
    hitCount: 0,          // total enemy hits taken (drives the humour quip)
    quipShown: false,     // the "i'm a virus too" quip has played
    // Escape sequence — scripted ending after the 5 docs are collected. null
    // during normal play; an object { step, ... } while the escape plays out.
    escape: null,
    // Generic narration (player's own voice etc.) — reuses the intel dialog
    // DOM. null when idle; { lines, idx, typing } while showing.
    narration: null,
    // Two-phase level model.
    //   'static'   — pre-checkpoint hostile YouTube page. All 6 static agents
    //                active, camera follows the player around a 960×1200
    //                world, 5 fixed-position docs to grab, then the cookie
    //                banner at the bottom is the checkpoint trigger.
    //   'scroller' — post-checkpoint runner. Current GameScene behavior,
    //                starting from the player's current scroll position.
    phase: 'static',
    cookieReady: false,        // becomes true after 5 docs; cookie banner = exit
    agents: createAgents(),
    layout: createLayout(),
    docs: createDocs(),
    cookieJar: createCookieJar(),
    propaganda: createPropaganda(),
    truth: createTruth(),
    looseCookies: createLooseCookies(),
    scanFragments: createScanFragments(),
  };
}

// Reset in place — preserves outer references to state.layout, state.agents, etc.
export function resetState(state) {
  const p = state.player;
  p.x = PLAYER.startX; p.y = PLAYER.startY; p.size = PLAYER.startSize;
  p.invuln = 0; p.hitFlash = 0; p.growT = 0;
  p.hp = PLAYER.startHp; p.maxHp = PLAYER.maxHp;

  state.docs.forEach(d => { d.taken = false; d.takeT = 0; });
  state.looseCookies.forEach(d => { d.taken = false; d.takeT = 0; });
  state.cookieJar.taken = false;
  state.cookieJar.takeT = 0;
  state.cookieCollected = false;

  const prop = state.propaganda[0];
  prop.x = prop.homeX; prop.y = prop.homeY;
  prop.dragging = false;
  prop.dox = 0; prop.doy = 0;
  prop.revealed = false;

  state.cursor = null;
  state.gaze = 0;
  state.docsCollected = 0;
  state.lostReason = '';
  state.time = 0;

  state.cam.zoom = state.cam.baseZoom;
  state.cam.targetZoom = state.cam.baseZoom;

  state.projectiles.length = 0;
  state.bullets.length = 0;
  state.debris.length = 0;
  state.crumbs.length = 0;

  state.stats.damageTaken = 0;
  state.stats.hitsReceived = 0;
  state.stats.gazeMaxed = false;
  state.stats.endedAt = 0;

  state.intelRevealed = false;
  state.intelDialog = null;
  state.truthExposedT = 0;
  state.tipShowing = false;

  // Auto-scroll + wave + powerup system reset
  state.scrollY = 0;
  state.scrollSpeed = 0;
  state.waveEnemies.length = 0;
  state.waveSpawnT = 2.5;       // matches initial grace
  state.powerups.length = 0;
  state.powerupSpawnT = 4;
  state.hiddenDocs.length = 0;
  state.hiddenDocSpawnT = 10;
  state.escape = null;
  state.narration = null;
  state.hitCount = 0;
  state.quipShown = false;
  state.quip = null;
  state.gameOver = false;
  p.buffs.size = 0; p.buffs.speed = 0; p.buffs.immune = 0; p.buffs.magnet = 0;
  state.floatingTexts.length = 0;

  // X-ray scan fragments back to un-revealed (clear coverage bitmaps too)
  state.scanFragments.forEach(f => {
    f._cov = null; f._covCount = 0; f._covSpan = 0;
    f.coverW = null; f.coverX = null;
    f.progress = 0; f.scanned = false;
  });

  // Agents back to idle
  state.agents.chasingRecs.forEach(a => {
    const slot = recSlots[a.recIdx];
    a.x = slot.x; a.y = slot.y;
    a.vx = 0; a.vy = 0;
    a.state = 'idle';
    a.life = 0;
  });

  const ss = state.agents.shootingSearch;
  ss.state = 'idle'; ss.cooldown = 0; ss.charge = 0; ss.shotsLeft = 0;

  const fc = state.agents.fallingComment;
  const fcSlot = commentSlots[fc.commentIdx];
  fc.x = fcSlot.x; fc.y = fcSlot.y;
  fc.vy = 0; fc.state = 'idle'; fc.life = 0;

  const el = state.agents.explodingLike;
  el.state = 'idle'; el.charge = 0;

  const cc = state.agents.crushingCookie;
  cc.state = 'idle'; cc.vy = 0;
  state.layout.cookie.y = PH - 40;
  state.layout.cookie.h = 40;

  const gs = state.agents.gunShooter;
  gs.state = 'idle';
  gs.armLength = 0;
  gs.awakenT = 0; gs.aimT = 0; gs.spentT = 0;
  gs.currentAngle = AGENTS.gunShooter.initialAngle;

  // Phase + Phase-A-only state
  state.phase = 'static';
  state.cookieReady = false;

  state.status = 'playing';
}
