import Phaser from 'phaser';
import { PW, PH, PLAYER, DAMAGE, CAMERA, GAZE, PICKUPS, RENDER, DIFFICULTY, L1, SCAN, SCROLL, POWERUP } from '../config.js';
import { createState, resetState } from '../game/state.js';
import { recSlots, commentSlots } from '../game/layout.js';
import { dist } from '../game/physics.js';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect, drawRecCard, drawComment } from '../game/draw.js';
import * as ExplodingLike from '../game/agents/explodingLike.js';
import * as CrushingCookie from '../game/agents/crushingCookie.js';
import * as FallingComment from '../game/agents/fallingComment.js';
import * as ShootingSearch from '../game/agents/shootingSearch.js';
import * as ChasingRecs from '../game/agents/chasingRecs.js';
import * as GunShooter from '../game/agents/gunShooter.js';
import { markScanCoverage } from '../game/scan.js';
import * as FallingBell from '../game/agents/fallingBell.js';
import * as Waves from '../game/waveEnemies.js';
import * as Powerups from '../game/powerups.js';
import * as HiddenDocs from '../game/hiddenDocs.js';
import { effectiveSize } from '../game/playerSize.js';
import { syncCracksToHp, drawCracks } from '../game/cracks.js';
import { saveLevelTime } from '../game/leaderboard.js';
import { crossfadeTo, stopMusic, loadMusic } from '../game/music.js';
import { playSfx, loadSfx, stopAllSfxLoops } from '../game/sfx.js';
import { playVoice, stopVoice } from '../game/voice.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';
import { damagePlayer } from '../game/combat.js';
import { drawCrashScreen } from '../game/crashScreen.js';
import { updateScan, drawScanPrompt } from '../game/scanDocs.js';
import { showLevelComplete, removeLevelComplete } from '../game/levelComplete.js';

// First-time onboarding tips. Direction A voice — has personality but
// still tells you what to do. Keyed in localStorage so veterans never see.
const ONBOARDING_TIPS = [
  { key: 'drag-ad',  text: 'that <span class="hl">weird comment</span> — drag it over the red bit. the page shouldn\'t see what\'s under there.' },
  { key: 'docs',     text: 'grab the <span class="hl">5 yellow docs</span>. don\'t take all night, people are scrolling.' },
  { key: 'cookies',  text: 'docs got. <span class="hl">accept the cookies</span>. they\'re lying about what\'s in them, that\'s fine.' },
  { key: 'exfil',    text: 'hit <span class="hl">SUBSCRIBE</span> to plant the malware. the page won\'t thank you.' },
];

// Intel memo — plays once when the player first uncovers the CLASSIFIED
// rect. Max is HUSH's enemy boss (voiced in L2 climax). Lines are written
// self-contained so a first-time player understands without prior context.
// Each line has an optional voiceId for drop-in TTS — see public/voice/README.md
const INTEL_LINES = [
  // First beat: the player REACTING to what they uncovered — beats the old
  // straight-to-memo cold open, which was jarring.
  { speaker: 'YOU',
    text: 'Hold on... what is this? Looks like a way out behind the wall.',
    voiceId: 'memo-you-react' },
  { speaker: 'YOU',
    text: 'And something taped to the back of it... a memo?',
    voiceId: 'memo-you-react-02' },
  { speaker: '[ INTERCEPT — INTERNAL HUSH MEMO ]',
    text: 'From: Max, Director of Engagement — Q1 2039.',
    voiceId: 'memo-intercept-01' },
  { speaker: '[ MEMO ]',
    text: '"Engagement is down. Our analysts think users are getting suspicious."',
    voiceId: 'memo-max-01' },
  { speaker: '[ MEMO ]',
    text: '"Our analysts are wrong. Users aren\'t suspicious. They\'re bored."',
    voiceId: 'memo-max-02' },
  { speaker: '[ MEMO ]',
    text: '"Bored is fine. Bored people don\'t organize."',
    voiceId: 'memo-max-03' },
  { speaker: '[ MEMO ]',
    text: '"Cancel the next news cycle. Boring people stay quiet."',
    voiceId: 'memo-max-04' },
  { speaker: '[ INTERCEPT ]',
    text: 'Rest didn\'t load. The full version is on HUSH\'s internal chat — they call it SPYGRAM. Of course they do.',
    voiceId: 'memo-intercept-02' },
];

