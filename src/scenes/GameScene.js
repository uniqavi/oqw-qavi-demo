import Phaser from 'phaser';
import { PW, PH, PLAYER, CAMERA, GAZE, PICKUPS, RENDER, DIFFICULTY, L1, SCAN, SCROLL, POWERUP } from '../config.js';
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
import * as Waves from '../game/waveEnemies.js';
import * as Powerups from '../game/powerups.js';
import * as HiddenDocs from '../game/hiddenDocs.js';
import { effectiveSize } from '../game/playerSize.js';
import { startEndSequence, updateEndSequence, drawArcs, PHASE_DURATIONS } from '../game/endSequence.js';
import { crossfadeTo, stopMusic } from '../game/music.js';
import { playSfx } from '../game/sfx.js';
import { playVoice, stopVoice } from '../game/voice.js';

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

    // Swap menu music → L1 theme. Crossfade so it feels continuous.
    crossfadeTo('level1', { fadeMs: 1500 });

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
    // Show the runner frames while this scene is active
    this.runnerHud.taskFrame?.classList.remove('hidden');
    this.runnerHud.hpFrame?.classList.remove('hidden');

    // Solo-YOU intro after the 1.1 → 1.2 transition: Toto is gone, the player
    // is now inside the boosted video.
    if (this.fromHomePage) {
      setTimeout(() => {
        this.startNarration([
          { speaker: 'YOU', text: "Okay... I'm inside the video. This isn't a video. It's a feed — and it's hostile." },
          { speaker: 'YOU', text: "If I find five pieces of evidence in here, I can take this thing down myself." },
          { speaker: 'YOU', text: "Stay sharp. No Toto on the line." },
        ]);
      }, 600);
    }

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

    // End-sequence DOM refs (malware install + glitch wipe)
    this.endDom = {
      wrap:    document.getElementById('end-sequence'),
      install: document.getElementById('malware-install'),
      fill:    document.getElementById('malware-fill'),
      pct:     document.getElementById('malware-pct'),
      sweep:   document.getElementById('glitch-sweep'),
    };
    this.canvasWrapEl = document.querySelector('.canvas-wrap');
    this.endSeq = null;

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
      if (this.state.status === 'won') {
        if (e.key === 'Escape') { e.preventDefault(); this.backToMenu(); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.restart(); }
      } else if (this.state.status === 'lost') {
        if (e.key === 'Escape') { e.preventDefault(); this.backToMenu(); }
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

    // Tab system — locked tabs no-op until L1 ends. spygram.hush tab swaps
    // into Level 2 after the post-mission state begins.
    this.tabEls = document.querySelectorAll('#browser-tabs .tab');
    this.onTabClick = (e) => {
      const el = e.currentTarget;
      if (el.classList.contains('locked')) return;
      if (el.classList.contains('plus')) return;
      // SPYGRAM tab: switch to L2 scene (only if unlocked, i.e. post-mission)
      if (el.dataset.tab === 'spygram' && this.state.status === 'won') {
        const urlBar = document.getElementById('browser-url');
        if (urlBar) urlBar.textContent = 'https://spygram.hush/auth?session=lewis';
        this.tabEls.forEach((t) => t.classList.remove('active'));
        el.classList.add('active');
        this.canvasWrapEl?.classList.remove('post-mission');
        this.scene.stop();
        this.scene.start('Level2Scene');
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
      // Reset end-sequence + intel DOM so nothing leaks across re-entries
      this.endDom?.wrap?.classList.add('hidden');
      this.endDom?.install?.classList.remove('show');
      this.endDom?.sweep?.classList.remove('run');
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
    for (let i = this.state.propaganda.length - 1; i >= 0; i--) {
      const p = this.state.propaganda[i];
      const m = this.state.mouse;
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
  }
  backToMenu() {
    if (this.overlayEl) this.overlayEl.classList.remove('show');
    this.resetResultsUI();
    document.body.classList.add('menu-mode');
    crossfadeTo('menu', { fadeMs: 800 });
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
    // Clean up end-sequence DOM so a restart starts from a known state
    this.endDom?.wrap?.classList.add('hidden');
    this.endDom?.install?.classList.remove('show');
    this.endDom?.sweep?.classList.remove('run');
    if (this.endDom?.fill) this.endDom.fill.style.width = '0%';
    if (this.endDom?.pct) this.endDom.pct.textContent = '0%';
    // Intel dialog + post-mission banner reset
    this.intelDom?.wrap?.classList.add('hidden');
    this.intelDom?.wrap?.classList.remove('show');
    if (this.intelDom?.line) this.intelDom.line.textContent = '';
    if (this.intelDom?.hint) this.intelDom.hint.classList.remove('show');
    this.postMissionEl?.classList.add('hidden');
    this.postMissionEl?.classList.remove('show');
    // Restart wipes the post-mission dim so the page is "live" again
    this.canvasWrapEl?.classList.remove('post-mission');
    this.firstAdDragged = false;
    this.endSeq = null;
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

  // ===== End sequence (malware install → short-circuit arcs → glitch wipe) =====
  beginEndSequence() {
    if (this.endSeq) return;
    this.endSeq = startEndSequence(this.state);
    this.state.status = 'ending';
    // Show DOM overlay + install bar
    this.endDom.wrap?.classList.remove('hidden');
    this.endDom.install?.classList.add('show');
  }
  tickEndSequenceDom() {
    const es = this.endSeq;
    if (!es) return;
    if (es.phase === 'install') {
      const pct = Math.min(100, Math.round((es.t / PHASE_DURATIONS.install) * 100));
      if (this.endDom.fill) this.endDom.fill.style.width = pct + '%';
      if (this.endDom.pct) this.endDom.pct.textContent = pct + '%';
    } else if (es.phase === 'sweep') {
      // Install bar done — hide it so the canvas sweep takes the stage
      this.endDom.install?.classList.remove('show');
    }
  }

  // Cinematic camera driver — runs during state.status === 'ending'.
  // Install phase: smoothly pan from player position up to the top of the page.
  // Sweep phase: keep the descending sweep line at ~30% of the viewport so
  // the player sees enemies above (about to die) and below (already dead).
  updateCinematicCamera(dt) {
    const es = this.endSeq;
    if (!es) return;
    const cam = this.state.cam;

    // Lock zoom to baseZoom (full-page-width fit) so framing is predictable
    cam.targetZoom = cam.baseZoom;

    const viewW = this.VW / cam.zoom;
    const viewH = this.VH / cam.zoom;
    const maxCamY = Math.max(0, PH - viewH);
    const targetX = (PW - viewW) / 2;

    let targetY = cam.y;
    if (es.phase === 'install') {
      // Save the camera's starting position once, then ease it toward 0
      if (es.camStartY === undefined) es.camStartY = cam.y;
      const tRaw = Math.min(1, es.t / PHASE_DURATIONS.install);
      const eased = tRaw < 0.5
        ? 2 * tRaw * tRaw
        : 1 - Math.pow(-2 * tRaw + 2, 2) / 2;
      targetY = es.camStartY * (1 - eased);
    } else if (es.phase === 'sweep') {
      // Position the sweep line ~30% from the top of the viewport so the
      // player sees the kill happen with breathing room around it.
      targetY = es.sweepY - viewH * 0.3;
      targetY = Math.max(0, Math.min(maxCamY, targetY));
    }

    // Smooth follow — fairly tight so the camera doesn't lag behind the sweep
    cam.y += (targetY - cam.y) * Math.min(1, dt * 5);
    cam.x += (targetX - cam.x) * Math.min(1, dt * 3);
  }
  finishEndSequence() {
    // Hide overlays + apply post-mission dim
    this.endDom.wrap?.classList.add('hidden');
    this.endDom.sweep?.classList.remove('run');
    this.sweepRun = false;
    this.canvasWrapEl?.classList.add('post-mission');
    // Unlock the SPYGRAM tab with a pulse animation
    const spygramTab = document.querySelector('#browser-tabs .tab[data-tab="spygram"]');
    if (spygramTab) {
      spygramTab.classList.remove('locked');
      spygramTab.removeAttribute('data-tooltip');
      spygramTab.innerHTML = '<span class="dot">●</span>spygram.hush<span class="x">×</span>';
      spygramTab.classList.add('unlocking');
    }
    this.state.status = 'won';
    // Show the small post-mission banner instead of the big results screen
    this.postMissionEl?.classList.remove('hidden');
    requestAnimationFrame(() => this.postMissionEl?.classList.add('show'));
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
      this.overlaySubEl.textContent = 'malware planted. page short-circuited. new tab open — spygram.hush';
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
    if (!this.state.intelDialog && !this.state.tipShowing && !this.state.narration) this.state.time += dt;

    // Smooth zoom toward target
    const c = this.state.cam;
    c.zoom += (c.targetZoom - c.zoom) * Math.min(1, dt * CAMERA.zoomLerp);

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

    if (this.state.status === 'playing' && !this.state.intelDialog && !this.state.tipShowing && !this.state.narration) {
      this.runGameLogic(dt);
      this.updateOnboardingTips();
    } else if (this.state.status === 'playing' && !this.state.intelDialog && this.state.tipShowing) {
      // Tip is up — game paused. Still check if a new tip should show
      // (e.g. on first frame after game starts, before tipShowing was set).
      // Skip in normal cases since tipShowing is true.
    } else if (this.state.intelDialog) {
      // Game paused while reading the intel memo — only typewriter ticks
      // run (driven by its own setTimeout). Don't advance time/gaze/agents.
    } else if (this.state.status === 'ending') {
      // Cinematic camera during the end sequence:
      //   install phase → pan from player position up to the top of the page
      //   sweep phase   → follow the descending sweep line down to the bottom
      this.updateCinematicCamera(dt);
      const done = updateEndSequence(this.endSeq, dt, this.state);
      this.tickEndSequenceDom();
      if (done) this.finishEndSequence();
    }

    this.render();
    this.updateHUD();
    // Only the LOSS path shows the big results screen. WIN goes straight to
    // post-mission state (banner + secured page) per the new design.
    if (this.state.status === 'lost' && !this.overlayEl?.classList.contains('show')) {
      this.showOverlay();
    }
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
    const viewW = this.VW / c.zoom;
    const viewH = this.VH / c.zoom;
    const prevScrollY = state.scrollY;
    if (state.escape) {
      this.updateEscapeScroll(dt, viewH);
    } else {
      let baseRamped;
      if (state.time < SCROLL.slowDuration) {
        baseRamped = SCROLL.slowSpeed;
      } else {
        const rampT = Math.min(1, (state.time - SCROLL.slowDuration) / SCROLL.rampDuration);
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
    // viewport-relative Y when no input.
    p.y += dScroll;

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

    // Step 3: clamp horizontally to the page; vertically to the viewport.
    // The bottom clamp is intentional — the player can ride at the bottom
    // edge, but they're then directly in the enemy-spawn line. effSize is
    // HP-scaled + buff-scaled so the window literally shrinks with damage.
    const effSize = effectiveSize(p);
    p.x = Phaser.Math.Clamp(p.x, effSize / 2, PW - effSize / 2);
    const viewTop = state.scrollY + 30;
    const viewBot = state.scrollY + viewH - 30 - effSize * 0.75;
    p.y = Phaser.Math.Clamp(p.y, viewTop, viewBot);

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.growT > 0) p.growT -= dt;

    // ── Wave enemies + powerups + hidden docs ─────────────────────────────
    // During the escape sequence we stop spawning new threats/docs and let
    // any in-flight ones clear. Enemies still update so they fly off-screen.
    if (!state.escape) {
      Waves.tickSpawner(state, dt, viewH);
      Powerups.tick(state, dt, viewH);
      const docsBefore = state.docsCollected;
      HiddenDocs.tick(state, dt, viewH);
      if (state.docsCollected > docsBefore) {
        beep(880, 0.08, 'sine', 0.13);
        setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
        // Collected the last doc → kick off the escape sequence.
        if (state.docsCollected >= state.docsTarget) this.beginEscape();
      }
    }
    Waves.update(state, dt, viewH);

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

    // X-ray scanning (spatial) — the truth shows only through the window.
    // Sweep the window across an element to cover it; once enough of its width
    // has been swept, the reveal latches persistent. Free + optional — does
    // not gate the win.
    {
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

    // Agents — Level 1 runs a REDUCED set for accessibility (see config L1).
    // Disabled agents are simply never updated, so they stay idle and render
    // as harmless page components. Projectile-cleanup loops always run so any
    // in-flight projectiles still despawn cleanly.
    ChasingRecs.updateAll(state.agents.chasingRecs.slice(0, L1.activeChasingRecs), dt, state);
    if (L1.shootingSearch) ShootingSearch.update(state.agents.shootingSearch, dt, state);
    ShootingSearch.updateProjectiles(state, dt);
    if (L1.fallingComment) FallingComment.update(state.agents.fallingComment, dt, state);
    if (L1.explodingLike) ExplodingLike.update(state.agents.explodingLike, dt, state);
    ExplodingLike.updateProjectiles(state, dt);
    if (L1.crushingCookie) CrushingCookie.update(state.agents.crushingCookie, dt, state);
    // Gun shooter — gated by the difficulty grace period so new players get a
    // chance to learn the controls before it can fire.
    if (L1.gunShooter && state.time >= state.gunGraceUntil) {
      GunShooter.update(state.agents.gunShooter, dt, state);
    }
    GunShooter.updateProjectiles(state, dt);

    // (Old hole win-trigger removed — the escape sequence owns the exit now.)
  }

  // ===== ESCAPE SEQUENCE (after the 5 docs are collected) =====
  // Beat list:
  //   1. narration: "looks like we got what we needed. how do we get out?"
  //   2. scroll decelerates; the weird comment scrolls into frame and stops
  //   3. narration: "that comment looks different... something behind it"
  //   4. player drags the weird comment aside → reveals the broken hole
  //   5. narration: "that's an exit. let's go."
  //   6. player moves the window into the hole → (placeholder) next level
  beginEscape() {
    const state = this.state;
    if (state.escape) return;
    const viewH = this.VH / state.cam.zoom;
    // Place the weird comment ~1.2 viewports below the current scroll so it
    // scrolls into view as the page decelerates. Snap it to the comment-feed
    // grid (top 620, row 100) so it replaces a row cleanly instead of
    // overlapping its neighbours.
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
    state.escape = { step: 'narrate1', commentY, stopY, t: 0 };
    // Narration 1 — player's own voice.
    this.startNarration([
      { speaker: 'YOU', text: 'Looks like we got what we needed.' },
      { speaker: 'YOU', text: 'Now... how do we get out of here?' },
    ], () => { state.escape.step = 'toComment'; });
  }

  // Scroll-owning half of the escape — runs early (before player movement) so
  // dScroll reflects the deceleration. Eases the camera to a stop with the
  // weird comment in frame, then hands off to narration 2.
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
        esc.step = 'narrate2';
        this.startNarration([
          { speaker: 'YOU', text: 'Hold on — look at that comment.' },
          { speaker: 'YOU', text: "It looks a little different than the others. There's something behind it, I suspect." },
        ], () => { esc.step = 'drag'; });
      }
    } else {
      // All other escape steps freeze the scroll.
      state.scrollSpeed = 0;
      if (esc.step !== 'narrate1') state.scrollY = esc.stopY;
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
        esc.step = 'narrate3';
        this.startNarration([
          { speaker: 'YOU', text: 'Oh, damn.' },
          { speaker: 'YOU', text: "That looks like an exit. Let's go, then." },
        ], () => { esc.step = 'exit'; });
      }
    } else if (esc.step === 'exit') {
      const hole = state.truth[0];
      if (p.x > hole.x + 40 && p.x < hole.x + hole.w - 40 &&
          p.y > hole.y - 10 && p.y < hole.y + hole.h + 10) {
        esc.step = 'done';
        beep(523, 0.1, 'sine', 0.1);
        setTimeout(() => beep(659, 0.1, 'sine', 0.1), 90);
        setTimeout(() => beep(784, 0.2, 'sine', 0.12), 200);
        // PLACEHOLDER for the next level / dark-tunnel transition. For now,
        // a final narration then flip to 'won' so the run resolves cleanly.
        this.startNarration([
          { speaker: 'SYSTEM', text: '> slipping through the gap...' },
          { speaker: 'SYSTEM', text: '> [ next level + tunnel animation goes here ]' },
        ], () => {
          state.status = 'won';
          state.stats.endedAt = state.time;
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

    // sidebar recs — empty slot if a chasing rec is currently away from it
    for (let i = 0; i < recSlots.length; i++) {
      const slot = recSlots[i];
      if (ChasingRecs.isAgentSlot(state.agents.chasingRecs, i)) {
        ChasingRecs.drawEmptySlot(ctx, slot);
      } else {
        drawRecCard(ctx, slot.x, slot.y, slot.w, slot.h, i, false, null, state.time);
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
      for (let i = iStart; i <= iEnd; i++) {
        if (i === escapeRow) continue;
        drawComment(ctx, CX, COMMENTS_TOP + i * ROW_H, CW, CH, i, false, null);
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

    // (Cookie banner disabled — was pinned to PH-40 which is far off-screen now.)
    // CrushingCookie.drawBanner(ctx, state.agents.crushingCookie, state);


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

    // bell (notifications) — sits beside SUBSCRIBE, like a real video page
    {
      const bl = layout.bellBtn;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 1;
      ctx.fillRect(bl.x, bl.y, bl.w, bl.h);
      ctx.strokeRect(bl.x, bl.y, bl.w, bl.h);
      ctx.fillStyle = '#1a1a1f';
      ctx.font = '14px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('🔔', bl.x + bl.w / 2, bl.y + bl.h / 2 + 1);
      ctx.textAlign = 'left';
      ctx.restore();
    }



    // bullets (gunShooter), search projectiles, debris (explodingLike)
    GunShooter.drawProjectiles(ctx, state);
    ShootingSearch.drawProjectiles(ctx, state);
    ExplodingLike.drawProjectiles(ctx, state);

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

    // Wave enemies (auto-scroll shooter waves) — drawn in world coords above
    // the page chrome so they appear to fly OVER the page.
    Waves.draw(ctx, state);
    // Hidden docs — drift up like enemies, proximity-revealed.
    HiddenDocs.draw(ctx, state);
    // Powerups drift up in the same world space — drawn after so they read
    // on top if they overlap.
    Powerups.draw(ctx, state);

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

    // End-sequence electrical arcs (drawn last so they overlay everything in world space)
    if (this.endSeq) drawArcs(ctx, this.endSeq, state);

    ctx.restore();

    // Screen-space overlays (outside the world transform)
    this.drawQuip(ctx);
  }

  // ===== HUD =====
  updateHUD() {
    const state = this.state;
    const p = state.player;

    // ── Runner HUD (top-left task + top-right HP) ──
    if (this.runnerHud?.taskLine) {
      const step = state.escape?.step;
      let line, prog;
      if (step === 'exit' || step === 'done') {
        line = '▸ Slip the window through the hole to escape!';
        prog = 'GO';
      } else if (state.escape) {
        line = 'Evidence secured — find the way out.';
        prog = state.docsCollected + ' / ' + state.docsTarget;
      } else {
        line = 'Collect 5 pieces of evidence to take it down.';
        prog = state.docsCollected + ' / ' + state.docsTarget;
      }
      this.runnerHud.taskLine.textContent = line;
      this.runnerHud.taskProgress.textContent = prog;
    }
    if (this.runnerHud?.hpFill) {
      const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
      this.runnerHud.hpFill.style.width = hpPct + '%';
      // Color shifts as HP drops
      this.runnerHud.hpFill.style.background =
        hpPct > 60 ? 'linear-gradient(90deg, #2D8659 0%, #6dc89e 100%)'
        : hpPct > 30 ? 'linear-gradient(90deg, #F4D35E 0%, #ffe48a 100%)'
        : 'linear-gradient(90deg, #E63946 0%, #ff6b73 100%)';
      this.runnerHud.hpNumber.textContent = p.hp + ' / ' + p.maxHp;
    }

    // ── Legacy HUD writes (still set for any code path that reads them) ──
    if (this.hud.size) this.hud.size.textContent = p.hp + ' / ' + p.maxHp;
    if (this.hud.docs) this.hud.docs.textContent = state.docsCollected + ' / ' + state.docsTarget;
    if (this.hud.zoom) this.hud.zoom.textContent = Math.round(state.scrollSpeed);
  }

}
