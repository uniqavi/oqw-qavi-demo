import Phaser from 'phaser';
import { initAudio, beep, noise, whoosh, whistle } from '../game/audio.js';
import { saveLevelTime } from '../game/leaderboard.js';
import { drawHandRect } from '../game/draw.js';
import { dist } from '../game/physics.js';
import { COLORS, PLAYER, AGENTS } from '../config.js';
import * as ChasingRecs from '../game/agents/chasingRecs.js';
import * as ShootingSearch from '../game/agents/shootingSearch.js';
import * as GunShooter from '../game/agents/gunShooter.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';
import { damagePlayer } from '../game/combat.js';
import { syncCracksToHp, drawCracks } from '../game/cracks.js';
import { crossfadeTo, loadMusic } from '../game/music.js';
import { loadSfx, playSfx } from '../game/sfx.js';
import { updateScan, drawScanPrompt } from '../game/scanDocs.js';
import { showLevelComplete, removeLevelComplete } from '../game/levelComplete.js';


// LEVEL 1.1 — TOTALLYNORMALTUBE HOME PAGE ("Hidden Agents")
//
// The home page LOOKS innocent, but its UI is hostile. You pilot the red
// window (WASD, SHIFT to dash) around the page and:
//   • the account avatar (top-right) pulls a gun and fires one lethal shot —
//     rush it to dodge;
//   • two video cards tear off the page and CHASE you;
//   • the search bar fires autocomplete shrapnel when you get near the top.
// Survive, collect the scattered EVIDENCE DOCS, then dive into the boosted
// video ("What They Don't Want You To See") to drop into Level 1.2.
//
// No scanning — taking damage drains an HP bar (same model as 1.2). At 0 HP
// the window crashes → retry (R). Agents are the ported Mission-02 modules,
// re-coordinated onto this 1920-wide layout (see src/game/agents/*).

const DW = 1920;                       // logical design width (fit to canvas width)
const DOCS_TARGET = 4;                 // evidence docs to collect before the exit opens
const GUN_GRACE = 4;                   // seconds before the avatar can fire (learn the controls)

const LAYOUT = {
  topBar: { h: 56 },
  chips:  { y: 56, h: 48 },
  rail:   { w: 240 },
  content:{ x: 264, top: 128, right: 40 },
};
const CONTENT_W = DW - LAYOUT.content.x - LAYOUT.content.right;

// Search bar + account avatar rects in world space — must match where
// drawTopBar paints them, since the agents trigger/aim off these.
const SEARCH_RECT  = { x: DW / 2 - 320, y: 12, w: 560, h: 32 };
const ACCOUNT_RECT = { x: DW / 2 + 250, y: 10, w: 36, h: 36 };

const CHIPS = ['All', 'Brain Rot', 'Distractions', 'Outrage', 'Compliance',
  'Nothing', 'Mixes', 'Live', 'Comply', 'Trending', 'New to you'];
const RAIL = [
  ['⌂', 'Home', true], ['⚡', 'Shorts'], ['▷', 'Subscriptions'],
  ['—'], ['◐', 'You'], ['◷', 'History'], ['▤', 'Playlists'], ['♡', 'Liked'],
  ['—'], ['EXPLORE'], ['♪', 'Music'], ['⛶', 'Live'], ['◉', 'Gaming'],
];
const THUMB_COLORS = [COLORS.blue, COLORS.purple, COLORS.green, COLORS.yellow,
  COLORS.red, '#0fa3b1', '#e07a5f', '#3d5a80'];

// `p` (propaganda) just tints the view count red — purely cosmetic now.
// `target` is the boosted video that is the EXIT into 1.2.
const FEATURED = [
  { t: "I BET YOU DIDN'T KNOW THIS", c: 'MindBlown Daily', v: '2.1B', d: '0:42', p: true },
  { t: 'MAKE DINOSAURS GREAT AGAIN', c: 'PrehistoricPolitics', v: '1.8B', d: '8:00', p: true, art: 'turtle' },
  { t: 'CELEBRITY DOES NOTHING FOR 3 HOURS', c: 'NoThoughts', v: '205K', d: '16:31' },
];
const SHORTS = [
  { t: "it's giving 💅", e: '' }, { t: 'we live in a society', e: '' },
  { t: 'delulu solulu', e: '' }, { t: 'caught in 4K', e: '' }, { t: 'obey', e: '' },
];
const GRID = [
  { t: 'why thinking is bad for you', c: 'BoredAbove', v: '88K', d: '9:41' },
  { t: 'POV: you opened this tab again', c: 'RelatableCore', v: '4.2K', d: '0:15' },
  { t: 'this is fine (everything is normal)', c: 'ThisIsFine', v: '12K', d: '7:07' },
  { t: 'STONKS only go up (trust me)', c: 'MemeStreet', v: '990M', d: '14:22', p: true },
  { t: "bro really thinks he's him", c: 'NoWayBro', v: '212', d: '0:33' },
  { t: 'skibidi rizz gone wrong (emotional)', c: 'BrainrotTV', v: '3.4B', d: '2:31', p: true },
  { t: "What They Don't Want You To See (full doc)", c: 'UnknownUploader', v: '6.9B', d: '3:14', target: true },
  { t: '[REDACTED] (do not watch)', c: '████████', v: '4', d: '0:04' },
  { t: 'touch grass challenge — IMPOSSIBLE', c: 'TerminallyOnline', v: '9.1K', d: '9:09' },
  { t: 'ASMR: corporate compliance training', c: 'HUSH HR', v: '47K', d: '45:00' },
  { t: 'we live in a society (4 hours)', c: 'SocietyCore', v: '660K', d: '4:00:00' },
  { t: 'watch this INSTEAD of the news', c: 'TotallyNormal', v: '31K', d: '7:07' },
];

export default class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  create(data) {
    this.difficulty = data?.difficulty || localStorage.getItem('oqw-difficulty') || 'easy';
    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    document.body.classList.remove('menu-mode');
    // One shared in-level track across all levels (level2.mp3); the desktop
    // hub uses level1.mp3 — see music notes in src/game/music.js.
    // load* are no-ops if MenuScene already loaded them, but cover DEV jumps
    // straight into this scene.
    loadMusic(); loadSfx();
    crossfadeTo('level2', { fadeMs: 1500 });
    const urlBar = document.getElementById('browser-url');
    if (urlBar) urlBar.textContent = 'https://totallynormaltube.gov.??/';

    this.time = 0;
    this.camX = 0;
    this.camY = 0;
    this.zoomLevel = 1.0;
    this.docsCollected = 0;
    this.bonusCollected = 0;
    this._hudAnimateStarted = false;
    this.failed = false;
    this.entering = false;
    this.started = false;
    this.startT = 0;
    this.tutorialStep = 0;
    this.cannonballs = [];
    this.fireballs = [];
    this.portalSparkles = [];

    // Smasher short selections (exactly two unique alternating smashers: 2nd [index 1] and 4th [index 3] cards)
    this.smasherIndices = [1, 3];
    this.smasherStates = this.smasherIndices.map(index => ({
      index,
      state: 'idle',
      x: 0,
      y: 0,
      length: 0,
      targetX: 0,
      targetY: 0,
      angle: -Math.PI / 2,
      t: 0,
      cooldown: 0,
      triggerR: 320,
    }));