// Phase 3 — first playable.
// Renders the entire page chrome to a vanilla 2D canvas overlay (#oqw) layered
// over the Phaser canvas. Phaser handles input + scenes; this scene draws.
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(data) {
    this.difficulty = data?.difficulty || localStorage.getItem('oqw-difficulty') || 'easy';
    this.fromHomePage = !!data?.fromHomePage;        // arrived via 1.1 fight
    this.diffMod = DIFFICULTY[this.difficulty] || DIFFICULTY.easy;
    this.state = createState();
    this.state.status = 'playing';
    
    // Preload flipflop image
    this.flipflopImg = new Image();
    this.flipflopImg.src = 'flipflop.png';
    this.state.flipflopImg = this.flipflopImg;
    
    this.state.cannonballs = [];
    this.commentMortars = new Map();
    this.spikeThrowers = new Map();
    // Bump every agent's trigger range by the difficulty modifier. Doing it
    // here (not in state.js) so the value stays a multiplier rather than a
    // baked constant — easier to retune.
    const tMul = this.diffMod.triggerRange;
    this.state.agents.chasingRecs.forEach(a => { a.triggerR *= tMul; });
    this.state.agents.shootingSearch.triggerR *= tMul;
    this.state.agents.fallingComment.triggerR *= tMul;
    this.state.agents.explodingLike.triggerR  *= tMul;
    this.state.agents.crushingCookie.triggerR *= tMul;
    this.state.agents.gunShooter.triggerR     *= tMul;
    // Grace period — gun shooter is muted for the opening. The single most
    // common first-death cause was the avatar firing 4 seconds in. This
    // gives new players room to figure out the controls.
    this.state.gunGraceUntil = this.diffMod.gunGrace;

    // ── Phase A setup ────────────────────────────────────────────────────
    // Match the old build (reference/operation_quiet_window_mission_02.html)
    // verbatim: 960×1200 page, cookie banner pinned at the very bottom
    // (PH-40 = 1160), all six agents in their original slots, camera
    // follows the player as they scroll up/down through the page.
    {
      this.PH_PHASE_A = 1200;
      // Cookie banner at world y=1160 — reachable only by scrolling all
      // the way down (i.e., after grabbing the docs).
      this.state.layout.cookie.y = this.PH_PHASE_A - 40;
      this.state.layout.cookie.h = 40;
      const cc = this.state.agents.crushingCookie;
      cc.homeY = this.PH_PHASE_A - 40;
      cc.homeH = 40;
      // Old build triggerR = 250 at base; scale by difficulty as usual.
      cc.triggerR = 250 * this.diffMod.triggerRange;
    }

    // Per-level music: the 1.2 runner gets its own upbeat chiptune loop
    // ("Voxel Revolution"); the desktop hub plays level1.mp3. Crossfade so
    // it feels continuous. load* are no-ops if already loaded, but cover
    // DEV jumps straight into this scene.
    loadMusic(); loadSfx();
    crossfadeTo('level12', { fadeMs: 1500 });

    // Art-matched hole image (drawn behind the suspicious comment when the
    // passage is revealed). Loads async; drawHole falls back to a dark rect
    // until it's ready.
    this.holeImg = new Image();
    this.holeImgLoaded = false;
    this.holeImg.onload = () => { this.holeImgLoaded = true; };
    this.holeImg.src = '/hole.png';

    // Hidden Phaser canvas children that aren't used — we draw to #oqw instead.
    this.cameras.main.setBackgroundColor(0x181818);

    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.VW = 0;
    this.VH = 0;
    this.handleResize = this.handleResize.bind(this);
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    // Keyboard
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.input.keyboard.on('keydown-PLUS', this.zoomInStep, this);
    this.input.keyboard.on('keydown-EQUALS', this.zoomInStep, this);
    this.input.keyboard.on('keydown-MINUS', this.zoomOutStep, this);
    this.input.keyboard.on('keydown-UNDERSCORE', this.zoomOutStep, this);

    // Mouse — pointer.x/y are screen coords on Phaser's canvas (CSS px)
    this.input.on('pointermove', (pointer) => this.updateMouseCoords(pointer));
    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.onMouseUp = () => this.handlePointerUp();
    document.addEventListener('mouseup', this.onMouseUp);

    // Wheel zoom
    this.input.on('wheel', (_pointer, _gos, _dx, dy) => {
      if (this.state.status !== 'playing') return;
      const factor = dy > 0 ? 1 / CAMERA.wheelZoomFactor : CAMERA.wheelZoomFactor;
      const c = this.state.cam;
      c.targetZoom = Phaser.Math.Clamp(c.targetZoom * factor, c.minZoom, c.maxZoom);
    });

    // Results screen DOM refs
    this.restartBtn = document.getElementById('restart');
    this.backMenuBtn = document.getElementById('back-menu');
    this.overlayEl = document.getElementById('overlay');
    this.overlayTagEl = document.getElementById('overlay-tag');
    this.overlayTitleEl = document.getElementById('overlay-title');
    this.overlaySubEl = document.getElementById('overlay-sub');
    this.gradeLetterEl = document.getElementById('grade-letter');
    this.gradeNameEl = document.getElementById('grade-name');
    this.statRows = document.querySelectorAll('#stats-grid .stat-row');
    this.onRestart = () => this.restart();
    this.onBackMenu = () => this.backToMenu();
    this.restartBtn?.addEventListener('click', this.onRestart);
    this.backMenuBtn?.addEventListener('click', this.onBackMenu);

    // HUD DOM refs — legacy ids still queried for backwards-compat, but the
    // visible UI is the new top-left task frame + top-right HP frame.
    this.hud = {
      size: document.getElementById('ui-size'),
      gaze: document.getElementById('ui-gaze'),
      docs: document.getElementById('ui-docs'),
      cookie: document.getElementById('ui-cookie'),
      zoom: document.getElementById('ui-zoom'),
      hint: document.getElementById('ui-hint'),
    };
    // New runner HUD (top-left task + top-right HP)
    this.runnerHud = {
      taskFrame:    document.getElementById('task-frame'),
      taskLine:     document.getElementById('task-line'),
      taskProgress: document.getElementById('task-progress'),
      hpFrame:      document.getElementById('hp-frame'),
      hpFill:       document.getElementById('hp-fill'),
      hpNumber:     document.getElementById('hp-number'),
    };
    // Show the runner objective frame while this scene is active. The HP bar
    // stays hidden — health shows as glass cracks on the window (Level 1.1
    // consistency).
    this.runnerHud.taskFrame?.classList.remove('hidden');
    this.runnerHud.taskFrame?.classList.remove('cleared');
    this.cracks = [];
    this._lastHp = 3;

    // Solo-YOU intro removed - directly start play.

    // Dev testing panel (temporary). Toggle button + 3 ability toggles that
    // flip state.player.test.* flags (immune / size / magnet).
    this.testEls = {
      toggle: document.getElementById('test-toggle'),
      panel:  document.getElementById('test-panel'),
      opts:   document.querySelectorAll('#test-panel .test-opt'),
    };
    this.testEls.toggle?.classList.remove('hidden');
    this.onTestToggle = (e) => { e.stopPropagation(); this.testEls.panel?.classList.toggle('hidden'); };
    this.testEls.toggle?.addEventListener('click', this.onTestToggle);
    this.onTestOpt = (e) => {
      e.stopPropagation();
      const key = e.currentTarget.dataset.test;
      const t = this.state.player.test;
      t[key] = !t[key];
      e.currentTarget.classList.toggle('on', t[key]);
      const st = e.currentTarget.querySelector('.test-state');
      if (st) st.textContent = t[key] ? 'ON' : 'OFF';
      beep(t[key] ? 880 : 440, 0.05, 'square', 0.05);
    };
    this.testEls.opts?.forEach((el) => el.addEventListener('click', this.onTestOpt));

    this.canvasWrapEl = document.querySelector('.canvas-wrap');

    // Intel dialog DOM refs (in-game memo popup)
    this.intelDom = {
      wrap:    document.getElementById('intel-dialog'),
      speaker: document.getElementById('intel-speaker'),
      line:    document.getElementById('intel-line'),
      hint:    document.getElementById('intel-hint'),
    };
    this.intelTypeTimer = null;
    this.narrationTimer = null;
    // Click anywhere → advance whichever dialog is active (intel memo OR the
    // escape narration). Narration takes priority since it gates the escape.
    this.onIntelClick = (e) => {
      if (this.state.narration) {
        e.stopPropagation();
        this.advanceNarration();
      } else if (this.state.intelDialog) {
        e.stopPropagation();
        this.advanceIntel();
      }
    };
    document.addEventListener('click', this.onIntelClick);

    // Post-mission banner DOM ref
    this.postMissionEl = document.getElementById('post-mission-banner');

    // Keys: ESC → main menu, R → replay. Active in any non-playing state
    // (post-mission, intel dialog, or loss). Avoids needing a results screen.
    this.onKey = (e) => {
      // Onboarding tip takes priority — SPACE/Enter dismisses
      if (this.state.tipShowing && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        this.hideTip();
        return;
      }
      if (this.state.narration && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        this.advanceNarration();
        return;
      }
      if (this.state.intelDialog && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        this.advanceIntel();
        return;
      }
      // ESC during play → pause / audio menu (MAIN MENU button quits).
      if (e.key === 'Escape' && this.state.status === 'playing'
          && !this.state.tipShowing && !this.state.intelDialog && !this.state.narration) {
        e.preventDefault();
        togglePauseMenu({ onQuit: () => this.backToMenu() });
        return;
      }
      if (this.state.status === 'won') {
        if (e.key === 'Escape') { e.preventDefault(); this.backToMenu(); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.restart(); }
      } else if (this.state.status === 'lost') {
        // Unified crash screen: R restarts, ESC goes to menu (same as Level 1.1)
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.restart(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.backToMenu(); }
      }
    };
    document.addEventListener('keydown', this.onKey);

    // Onboarding tooltip DOM + click-to-dismiss anywhere on the backdrop
    this.tipEl     = document.getElementById('onboarding-tip');
    this.tipTextEl = document.getElementById('onboarding-tip-text');
    this.currentTip = null;
    this.tipTimer = null;
    this.firstAdDragged = false;
    this.onTipClick = (e) => {
      if (this.state.tipShowing) {
        e.stopPropagation();
        this.hideTip();
      }
    };
    this.tipEl?.addEventListener('click', this.onTipClick);

    // Tab system — after a win the tab close buttons flash; clicking one
    // exits to the desktop (Phase 3 completion flow). Locked tabs no-op.
    this.tabEls = document.querySelectorAll('#browser-tabs .tab');
    this.onTabClick = (e) => {
      if (this.state.status === 'won' && e.target.classList.contains('x')) {
        this.backToMenu();
      }
    };
    this.tabEls.forEach((el) => el.addEventListener('click', this.onTabClick));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('mouseup', this.onMouseUp);
      document.removeEventListener('keydown', this.onKey);
      this.restartBtn?.removeEventListener('click', this.onRestart);
      this.backMenuBtn?.removeEventListener('click', this.onBackMenu);
      document.removeEventListener('click', this.onIntelClick);
      this.tipEl?.removeEventListener('click', this.onTipClick);
      this.tabEls?.forEach((el) => el.removeEventListener('click', this.onTabClick));
      if (this.revealTimers) this.revealTimers.forEach(clearTimeout);
      if (this.tipTimer) clearTimeout(this.tipTimer);
      if (this.intelTypeTimer) clearTimeout(this.intelTypeTimer);
      stopAllSfxLoops();
      resetPauseMenu();
      removeLevelComplete();
      this.intelDom?.wrap?.classList.add('hidden');
      this.intelDom?.wrap?.classList.remove('show');
      this.postMissionEl?.classList.add('hidden');
      this.postMissionEl?.classList.remove('show');
      this.canvasWrapEl?.classList.remove('post-mission');
      // Hide runner-specific HUD frames so other scenes (Menu / Level2) don't
      // get them stuck on screen.
      this.runnerHud?.taskFrame?.classList.add('hidden');
      this.runnerHud?.hpFrame?.classList.add('hidden');
      this.testEls?.toggle?.classList.add('hidden');
      this.testEls?.panel?.classList.add('hidden');
      this.testEls?.toggle?.removeEventListener('click', this.onTestToggle);
      this.testEls?.opts?.forEach((el) => el.removeEventListener('click', this.onTestOpt));
    });
  }

  // ===== Resize / zoom =====
  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.VW = w;
    this.VH = h;

    const c = this.state.cam;
    const fitZoom = w / PW;
    c.baseZoom = fitZoom;
    c.minZoom = fitZoom * CAMERA.minZoomMult;
    c.maxZoom = fitZoom * CAMERA.maxZoomMult;
    if (!c.initialized) {
      c.zoom = fitZoom;
      c.targetZoom = fitZoom;
      c.initialized = true;
    } else {
      c.zoom = Phaser.Math.Clamp(c.zoom, c.minZoom, c.maxZoom);
      c.targetZoom = Phaser.Math.Clamp(c.targetZoom, c.minZoom, c.maxZoom);
    }
  }

  zoomInStep() {
    if (this.state.status !== 'playing') return;
    const c = this.state.cam;
    c.targetZoom = Phaser.Math.Clamp(c.targetZoom * CAMERA.keyZoomFactor, c.minZoom, c.maxZoom);
  }
  zoomOutStep() {
    if (this.state.status !== 'playing') return;
    const c = this.state.cam;
    c.targetZoom = Phaser.Math.Clamp(c.targetZoom / CAMERA.keyZoomFactor, c.minZoom, c.maxZoom);
  }

  // ===== Mouse =====
  updateMouseCoords(pointer) {
    const m = this.state.mouse;
    const c = this.state.cam;
    m.sx = pointer.x;
    m.sy = pointer.y;
    m.x = c.x + pointer.x / c.zoom;
    m.y = c.y + pointer.y / c.zoom;
  }

  onPointerDown(pointer) {
    initAudio();
    this.updateMouseCoords(pointer);
    this.state.mouse.down = true;
    // The suspicious comment is only draggable during the escape's 'drag' step.
    if (!this.state.escape || this.state.escape.step !== 'drag') return;
    const m = this.state.mouse;
    for (let i = this.state.propaganda.length - 1; i >= 0; i--) {
      const p = this.state.propaganda[i];
      if (m.x >= p.x && m.x <= p.x + p.w && m.y >= p.y && m.y <= p.y + p.h) {
        p.dragging = true;
        p.dox = m.x - p.x;
        p.doy = m.y - p.y;
        beep(420, 0.04, 'square', 0.04);
        break;
      }
    }
  }
  handlePointerUp() {
    this.state.mouse.down = false;
    this.state.propaganda.forEach((p) => {
      if (p.dragging) {
        p.dragging = false;
        beep(280, 0.04, 'square', 0.03);
      }
    });
  }

  // ===== Restart / back to menu =====
  restart() {
    if (this.overlayEl) this.overlayEl.classList.remove('show');
    this.resetResultsUI();
    resetState(this.state);
    this.cracks = [];
    this._lastHp = this.state.player.hp;
  }
  backToMenu() {
    if (this.overlayEl) this.overlayEl.classList.remove('show');
    this.resetResultsUI();
    document.body.classList.add('menu-mode');
    crossfadeTo('level1', { fadeMs: 800 });
    this.scene.stop('HUDScene');
    this.scene.start('MenuScene');
  }
  resetResultsUI() {
    if (this.revealTimers) this.revealTimers.forEach(clearTimeout);
    this.revealTimers = [];
    if (this.intelTypeTimer) clearTimeout(this.intelTypeTimer);
    this.gradeLetterEl?.classList.remove('show');
    this.gradeNameEl?.classList.remove('show');
    this.statRows?.forEach((row) => row.classList.add('hidden-row'));
    // Intel dialog + post-mission banner reset
    this.intelDom?.wrap?.classList.add('hidden');
    this.intelDom?.wrap?.classList.remove('show');
    if (this.intelDom?.line) this.intelDom.line.textContent = '';
    if (this.intelDom?.hint) this.intelDom.hint.classList.remove('show');
    this.postMissionEl?.classList.add('hidden');
    this.postMissionEl?.classList.remove('show');
    // Restart wipes the post-mission dim so the page is "live" again
    this.canvasWrapEl?.classList.remove('post-mission');
    document.querySelectorAll('#browser-tabs .tab .x').forEach(x => x.classList.remove('flash-exit'));
    this.firstAdDragged = false;
  }

  // ===== Onboarding tooltips =====
  // Show a tip only on first ever playthrough (localStorage flag). Subsequent
  // plays skip — reviewer feedback was "first-time players shouldn't need
  // external guidance," but veterans don't need this clutter every run.
  shouldShowTip(key) {
    return localStorage.getItem('oqw-tip-' + key) !== 'done';
  }
  markTipDone(key) {
    localStorage.setItem('oqw-tip-' + key, 'done');
  }
  showTip(tip) {
    if (!this.tipEl || !this.tipTextEl) return;
    if (this.currentTip === tip.key) return;
    if (!this.shouldShowTip(tip.key)) return;
    this.currentTip = tip.key;
    this.tipTextEl.innerHTML = tip.text;
    this.tipEl.classList.remove('hidden');
    requestAnimationFrame(() => this.tipEl.classList.add('show'));
    // Pause gameplay while tip is on-screen (centered modal style — player
    // can't see game behind it so freezing is the correct UX)
    this.state.tipShowing = true;
    // Long max-duration fallback in case player walks away — 30s
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => this.hideTip(), 30000);
  }
  hideTip(markDone = true) {
    if (!this.tipEl) return;
    if (this.tipTimer) { clearTimeout(this.tipTimer); this.tipTimer = null; }
    if (markDone && this.currentTip) this.markTipDone(this.currentTip);
    this.tipEl.classList.remove('show');
    this.currentTip = null;
    this.state.tipShowing = false;
    setTimeout(() => this.tipEl?.classList.add('hidden'), 400);
  }

  // Decide which tip (if any) is relevant given current game state.
  updateOnboardingTips() {
    // Disabled in the runner rework — these tips ("grab the 5 docs", "drag the
    // comment", "accept the cookies", "SUBSCRIBE") were for the old discovery
    // design and were popping up mid-run. The OBJECTIVE frame is the guidance
    // now. Make sure none are left showing.
    if (this.currentTip) this.hideTip(false);
  }

  // ===== Intel dialog (in-game memo popup) =====
  startIntel() {
    const state = this.state;
    if (state.intelRevealed || state.intelDialog) return;
    state.intelRevealed = true;
    state.intelDialog = { idx: 0, charT: 0, typing: true };
    this.intelDom.wrap?.classList.remove('hidden');
    requestAnimationFrame(() => this.intelDom.wrap?.classList.add('show'));
    this.showIntelLine(0);
    beep(660, 0.08, 'sine', 0.08);
    setTimeout(() => beep(880, 0.1, 'sine', 0.08), 90);
  }

  showIntelLine(i) {
    const line = INTEL_LINES[i];
    if (!line) return this.closeIntel();
    if (this.intelDom.speaker) this.intelDom.speaker.textContent = line.speaker;
    if (this.intelDom.line) this.intelDom.line.textContent = '';
    this.intelDom.hint?.classList.remove('show');
    if (line.voiceId) playVoice(line.voiceId);
    else stopVoice();
    let chars = 0;
    const text = line.text;
    const tick = () => {
      const dialog = this.state.intelDialog;
      if (!dialog || !dialog.typing) {
        if (this.intelDom.line) this.intelDom.line.textContent = text;
        this.intelDom.hint?.classList.add('show');
        return;
      }
      if (isPauseOpen()) {            // hold the typewriter while paused
        this.intelTypeTimer = setTimeout(tick, 90);
        return;
      }
      if (chars < text.length) {
        chars++;
        if (this.intelDom.line) this.intelDom.line.textContent = text.slice(0, chars);
        if (text[chars - 1] !== ' ' && Math.random() < 0.22) {
          beep(1600 + Math.random() * 600, 0.005, 'square', 0.011);
        }
        this.intelTypeTimer = setTimeout(tick, 28);
      } else {
        if (this.state.intelDialog) this.state.intelDialog.typing = false;
        this.intelDom.hint?.classList.add('show');
      }
    };
    tick();
  }

  advanceIntel() {
    if (isPauseOpen()) return;          // frozen while the pause menu is open
    const dialog = this.state.intelDialog;
    if (!dialog) return;
    if (dialog.typing) {
      // Skip typewriter — show full line immediately
      if (this.intelTypeTimer) clearTimeout(this.intelTypeTimer);
      dialog.typing = false;
      const line = INTEL_LINES[dialog.idx];
      if (this.intelDom.line) this.intelDom.line.textContent = line.text;
      this.intelDom.hint?.classList.add('show');
      return;
    }
    dialog.idx++;
    if (dialog.idx >= INTEL_LINES.length) return this.closeIntel();
    dialog.typing = true;
    this.showIntelLine(dialog.idx);
  }

  closeIntel() {
    if (this.intelTypeTimer) clearTimeout(this.intelTypeTimer);
    stopVoice();
    this.state.intelDialog = null;
    this.intelDom.wrap?.classList.remove('show');
    setTimeout(() => this.intelDom.wrap?.classList.add('hidden'), 400);
  }

  // Compute time/stealth/survival stars and overall letter grade.
  computeGrade(state) {
    const elapsed = state.stats.endedAt || state.time;

    // Time: faster = better. Tuned for Level 1 typical playthrough.
    let timeStars = 1;
    if (elapsed < 60) timeStars = 3;
    else if (elapsed < 120) timeStars = 2;

    // Stealth: gaze never crossed threshold = perfect.
    let stealthStars = 3;
    if (state.stats.gazeMaxed) stealthStars = 1;
    else if (state.gaze > 50) stealthStars = 2;

    // Survival: damage taken (lower = better).
    let survivalStars = 1;
    if (state.stats.damageTaken === 0) survivalStars = 3;
    else if (state.stats.damageTaken < 25) survivalStars = 2;

    const total = timeStars + stealthStars + survivalStars; // 3..9

    let letter = 'D';
    let name = 'BARELY';
    let tier = 'barely';
    if (state.status === 'lost') { letter = 'F'; name = 'FAIL'; tier = 'fail'; }
    else if (total >= 9) { letter = 'S+'; name = 'FLAWLESS'; tier = 'flawless'; }
    else if (total >= 8) { letter = 'S';  name = 'ACE';      tier = 'ace'; }
    else if (total >= 7) { letter = 'A';  name = 'EXCELLENT'; tier = 'excellent'; }
    else if (total >= 5) { letter = 'B';  name = 'GOOD';     tier = 'good'; }
    else if (total >= 4) { letter = 'C';  name = 'PASS';     tier = 'pass'; }

    return { timeStars, stealthStars, survivalStars, total, letter, name, tier, elapsed };
  }

  formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  starsHtml(n) {
    let out = '';
    for (let i = 0; i < 3; i++) {
      out += i < n ? '<span class="filled">★</span>' : '<span>☆</span>';
    }
    return out;
  }

  showOverlay() {
    if (!this.overlayEl) return;
    const state = this.state;
    const won = state.status === 'won';
    const grade = this.computeGrade(state);

    // Header text — different framing for win vs loss
    if (won) {
      this.overlayTagEl.textContent = '[ EXFILTRATED ]';
      this.overlayTagEl.style.color = '#2D8659';
      this.overlayTitleEl.textContent = 'MISSION COMPLETE';
      this.overlaySubEl.textContent = 'evidence exfiltrated. return to the desktop.';
    } else {
      this.overlayTagEl.textContent = '[ THE PAGE WON ]';
      this.overlayTagEl.style.color = '#E63946';
      this.overlayTitleEl.textContent = state.lostReason || 'CLOSED BY BROWSER';
      this.overlaySubEl.textContent =
        state.lostReason === 'GARBAGE COLLECTED'
          ? "the avatar shot you. it shoots everyone. don't take it personally — just run at it next time."
          : state.lostReason === 'CAUGHT BY CURSOR'
            ? 'page noticed the red bit was uncovered. you have to keep something over it.'
            : 'tab crashed. happens to everyone.';
    }

    // Stat row labels — re-set every show, since loss uses different ones
    const rowLabels = won
      ? ['TIME',     'STEALTH', 'SURVIVAL', 'DOCS']
      : ['SURVIVED', 'GAZE',    'DAMAGE',   'DOCS'];
    this.statRows.forEach((row, i) => {
      const nameEl = row.querySelector('.stat-name');
      if (nameEl) nameEl.textContent = rowLabels[i];
    });

    // Stat values
    document.getElementById('stat-time').textContent = this.formatTime(grade.elapsed);
    if (won) {
      document.getElementById('stat-stealth').textContent = state.stats.gazeMaxed ? 'DETECTED' : 'CLEAN';
      document.getElementById('stat-survival').textContent = state.stats.damageTaken === 0
        ? 'UNTOUCHED'
        : state.stats.damageTaken + ' size lost · ' + state.stats.hitsReceived + ' hit' + (state.stats.hitsReceived === 1 ? '' : 's');
    } else {
      document.getElementById('stat-stealth').textContent = state.stats.gazeMaxed
        ? 'MAXED OUT'
        : Math.round(state.gaze) + '%';
      document.getElementById('stat-survival').textContent =
        state.stats.damageTaken + ' size lost · ' + state.stats.hitsReceived + ' hit' + (state.stats.hitsReceived === 1 ? '' : 's');
    }
    document.getElementById('stat-docs').textContent = state.docsCollected + ' / ' + state.docs.length;

    // Stars — only awarded on win. On loss, leave them empty (no misleading 3 stars).
    document.getElementById('stat-time-stars').innerHTML     = won ? this.starsHtml(grade.timeStars)     : '';
    document.getElementById('stat-stealth-stars').innerHTML  = won ? this.starsHtml(grade.stealthStars)  : '';
    document.getElementById('stat-survival-stars').innerHTML = won ? this.starsHtml(grade.survivalStars) : '';

    // Grade letter (class for color tier)
    this.gradeLetterEl.textContent = grade.letter;
    this.gradeLetterEl.className = 'grade-letter tier-' + grade.tier;
    this.gradeNameEl.textContent = grade.name;

    // Show overlay first, then sequentially reveal stat rows + grade
    this.overlayEl.classList.add('show');
    this.revealTimers = [];
    const reveal = (delay, fn) => this.revealTimers.push(setTimeout(fn, delay));

    if (won) {
      reveal(350,  () => { this.statRows[0].classList.remove('hidden-row'); beep(880, 0.06, 'sine', 0.08); });
      reveal(700,  () => { this.statRows[1].classList.remove('hidden-row'); beep(988, 0.06, 'sine', 0.08); });
      reveal(1050, () => { this.statRows[2].classList.remove('hidden-row'); beep(1100, 0.06, 'sine', 0.08); });
      reveal(1400, () => { this.statRows[3].classList.remove('hidden-row'); beep(1320, 0.08, 'sine', 0.08); });
      reveal(1850, () => {
        this.gradeLetterEl.classList.add('show');
        this.gradeNameEl.classList.add('show');
        if (grade.tier === 'flawless' || grade.tier === 'ace') {
          beep(523, 0.15, 'sine', 0.1);
          setTimeout(() => beep(659, 0.15, 'sine', 0.1), 90);
          setTimeout(() => beep(784, 0.2, 'sine', 0.12), 180);
          setTimeout(() => beep(1047, 0.3, 'sine', 0.12), 320);
        } else {
          beep(660, 0.15, 'sine', 0.1);
          setTimeout(() => beep(880, 0.25, 'sine', 0.12), 140);
        }
      });
    } else {
      // Loss: reveal everything quickly, no celebratory grade animation
      playSfx('gameOver');
      reveal(200, () => { this.statRows.forEach((r) => r.classList.remove('hidden-row')); });
      reveal(450, () => {
        this.gradeLetterEl.classList.add('show');
        this.gradeNameEl.classList.add('show');
        beep(120, 0.4, 'sawtooth', 0.1);
      });
    }
  }

  // ===== Per-frame =====
  update(_time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000);
    // Don't accrue game time while a tip or the intel memo is on-screen.
    // The run-time stat shouldn't punish players for reading.
    if (!this.state.intelDialog && !this.state.tipShowing && !this.state.narration && !isPauseOpen()) {
      this.state.time += dt;
      // phaseTime is a separate clock that resets at the checkpoint, so the
      // scroller's slow→fast ramp starts fresh in Phase B (rather than
      // already being mid-ramp because state.time was already large).
      this.state.phaseTime = (this.state.phaseTime ?? 0) + dt;
      if (this.state.status === 'playing') {
        try {
          const currentAccum = parseFloat(localStorage.getItem('oqw-accum-l2') || '0');
          localStorage.setItem('oqw-accum-l2', String(currentAccum + dt));
        } catch (e) {}
      }
    }

    // Smooth zoom toward target
    const c = this.state.cam;
    c.zoom += (c.targetZoom - c.zoom) * Math.min(1, dt * CAMERA.zoomLerp);

    // Floating world-space texts ("+22 HP", "HP MAX") — tick every frame so
    // they animate even when the underlying logic is paused.
    if (this.state.floatingTexts && this.state.floatingTexts.length) {
      this.state.floatingTexts = this.state.floatingTexts.filter(ft => {
        ft.age += dt;
        return ft.age < ft.life;
      });
    }

    // Decay sparks/crumbs even outside playing state
    this.state.sparks = this.state.sparks.filter((s) => {
      s.life -= dt;
      if (s.vx !== undefined) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.vx *= 0.92; s.vy *= 0.92;
      }
      return s.life > 0;
    });
    this.state.crumbs = this.state.crumbs.filter((cr) => {
      cr.life -= dt;
      cr.x += cr.vx * dt; cr.y += cr.vy * dt;
      cr.vy += RENDER.crumbGravity * dt;
      cr.rot += cr.vrot * dt;
      return cr.life > 0;
    });

    if (isPauseOpen()) {
      // Paused — hold the world; render the frozen frame below.
    } else if (this.state.status === 'playing' && !this.state.intelDialog && !this.state.tipShowing && !this.state.narration) {
      this.runGameLogic(dt);
      this.updateOnboardingTips();
    } else if (this.state.status === 'playing' && !this.state.intelDialog && this.state.tipShowing) {
      // Tip is up — game paused. Still check if a new tip should show
      // (e.g. on first frame after game starts, before tipShowing was set).
      // Skip in normal cases since tipShowing is true.
    } else if (this.state.intelDialog) {
      // Game paused while reading the intel memo — only typewriter ticks
      // run (driven by its own setTimeout). Don't advance time/gaze/agents.
    }

    this.render();
    this.updateHUD();
    // WIN: the shared LEVEL COMPLETE overlay is shown from
    // updateEscapeInteractions (single "go back to desktop" action).
    // LOSS: unified canvas crash screen (drawn inside render()) — no DOM
    // overlay needed. The old results/grade overlay (showOverlay) is retired.
  }

  runGameLogic(dt) {
    const state = this.state;
    const p = state.player;
    const c = state.cam;

    // ── AUTO-SCROLL camera ────────────────────────────────────────────────
    // Two-phase ramp: slow chill phase, then linear ramp up to fast cap. The
    // scroll is NOT affected by SHIFT — it ramps purely on time. During the
    // escape the scroll is owned by updateEscapeScroll. dScroll = actual
    // camera delta this frame, used to auto-advance the player.
    //
    // Phase A (static) — camera FOLLOWS the player around a bounded
    // 960×1200 page (matches the old build). Player moves freely with WASD;
    // the camera tracks their Y position so the page scrolls naturally.
    // scrollY isn't updated here — it's updated AFTER the player moves
    // (in the clamp block below) so it reads the post-move position.
    const viewW = this.VW / c.zoom;
    const viewH = this.VH / c.zoom;
    const prevScrollY = state.scrollY;
    if (state.phase === 'static') {
      state.scrollSpeed = 0;
      // scrollY held until the post-movement camera update
    } else if (state.escape) {
      this.updateEscapeScroll(dt, viewH);
    } else {
      const pt = state.phaseTime ?? state.time;
      let baseRamped;
      if (pt < SCROLL.slowDuration) {
        baseRamped = SCROLL.slowSpeed;
      } else {
        const rampT = Math.min(1, (pt - SCROLL.slowDuration) / SCROLL.rampDuration);
        baseRamped = SCROLL.slowSpeed + (SCROLL.fastSpeed - SCROLL.slowSpeed) * rampT;
      }
      state.scrollSpeed = baseRamped;
      state.scrollY += baseRamped * dt;
    }
    const dScroll = state.scrollY - prevScrollY;

    // Camera tracks scrollY directly
    c.y = state.scrollY;
    c.x = (PW - viewW) / 2;

    // ── Player movement (auto-follow + WASD) ──────────────────────────────
    // Step 1: auto-advance the player WITH the camera so they keep their
    // viewport-relative Y when no input (Phase B only; Phase A has no
    // auto-scroll so dScroll = 0 there).
    if (state.phase !== 'static') p.y += dScroll;

    // Step 2: WASD / arrows for free movement. SHIFT boosts the PLAYER's
    // movement speed only (the scroll is untouched). The FAST powerup also
    // multiplies movement.
    const boosting = this.wasd.shift.isDown;
    const speedMul = (p.buffs.speed > 0 ? POWERUP.speedMul : 1) * (boosting ? PLAYER.boostMul : 1);
    const speed = PLAYER.baseSpeed * speedMul;
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown  || this.cursors.left.isDown)  vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown    || this.cursors.up.isDown)    vy -= 1;
    if (this.wasd.down.isDown  || this.cursors.down.isDown)  vy += 1;
    if (vx || vy) {
      const len = Math.hypot(vx, vy);
      vx /= len; vy /= len;
    }
    p.x += vx * speed * dt;
    p.y += vy * speed * dt;

    // Step 3: clamp. Phase A — bounded to the 960×1200 page; camera
    // follows the player. Phase B — clamped to the current viewport; the
    // player can ride the bottom edge into the spawn line.
    const effSize = effectiveSize(p);
    p.x = Phaser.Math.Clamp(p.x, effSize / 2, PW - effSize / 2);
    if (state.phase === 'static') {
      const phMax = this.PH_PHASE_A ?? 1200;
      p.y = Phaser.Math.Clamp(p.y, effSize * 0.4, phMax - effSize * 0.4);
      // Camera follows the player; lerp gently so it doesn't snap.
      const maxScrollY = Math.max(0, phMax - viewH);
      const target = Math.max(0, Math.min(maxScrollY, p.y - viewH / 2));
      state.scrollY += (target - state.scrollY) * Math.min(1, dt * 6);
      state.scrollY = Math.max(0, Math.min(maxScrollY, state.scrollY));
      c.y = state.scrollY;
    } else {
      const viewTop = state.scrollY + 30;
      const viewBot = state.scrollY + viewH - 30 - effSize * 0.75;
      p.y = Phaser.Math.Clamp(p.y, viewTop, viewBot);
    }

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.growT > 0) p.growT -= dt;

    // Hold-to-scan input — consumed by the doc systems (Phase A fixed docs
    // + the Phase B hidden-doc scroller in hiddenDocs.js).
    state.scanHeld = this.wasd.space.isDown;

    // ── Wave enemies + powerups + hidden docs (Phase B only) ─────────────
    // Phase A has no scroller spawn systems — it's pure static-page combat.
    // During the escape sequence we also stop spawning new threats/docs and
    // let any in-flight ones clear. Enemies still update so they fly off.
    // Glass cracks track the discrete-hits HP (grow on hit, repair on heal)
    this._lastHp = syncCracksToHp(this.cracks, this._lastHp, p.hp, effectiveSize(p), effectiveSize(p) * 0.75);

    if (state.phase === 'scroller' && !state.escape) {
      Waves.tickSpawner(state, dt, viewH);
      Powerups.tick(state, dt, viewH);
      const docsBefore = state.docsCollected;
      HiddenDocs.tick(state, dt, viewH);
      if (state.docsCollected > docsBefore) {
        beep(880, 0.08, 'sine', 0.13);
        setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
        // Collected the last scroller doc → kick off the escape sequence.
        if (state.docsCollected >= state.docsTarget) this.beginEscape();
      }
    }
    if (state.phase === 'scroller') Waves.update(state, dt, viewH);

    // Phase-A advance: tick the static-page combat, then check checkpoint.
    if (state.phase === 'static') {
      this.updateStaticPhase(dt);
    }

    // Humour quip — after a couple of hits the player grumbles about getting
    // attacked, then realises the irony. Non-blocking (doesn't pause).
    if (!state.quipShown && state.hitCount >= 2 && !state.escape) {
      state.quipShown = true;
      this.showQuip([
        'bro, why do these viruses keep attacking me?',
        "...wait. they don't know i'm a virus too.",
      ]);
    }
    if (state.quip) {
      state.quip.t += dt;
      if (state.quip.t >= state.quip.dur) {
        state.quip.idx++;
        state.quip.t = 0;
        if (state.quip.idx >= state.quip.lines.length) state.quip = null;
      }
    }

    // Escape interactions that need the post-movement player position
    // (drag-reveal of the comment, moving into the hole).
    if (state.escape) this.updateEscapeInteractions();

    if (state.gameOver && state.status === 'playing') {
      state.status = 'lost';
      state.lostReason = 'WINDOW CRASHED';
      state.stats.endedAt = state.time;
      noise(0.4, 0.18);
      beep(80, 0.5, 'square', 0.13);
    }

    // Propaganda dragging
    for (const prop of state.propaganda) {
      if (prop.dragging) {
        prop.x = state.mouse.x - prop.dox;
        prop.y = state.mouse.y - prop.doy;
        prop.x = Phaser.Math.Clamp(prop.x, 0, PW - prop.w);
        prop.y = Phaser.Math.Clamp(prop.y, 50, PH - prop.h);
      }
    }

    // (Old auto-reveal of the suspicious comment removed — the escape
    // sequence now owns the weird-comment → hole reveal. See updateEscape.)

    // Cursor (gaze enforcer) — disabled in L1 for accessibility (config L1).
    // The lethal hunter debuts in L2. Gaze can still rise/fall as feedback,
    // it just never spawns the cursor here.
    if (L1.gazeEnforcer && state.gaze >= GAZE.threshold && !state.cursor) {
      state.cursor = { x: -40, y: 50, vx: 0, vy: 0, born: 0 };
      state.stats.gazeMaxed = true;
      noise(0.35, 0.16);
      beep(95, 0.5, 'sawtooth', 0.11);
    }
    if (state.cursor) {
      const cu = state.cursor;
      cu.born += dt;
      const dx = p.x - cu.x, dy = p.y - cu.y;
      const d = Math.hypot(dx, dy) || 1;
      cu.vx += (dx / d) * GAZE.cursorAccel * dt;
      cu.vy += (dy / d) * GAZE.cursorAccel * dt;
      cu.vx *= GAZE.cursorDamping;
      cu.vy *= GAZE.cursorDamping;
      cu.x += cu.vx * dt;
      cu.y += cu.vy * dt;
      if (d < p.size * GAZE.cursorCatchRadiusMult && cu.born > GAZE.cursorBornGrace) {
        state.status = 'lost';
        state.lostReason = 'CAUGHT BY CURSOR';
        state.stats.endedAt = state.time;
        noise(0.5, 0.2);
        beep(70, 0.6, 'square', 0.13);
      }
    }

    // (Legacy doc / loose-cookie / cookie-jar pickups removed — they lived at
    // fixed page positions in the old discovery design and would be wrongly
    // auto-collected as the runner scrolls past them. The runner's only
    // collectible is the hidden-doc system above.)

    // X-ray scanning (Phase B only) — sweep the window across hidden truths
    // to latch them open. Free + optional, doesn't gate the win.
    if (state.phase === 'scroller') {
      const s = p.size, ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      for (const f of state.scanFragments) {
        if (f.scanned) continue;
        if (this.windowOverlaps(f)) {
          const { frac, gained } = markScanCoverage(f, px, s, this.ctx);
          f.progress = frac;
          if (gained > 0 && Math.random() < 0.5) beep(1500 + Math.random() * 600, 0.004, 'square', 0.012);
          if (frac >= SCAN.coverThreshold) {
            f.scanned = true;
            beep(880, 0.08, 'sine', 0.1);
            setTimeout(() => beep(1320, 0.1, 'sine', 0.08), 70);
          }
        }
      }
    }

    // Agents — Phase A enables ALL 6 (the old static-page combat); Phase B
    // runs the reduced L1 set (currently all flags off, so the page is calm
    // for the runner). Projectile-cleanup loops always run so in-flight
    // projectiles despawn cleanly across the phase swap.
    const inStatic = state.phase === 'static';
    const chaseCount = inStatic ? state.agents.chasingRecs.length : L1.activeChasingRecs;
    ChasingRecs.updateAll(state.agents.chasingRecs.slice(0, chaseCount), dt, state);
    if (inStatic || L1.shootingSearch) ShootingSearch.update(state.agents.shootingSearch, dt, state);
    ShootingSearch.updateProjectiles(state, dt);
    if (inStatic || L1.fallingComment) FallingComment.update(state.agents.fallingComment, dt, state);
    if (inStatic || L1.explodingLike) ExplodingLike.update(state.agents.explodingLike, dt, state);
    ExplodingLike.updateProjectiles(state, dt);
    if ((inStatic && !state.cookieReady) || L1.crushingCookie) CrushingCookie.update(state.agents.crushingCookie, dt, state);
    if (inStatic || L1.fallingBell) FallingBell.update(state.agents.fallingBell, dt, state);
    // Gun shooter — gated by the difficulty grace period so new players get a
    // chance to learn the controls before it can fire.
    if ((inStatic || L1.gunShooter) && state.time >= state.gunGraceUntil) {
      GunShooter.update(state.agents.gunShooter, dt, state);
    }
    GunShooter.updateProjectiles(state, dt);
    
    this.updateCommentMortars(dt);
    this.updateCannonballs(dt);
    this.updateSpikeThrowers(dt);
  }

  // ===== PHASE A — static-page combat (pre-checkpoint) =====
  // Runs every frame while state.phase === 'static'. Drives:
  //   - the 5 fixed-position doc pickups (state.docs)
  //   - on the 5th doc, flips state.cookieReady so the cookie banner
  //     becomes the exit (instead of crushing the player)
  //   - touching the now-friendly cookie banner triggers the checkpoint
  updateStaticPhase(dt) {
    const state = this.state;
    const p = state.player;

    // Doc collection — stand over one of the 5 fixed-position docs and
    // HOLD SPACE to scan it (see src/game/scanDocs.js).
    for (const d of state.docs) {
      if (d.taken) continue;
      const overlapping = dist(p.x, p.y, d.x, d.y) < d.r + p.size * 0.32;
      d._near = overlapping;
      if (updateScan(d, overlapping, state.scanHeld, dt)) {
        d.taken = true; d.takeT = state.time;
        state.docsCollected++;
        playSfx('docScan');
        beep(880, 0.08, 'sine', 0.13);
        setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
        if (state.docsCollected >= state.docsTarget) {
          state.cookieReady = true;
          state.agents.crushingCookie.state = 'returning';
          this.triggerCheckpoint();
          break;
        }
      }
    }

    // Touching the cookie banner once cookieReady → checkpoint. Generous
    // hit-band (40px above the banner) so the player doesn't have to thread
    // a needle — descend into the banner zone and you're "accepting."
    if (state.cookieReady) {
      const cb = state.layout.cookie;
      if (p.y > cb.y - 40 && p.y < cb.y + cb.h + 8) this.triggerCheckpoint();
    }
  }

  // ===== Checkpoint — flip Phase A → Phase B =====
  // Plays a short toto line, then on dismiss flips the phase and resets the
  // doc counter so Phase B can count to 5 again. The scroller picks up from
  // the player's CURRENT scroll position (they're at the cookie banner near
  // y=1160), not from the page top — the runner just keeps going from here.
  triggerCheckpoint() {
    const state = this.state;
    if (state.phase !== 'static') return;
    state.phase = 'transitioning';   // guard against re-entry from agent updates
    // Lock further damage during the transition — no cheap deaths between
    // accepting the cookies and the scroller starting up.
    state.player.invuln = Math.max(state.player.invuln, 2.0);
    beep(523, 0.1, 'sine', 0.1);
    setTimeout(() => beep(659, 0.1, 'sine', 0.1), 90);
    setTimeout(() => beep(784, 0.2, 'sine', 0.12), 200);
    state.phase = 'scroller';
    state.phaseTime = 0;
    state.docsCollected = 0;
    // Clear Phase-A-only state so the scroller starts clean
    state.cursor = null;
    state.gaze = 0;
    state.projectiles.length = 0;
    state.bullets.length = 0;
    state.debris.length = 0;
    // Reset scroller-spawn timers so the runner doesn't dump a backlog
    state.waveSpawnT = 2.5;
    state.powerupSpawnT = 4;
    state.hiddenDocSpawnT = 10;
  }

  // ===== ESCAPE SEQUENCE (after the 5 docs are collected) =====
  // Beat list:
  beginEscape() {
    const state = this.state;
    if (state.escape) return;
    const viewH = this.VH / state.cam.zoom;
    const COMMENTS_TOP = 620, ROW_H = 100;
    let commentY = state.scrollY + viewH + 260;
    commentY = COMMENTS_TOP + Math.round((commentY - COMMENTS_TOP) / ROW_H) * ROW_H;
    const slotX = 24, slotW = 580, slotH = 88;
    const prop = state.propaganda[0];
    prop.x = slotX; prop.y = commentY; prop.w = slotW; prop.h = slotH;
    prop.homeX = slotX; prop.homeY = commentY;
    prop.dragging = false; prop.revealed = false;
    const hole = state.truth[0];
    hole.x = slotX; hole.y = commentY; hole.w = slotW; hole.h = slotH;
    // Camera target so the comment ends ~40% down the viewport.
    const stopY = commentY - viewH * 0.40;
    state.escape = { step: 'toComment', commentY, stopY, t: 0 };
  }

  // Scroll-owning half of the escape — runs early (before player movement) so
  // dScroll reflects the deceleration. Eases the camera to a stop with the
  // weird comment in frame, then hands off to drag.
  updateEscapeScroll(dt, viewH) {
    const state = this.state;
    const esc = state.escape;
    esc.t += dt;
    if (esc.step === 'toComment') {
      const ease = Math.min(1, dt * 2.2);
      state.scrollY += (esc.stopY - state.scrollY) * ease;
      state.scrollSpeed = Math.abs(esc.stopY - state.scrollY) * 2.2;
      if (Math.abs(esc.stopY - state.scrollY) < 3) {
        state.scrollY = esc.stopY; state.scrollSpeed = 0;
        esc.step = 'drag';
      }
    } else {
      // All other escape steps freeze the scroll.
      state.scrollSpeed = 0;
      state.scrollY = esc.stopY;
    }
  }

  // Interaction half — runs after player movement. Handles the drag-reveal and
  // moving into the hole (both need the up-to-date player position).
  updateEscapeInteractions() {
    const state = this.state;
    const esc = state.escape;
    const p = state.player;
    if (esc.step === 'drag') {
      const prop = state.propaganda[0];
      const movedAway = Math.hypot(prop.x - prop.homeX, prop.y - prop.homeY) > 70;
      if (movedAway && !prop.revealed) {
        prop.revealed = true;
        prop.revealClock = performance.now();   // real-time clock for the slide-away
        prop.dragging = false;                   // release it so the slide takes over
        noise(0.3, 0.14);
        beep(90, 0.45, 'sawtooth', 0.09);
        esc.step = 'exit';
      }
    } else if (esc.step === 'exit') {
      const hole = state.truth[0];
      if (p.x > hole.x + 40 && p.x < hole.x + hole.w - 40 &&
          p.y > hole.y - 10 && p.y < hole.y + hole.h + 10) {
        esc.step = 'done';
        beep(523, 0.1, 'sine', 0.1);
        setTimeout(() => beep(659, 0.1, 'sine', 0.1), 90);
        setTimeout(() => beep(784, 0.2, 'sine', 0.12), 200);
        state.status = 'won';
        state.stats.endedAt = state.time;
        saveLevelTime('l2', parseFloat(localStorage.getItem('oqw-accum-l2') || '0'));   // speedrun clock for the leaderboard
        // Story progression loop: Level 1.2 complete → back to the DESKTOP
        // (new intel lands in the Briefing folder there). The dashboard
        // launches from its desktop icon after the decryption minigame — no
        // direct jump into DashboardScene.
        try { localStorage.setItem('oqw-level2-cleared', 'true'); } catch (e) {}
        this.scene.stop('HUDScene');
        showLevelComplete({
          title: 'LEVEL 1.2 — THE BOOSTED VIDEO',
          sub: 'You slipped out before HUSH traced the window. That run stirred them up — ' +
               'something just landed in the <b>Briefing</b> folder on your desktop.',
          onDesktop: () => this.backToMenu(),
        });
      }
    }
  }

  // Non-blocking internal-monologue quip — a small caption that auto-advances.
  showQuip(lines) {
    this.state.quip = { lines, idx: 0, t: 0, dur: 3.2 };
    beep(520, 0.05, 'sine', 0.05);
  }

  // Draw the quip as a screen-space caption near the top-centre of the canvas.
  drawQuip(ctx) {
    const q = this.state.quip;
    if (!q) return;
    const text = q.lines[q.idx];
    if (!text) return;
    // fade in/out at the edges of each line's duration
    const fadeIn = Math.min(1, q.t / 0.3);
    const fadeOut = Math.min(1, (q.dur - q.t) / 0.3);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    const { VW } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "italic 600 26px 'Saira Condensed', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 44;
    const cx = VW / 2, cy = 70;
    // bubble
    ctx.fillStyle = 'rgba(10,12,20,0.86)';
    ctx.strokeStyle = 'rgba(122,208,235,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - 22, w, 44, 10);
    else ctx.rect(cx - w / 2, cy - 22, w, 44);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
  }

  // ===== Narration (player's own voice etc.) — reuses the intel dialog DOM =====
  startNarration(lines, onDone) {
    const state = this.state;
    state.narration = { lines, idx: 0, typing: true, onDone };
    this.intelDom.wrap?.classList.remove('hidden');
    requestAnimationFrame(() => this.intelDom.wrap?.classList.add('show'));
    this.showNarrationLine(0);
    beep(660, 0.06, 'sine', 0.06);
  }
  showNarrationLine(i) {
    const n = this.state.narration;
    if (!n) return;
    const line = n.lines[i];
    if (!line) return this.closeNarration();
    const colors = { YOU: '#4A7BC8', TOTO: '#E63946', SYSTEM: '#2D8659', MAX: '#9b59b6' };
    if (this.intelDom.speaker) {
      this.intelDom.speaker.textContent = line.speaker || '';
      this.intelDom.speaker.style.background = colors[line.speaker] || '#1a1a1f';
    }
    if (this.intelDom.line) this.intelDom.line.textContent = '';
    this.intelDom.hint?.classList.remove('show');
    let chars = 0;
    const text = line.text;
    const tick = () => {
      const nn = this.state.narration;
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
      } else if (this.state.narration) {
        this.state.narration.typing = false;
      }
    };
    tick();
  }
  advanceNarration() {
    if (isPauseOpen()) return;          // frozen while the pause menu is open
    const n = this.state.narration;
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
    const n = this.state.narration;
    const onDone = n && n.onDone;
    this.state.narration = null;
    this.intelDom.wrap?.classList.remove('show');
    setTimeout(() => this.intelDom.wrap?.classList.add('hidden'), 400);
    if (onDone) onDone();
  }

  // The suspicious comment — looks like a normal comment but greyer, so it
  // reads as "off." Drawn during the escape sequence; draggable in the 'drag'
  // step to reveal the hole behind it.
  drawWeirdComment(ctx, prop) {
    const state = this.state;
    // Once revealed, the comment slides down + fades fully off (real-time so
    // it animates even while the narration pauses the game), exposing the hole.
    let ox = 0, oy = 0, alpha = 1;
    if (prop.revealed) {
      const t = Math.min(1, (performance.now() - (prop.revealClock || 0)) / 550);
      const e = t * t * (3 - 2 * t);     // smoothstep
      ox = e * 90; oy = e * 200; alpha = 1 - e;
      if (t >= 1) return;                // fully gone — hole is clear
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    if (prop.dragging) {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
    }
    drawHandRect(ctx, prop.x, prop.y, prop.w, prop.h, '#d6d6d6', '#b0b0b0', 200, 1.2);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Avatar
    ctx.fillStyle = '#9a9a9a';
    ctx.beginPath(); ctx.arc(prop.x + 22, prop.y + 22, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText('?', prop.x + 22, prop.y + 23);
    ctx.textAlign = 'left';
    // Username + timestamp
    ctx.fillStyle = '#5a5a5a';
    ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top';
    ctx.fillText('@hush_compliance   •   just now', prop.x + 44, prop.y + 8);
    // Comment text — too eager (the "fishy" tell)
    ctx.fillStyle = '#6a6a6a'; ctx.font = '11px sans-serif';
    ctx.fillText("yeah totally, nothing weird going on here. move along.", prop.x + 44, prop.y + 28);
    // Footer
    ctx.fillStyle = '#999999'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('👍 0   👎   reply', prop.x + 44, prop.y + 56);
    // Drag hint while it's grabbable
    if (state.escape?.step === 'drag' && !prop.dragging && !prop.revealed) {
      const pulse = 0.5 + Math.sin(state.time * 4) * 0.4;
      ctx.fillStyle = 'rgba(230, 57, 70, ' + (0.5 + pulse * 0.5) + ')';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('▸ hold & drag this aside', prop.x + prop.w - 12, prop.y + prop.h - 12);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  // Broken-wall hole behind the suspicious comment — the level's escape
  // route. Uses the art-matched hole.png, with a subtle live flicker + a few
  // animated sparks layered on top so it still feels electrical/alive, plus
  // the exit prompt once everything's collected.
  drawHole(ctx, r, ready) {
    const t = this.state.time;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;

    if (this.holeImgLoaded) {
      // Subtle "unstable connection" opacity flicker
      const flicker = 0.94 + Math.sin(t * 13) * 0.03 + (Math.random() < 0.06 ? -0.12 : 0);
      ctx.save();
      ctx.globalAlpha = Math.max(0.7, flicker);
      ctx.drawImage(this.holeImg, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      // Fallback while the image loads — plain dark gap (no ugly placeholder)
      ctx.fillStyle = '#08080c';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // A few live sparks near the rim so the wires in the art look energized
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.12) {
        const sx = r.x + 20 + Math.random() * (r.w - 40);
        const sy = r.y + 6 + Math.random() * (r.h - 12);
        ctx.fillStyle = 'rgba(255, 240, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // (The "slip through to escape" cue is shown in the OBJECTIVE UI instead
    //  of on the hole art — looks cleaner. See updateHUD.)
  }

  // ===== Phase A overlays — fixed-position docs (rectangular, same style
  // as the scroller's hiddenDocs gold-paper look) plus a pulse on the
  // cookie banner once all 5 docs are collected.
  drawPhaseAOverlays(ctx) {
    const state = this.state;
    const t = state.time;

    // Fixed-position docs — rectangular gold-paper design, matched to
    // hiddenDocs so Phase A and Phase B docs look the same.
    const DW = 28, DH = 34;
    for (const d of state.docs) {
      if (d.taken) continue;
      const pulse = 0.6 + Math.sin(t * 6 + d.x * 0.1) * 0.4;
      const dx = d.x - DW / 2;
      const dy = d.y - DH / 2;
      ctx.save();
      // Soft halo
      ctx.globalAlpha = 0.45 + pulse * 0.25;
      ctx.fillStyle = '#F4D35E';
      ctx.fillRect(dx - 8, dy - 8, DW + 16, DH + 16);
      ctx.globalAlpha = 1;
      // Body
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#F2C200';
      ctx.fillRect(dx, dy, DW, DH);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, DW, DH);
      // Dog-ear corner
      ctx.fillStyle = '#d4b94a';
      ctx.beginPath();
      ctx.moveTo(dx + DW - 10, dy);
      ctx.lineTo(dx + DW, dy + 10);
      ctx.lineTo(dx + DW - 10, dy + 10);
      ctx.closePath();
      ctx.fill();
      // Text lines
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(dx + 5, dy + 16, DW - 10, 2);
      ctx.fillRect(dx + 5, dy + 22, DW - 14, 2);
      ctx.fillRect(dx + 5, dy + 28, DW - 8,  2);
      ctx.fillRect(dx + 5, dy + 34, DW - 20, 2);
      // Pulsing border
      const pb = 0.6 + Math.sin(t * 8) * 0.4;
      ctx.strokeStyle = 'rgba(244, 211, 94, ' + (0.5 + pb * 0.5) + ')';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(dx - 2, dy - 2, DW + 4, DH + 4);
      ctx.restore();

      // Hold-to-scan prompt + progress while the window covers the doc
      if (d._near || (d.scanP || 0) > 0) {
        drawScanPrompt(ctx, d, d.x, d.y, { above: DH / 2 + 26, scale: 0.85 });
      }
    }

    // Once cookieReady, pulse the cookie banner so the player knows it's
    // the exit. Drawn in world coords; banner already drawn underneath.
    if (state.cookieReady) {
      const cb = state.layout.cookie;
      const pulse = 0.5 + Math.sin(t * 5) * 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(45, 134, 89, ' + (0.6 + pulse * 0.4) + ')';
      ctx.lineWidth = 4;
      ctx.strokeRect(cb.x + 2, cb.y + 2, cb.w - 4, cb.h - 4);
      ctx.restore();
    }
  }

  // ===== X-ray scan fragments =====
  // Window/fragment overlap test (window is size × size*0.75, centered on x/y).
  windowOverlaps(r) {
    const p = this.state.player, s = p.size, ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    return px < r.x + r.w && px + s > r.x && py < r.y + r.h && py + ph > r.y;
  }

  // Spatial X-ray: draw the FULL hidden truth, clipped to the window, so only
  // the slice physically under the window shows. No character slicing — move
  // the window and you reveal whatever it's currently over.
  drawXrayReveal(ctx, f) {
    const p = this.state.player, s = p.size, ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, s, ph); ctx.clip();
    ctx.fillStyle = SCAN.xrayBg;
    ctx.fillRect(f.x - 4, f.y - 4, f.w + 8, f.h + 8);
    ctx.fillStyle = SCAN.xrayColor;
    ctx.font = f.font; ctx.textBaseline = 'top';
    ctx.fillText(f.hidden, f.tx, f.ty);
    ctx.restore();
  }

  // Page-level fragment visuals (visible "lie", persistent revealed truth, and
  // the "something here" glow). The live in-window decode is a SEPARATE later
  // pass (drawScanXray) so the hidden-under-layer fill can't paint over it.
  drawScanFragment(ctx, f) {
    if (f.scanned) {
      ctx.fillStyle = SCAN.revealColor;
      ctx.font = f.font; ctx.textBaseline = 'top';
      ctx.fillText(f.hidden, f.tx, f.ty);
      return;
    }
    if (f.style === 'redaction') {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    } else {
      ctx.fillStyle = f.color; ctx.font = f.font; ctx.textBaseline = 'top';
      ctx.fillText(f.visible, f.tx, f.ty);
    }
    if (this.windowOverlaps(f)) {
      const pulse = 0.5 + Math.sin(this.state.time * 6) * 0.5;
      ctx.strokeStyle = 'rgba(' + SCAN.glowColor + ',' + (0.35 + pulse * 0.4) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x - 3, f.y - 3, f.w + 6, f.h + 6);
    }
  }

  drawScanFragments(ctx) {
    for (const f of this.state.scanFragments) this.drawScanFragment(ctx, f);
  }

  // Live in-window decode for any un-scanned fragment under the window. Drawn
  // after the hidden under-layer so it reads as the truth seen through the glass.
  drawScanXray(ctx) {
    for (const f of this.state.scanFragments) {
      if (!f.scanned && this.windowOverlaps(f)) this.drawXrayReveal(ctx, f);
    }
  }

  // ===== Render =====
  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    const state = this.state;
    const layout = state.layout;

    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    ctx.scale(state.cam.zoom, state.cam.zoom);
    ctx.translate(-state.cam.x, -state.cam.y);

    // page bg + grid — bounded to the CURRENT viewport so PH=∞ doesn't
    // blow up the line loops. The grid tiles forever as the camera scrolls.
    const viewH = this.VH / state.cam.zoom;
    const topY = state.cam.y - 40;
    const botY = state.cam.y + viewH + 40;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, topY, PW, botY - topY);
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= PW; i += 40) { ctx.moveTo(i, topY); ctx.lineTo(i, botY); }
    const gridStart = Math.floor(topY / 40) * 40;
    for (let i = gridStart; i <= botY; i += 40) { ctx.moveTo(0, i); ctx.lineTo(PW, i); }
    ctx.stroke();

    // nav
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, 50);
    ctx.fillStyle = '#e5e5e5'; ctx.fillRect(0, 50, PW, 1);
    ctx.fillStyle = '#E63946';
    ctx.fillRect(layout.logo.x, layout.logo.y, 30, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶', layout.logo.x + 9, layout.logo.y + 11);
    ctx.fillStyle = '#1a1a1f';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('TotallyNormal', layout.logo.x + 38, layout.logo.y + 13);

    // search bar (driven by ShootingSearch agent state)
    ShootingSearch.drawBar(ctx, state.agents.shootingSearch, state);
    // account avatar (driven by GunShooter agent state) — note: arm is drawn here too
    GunShooter.drawAvatar(ctx, state.agents.gunShooter, state);

    // video player
    {
      const v = layout.video;
      ctx.fillStyle = '#0c0c0e'; ctx.fillRect(v.x, v.y, v.w, v.h);
      const colors = ['#E63946', '#F4D35E', '#2D8659', '#4A7BC8', '#9b59b6'];
      const barW = v.w / colors.length;
      for (let i = 0; i < colors.length; i++) {
        ctx.fillStyle = colors[i];
        ctx.globalAlpha = 0.3 + Math.sin(state.time * 2 + i) * 0.1;
        ctx.fillRect(v.x + i * barW, v.y, barW, v.h - 30);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const px = v.x + v.w / 2, py = v.y + v.h / 2;
      ctx.moveTo(px - 18, py - 22);
      ctx.lineTo(px + 22, py);
      ctx.lineTo(px - 18, py + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(v.x, v.y + v.h - 24, v.w, 4);
      ctx.fillStyle = '#E63946';
      ctx.fillRect(v.x, v.y + v.h - 24, v.w * (0.3 + Math.sin(state.time * 0.3) * 0.2), 4);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(v.x, v.y + v.h - 18, v.w, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶  3:14 / ??:??', v.x + 10, v.y + v.h - 9);
      ctx.fillText('⚙ ⛶', v.x + v.w - 40, v.y + v.h - 9);
    }
    // video title — drawn by the scan-fragment layer below (it's a hidden-
    // truth fragment now: the visible headline hides "PROJECT WHITEWASH").

    // like button (driven by ExplodingLike agent state)
    ExplodingLike.drawButton(ctx, state.agents.explodingLike, state);
    // dislike / share
    {
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(layout.dislikeBtn.x, layout.dislikeBtn.y, layout.dislikeBtn.w, layout.dislikeBtn.h);
      ctx.strokeRect(layout.dislikeBtn.x, layout.dislikeBtn.y, layout.dislikeBtn.w, layout.dislikeBtn.h);
      ctx.fillStyle = '#1a1a1f';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('👎', layout.dislikeBtn.x + 10, layout.dislikeBtn.y + 15);
      ctx.fillRect(layout.shareBtn.x, layout.shareBtn.y, layout.shareBtn.w, layout.shareBtn.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(layout.shareBtn.x + 1, layout.shareBtn.y + 1, layout.shareBtn.w - 2, layout.shareBtn.h - 2);
      ctx.fillStyle = '#1a1a1f';
      ctx.fillText('↗ SHARE', layout.shareBtn.x + 8, layout.shareBtn.y + 15);
    }

    // description
    {
      const d = layout.description;
      ctx.fillStyle = '#eee'; ctx.fillRect(d.x, d.y, d.w, d.h);
      // uploader line + the "memo" redaction bar are hidden-truth scan
      // fragments now — drawn by the scan layer below. Keep a couple of
      // plain filler bars for texture.
      ctx.fillStyle = '#666';
      ctx.fillRect(d.x + 10, d.y + 30, 540, 4);
      ctx.fillRect(d.x + 10, d.y + 42, 480, 4);
      ctx.fillRect(d.x + 10, d.y + 54, 510, 4);
    }

    // X-ray scan-fragment layer — visible "lies" + persistent revealed truths
    // (and the live in-window decode while the player hovers a fragment).
    this.drawScanFragments(ctx);

    // sidebar recs — infinite scrolling feed
    {
      const RECS_TOP = 70, ROW_H = 96, CW = 320, CH = 86, CX = 620;
      const iStart = Math.max(0, Math.floor((topY - RECS_TOP) / ROW_H));
      const iEnd = Math.floor((botY - RECS_TOP) / ROW_H);
      for (let i = iStart; i <= iEnd; i++) {
        if (state.phase === 'static' && ChasingRecs.isAgentSlot(state.agents.chasingRecs, i)) {
          ChasingRecs.drawEmptySlot(ctx, { x: CX, y: RECS_TOP + i * ROW_H, w: CW, h: CH });
        } else {
          const isSpike = (i === 3 || i === 6);
          const spikeState = isSpike ? this.spikeThrowers.get(i) : null;
          drawRecCard(ctx, CX, RECS_TOP + i * ROW_H, CW, CH, i, false, null, state.time, spikeState);
        }
      }
    }
    ChasingRecs.drawAgents(ctx, state.agents.chasingRecs, state);

    // ── Infinite comment feed — tiles comment rows down the page so it reads
    // like an endless YouTube comments section as the camera scrolls. Rows are
    // deterministic per index, so they stay stable while scrolling.
    {
      const COMMENTS_TOP = 620, ROW_H = 100, CW = 580, CH = 88, CX = 24;
      const iStart = Math.max(0, Math.floor((topY - COMMENTS_TOP) / ROW_H));
      const iEnd = Math.floor((botY - COMMENTS_TOP) / ROW_H);
      // During the escape, the weird comment owns one grid row — skip the
      // normal comment there so they don't overlap.
      const escapeRow = state.escape
        ? Math.round((state.escape.commentY - COMMENTS_TOP) / ROW_H) : -1;
      const fc = state.agents.fallingComment;
      const fcRow = (state.phase === 'static' && fc.state !== 'idle') ? fc.commentIdx : -1;
      for (let i = iStart; i <= iEnd; i++) {
        if (i === escapeRow || i === fcRow) continue;
        const mortarState = (i % 3 === 1) ? this.commentMortars.get(i) : null;
        drawComment(ctx, CX, COMMENTS_TOP + i * ROW_H, CW, CH, i, false, null, mortarState, state.time);
      }
    }

    // ── Escape sequence: the broken hole + the weird comment that hides it. ──
    if (state.escape) {
      const prop = state.propaganda[0];
      const hole = state.truth[0];
      if (prop.dragging || prop.revealed) {
        this.drawHole(ctx, hole, state.escape.step === 'exit');
      }
      this.drawWeirdComment(ctx, prop);
    }

    // Cookie banner — Phase A only (Phase B's camera scrolls far past PH-40
    // where the banner is pinned, so it'd be off-screen anyway).
    if (state.phase === 'static') {
      CrushingCookie.drawBanner(ctx, state.agents.crushingCookie, state);
    }


    // crumbs
    for (const cr of state.crumbs) {
      ctx.save();
      ctx.translate(cr.x, cr.y);
      ctx.rotate(cr.rot);
      ctx.globalAlpha = Math.min(1, cr.life);
      ctx.fillStyle = cr.color;
      ctx.fillRect(-cr.size / 2, -cr.size / 2, cr.size, cr.size);
      ctx.restore();
    }

    // subscribe — decorative page chrome (the real exit is the hidden hole),
    // now sitting in the action row beside SHARE, with a bell next to it.
    {
      const ex = layout.subscribe;
      ctx.save();
      ctx.fillStyle = '#E63946';
      ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('SUBSCRIBE', ex.x + ex.w / 2, ex.y + ex.h / 2);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // bell (notifications) — sits beside SUBSCRIBE, like a real video page (FallingBell agent)
    FallingBell.drawAgent(ctx, state.agents.fallingBell, state);



    // bullets (gunShooter), search projectiles, debris (explodingLike)
    GunShooter.drawProjectiles(ctx, state);
    ShootingSearch.drawProjectiles(ctx, state);
    ExplodingLike.drawProjectiles(ctx, state);
    
    // Draw active road spikes
    for (const s of this.spikeThrowers.values()) {
      if (s.state === 'rolling' || s.state === 'extended' || s.state === 'retracting') {
        this.drawSpikes(ctx, s.x, s.y, s.spikeLength);
      }
    }
    
    // Draw active cannonballs
    for (const cb of state.cannonballs) {
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

    // sparks (cosmetic)
    for (const s of state.sparks) {
      if (s.hit) {
        ctx.fillStyle = 'rgba(230,57,70,' + (s.life * 1.5) + ')';
        ctx.fillRect(s.x, s.y, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,' + (s.life * 0.15) + ')';
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }

    // (Loose-cookie surface pickups + the old cookie-jar / doc X-ray
    //  under-layer were removed — leftovers from the discovery design with no
    //  role in the runner. The window keeps a dark "scanner" body so the
    //  scan-fragment reveal still reads through it.)
    {
      const p = state.player;
      const s = effectiveSize(p);
      const ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(px, py, s, ph); ctx.clip();
      ctx.fillStyle = '#110214';
      ctx.fillRect(px, py, s, ph);
      ctx.restore();
    }

    // Live X-ray decode of scan fragments — on top of the under-layer fill,
    // under the player chrome, so it reads as truth seen through the window.
    this.drawScanXray(ctx);

    // Phase-A overlays — fixed-position docs + gaze trackers + draggable
    // propaganda ads + the active falling-comment agent (which normally
    // isn't drawn in the scroller). Drawn here so they sit OVER the page
    // chrome but UNDER the player window.
    if (state.phase === 'static') {
      const fc = state.agents.fallingComment;
      if (fc.state !== 'idle') FallingComment.drawAgent(ctx, fc, state);
      this.drawPhaseAOverlays(ctx);
    }

    // Wave enemies (auto-scroll shooter waves) — drawn in world coords above
    // the page chrome so they appear to fly OVER the page. Phase B only.
    if (state.phase === 'scroller') {
      Waves.draw(ctx, state);
      // Hidden docs — drift up like enemies, proximity-revealed.
      HiddenDocs.draw(ctx, state);
      // Powerups drift up in the same world space — drawn after so they read
      // on top if they overlap.
      Powerups.draw(ctx, state);
    }

    // Floating world-space texts (rise + fade) from HP+ pickups etc.
    if (state.floatingTexts) {
      for (const ft of state.floatingTexts) {
        const k = ft.age / ft.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = ft.color || '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.font = "bold 700 22px 'Saira Condensed', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const y = ft.wy - k * 56;
        ctx.strokeText(ft.text, ft.wx, y);
        ctx.fillText(ft.text, ft.wx, y);
        ctx.textAlign = 'left';
        ctx.restore();
      }
    }

    // player
    {
      const p = state.player;
      // Effective size = HP-scaled × buff-scaled (shared with collision so
      // the window LOOKS the same as it COLLIDES — the visible shrink from
      // damage is real, not just cosmetic).
      const s = effectiveSize(p);
      const ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      ctx.save();
      // Immune-buff golden halo (drawn behind player)
      if (p.buffs.immune > 0) {
        const pulse = 0.6 + Math.sin(state.time * 8) * 0.4;
        ctx.strokeStyle = 'rgba(244, 211, 94, ' + (0.5 + pulse * 0.4) + ')';
        ctx.lineWidth = 5; ctx.shadowColor = 'rgba(244, 211, 94, 0.9)'; ctx.shadowBlur = 18;
        ctx.strokeRect(px - 4, py - 4, s + 8, ph + 8);
        ctx.shadowBlur = 0;
      }
      if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
      // Window-border glow when hovering un-scanned hidden content (§1 cue).
      if (state.scanFragments.some(f => !f.scanned && this.windowOverlaps(f))) {
        const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(' + SCAN.glowColor + ',' + (0.45 + pulse * 0.45) + ')';
        ctx.lineWidth = 3; ctx.shadowColor = 'rgba(' + SCAN.glowColor + ',0.9)'; ctx.shadowBlur = 12;
        ctx.strokeRect(px - 1, py - 1, s + 2, ph + 2);
        ctx.restore();
      }
      drawHandRect(ctx, px, py, s, ph, p.hitFlash > 0 ? '#fff' : 'transparent', '#1a1a1f', 50);
      // title bar
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(px + 1, py + 1, s - 2, 14);
      // close button (drawn first so the title text can clip up to it)
      ctx.fillStyle = '#E63946';
      ctx.fillRect(px + s - 13, py + 3, 9, 9);
      ctx.fillStyle = '#fff';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', px + s - 11, py + 8);
      // title text — shortens at small sizes AND is clipped to the bar so it
      // can never overflow the window when the player shrinks from damage.
      const label = s > 130 ? 'PRIMITIVE_ERROR.exe' : s > 80 ? 'ERROR.exe' : s > 50 ? 'ERR' : '';
      if (label) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(px + 4, py + 1, s - 19, 13);   // clip region stops before the × button
        ctx.clip();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, px + 5, py + 8);
        ctx.restore();
      }
      if (s > 50) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 10px ui-monospace, monospace';
        const t = '0x7F4C';
        const tw = ctx.measureText(t).width;
        ctx.fillText(t, px + s / 2 - tw / 2, py + ph / 2 + 4);
      }
      // Glass cracks — the window IS the health display (no HP bar)
      drawCracks(ctx, this.cracks, p.x, p.y, s, ph);
      ctx.restore();
    }

    // cursor
    if (state.cursor) {
      const cu = state.cursor;
      ctx.save();
      ctx.translate(cu.x, cu.y);
      ctx.fillStyle = '#0c0c0e';
      ctx.strokeStyle = '#E63946';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 38);
      ctx.lineTo(8, 30);
      ctx.lineTo(14, 42);
      ctx.lineTo(20, 38);
      ctx.lineTo(14, 26);
      ctx.lineTo(28, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const pulse = 18 + Math.sin(state.time * 10) * 3;
      ctx.strokeStyle = 'rgba(230,57,70,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(14, 22, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Screen-space overlays (outside the world transform)
    this.drawQuip(ctx);

    // Unified death screen — drawn last so it sits on top of everything.
    // Matches Level 1.1 exactly: dark backdrop + WINDOW CRASHED + R/ESC hint.
    if (this.state.status === 'lost') {
      drawCrashScreen(ctx, this.VW, this.VH);
    }
  }

  // ===== HUD =====
  updateHUD() {
    const state = this.state;
    const p = state.player;

    // ── Runner HUD (top-left task + top-right HP) ──
    if (this.runnerHud?.taskLine) {
      const step = state.escape?.step;
      // Bonus pickups (glass-repair docs) are tracked separately from the
      // required evidence — shown as ★ so the counter never lies about the
      // win requirement.
      const bonusSuffix = state.bonusCollected > 0 ? '  ·  ★' + state.bonusCollected : '';
      let line, prog;
      if (step === 'exit' || step === 'done') {
        line = '▸ Slip the window through the hole to escape!';
        prog = 'GO';
      } else if (state.escape) {
        line = 'Evidence secured — find the way out.';
        prog = state.docsCollected + ' / ' + state.docsTarget + bonusSuffix;
      } else if (state.phase === 'static') {
        line = 'Hold SPACE over the 5 gold docs to scan them.';
        prog = state.docsCollected + ' / ' + state.docsTarget + bonusSuffix;
      } else {
        line = 'Scan 5 pieces of evidence (hold SPACE) to take it down.';
        prog = state.docsCollected + ' / ' + state.docsTarget + bonusSuffix;
      }
      this.runnerHud.taskLine.textContent = line;
      this.runnerHud.taskProgress.textContent = prog;

      if (state.escape) {
        this.runnerHud.taskFrame?.classList.add('cleared');
      } else {
        this.runnerHud.taskFrame?.classList.remove('cleared');
      }
    }
    // (HP bar removed — health is the glass-crack state of the window itself.)

    // ── Legacy HUD writes (still set for any code path that reads them) ──
    if (this.hud.size) this.hud.size.textContent = Math.round(p.hp) + ' / ' + p.maxHp;
    if (this.hud.docs) this.hud.docs.textContent = state.docsCollected + ' / ' + state.docsTarget;
    if (this.hud.zoom) this.hud.zoom.textContent = Math.round(state.scrollSpeed);
  }

  updateCommentMortars(dt) {
    const state = this.state;
    const p = state.player;
    const viewH = this.scale.height;
    const topY = state.scrollY - 100;
    const botY = state.scrollY + viewH + 200;
    const COMMENTS_TOP = 620, ROW_H = 100, CX = 24;
    
    const iStart = Math.max(0, Math.floor((topY - COMMENTS_TOP) / ROW_H));
    const iEnd = Math.floor((botY - COMMENTS_TOP) / ROW_H);
    
    // Clean up far offscreen mortar states
    for (const [idx, m] of this.commentMortars.entries()) {
      if (m.cy < state.scrollY - 400) {
        this.commentMortars.delete(idx);
      }
    }
    
    // Initialize comment mortars in active range
    for (let i = iStart; i <= iEnd; i++) {
      if (i % 3 === 1) {
        if (!this.commentMortars.has(i)) {
          const slotY = COMMENTS_TOP + i * ROW_H;
          this.commentMortars.set(i, {
            state: 'idle',
            cx: CX + 22,
            cy: slotY + 22,
            angle: 0,
            barrelLength: 0,
            cooldown: 0,
            triggerR: 420,
          });
        }
      }
    }
    
    // Update active mortars
    const tMul = this.diffMod.triggerRange;
    for (const m of this.commentMortars.values()) {
      if (Math.abs(m.cy - state.scrollY) > viewH + 400) continue;
      
      const d = dist(p.x, p.y, m.cx, m.cy);
      
      if (m.state === 'idle') {
        m.barrelLength = 0;
        if (d < m.triggerR * tMul) {
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
        const speed = 260 * this.diffMod.agentSpeed;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        state.cannonballs.push({
          x: m.cx + Math.cos(angle) * (14 + m.barrelLength),
          y: m.cy + Math.sin(angle) * (14 + m.barrelLength),
          vx, vy, r: 6, life: 3.5
        });
        
        beep(120, 0.25, 'sawtooth', 0.08);
        noise(0.12, 0.08);
        
        const mx = m.cx + Math.cos(angle) * (14 + m.barrelLength);
        const my = m.cy + Math.sin(angle) * (14 + m.barrelLength);
        for (let j = 0; j < 6; j++) {
          state.sparks.push({
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
          if (d < m.triggerR * tMul) {
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
    const state = this.state;
    const p = state.player;
    const dmg = 10 * this.diffMod.agentDamage;
    for (const cb of state.cannonballs) {
      cb.x += cb.vx * dt;
      cb.y += cb.vy * dt;
      cb.life -= dt;
      
      const pbx = p.x - p.size / 2;
      const pby = p.y - p.size * 0.375;
      const pbw = p.size;
      const pbh = p.size * 0.75;
      if (cb.x > pbx && cb.x < pbx + pbw && cb.y > pby && cb.y < pby + pbh) {
        damagePlayer(state, dmg, 0, 0);
        cb.life = 0;
        for (let j = 0; j < 8; j++) {
          state.sparks.push({
            x: cb.x, y: cb.y,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 0.3, hit: true
          });
        }
        beep(80, 0.3, 'sawtooth', 0.15);
      }
    }
    state.cannonballs = state.cannonballs.filter(cb => cb.life > 0);
  }

  updateSpikeThrowers(dt) {
    const state = this.state;
    const p = state.player;
    const viewH = this.scale.height;
    const topY = state.scrollY - 100;
    const botY = state.scrollY + viewH + 200;
    const RECS_TOP = 70, ROW_H = 96, CX = 620;
    
    const iStart = Math.max(0, Math.floor((topY - RECS_TOP) / ROW_H));
    const iEnd = Math.floor((botY - RECS_TOP) / ROW_H);
    
    // Clean up far offscreen spike throwers
    for (const [idx, s] of this.spikeThrowers.entries()) {
      if (s.y < state.scrollY - 400) {
        this.spikeThrowers.delete(idx);
      }
    }
    
    // Initialize spike throwers
    for (let i = iStart; i <= iEnd; i++) {
      if (i === 3 || i === 6) {
        if (!this.spikeThrowers.has(i)) {
          const slotY = RECS_TOP + i * ROW_H;
          this.spikeThrowers.set(i, {
            state: 'idle',
            x: CX,
            y: slotY + 43,
            t: 0,
            spikeLength: 0,
            cooldown: 0,
          });
        }
      }
    }
    
    // Update active throwers
    for (const s of this.spikeThrowers.values()) {
      if (Math.abs(s.y - state.scrollY) > viewH + 400) continue;
      
      const d = dist(p.x, p.y, s.x, s.y);
      
      if (s.state === 'idle') {
        s.spikeLength = 0;
        if (Math.abs(p.y - s.y) < 150 && p.x < 620 && s.cooldown <= 0) {
          s.state = 'telegraph';
          s.t = 0;
          beep(350, 0.1, 'sawtooth', 0.05);
        }
      } else if (s.state === 'telegraph') {
        s.t += dt;
        if (s.t >= 0.6) {
          s.state = 'rolling';
          s.t = 0;
          noise(0.2, 0.05);
        }
      } else if (s.state === 'rolling') {
        s.t += dt;
        s.spikeLength += 900 * dt * this.diffMod.agentSpeed;
        if (s.spikeLength >= 330 || s.t >= 0.4) {
          s.spikeLength = 330;
          s.state = 'extended';
          s.t = 0;
        }
        this.checkSpikeCollision(s, p);
      } else if (s.state === 'extended') {
        s.t += dt;
        if (s.t >= 1.2) {
          s.state = 'retracting';
          s.t = 0;
        }
        this.checkSpikeCollision(s, p);
      } else if (s.state === 'retracting') {
        s.t += dt;
        s.spikeLength -= 600 * dt;
        if (s.spikeLength <= 0) {
          s.spikeLength = 0;
          s.state = 'cooldown';
          s.cooldown = 3.5;
        }
      } else if (s.state === 'cooldown') {
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          s.state = 'idle';
        }
      }
    }
  }

  checkSpikeCollision(s, p) {
    const pbx = p.x - p.size / 2;
    const pby = p.y - p.size * 0.375;
    const pbw = p.size;
    const pbh = p.size * 0.75;
    
    const inY = (s.y > pby && s.y < pby + pbh);
    const inX = (p.x + pbw/2 > s.x - s.spikeLength && p.x - pbw/2 < s.x);
    if (inY && inX) {
      const dmg = (DAMAGE.roadSpike || 25) * this.diffMod.agentDamage;
      damagePlayer(this.state, dmg, 0, 0, false);
      beep(80, 0.4, 'sawtooth', 0.2);
      noise(0.4, 0.3);
    }
  }

  drawSpikes(ctx, sx, sy, length) {
    ctx.save();
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - length, sy);
    ctx.stroke();

    ctx.strokeStyle = '#F4D35E';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - length, sy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#7d8e98';
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 1;
    for (let x = sx - 6; x >= sx - length; x -= 8) {
      ctx.beginPath();
      ctx.moveTo(x - 2.5, sy - 2);
      ctx.lineTo(x, sy - 10);
      ctx.lineTo(x + 2.5, sy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 2.5, sy + 2);
      ctx.lineTo(x, sy + 10);
      ctx.lineTo(x + 2.5, sy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

}
