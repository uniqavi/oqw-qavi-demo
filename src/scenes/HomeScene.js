import Phaser from 'phaser';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { dist } from '../game/physics.js';
import { COLORS, PLAYER, AGENTS } from '../config.js';
import * as ChasingRecs from '../game/agents/chasingRecs.js';
import * as ShootingSearch from '../game/agents/shootingSearch.js';
import * as GunShooter from '../game/agents/gunShooter.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';

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
const ACCOUNT_RECT = { x: DW - 142, y: 16, w: 24, h: 24 }; // avatar circle centers ~(DW-130, 28)

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
    const urlBar = document.getElementById('browser-url');
    if (urlBar) urlBar.textContent = 'https://totallynormaltube.gov.??/';

    this.time = 0;
    this.camY = 0;
    this.docsCollected = 0;
    this.failed = false;
    this.entering = false;        // portal dive in progress (waiting on narration)
    this.started = false;         // agents stay inert until the intro is dismissed
    this.startT = 0;              // game time when play actually began (for gun grace)

    this.buildVideos();           // sets this.videos + this.worldH

    // Player window — HP model (same as the 1.2 runner). size=120 makes the
    // shared playerBox() hitbox exactly match the 120×90 window the agents
    // collide against. Start in the gap below the featured row.
    const fth = ((CONTENT_W - 48) / 3) * 9 / 16;
    const player = {
      x: DW / 2, y: LAYOUT.content.top + fth + 46,
      w: 120, h: 90, size: 120,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, useHp: true,
      invuln: 0, hitFlash: 0,
      test: { immune: false },
    };
    this.player = player;

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
    };

    this.docs = this.buildDocs();
    this.portalVid = this.videos.find(v => v.target);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });
    this.onKey = (e) => {
      // Narration takes priority — SPACE/Enter advance the line
      if (this.narration && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); this.advanceNarration(); return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePauseMenu({ onQuit: () => this.quitToMenu() });
      } else if (this.failed && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault(); this.scene.restart({ difficulty: this.difficulty });
      }
    };
    document.addEventListener('keydown', this.onKey);

    // HUD — reuse the runner's OBJECTIVE frame (docs counter) + HP frame.
    this.taskFrame = document.getElementById('task-frame');
    this.taskLine = document.getElementById('task-line');
    this.taskProg = document.getElementById('task-progress');
    this.hpFrame = document.getElementById('hp-frame');
    this.hpFill = document.getElementById('hp-fill');
    this.hpNumber = document.getElementById('hp-number');
    this.taskFrame?.classList.remove('hidden');
    this.hpFrame?.classList.remove('hidden');

    // Narration: reuse the intel-dialog DOM. Click anywhere or SPACE/Enter
    // advances. While narration is active the level is paused.
    this.intelDom = {
      wrap:    document.getElementById('intel-dialog'),
      speaker: document.getElementById('intel-speaker'),
      line:    document.getElementById('intel-line'),
      hint:    document.getElementById('intel-hint'),
    };
    this.narration = null;
    this.narrationTimer = null;
    this.onNarrationClick = (e) => {
      if (this.narration) { e.stopPropagation(); this.advanceNarration(); }
    };
    document.addEventListener('click', this.onNarrationClick);

    // Beat tracking — flag-driven narration so the same beat can't replay.
    this.beats = { intro: false, first: false, allDocs: false, lost: false };
    setTimeout(() => this.playIntroNarration(), 600);

    this.handleResize();
    initAudio();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onNarrationClick);
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      resetPauseMenu();
      this.taskFrame?.classList.add('hidden');
      this.hpFrame?.classList.add('hidden');
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
        baseX: ACCOUNT_RECT.x + 12, baseY: ACCOUNT_RECT.y + 12,
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
    // Scattered down the page in walkable gaps. r is generous so pickup feels
    // forgiving. Tuned by eye against the layout; nudge in preview.
    return [
      { x: 1500, y: 470,  r: 18, taken: false, takeT: 0 },
      { x: 470,  y: 560,  r: 18, taken: false, takeT: 0 },
      { x: 980,  y: 1180, r: 18, taken: false, takeT: 0 },
      { x: 1520, y: 1560, r: 18, taken: false, takeT: 0 },
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
    return { ...d, x, y, w, th, seed, removed: false, removeT: 0, _agent: null };
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
    resetPauseMenu();
    document.body.classList.add('menu-mode');
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
    if (this.narration) { this.render(); this.updateHud(); return; }   // paused for narration

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
    this.camY = Phaser.Math.Clamp(p.y - this.viewHW * 0.42, 0, Math.max(0, this.worldH - this.viewHW));

    // ── Hostile UI agents (inert until the intro is dismissed) ──
    if (this.started) {
      ChasingRecs.updateAll(this.gs.agents.chasingRecs, dt, this.gs);
      ShootingSearch.update(this.gs.agents.shootingSearch, dt, this.gs);
      if (this.time >= this.startT + GUN_GRACE) GunShooter.update(this.gs.agents.gunShooter, dt, this.gs);
    }
    // Projectile/bullet motion always ticks so in-flight shots clear cleanly.
    ShootingSearch.updateProjectiles(this.gs, dt);
    GunShooter.updateProjectiles(this.gs, dt);

    // ── Evidence docs ──
    for (const d of this.docs) {
      if (d.taken) continue;
      if (dist(p.x, p.y, d.x, d.y) < d.r + p.h * 0.42) this.collectDoc(d);
    }

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
    this.docsCollected++;
    beep(880, 0.08, 'sine', 0.13); setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
    if (this.docsCollected === 1) setTimeout(() => this.playFirstDocNarration(), 300);
    else if (this.docsCollected >= DOCS_TARGET) setTimeout(() => this.playAllDocsNarration(), 300);
  }

  startEnter() {
    if (this.entering) return;
    this.entering = true;
    noise(0.5, 0.2); beep(120, 0.5, 'sawtooth', 0.1);
    setTimeout(() => this.playLostContactNarration(() => this.transitionToRunner()), 450);
  }
  transitionToRunner() {
    try { localStorage.setItem('oqw-level1-cleared', 'true'); } catch (e) {}
    this.scene.stop();
    this.scene.start('GameScene', { difficulty: this.difficulty, fromHomePage: true });
    this.scene.launch('HUDScene');
  }

  updateHud() {
    if (this.taskLine) {
      this.taskLine.textContent = this.docsCollected >= DOCS_TARGET
        ? 'Dive into the boosted video.'
        : 'Collect the evidence. Dodge the page.';
    }
    if (this.taskProg) this.taskProg.textContent = this.docsCollected + ' / ' + DOCS_TARGET;
    const p = this.player;
    const pct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    if (this.hpFill) {
      this.hpFill.style.width = (pct * 100) + '%';
      this.hpFill.style.background = pct > 0.5 ? '#2D8659' : pct > 0.25 ? '#F4D35E' : '#E63946';
    }
    if (this.hpNumber) this.hpNumber.textContent = Math.max(0, Math.round(p.hp));
  }

  // ===== Render =====
  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;
    const s = this.scale1;

    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.scale(s, s);
    ctx.translate(0, -this.camY);

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

    // player window
    this.drawWindow(ctx);

    ctx.restore();

    // hint + fail overlay (screen space)
    if (this.failed) this.drawFail(ctx);
    else {
      ctx.fillStyle = '#9a9a9a'; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText('WASD move  ·  SHIFT dash  ·  rush the avatar to dodge its shot  ·  ESC to exit', 18, VH - 16);
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
    ctx.translate(d.x, d.y); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(244,211,94,0.4)';
    ctx.beginPath(); ctx.arc(0, 0, d.r + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F4D35E'; ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5;
    ctx.fillRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
    ctx.strokeRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
    ctx.fillRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
    ctx.strokeRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText('DOC', 0, 3);
    ctx.restore();
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
    const pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
    ctx.strokeStyle = 'rgba(45,134,89,' + (0.55 + pulse * 0.4) + ')';
    ctx.lineWidth = 5; ctx.strokeRect(v.x - 3, v.y - 3, v.w + 6, v.th + 6);
    ctx.fillStyle = 'rgba(45,134,89,0.9)';
    const label = '▶ DIVE IN';
    ctx.font = 'bold 20px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lw = ctx.measureText(label).width + 28;
    ctx.fillRect(v.x + v.w / 2 - lw / 2, v.y - 36, lw, 28);
    ctx.fillStyle = '#fff'; ctx.fillText(label, v.x + v.w / 2, v.y - 21);
    ctx.textAlign = 'left';
  }

  // ===== Narration (Toto + YOU) =====
  playIntroNarration() {
    if (this.beats.intro) return;
    this.beats.intro = true;
    this.startNarration([
      { speaker: 'TOTO', text: "Okay — I patched into HUSH's home page. Looks harmless, right?" },
      { speaker: 'YOU',  text: "Just a wall of clickbait. What am I looking for?" },
      { speaker: 'TOTO', text: "Evidence. Four files are scattered across this page. Grab all four." },
      { speaker: 'YOU',  text: "And the catch?" },
      { speaker: 'TOTO', text: "The page bites. That account avatar pulls a GUN — one shot, lethal at range. Rush it and the shot misses." },
      { speaker: 'TOTO', text: "Some video cards will tear off and chase you. The search bar fires too if you linger up top. SHIFT to dash." },
      { speaker: 'YOU',  text: "Charming. Where do the files go once I have them?" },
      { speaker: 'TOTO', text: "Into the big one — 'What They Don't Want You To See.' Get the evidence, then dive into that video." },
    ], () => { this.started = true; this.startT = this.time; });
  }
  playFirstDocNarration() {
    if (this.beats.first) return;
    this.beats.first = true;
    this.startNarration([
      { speaker: 'YOU',  text: "Got the first file." },
      { speaker: 'TOTO', text: "Three to go. Keep moving — standing still is how the avatar lines you up." },
    ]);
  }
  playAllDocsNarration() {
    if (this.beats.allDocs) return;
    this.beats.allDocs = true;
    this.startNarration([
      { speaker: 'TOTO', text: "That's all four. The boosted video's pulsing green now — that's your way in." },
      { speaker: 'YOU',  text: "Diving in." },
    ]);
  }
  // Triggered when the player enters the portal — Toto cuts out.
  playLostContactNarration(onDone) {
    if (this.beats.lost) return;
    this.beats.lost = true;
    this.startNarration([
      { speaker: 'TOTO', text: "Wait — it's pulling you in deeper than I thought. Something's wrong, I'm—" },
      { speaker: 'SYSTEM', text: '> CONNECTION LOST: toto.handler' },
      { speaker: 'YOU',  text: "Toto? Toto, do you copy?" },
      { speaker: 'YOU',  text: "...okay. Just me, then." },
    ], onDone);
  }

  startNarration(lines, onDone) {
    if (this.narrationTimer) clearTimeout(this.narrationTimer);
    this.narration = { lines, idx: 0, typing: true, onDone };
    this.intelDom.wrap?.classList.remove('hidden');
    requestAnimationFrame(() => this.intelDom.wrap?.classList.add('show'));
    this.showNarrationLine(0);
    beep(660, 0.06, 'sine', 0.06);
  }
  showNarrationLine(i) {
    const n = this.narration;
    if (!n) return;
    const line = n.lines[i];
    if (!line) return this.closeNarration();
    const colors = { YOU: '#4A7BC8', TOTO: '#E63946', SYSTEM: '#2D8659' };
    if (this.intelDom.speaker) {
      this.intelDom.speaker.textContent = line.speaker || '';
      this.intelDom.speaker.style.background = colors[line.speaker] || '#1a1a1f';
    }
    if (this.intelDom.line) this.intelDom.line.textContent = '';
    this.intelDom.hint?.classList.remove('show');
    let chars = 0;
    const text = line.text;
    const tick = () => {
      const nn = this.narration;
      if (!nn || !nn.typing) {
        if (this.intelDom.line) this.intelDom.line.textContent = text;
        return;
      }
      if (isPauseOpen()) {            // hold the typewriter while paused
        this.narrationTimer = setTimeout(tick, 90);
        return;
      }
      if (chars < text.length) {
        chars++;
        if (this.intelDom.line) this.intelDom.line.textContent = text.slice(0, chars);
        if (text[chars - 1] !== ' ' && Math.random() < 0.22) beep(1600 + Math.random() * 600, 0.005, 'square', 0.011);
        this.narrationTimer = setTimeout(tick, 28);
      } else {
        this.narration.typing = false;
      }
    };
    tick();
  }
  advanceNarration() {
    if (isPauseOpen()) return;          // frozen while the pause menu is open
    const n = this.narration;
    if (!n) return;
    if (n.typing) {
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      n.typing = false;
      if (this.intelDom.line) this.intelDom.line.textContent = n.lines[n.idx].text;
      return;
    }
    n.idx++;
    if (n.idx >= n.lines.length) return this.closeNarration();
    n.typing = true;
    this.showNarrationLine(n.idx);
  }
  closeNarration() {
    if (this.narrationTimer) clearTimeout(this.narrationTimer);
    const n = this.narration;
    const onDone = n && n.onDone;
    this.narration = null;
    this.intelDom?.wrap?.classList.remove('show');
    setTimeout(() => this.intelDom?.wrap?.classList.add('hidden'), 400);
    if (onDone) onDone();
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
    ctx.fillStyle = THUMB_COLORS[(v.seed + 3) % THUMB_COLORS.length];
    ctx.beginPath(); ctx.arc(x + 18, ay + 6, 16, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(data.t, x + w / 2, y + h - 30);
    ctx.textAlign = 'left';
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