    // Preload flipflop image
    this.flipflopImg = new Image();
    this.flipflopImg.src = 'flipflop.png';

    this.buildVideos();           // sets this.videos + this.worldH

    // Player window — HP model (same as the 1.2 runner). size=120 makes the
    // shared playerBox() hitbox exactly match the 120×90 window the agents
    // collide against. Start in the gap below the featured row.
    const fth = ((CONTENT_W - 48) / 3) * 9 / 16;
    // Lethality redesign: 3 discrete hits (gun costs 2) instead of an HP
    // pool — the level is about learning a safe route, not tanking damage.
    // Spawn at the top-left corner of the walkable content area.
    const player = {
      x: LAYOUT.content.x + 66, y: LAYOUT.chips.y + LAYOUT.chips.h + 55,
      w: 120, h: 90, size: 120,
      hp: 3, maxHp: 3, useHp: true, useHits: true,
      invuln: 0, hitFlash: 0,
      test: { immune: false },
    };
    this.player = player;
    this._lastHp = player.hp;
    this.cracks = [];            // glass cracks on the window, grown per hit

    // Shared state object the ported agents + combat helper consume. Mirrors
    // the shape of game/state.js (player, layout, projectiles/bullets/sparks,
    // stats, status) but only the fields these three agents touch.
    this.gs = {
      player,
      layout: { search: SEARCH_RECT, account: ACCOUNT_RECT },
      projectiles: [], bullets: [], sparks: [],
      stats: { damageTaken: 0, hitsReceived: 0, endedAt: 0 },
      status: 'playing', lostReason: '',
      time: 0, worldW: DW,
      agents: this.buildAgents(),
      flipflopImg: this.flipflopImg,
    };

    this.docs = this.buildDocs();
    this.portalVid = this.videos.find(v => v.target);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.onKey = (e) => {
      // Tutorial takes priority — SPACE/Enter advance the step
      if (this.tutorialStep > 0 && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); this.advanceTutorial(); return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePauseMenu({ onQuit: () => this.quitToMenu() });
      } else if (this.failed && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault(); this.scene.restart({ difficulty: this.difficulty });
      }
    };
    document.addEventListener('keydown', this.onKey);

    // HUD — Phase 2 top-bar redesign: the docs counter lives in the browser
    // chrome (SECURED badge in the urlbar) and health is shown as glass
    // cracks on the window itself. No overlay frames.
    this.urlbarTools = document.getElementById('urlbar-tools');
    this.securedBadge = document.getElementById('secured-badge');
    this.securedCount = document.getElementById('secured-count');
    this.urlbarTools?.classList.remove('hidden');
    this.securedBadge?.classList.remove('cleared');

    // Narration: reuse the intel-dialog DOM. Click anywhere or SPACE/Enter
    // advances. While narration is active the level is paused.
    this.intelDom = {
      wrap:    document.getElementById('intel-dialog'),
      speaker: document.getElementById('intel-speaker'),
      line:    document.getElementById('intel-line'),
      hint:    document.getElementById('intel-hint'),
    };
    this.onNarrationClick = (e) => {
      if (this.tutorialStep > 0) { e.stopPropagation(); this.advanceTutorial(); }
    };
    document.addEventListener('click', this.onNarrationClick);

    setTimeout(() => this.startTutorial(), 600);

    this.handleResize();
    initAudio();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onNarrationClick);
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      resetPauseMenu();
      removeLevelComplete();
      this.urlbarTools?.classList.add('hidden');
      this.intelDom?.wrap?.classList.add('hidden');
      this.intelDom?.wrap?.classList.remove('show');
    });
  }

  // Two video cards tear off the page and chase you; the avatar pulls a gun;
  // the search bar shoots. Trigger ranges are bumped from the 960-space
  // defaults to feel right on this wider page.
  buildAgents() {
    const tMul = { easy: 0.8, normal: 1, hard: 1.15 }[this.difficulty] || 0.8;
    const gs = AGENTS.gunShooter;
    return {
      // recIdx only drives drawRecCard's color/title; slot is the card's rect.
      chasingRecs: [],   // filled by linkChasers() once video rects exist
      shootingSearch: {
        state: 'idle', cooldown: 0, charge: 0, shotsLeft: 0,
        triggerR: 460 * tMul,
      },
      gunShooter: {
        state: 'idle',
        baseX: ACCOUNT_RECT.x + ACCOUNT_RECT.w / 2, baseY: ACCOUNT_RECT.y + ACCOUNT_RECT.h / 2,
        triggerR: 700 * tMul,
        armLength: 0,
        currentAngle: gs.initialAngle,
        awakenT: 0, aimT: 0, spentT: 0,
        rotateSpeed: gs.rotateSpeed,
      },
    };
  }

  // Pick two cards to become chasers and wire each to an agent + back-ref.
  // Deliberately grid cards LOWER on the page (not the featured row) so they
  // don't ambush the window where it spawns — you have to walk into them.
  linkChasers(tMul) {
    const picks = [this.videos[3], this.videos[8]].filter(Boolean); // grid: top-left + mid-right
    const recIdx = [4, 1];
    this.gs.agents.chasingRecs = picks.map((v, i) => {
      const slot = { x: v.x, y: v.y, w: v.w, h: v.th };
      const a = {
        recIdx: recIdx[i % recIdx.length], slot,
        state: 'idle', x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        vx: 0, vy: 0, life: 0,
        triggerR: 380 * tMul,
      };
      v._agent = a;
      return a;
    });
  }

  buildDocs() {
    // Scattered down the page in walkable gaps. Stand over one and HOLD
    // SPACE to scan/collect it (r is the pickup + visual radius). The
    // `bonusTimed` doc is EXTRA (not required): bigger, blinking, with a
    // countdown — scan it before it's deleted and the glass repairs one hit.
    //
    // Placement rule: docs sit NEAR hazards (the challenge) but never ON
    // them — every doc has clear dodge room around it:
    //   #1 featured-row meta strip, clear of the card-3 mortar avatar
    //   #2 shorts label row, out of smasher reach
    //   #3 shorts/grid gap, near (not under) the right smasher
    //   #4 grid row-2 meta area, near the chaser card but off it
    //   bonus — above the left smasher's slam arc, still inside its trigger
    return [
      { x: 1560, y: 500,  r: 18, taken: false, takeT: 0 },
      { x: 470,  y: 560,  r: 18, taken: false, takeT: 0 },
      { x: 920,  y: 1180, r: 18, taken: false, takeT: 0 },
      { x: 1180, y: 1700, r: 18, taken: false, takeT: 0 },
      { x: 760,  y: 830,  r: 27, taken: false, takeT: 0, bonusTimed: true, ttl: 30 },
    ];
  }

  // Precompute world-space rects for every video card.
  buildVideos() {
    const vids = [];
    const x0 = LAYOUT.content.x, gap = 24;
    let y = LAYOUT.content.top;

    // featured row (3)
    const fw = (CONTENT_W - gap * 2) / 3, fth = fw * 9 / 16;
    FEATURED.forEach((d, i) => vids.push(this.mkVid(d, x0 + i * (fw + gap), y, fw, fth, i)));
    y += fth + 92;

    // shorts row (decorative)
    this.shortsY = y;
    const sw = (CONTENT_W - gap * 4) / 5;
    this.shortsH = sw * 16 / 9;
    y += 28 + this.shortsH + 64;

    // grid (rows of 3)
    const gw = (CONTENT_W - gap * 2) / 3, gth = gw * 9 / 16;
    GRID.forEach((d, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      vids.push(this.mkVid(d, x0 + col * (gw + gap), y + row * (gth + 96), gw, gth, i + 7));
    });
    y += Math.ceil(GRID.length / 3) * (gth + 96);

    this.videos = vids;
    this.worldH = y + 60;
  }
  mkVid(d, x, y, w, th, seed) {
    const cx = x + 18;
    const ay = y + th + 14;
    const cy = ay + 6;
    // Deterministic mortar picks (was Math.random() < 0.5) — random rolls
    // could park a cannon right next to a doc and make it uncollectable.
    // Fixed seeds keep the density similar and never land on the exit
    // portal or the chaser cards (seeds 7 / 12 are chasers, 13 is the exit).
    const isMortar = (seed % 4 === 2) && !d.target;
    return {
      ...d, x, y, w, th, seed, removed: false, removeT: 0, _agent: null,
      mortar: isMortar ? {
        cx, cy,
        state: 'idle',
        angle: 0,
        cooldown: 0,
        transformT: 0,
        barrelLength: 0,
        triggerR: 350,
      } : null
    };
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.VW = w; this.VH = h;
    this.scale1 = w / DW;
    this.viewHW = h / this.scale1;       // viewport height in world units
    // Chasers depend on video rects existing — link them once, after first sizing.
    if (this.gs && this.gs.agents.chasingRecs.length === 0) {
      const tMul = { easy: 0.8, normal: 1, hard: 1.15 }[this.difficulty] || 0.8;
      this.linkChasers(tMul);
    }
  }

  quitToMenu() {
    clearInterval(this._tickingInterval);
    resetPauseMenu();
    document.body.classList.add('menu-mode');
    crossfadeTo('level1', { fadeMs: 800 });
    this.scene.stop();
    this.scene.start('MenuScene');
  }

  update(_t, dms) {
    const dt = Math.min(0.05, dms / 1000);
    // Paused (ESC menu open) — freeze time + logic, keep the last frame drawn.
    if (isPauseOpen()) { this.render(); return; }
    this.time += dt;
    this.gs.time = this.time;

    // Sparks decay every frame (even when paused / failed).
    this.gs.sparks = this.gs.sparks.filter(s => {
      s.life -= dt;
      if (s.vx !== undefined) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.92; s.vy *= 0.92; }
      return s.life > 0;
    });

    if (this.gs.status === 'lost') this.failed = true;
    if (this.failed) { this.render(); this.updateHud(); return; }
    if (this.entering) { this.render(); this.updateHud(); return; }
    if (this.tutorialStep > 0) {
      const zoomTarget = 1.6;
      let tx = this.player.x, ty = this.player.y;
      if (this.tutorialStep === 2) {
        const doc = this.docs[1];
        tx = doc.x; ty = doc.y;
      } else if (this.tutorialStep === 3 && this.portalVid) {
        tx = this.portalVid.x + this.portalVid.w / 2;
        ty = this.portalVid.y + this.portalVid.th / 2;
      }
      const viewW = DW / this.zoomLevel;
      const viewHW = this.viewHW / this.zoomLevel;
      let targetCamX = tx - viewW / 2;
      let targetCamY = ty - viewHW / 2;
      targetCamX = Phaser.Math.Clamp(targetCamX, 0, Math.max(0, DW - viewW));
      targetCamY = Phaser.Math.Clamp(targetCamY, 0, Math.max(0, this.worldH - viewHW));
      
      this.zoomLevel += (zoomTarget - this.zoomLevel) * Math.min(1, dt * 3.5);
      this.camX += (targetCamX - this.camX) * Math.min(1, dt * 4.5);
      this.camY += (targetCamY - this.camY) * Math.min(1, dt * 4.5);
      
      this.render();
      this.updateHud();
      return;
    }

    const p = this.player;

    // ── Player movement (WASD / arrows, SHIFT to dash) ──
    const boosting = this.wasd.shift.isDown;
    const speed = PLAYER.baseSpeed * (boosting ? PLAYER.boostMul : 1);
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.wasd.down.isDown || this.cursors.down.isDown) vy += 1;
    if (vx || vy) { const l = Math.hypot(vx, vy); vx /= l; vy /= l; }
    p.x += vx * speed * dt; p.y += vy * speed * dt;
    p.x = Phaser.Math.Clamp(p.x, LAYOUT.content.x + p.w / 2, DW - LAYOUT.content.right - p.w / 2);
    p.y = Phaser.Math.Clamp(p.y, LAYOUT.chips.y + LAYOUT.chips.h + p.h / 2, this.worldH - p.h / 2);

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;

    // ── Camera follows the window ──
    this.zoomLevel += (1.0 - this.zoomLevel) * Math.min(1, dt * 4.5);
    this.camX += (0 - this.camX) * Math.min(1, dt * 4.5);
    const targetCamY = Phaser.Math.Clamp(p.y - this.viewHW * 0.42, 0, Math.max(0, this.worldH - this.viewHW));
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 4.5);

    // ── Hostile UI agents (inert until the intro is dismissed) ──
    if (this.started) {
      ChasingRecs.updateAll(this.gs.agents.chasingRecs, dt, this.gs);
      ShootingSearch.update(this.gs.agents.shootingSearch, dt, this.gs);
      if (this.time >= this.startT + GUN_GRACE) GunShooter.update(this.gs.agents.gunShooter, dt, this.gs);
      this.updateMortars(dt);
      this.updateCannonballs(dt);
      for (const vs of this.smasherStates) {
        this.updateSmasherState(vs, dt);
      }
    }
    // Projectile/bullet motion always ticks so in-flight shots clear cleanly.
    ShootingSearch.updateProjectiles(this.gs, dt);
    GunShooter.updateProjectiles(this.gs, dt);

    // update exit sparkles
    if (this.docsCollected >= DOCS_TARGET && this.portalVid) {
      if (Math.random() < 0.25) {
        this.portalSparkles.push({
          x: this.portalVid.x + Math.random() * this.portalVid.w,
          y: this.portalVid.y + this.portalVid.th - Math.random() * 20,
          vy: -40 - Math.random() * 40,
          life: 1.0,
          maxLife: 1.0,
          size: 3 + Math.random() * 5,
          angle: Math.random() * Math.PI,
          rotSpeed: (Math.random() - 0.5) * 2,
        });
      }
      for (const sp of this.portalSparkles) {
        sp.y += sp.vy * dt;
        sp.life -= dt;
        sp.angle += sp.rotSpeed * dt;
      }
      this.portalSparkles = this.portalSparkles.filter(sp => sp.life > 0);
    }

    // ── Evidence docs: stand over one and HOLD SPACE to scan/collect it ──
    const scanHeld = this.wasd.space.isDown;
    for (const d of this.docs) {
      if (d.taken) continue;
      // Timed bonus doc: counts down once the level starts; expires = deleted.
      if (d.bonusTimed) {
        d.ttl -= dt;
        if (d.ttl <= 0) {
          d.taken = true; d.takeT = this.time; d.expired = true;
          beep(180, 0.25, 'sawtooth', 0.08);   // fizzle — file deleted
          continue;
        }
      }
      const overlapping = dist(p.x, p.y, d.x, d.y) < d.r + p.h * 0.42;
      d._near = overlapping;   // drawDoc shows the "Hold SPACE" prompt off this
      if (updateScan(d, overlapping, scanHeld, dt)) this.collectDoc(d);
    }

    // ── Glass cracks: grow on hits, repair on heals (shared module) ──
    this._lastHp = syncCracksToHp(this.cracks, this._lastHp, p.hp, p.w, p.h);

    // ── Exit portal: once all docs are in, dive into the boosted video ──
    if (this.docsCollected >= DOCS_TARGET && this.portalVid && this.overlapsVid(p, this.portalVid)) {
      this.startEnter();
    }

    this.render();
    this.updateHud();
  }

  overlapsVid(p, v) {
    return p.x + p.w / 2 > v.x && p.x - p.w / 2 < v.x + v.w &&
           p.y + p.h / 2 > v.y && p.y - p.h / 2 < v.y + v.th;
  }

  collectDoc(d) {
    d.taken = true; d.takeT = this.time;
    playSfx('docScan');
    if (d.bonusTimed) {
      // Bonus intel: repairs one hit of glass (crack cluster removed by the
      // sync in update). Doesn't count toward the exit requirement.
      this.bonusCollected++;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      playSfx('heal');
      beep(660, 0.1, 'sine', 0.12); setTimeout(() => beep(990, 0.16, 'sine', 0.1), 90);
      return;
    }
    this.docsCollected++;
    beep(880, 0.08, 'sine', 0.13); setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
  }

  startEnter() {
    if (this.entering) return;
    this.entering = true;
    noise(0.5, 0.2); beep(120, 0.5, 'sawtooth', 0.1);
    this.finishLevel();
  }
  // Level 1.1 complete — no more direct jump into the runner. The player
  // returns to the desktop, where Toto's chat unlocks Level 1.2.
  finishLevel() {
    // Speedrun clock: time from tutorial end to clearing the level
    saveLevelTime('l1', Math.max(0, this.time - (this.startT || 0)));
    try { localStorage.setItem('oqw-level1-cleared', 'true'); } catch (e) {}
    clearInterval(this._tickingInterval);
    showLevelComplete({
      title: 'LEVEL 1.1 — THE HOME FEED',
      sub: 'All evidence scanned. The boosted video checks out — but HUSH will notice the probe. ' +
           'Toto is pinging you on <b>SecureChat</b>.',
      onDesktop: () => this.quitToMenu(),
    });
  }

  updateHud() {
    if (this.securedCount) {
      this.securedCount.textContent = this.docsCollected + '/' + DOCS_TARGET +
        (this.bonusCollected > 0 ? ' ·★' + this.bonusCollected : '');
    }
    if (this.docsCollected >= DOCS_TARGET) {
      this.securedBadge?.classList.add('cleared');
      if (!this._hudAnimateStarted) {
        this._hudAnimateStarted = true;
        this.startTickingClock();
      }
    } else {
      this.securedBadge?.classList.remove('cleared');
    }
  }

  startTickingClock() {
    let beat = 0;
    this._tickingInterval = setInterval(() => {
      if (this.failed || !this.sys || this.entering) {
        clearInterval(this._tickingInterval);
        return;
      }
      const freq = beat % 2 === 0 ? 800 : 600;
      beep(freq, 0.02, 'triangle', 0.08);
      beat++;
    }, 600);
  }

  // ===== Render =====
  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;
    const s = this.scale1;

    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.scale(s * this.zoomLevel, s * this.zoomLevel);
    ctx.translate(-this.camX, -this.camY);

    // page bg
    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, DW, this.worldH);
    this.drawRail(ctx);
    this.drawChips(ctx);
    this.drawTopBar(ctx);

    this.drawShortsRow(ctx);
    // video cards — skip any card whose chaser agent has left its slot
    for (const v of this.videos) {
      if (v._agent && v._agent.state !== 'idle') this.drawEmptyCard(ctx, v);
      else this.drawVideoCard(ctx, v);
    }

    // evidence docs
    for (const d of this.docs) this.drawDoc(ctx, d);

    // chasing cards (active agents) drawn over the page
    ChasingRecs.drawAgents(ctx, this.gs.agents.chasingRecs, this.gs);

    // account avatar + gun arm (replaces the static avatar in drawTopBar)
    GunShooter.drawAvatar(ctx, this.gs.agents.gunShooter, this.gs);
    // search-bar threat overlay (only while it's winding up / firing)
    this.drawSearchThreat(ctx);

    // projectiles + bullets + sparks
    ShootingSearch.drawProjectiles(ctx, this.gs);
    GunShooter.drawProjectiles(ctx, this.gs);
    this.drawSparks(ctx);

    // exit highlight on the boosted video once docs are done
    if (this.docsCollected >= DOCS_TARGET && this.portalVid) this.drawPortal(ctx, this.portalVid);

    // cannonballs & smasher
    this.drawCannonballs(ctx);
    for (const vs of this.smasherStates) {
      if (vs.state !== 'idle' && vs.state !== 'cooldown') {
        this.drawSmasher(ctx, vs.x, vs.y, vs.angle, vs.length, vs.t, vs.state);
      }
    }

    // player window
    this.drawWindow(ctx);

    ctx.restore();

    if (this.tutorialStep === 1) {
      this.drawVignette(ctx, this.player.x, this.player.y, 90);
    } else if (this.tutorialStep === 2) {
      const doc = this.docs[1];
      this.drawVignette(ctx, doc.x, doc.y, 50);
    } else if (this.tutorialStep === 3 && this.portalVid) {
      this.drawVignette(ctx, this.portalVid.x + this.portalVid.w / 2,
        this.portalVid.y + this.portalVid.th / 2, 200);
    }

    // red edge flash on damage (screen space)
    if (this.player.hitFlash > 0) {
      const a = (this.player.hitFlash / PLAYER.hitFlashDuration) * 0.45;
      const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
      g.addColorStop(0, 'rgba(230,57,70,0)');
      g.addColorStop(1, 'rgba(230,57,70,' + a + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }

    // hint + fail overlay (screen space)
    if (this.failed) this.drawFail(ctx);
    else {
      ctx.fillStyle = '#9a9a9a'; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText('WASD move  ·  SHIFT dash  ·  hold SPACE on docs to scan  ·  3 hits and you crash  ·  ESC to exit', 18, VH - 16);
    }
  }

  drawSparks(ctx) {
    for (const s of this.gs.sparks) {
      ctx.fillStyle = s.hit ? 'rgba(230,57,70,' + (s.life * 1.5) + ')' : 'rgba(0,0,0,' + (s.life * 0.15) + ')';
      ctx.fillRect(s.x, s.y, s.hit ? 2 : 1, s.hit ? 2 : 1);
    }
  }

  // Red pulsing readout over the search bar while it's charging/firing.
  drawSearchThreat(ctx) {
    const ag = this.gs.agents.shootingSearch;
    if (ag.state !== 'charging' && ag.state !== 'firing') return;
    const s = SEARCH_RECT;
    const pulse = 1 + Math.sin(this.time * 25) * 0.3;
    ctx.strokeStyle = 'rgba(230,57,70,' + (0.45 * pulse) + ')';
    ctx.lineWidth = 3; ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
    ctx.fillStyle = '#E63946'; ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('searching for: targets…', s.x + 12, s.y + s.h / 2);
  }

  drawDoc(ctx, d) {
    if (d.taken) {
      const a = this.time - d.takeT;
      if (a < 0.4) {
        ctx.strokeStyle = 'rgba(244,211,94,' + (1 - a / 0.4) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r + a * 70, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    const pulse = 1 + Math.sin(this.time * 4) * 0.12;
    ctx.save();
    // Timed bonus doc: bigger (r), hard-blinking, with a deletion countdown
    if (d.bonusTimed) {
      const urgent = d.ttl < 10;
      const blinkRate = urgent ? 10 : 5;
      ctx.globalAlpha = Math.sin(this.time * blinkRate) > -0.4 ? 1 : 0.25;
      ctx.fillStyle = urgent ? '#E63946' : '#1a1a1f';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DELETING IN ' + Math.ceil(d.ttl) + 's', d.x, d.y - d.r - 26);
    }
    ctx.translate(d.x, d.y); ctx.scale(pulse, pulse);
    ctx.fillStyle = d.bonusTimed ? 'rgba(45,134,89,0.45)' : 'rgba(244,211,94,0.4)';
    ctx.beginPath(); ctx.arc(0, 0, d.r + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.bonusTimed ? '#9ed6b5' : '#F4D35E'; ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5;
    ctx.fillRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
    ctx.strokeRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
    ctx.fillRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
    ctx.strokeRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText('DOC', 0, 3);
    ctx.restore();

    // Hold-to-scan prompt + progress while the window covers the doc
    if (d._near || (d.scanP || 0) > 0) {
      drawScanPrompt(ctx, d, d.x, d.y, { above: d.r + 44 });
    }

    ctx.textAlign = 'left';
  }

  // A card that has torn off the page leaves a dashed "gone" frame.
  drawEmptyCard(ctx, v) {
    drawHandRect(ctx, v.x, v.y, v.w, v.th, '#efefef', '#d6d6d6', v.seed * 11 + 5, 1.2);
    ctx.strokeStyle = '#cdcdcd'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]);
    ctx.strokeRect(v.x + 6, v.y + 6, v.w - 12, v.th - 12); ctx.setLineDash([]);
    ctx.fillStyle = '#b5b5b5'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('[ recommendation left the page ]', v.x + v.w / 2, v.y + v.th / 2);
    ctx.textAlign = 'left';
  }

  drawPortal(ctx, v) {
    const pulse = 0.5 + Math.sin(this.time * 6) * 0.5;
    const green = 'rgba(45,134,89,' + (0.55 + pulse * 0.4) + ')';
    const gold = 'rgba(244,211,94,' + (0.55 + pulse * 0.4) + ')';
    
    // Glowing border pulse
    ctx.strokeStyle = pulse > 0.5 ? gold : green;
    ctx.lineWidth = 6;
    ctx.strokeRect(v.x - 4, v.y - 4, v.w + 8, v.th + 8);

    // Diagonal sheen sweep
    const sweepT = (this.time * 0.6) % 1.0;
    const sx = v.x - 100 + sweepT * (v.w + 200);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.th);
    ctx.clip();
    const grad = ctx.createLinearGradient(sx, v.y, sx + 50, v.y + v.th);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 100, v.y, 200, v.th);
    ctx.restore();

    // Floating golden/heavenly sparkles
    for (const sp of this.portalSparkles) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);
      const alpha = sp.life / sp.maxLife;
      ctx.strokeStyle = 'rgba(244, 211, 94, ' + alpha + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-sp.size, 0); ctx.lineTo(sp.size, 0);
      ctx.moveTo(0, -sp.size); ctx.lineTo(0, sp.size);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = pulse > 0.5 ? 'rgba(244,211,94,0.95)' : 'rgba(45,134,89,0.95)';
    const label = '▶ DIVE IN';
    ctx.font = 'bold 20px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lw = ctx.measureText(label).width + 28;
    ctx.fillRect(v.x + v.w / 2 - lw / 2, v.y - 36, lw, 28);
    ctx.fillStyle = pulse > 0.5 ? '#1a1a1f' : '#fff'; ctx.fillText(label, v.x + v.w / 2, v.y - 21);
    ctx.textAlign = 'left';
  }

  // ===== Tutorial & Mortars =====
  startTutorial() {
    this.tutorialStep = 1;
    this.started = false;
    this.intelDom.wrap?.classList.remove('hidden');
    requestAnimationFrame(() => this.intelDom.wrap?.classList.add('show'));
    this.showTutorialStep();
  }

  showTutorialStep() {
    const step = this.tutorialStep;
    let speaker = 'TUTORIAL';
    let text = '';
    let hint = '';
    let color = '#F4D35E';
    if (step === 1) {
      speaker = 'YOU ARE THIS WINDOW';
      text = 'Move around the page with WASD or Arrow Keys. Hold SHIFT to speed boost.';
      hint = 'Press SPACE / Enter or click to continue';
      this.camY = Phaser.Math.Clamp(this.player.y - this.viewHW * 0.42, 0, Math.max(0, this.worldH - this.viewHW));
    } else if (step === 2) {
      speaker = 'YOUR GOAL';
      text = 'Collect all 4 evidence documents — stand over one and HOLD SPACE to scan it. Careful: you only survive 3 hits.';
      hint = 'Press SPACE / Enter or click to continue';
      const doc = this.docs[1];
      this.camY = Phaser.Math.Clamp(doc.y - this.viewHW * 0.5, 0, Math.max(0, this.worldH - this.viewHW));
    } else if (step === 3) {
      speaker = 'THE WAY OUT';
      text = 'This boosted video is your exit. Once all 4 docs are secured, dive into it.';
      hint = 'Press SPACE / Enter or click to start';
      if (this.portalVid) {
        this.camY = Phaser.Math.Clamp(this.portalVid.y + this.portalVid.th / 2 - this.viewHW * 0.5, 0, Math.max(0, this.worldH - this.viewHW));
      }
    }
    
    if (this.intelDom.speaker) {
      this.intelDom.speaker.textContent = speaker;
      this.intelDom.speaker.style.background = color;
      this.intelDom.speaker.style.color = '#1a1a1f';
    }
    if (this.intelDom.line) this.intelDom.line.textContent = text;
    if (this.intelDom.hint) {
      this.intelDom.hint.textContent = hint;
      this.intelDom.hint.classList.add('show');
    }
    beep(660, 0.06, 'sine', 0.06);
  }

  advanceTutorial() {
    if (this.tutorialStep === 1) {
      this.tutorialStep = 2;
      this.showTutorialStep();
    } else if (this.tutorialStep === 2) {
      this.tutorialStep = 3;
      this.showTutorialStep();
    } else if (this.tutorialStep === 3) {
      this.tutorialStep = 0;
      this.started = true;
      this.startT = this.time;
      this.intelDom?.wrap?.classList.remove('show');
      setTimeout(() => this.intelDom?.wrap?.classList.add('hidden'), 400);
      this.camY = Phaser.Math.Clamp(this.player.y - this.viewHW * 0.42, 0, Math.max(0, this.worldH - this.viewHW));
      beep(880, 0.08, 'sine', 0.08);
    }
  }

  updateMortars(dt) {
    const p = this.player;
    for (const v of this.videos) {
      if (v.removed) continue;
      const m = v.mortar;
      if (!m) continue;
      
      const d = dist(p.x, p.y, m.cx, m.cy);
      
      if (m.state === 'idle') {
        m.barrelLength = 0;
        if (d < m.triggerR) {
          m.state = 'transforming';
          m.transformT = 0;
          beep(200, 0.15, 'triangle', 0.05);
        }
      } else if (m.state === 'transforming') {
        m.transformT += dt;
        m.angle = Math.atan2(p.y - m.cy, p.x - m.cx);
        m.barrelLength = Math.min(18, (m.transformT / 0.5) * 18);
        if (m.transformT >= 0.5) {
          m.state = 'firing';
        }
      } else if (m.state === 'firing') {
        const angle = m.angle;
        const speed = 250;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        this.cannonballs.push({
          x: m.cx + Math.cos(angle) * (16 + m.barrelLength),
          y: m.cy + Math.sin(angle) * (16 + m.barrelLength),
          vx, vy, r: 6, life: 3.5
        });
        
        beep(120, 0.25, 'sawtooth', 0.08);
        noise(0.12, 0.08);
        
        const mx = m.cx + Math.cos(angle) * (16 + m.barrelLength);
        const my = m.cy + Math.sin(angle) * (16 + m.barrelLength);
        for (let i = 0; i < 6; i++) {
          this.gs.sparks.push({
            x: mx, y: my,
            vx: Math.cos(angle) * 120 + (Math.random() - 0.5) * 60,
            vy: Math.sin(angle) * 120 + (Math.random() - 0.5) * 60,
            life: 0.25, hit: true
          });
        }
        
        m.state = 'cooldown';
        m.cooldown = 2.5;
      } else if (m.state === 'cooldown') {
        m.cooldown -= dt;
        m.angle = Math.atan2(p.y - m.cy, p.x - m.cx);
        if (m.cooldown <= 0) {
          if (d < m.triggerR) {
            m.state = 'transforming';
            m.transformT = 0;
            beep(200, 0.15, 'triangle', 0.05);
          } else {
            m.state = 'idle';
          }
        }
      }
    }
  }

  updateCannonballs(dt) {
    const p = this.player;
    for (const cb of this.cannonballs) {
      cb.x += cb.vx * dt;
      cb.y += cb.vy * dt;
      cb.life -= dt;
      
      const pbx = p.x - 60;
      const pby = p.y - 45;
      if (cb.x > pbx && cb.x < pbx + 120 && cb.y > pby && cb.y < pby + 90) {
        damagePlayer(this.gs, 10, cb.vx * 0.15, cb.vy * 0.15);
        cb.life = 0;
        
        for (let i = 0; i < 8; i++) {
          this.gs.sparks.push({
            x: cb.x, y: cb.y,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 0.3, hit: true
          });
        }
        beep(100, 0.2, 'sawtooth', 0.1);
      }
    }
    this.cannonballs = this.cannonballs.filter(cb => cb.life > 0);
  }

  drawMortar(ctx, v) {
    const m = v.mortar;
    if (!m) return;
    
    const ay = v.y + v.th + 14;
    const cx = v.x + 18;
    const cy = ay + 6;
    
    ctx.save();
    
    if (m.state !== 'idle') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#333333';
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(10, -5, m.barrelLength, 10);
      ctx.fill();
      ctx.stroke();
      
      if (m.state === 'transforming') {
        const pulse = 0.5 + Math.sin(this.time * 30) * 0.5;
        ctx.strokeStyle = 'rgba(230, 57, 70, ' + pulse + ')';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(10, -5, m.barrelLength, 10);
      }
      ctx.restore();
    }
    
    let baseColor = THUMB_COLORS[(v.seed + 3) % THUMB_COLORS.length];
    if (m.state === 'transforming') {
      baseColor = Math.sin(this.time * 20) > 0 ? '#E63946' : baseColor;
    } else if (m.state === 'cooldown') {
      baseColor = '#606060';
    }
    
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  drawCannonballs(ctx) {
    for (const cb of this.cannonballs) {
      ctx.save();
      ctx.fillStyle = 'rgba(244, 211, 94, 0.45)';
      ctx.beginPath();
      ctx.arc(cb.x - cb.vx * 0.05, cb.y - cb.vy * 0.05, cb.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230, 57, 70, 0.35)';
      ctx.beginPath();
      ctx.arc(cb.x - cb.vx * 0.1, cb.y - cb.vy * 0.1, cb.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#1a1a1f';
      ctx.strokeStyle = '#E63946';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, cb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawVignette(ctx, tx, ty, radius) {
    const { VW, VH } = this;
    const s = this.scale1;
    const zoom = this.zoomLevel;
    
    const sx = (tx - this.camX) * s * zoom;
    const sy = (ty - this.camY) * s * zoom;
    const r = radius * s * zoom;
    
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, r * 0.7, sx, sy, r * 1.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    
    ctx.strokeStyle = '#F4D35E';
    ctx.lineWidth = 2.5 * s * zoom;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawSmasher(ctx, sx, sy, angle, length, stateTime, stateName) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    
    ctx.fillStyle = 'rgba(74, 123, 200, 0.75)';
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 2;
    
    // Handle extending along the positive X-axis (width 6 for doubled size)
    ctx.beginPath();
    ctx.rect(0, -3, Math.max(0, length - 80), 6);
    ctx.fill();
    ctx.stroke();
    
    // Paddle (rounded rect centered at y=0, starting at x=length-80, width=80, height=72)
    if (length > 80) {
      drawHandRect(ctx, length - 80, -36, 80, 72, 'rgba(74, 123, 200, 0.75)', '#1a1a1f', 15, 1.5);
      
      // Paddle grid lines representing swatter holes
      ctx.strokeStyle = 'rgba(26, 26, 31, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lx = length - 70; lx <= length - 10; lx += 15) {
        ctx.moveTo(lx, -28);
        ctx.lineTo(lx, 28);
      }
      for (let ly = -26; ly <= 26; ly += 13) {
        ctx.moveTo(length - 76, ly);
        ctx.lineTo(length - 4, ly);
      }
      ctx.stroke();
      
      // Warning highlight during telegraph
      if (stateName === 'raising' || stateName === 'smashing') {
        const pulse = 0.5 + Math.sin(stateTime * 25) * 0.5;
        ctx.strokeStyle = 'rgba(230, 57, 70, ' + pulse + ')';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(length - 84, -40, 88, 80);
      }
    }
    
    ctx.restore();
  }

  updateSmasherState(vState, dt) {
    const p = this.player;
    const gap = 24;
    const sw = (CONTENT_W - gap * 4) / 5;
    const sh = this.shortsH;
    const slotX = LAYOUT.content.x + vState.index * (sw + gap) + 26;
    const slotY = this.shortsY + 28 + sh - 30;
    
    vState.x = slotX;
    vState.y = slotY;
    const d = dist(p.x, p.y, slotX, slotY);
    
    const L_MAX = 330;
    vState.triggerR = 450;
    
    if (vState.state === 'idle') {
      vState.length = 0;
      vState.angle = -Math.PI / 2;
      if (this.started && d < vState.triggerR) {
        vState.state = 'popping';
        vState.t = 0;
        beep(140, 0.2, 'sawtooth', 0.1);
      }
    } else if (vState.state === 'popping') {
      vState.t += dt;
      vState.length += (L_MAX - vState.length) * dt * 9;
      vState.angle = -Math.PI / 2;
      
      if (vState.length >= L_MAX - 2) {
        vState.length = L_MAX;
        vState.state = 'raising';
        vState.t = 0;
        vState.direction = (p.x < slotX) ? -1 : 1;
        // rusty hinge creak as the swatter arm winds up
        whistle(0.5, 160, 480, 0.06);
        beep(220, 0.12, 'sawtooth', 0.05);
      }
    } else if (vState.state === 'raising') {
      vState.t += dt;
      const targetAngle = -Math.PI / 2 - vState.direction * (Math.PI / 5);
      vState.angle += (targetAngle - vState.angle) * dt * 6;
      vState.angle += Math.sin(vState.t * 30) * 0.035;
      
      if (vState.t >= 0.45) {
        vState.state = 'smashing';
        vState.t = 0;
        vState.targetAngle = Math.atan2(p.y - slotY, p.x - slotX);
        vState.targetAngle = Phaser.Math.Clamp(vState.targetAngle, -Math.PI * 0.95, -Math.PI * 0.05);
        whoosh(0.18, 500, 1400, 0.12);   // swing through the air
      }
    } else if (vState.state === 'smashing') {
      vState.t += dt;
      vState.angle += (vState.targetAngle - vState.angle) * Math.min(1, dt * 25);
      
      if (vState.t >= 0.12 || Math.abs(vState.angle - vState.targetAngle) < 0.05) {
        vState.angle = vState.targetAngle;
        
        const headX = slotX + Math.cos(vState.angle) * (vState.length - 40);
        const headY = slotY + Math.sin(vState.angle) * (vState.length - 40);
        
        if (dist(headX, headY, p.x, p.y) < 110) {
          damagePlayer(this.gs, 15, Math.cos(vState.angle) * 120, Math.sin(vState.angle) * 120);
          noise(0.45, 0.32); beep(55, 0.35, 'sine', 0.22);   // heavy slam ON you
        } else {
          noise(0.25, 0.2); beep(70, 0.2, 'sine', 0.14);     // slam into the page
        }
        
        for (let i = 0; i < 12; i++) {
          this.gs.sparks.push({
            x: headX, y: headY,
            vx: Math.cos(vState.angle) * 100 + (Math.random() - 0.5) * 180,
            vy: Math.sin(vState.angle) * 100 + (Math.random() - 0.5) * 180,
            life: 0.3, hit: true
          });
        }
        
        vState.state = 'holding';
        vState.t = 0;
      }
    } else if (vState.state === 'holding') {
      vState.t += dt;
      if (vState.t >= 0.25) {
        vState.state = 'retracting';
        vState.t = 0;
      }
    } else if (vState.state === 'retracting') {
      vState.t += dt;
      vState.length += (0 - vState.length) * dt * 6;
      vState.angle += (-Math.PI / 2 - vState.angle) * dt * 6;
      
      if (vState.length <= 3) {
        vState.length = 0;
        vState.angle = -Math.PI / 2;
        vState.state = 'cooldown';
        vState.cooldown = 3.0;
      }
    } else if (vState.state === 'cooldown') {
      vState.length = 0;
      vState.angle = -Math.PI / 2;
      vState.cooldown -= dt;
      if (vState.cooldown <= 0) {
        vState.state = 'idle';
      }
    }
  }

  drawWindow(ctx) {
    const p = this.player, x = p.x - p.w / 2, y = p.y - p.h / 2;
    ctx.save();
    // blink during invulnerability frames
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    const body = p.hitFlash > 0 ? '#ffffff' : 'rgba(17,2,20,0.30)';
    drawHandRect(ctx, x, y, p.w, p.h, body, '#1a1a1f', 50, 2);
    ctx.fillStyle = '#1a1a1f'; ctx.fillRect(x + 2, y + 2, p.w - 4, 18);
    ctx.fillStyle = '#E63946'; ctx.fillRect(x + p.w - 18, y + 5, 12, 12);
    ctx.fillStyle = '#fff'; ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('PRIMITIVE_ERROR.exe', x + 7, y + 11);

    // Glass cracks — the window IS the health display (no HP bar)
    drawCracks(ctx, this.cracks, p.x, p.y, p.w, p.h);
    ctx.restore();
  }

  drawFail(ctx) {
    const { VW, VH } = this;
    ctx.fillStyle = 'rgba(20,2,6,0.82)'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#E63946'; ctx.font = "bold 40px 'Saira Condensed', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WINDOW CRASHED', VW / 2, VH / 2 - 40);
    ctx.fillStyle = '#f0f0f0'; ctx.font = "20px 'Saira Condensed', sans-serif";
    ctx.fillText("The page's security caught up with you.", VW / 2, VH / 2 + 4);
    ctx.fillStyle = '#9a9a9a'; ctx.font = '14px ui-monospace, monospace';
    ctx.fillText('press  R  to retry   ·   ESC for menu', VW / 2, VH / 2 + 44);
    ctx.textAlign = 'left';
  }

  // ===== page chrome + cards (drawing helpers) =====
  drawTopBar(ctx) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, DW, LAYOUT.topBar.h);
    ctx.fillStyle = '#ececec'; ctx.fillRect(0, LAYOUT.topBar.h - 1, DW, 1);
    ctx.fillStyle = '#1a1a1f';
    for (let i = 0; i < 3; i++) ctx.fillRect(24, 20 + i * 6, 22, 2.5);
    drawHandRect(ctx, 64, 16, 34, 24, COLORS.red, '#b71c2b', 12, 1.5);
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(76, 22); ctx.lineTo(88, 28); ctx.lineTo(76, 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 20px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('TotallyNormalTube', 108, 28);
    const sx = SEARCH_RECT.x, sw = SEARCH_RECT.w;
    drawHandRect(ctx, sx, 12, sw, 32, '#f7f7f7', '#cfcfcf', 40, 1.4);
    ctx.fillStyle = '#9a9a9a'; ctx.font = '14px Arial'; ctx.fillText('Search', sx + 16, 29);
    drawHandRect(ctx, sx + sw, 12, 56, 32, '#f0f0f0', '#cfcfcf', 70, 1.4);
    ctx.fillStyle = '#606060'; ctx.fillText('⌕', sx + sw + 24, 29);
    drawHandRect(ctx, DW - 300, 14, 96, 28, '#f0f0f0', '#dcdcdc', 90, 1.2);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 13px Arial'; ctx.fillText('＋ Create', DW - 288, 29);
    // bell icon
    ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(DW - 188, 28, 7, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(DW - 195, 28); ctx.lineTo(DW - 181, 28); ctx.stroke();
    ctx.beginPath(); ctx.arc(DW - 188, 32, 2, 0, Math.PI); ctx.stroke();
    // NOTE: the account avatar is drawn by GunShooter.drawAvatar (it's an agent).
  }
  drawChips(ctx) {
    const y = LAYOUT.chips.y;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(LAYOUT.rail.w, y, DW - LAYOUT.rail.w, LAYOUT.chips.h);
    ctx.fillStyle = '#ececec'; ctx.fillRect(LAYOUT.rail.w, y + LAYOUT.chips.h - 1, DW - LAYOUT.rail.w, 1);
    let x = LAYOUT.content.x; ctx.font = '13px Arial';
    for (let i = 0; i < CHIPS.length; i++) {
      const w = ctx.measureText(CHIPS[i]).width + 28, active = i === 0;
      drawHandRect(ctx, x, y + 9, w, 30, active ? '#1a1a1f' : '#f0f0f0', active ? '#1a1a1f' : '#dcdcdc', i * 7 + 3, 1.2);
      ctx.fillStyle = active ? '#fff' : '#1a1a1f'; ctx.textBaseline = 'middle';
      ctx.fillText(CHIPS[i], x + 14, y + 24);
      x += w + 10; if (x > DW - 120) break;
    }
  }
  drawRail(ctx) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, LAYOUT.topBar.h, LAYOUT.rail.w, this.worldH);
    ctx.fillStyle = '#ececec'; ctx.fillRect(LAYOUT.rail.w - 1, LAYOUT.topBar.h, 1, this.worldH);
    let y = LAYOUT.topBar.h + 16;
    for (const item of RAIL) {
      if (item[0] === '—') { ctx.fillStyle = '#ececec'; ctx.fillRect(14, y + 4, LAYOUT.rail.w - 28, 1); y += 18; continue; }
      if (item.length === 1) { ctx.fillStyle = '#909090'; ctx.font = 'bold 11px Arial'; ctx.textBaseline = 'middle'; ctx.fillText(item[0], 22, y + 14); y += 34; continue; }
      const [glyph, label, active] = item;
      if (active) drawHandRect(ctx, 10, y, LAYOUT.rail.w - 20, 40, '#efefef', '#e3e3e3', 33, 1);
      ctx.fillStyle = '#1a1a1f'; ctx.font = '17px Arial'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, 24, y + 21);
      ctx.font = (active ? 'bold ' : '') + '14px Arial'; ctx.fillText(label, 54, y + 21);
      y += 44;
    }
  }
  drawShortsRow(ctx) {
    const x0 = LAYOUT.content.x, gap = 24, y = this.shortsY;
    ctx.fillStyle = COLORS.red; ctx.font = 'bold 20px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡', x0, y); ctx.fillStyle = '#1a1a1f'; ctx.fillText('Shorts', x0 + 26, y);
    const sw = (CONTENT_W - gap * 4) / 5, sh = this.shortsH, sy = y + 28;
    for (let i = 0; i < SHORTS.length; i++) this.drawShortCard(ctx, x0 + i * (sw + gap), sy, sw, sh, SHORTS[i], i);
  }

  drawVideoCard(ctx, v) {
    const x = v.x, y = v.y, w = v.w, th = v.th;
    drawHandRect(ctx, x, y, w, th, THUMB_COLORS[v.seed % THUMB_COLORS.length], '#cfcfcf', v.seed * 11 + 5, 1.4);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, th); ctx.clip();
    if (v.art === 'turtle') this.drawTurtle(ctx, x + w / 2, y + th * 0.52, th * 0.42);
    else { ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; ctx.fillRect(x + w * 0.1, y + th * 0.55, w * 0.8, th * 0.34); ctx.globalAlpha = 1; }
    ctx.restore();
    // duration badge
    ctx.font = 'bold 11px Arial'; const bw = ctx.measureText(v.d).width;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x + w - bw - 22, y + th - 22, bw + 14, 16);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(v.d, x + w - bw - 15, y + th - 14);
    // avatar + title + channel + views
    const ay = y + th + 14;
    if (v.mortar) {
      this.drawMortar(ctx, v);
    } else {
      ctx.fillStyle = THUMB_COLORS[(v.seed + 3) % THUMB_COLORS.length];
      ctx.beginPath(); ctx.arc(x + 18, ay + 6, 16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#0f0f0f'; ctx.font = 'bold 15px Arial'; ctx.textBaseline = 'top';
    this.wrap(ctx, v.t, x + 46, ay - 6, w - 50, 19, 2);
    ctx.fillStyle = '#606060'; ctx.font = '13px Arial'; ctx.fillText(v.c, x + 46, ay + 34);
    const big = v.p || v.target;
    ctx.fillStyle = big ? '#c0392b' : '#606060';
    ctx.font = (big ? 'bold ' : '') + '13px Arial';
    ctx.fillText(v.v + ' views  ·  ' + (v.target ? 'pinned' : '2 hours ago'), x + 46, ay + 52);
  }

  drawShortCard(ctx, x, y, w, h, data, seed) {
    drawHandRect(ctx, x, y, w, h, THUMB_COLORS[(seed + 2) % THUMB_COLORS.length], '#cfcfcf', seed * 13 + 9, 1.4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, w * 0.32, 0, Math.PI * 2); ctx.fill();
    
    const smState = this.smasherStates.find(s => (s.index % SHORTS.length) === (seed % SHORTS.length));
    const isSmasher = !!smState;
    const isFlying = isSmasher && smState.state !== 'idle' && smState.state !== 'cooldown';
    
    if (!isFlying) {
      // Profile circle next to title
      if (isSmasher) {
        // Draw the swatter avatar at rest
        ctx.fillStyle = '#4A7BC8';
        ctx.beginPath(); ctx.arc(x + 26, y + h - 30, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.save();
        ctx.translate(x + 26, y + h - 30);
        ctx.rotate(-Math.PI / 4);
        ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
        ctx.fillStyle = 'rgba(74, 123, 200, 0.85)';
        ctx.fillRect(-5, -16, 10, 10);
        ctx.strokeRect(-5, -16, 10, 10);
        ctx.restore();
      } else {
        // Normal profile circle
        ctx.fillStyle = THUMB_COLORS[(seed + 4) % THUMB_COLORS.length];
        ctx.beginPath(); ctx.arc(x + 26, y + h - 30, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    
    // Title text next to circle
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(data.t, x + 48, y + h - 30);
  }

  drawTurtle(ctx, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#3f9d52';
    for (const dx of [-0.7, 0.7]) for (const dy of [0.35, -0.1]) {
      ctx.beginPath(); ctx.ellipse(cx + dx * r, cy + dy * r + r * 0.45, r * 0.22, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(cx + r * 1.05, cy, r * 0.34, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(cx + r * 1.18, cy - r * 0.06, r * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2D8659'; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1c5e3c'; ctx.lineWidth = Math.max(2, r * 0.05); ctx.stroke();
    ctx.strokeStyle = '#9bd9ad'; ctx.lineWidth = Math.max(1.5, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx - r * 0.4, cy - r * 0.1); ctx.lineTo(cx - r * 0.3, cy + r * 0.45);
    ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx + r * 0.4, cy - r * 0.1); ctx.lineTo(cx + r * 0.3, cy + r * 0.45);
    ctx.moveTo(cx - r * 0.4, cy - r * 0.1); ctx.lineTo(cx + r * 0.4, cy - r * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#E63946'; ctx.fillRect(cx + r * 0.92, cy - r * 0.34, r * 0.36, r * 0.12);
    ctx.fillRect(cx + r * 1.18, cy - r * 0.34, r * 0.14, r * 0.06);
    ctx.restore();
  }

  wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = text.split(' '); let line = '', yy = y, n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy); line = words[i]; yy += lh; n++;
        if (n >= maxLines - 1) {
          let last = line;
          while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
          ctx.fillText(i < words.length - 1 ? last + '…' : line, x, yy); return;
        }
      } else line = test;
    }
    ctx.fillText(line, x, yy);
  }
}
