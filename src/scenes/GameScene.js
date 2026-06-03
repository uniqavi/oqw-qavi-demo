import Phaser from 'phaser';
import { PW, PH, PLAYER, CAMERA, GAZE, PICKUPS, RENDER, DIFFICULTY, L1, SCAN } from '../config.js';
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
import { startEndSequence, updateEndSequence, drawArcs, PHASE_DURATIONS } from '../game/endSequence.js';
import { crossfadeTo, stopMusic } from '../game/music.js';
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

    // HUD DOM refs
    this.hud = {
      size: document.getElementById('ui-size'),
      gaze: document.getElementById('ui-gaze'),
      docs: document.getElementById('ui-docs'),
      cookie: document.getElementById('ui-cookie'),
      zoom: document.getElementById('ui-zoom'),
      hint: document.getElementById('ui-hint'),
    };

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
    // Click anywhere on the intel dialog → advance. Also Space.
    this.onIntelClick = (e) => {
      if (this.state.intelDialog) {
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
    for (let i = this.state.propaganda.length - 1; i >= 0; i--) {
      const p = this.state.propaganda[i];
      const m = this.state.mouse;
      if (m.x >= p.x && m.x <= p.x + p.w && m.y >= p.y && m.y <= p.y + p.h) {
        p.dragging = true;
        p.dox = m.x - p.x;
        p.doy = m.y - p.y;
        beep(420, 0.04, 'square', 0.04);
        // Dismiss the "drag ad" onboarding tip — they did it
        this.firstAdDragged = true;
        if (this.currentTip === 'drag-ad') this.hideTip();
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
    const state = this.state;
    if (state.status !== 'playing') { this.hideTip(false); return; }
    if (this.currentTip) return; // a tip is already on screen
    if (this.shouldShowTip('drag-ad') && state.time < 8 && !this.firstAdDragged) {
      this.showTip(ONBOARDING_TIPS[0]); return;
    }
    if (this.shouldShowTip('docs') && state.time > 8 && state.docsCollected === 0) {
      this.showTip(ONBOARDING_TIPS[1]); return;
    }
    if (this.shouldShowTip('cookies') && state.docsCollected === state.docs.length && !state.cookieCollected) {
      this.showTip(ONBOARDING_TIPS[2]); return;
    }
    if (this.shouldShowTip('exfil') && state.docsCollected === state.docs.length && state.cookieCollected) {
      this.showTip(ONBOARDING_TIPS[3]); return;
    }
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
    if (!this.state.intelDialog && !this.state.tipShowing) this.state.time += dt;

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

    if (this.state.status === 'playing' && !this.state.intelDialog && !this.state.tipShowing) {
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

    // Player movement
    const speedMult = 1.5 - (p.size / 200) * 0.7;
    const speed = PLAYER.baseSpeed * speedMult;
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.wasd.down.isDown || this.cursors.down.isDown) vy += 1;
    if (vx || vy) {
      const len = Math.hypot(vx, vy);
      vx /= len; vy /= len;
      if (Math.random() < 0.06) beep(700 + Math.random() * 500, 0.015, 'square', 0.02);
    }
    p.x += vx * speed * dt;
    p.y += vy * speed * dt;
    p.x = Phaser.Math.Clamp(p.x, p.size / 2, PW - p.size / 2);
    p.y = Phaser.Math.Clamp(p.y, p.size * 0.4, PH - p.size * 0.4);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.growT > 0) p.growT -= dt;

    // Camera follow
    const viewW = this.VW / c.zoom;
    const viewH = this.VH / c.zoom;
    c.x += ((p.x - viewW / 2) - c.x) * Math.min(1, dt * CAMERA.followLerp);
    c.y += ((p.y - viewH / 2) - c.y) * Math.min(1, dt * CAMERA.followLerp);
    c.x = PW > viewW ? Phaser.Math.Clamp(c.x, 0, PW - viewW) : (PW - viewW) / 2;
    c.y = PH > viewH ? Phaser.Math.Clamp(c.y, 0, PH - viewH) : (PH - viewH) / 2;

    // Propaganda dragging
    for (const prop of state.propaganda) {
      if (prop.dragging) {
        prop.x = state.mouse.x - prop.dox;
        prop.y = state.mouse.y - prop.doy;
        prop.x = Phaser.Math.Clamp(prop.x, 0, PW - prop.w);
        prop.y = Phaser.Math.Clamp(prop.y, 50, PH - prop.h);
      }
    }

    // Reveal the hidden passage: once the suspicious comment is dragged far
    // enough off its home spot, the hole behind it is uncovered. Latches, and
    // plays the intel memo once (you read what they were hiding as you open
    // the passage). Gaze/cursor is disabled in L1, so no gaze accumulation.
    {
      const prop = state.propaganda[0];
      const movedAway = Math.hypot(prop.x - prop.homeX, prop.y - prop.homeY) > 70;
      if (movedAway && !prop.revealed) {
        prop.revealed = true;
        noise(0.3, 0.14);
        beep(90, 0.45, 'sawtooth', 0.09);   // wall cracking open
        this.startIntel();                   // self-guards against re-trigger
      }
    }

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

    // Docs
    for (const d of state.docs) {
      if (d.taken) continue;
      if (dist(p.x, p.y, d.x, d.y) < d.r + p.size * PICKUPS.pickRadiusMult) {
        d.taken = true;
        d.takeT = state.time;
        state.docsCollected++;
        p.size = Math.min(PLAYER.maxSize, p.size + PICKUPS.docGrowth);
        beep(880, 0.08, 'sine', 0.13);
        beep(1320, 0.12, 'sine', 0.1);
      }
    }

    // Surface Pickups
    for (const d of state.looseCookies) {
      if (d.taken) continue;
      if (dist(p.x, p.y, d.x, d.y) < d.r + p.size * PICKUPS.pickRadiusMult) {
        d.taken = true;
        d.takeT = state.time;
        p.size = Math.min(PLAYER.maxSize, p.size + PICKUPS.crumbGrowth);
      }
    }

    // Cookie jar
    const cj = state.cookieJar;
    if (!cj.taken && dist(p.x, p.y, cj.x, cj.y) < cj.r + p.size * PICKUPS.pickRadiusMult) {
      cj.taken = true;
      cj.takeT = state.time;
      state.cookieCollected = true;
      p.size = Math.min(PLAYER.maxSize, p.size + PICKUPS.cookieGrowth);
      p.growT = PICKUPS.cookieGrowDuration;
      for (let i = 0; i < RENDER.crumbCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 100 + Math.random() * 200;
        state.crumbs.push({
          x: cj.x, y: cj.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100,
          rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 8,
          life: 1.5, size: 4 + Math.random() * 4,
          color: RENDER.crumbColors[Math.floor(Math.random() * RENDER.crumbColors.length)],
        });
      }
      beep(440, 0.1, 'sine', 0.12);
      setTimeout(() => beep(660, 0.1, 'sine', 0.12), 80);
      setTimeout(() => beep(880, 0.18, 'sine', 0.14), 180);
      setTimeout(() => beep(1320, 0.25, 'sine', 0.12), 320);
    }

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

    // Win trigger — slip through the revealed hole once everything's
    // collected. Replaces the old "reach SUBSCRIBE" exit. Starts the malware
    // install → short-circuit → glitch-wipe sequence, which flips status to
    // 'won' and runs the results overlay.
    if (state.docsCollected === state.docs.length && state.cookieCollected) {
      const prop = state.propaganda[0];
      const hole = state.truth[0];
      if (prop.revealed &&
          p.x > hole.x && p.x < hole.x + hole.w &&
          p.y > hole.y - 12 && p.y < hole.y + hole.h + 12) {
        state.stats.endedAt = state.time;
        beep(523, 0.1, 'sine', 0.1);
        setTimeout(() => beep(659, 0.1, 'sine', 0.1), 80);
        setTimeout(() => beep(784, 0.18, 'sine', 0.12), 180);
        setTimeout(() => beep(1047, 0.25, 'sine', 0.1), 320);
        this.beginEndSequence();
      }
    }
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

    // Exit cue once everything's collected
    if (ready) {
      const pulse = 0.5 + Math.sin(t * 5) * 0.5;
      ctx.fillStyle = 'rgba(124, 208, 235, ' + (0.55 + pulse * 0.45) + ')';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('↳ SLIP THROUGH TO ESCAPE', cx, cy);
      ctx.textAlign = 'left';
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

    // page bg + grid
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, PW, PH);
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= PW; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, PH); }
    for (let i = 0; i <= PH; i += 40) { ctx.moveTo(0, i); ctx.lineTo(PW, i); }
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

    // comments — skip the falling-comment slot (drawn separately below) and
    // slot 2, which is the suspicious (draggable) comment + hole behind it.
    for (let i = 0; i < commentSlots.length; i++) {
      if (i === 2) continue;
      if (FallingComment.isAgentSlot(state.agents.fallingComment, i)) continue;
      const slot = commentSlots[i];
      drawComment(ctx, slot.x, slot.y, slot.w, slot.h, i, false, null);
    }
    if (state.agents.fallingComment.state !== 'idle') {
      FallingComment.drawAgent(ctx, state.agents.fallingComment, state);
    }

    // The hidden passage (hole) behind the suspicious comment. Only drawn
    // once the player starts moving the comment, so it stays concealed until
    // uncovered. The comment is drawn AFTER, so when home it covers the hole.
    {
      const prop = state.propaganda[0];
      const hole = state.truth[0];
      if (prop.dragging || prop.revealed) {
        const ready = state.docsCollected === state.docs.length && state.cookieCollected;
        this.drawHole(ctx, hole, ready);
      }
    }

    // The suspicious comment — looks like a normal comment but greyer, so the
    // player senses something's off. Draggable; pulling it aside reveals the
    // hole behind it.
    for (const prop of state.propaganda) {
      ctx.save();
      if (prop.dragging) {
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 5;
      }
      // Grey card (real-comment layout, just desaturated)
      drawHandRect(ctx, prop.x, prop.y, prop.w, prop.h, '#d6d6d6', '#b0b0b0', 200, 1.2);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Avatar
      ctx.fillStyle = '#9a9a9a';
      ctx.beginPath();
      ctx.arc(prop.x + 22, prop.y + 22, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0f0f0';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('?', prop.x + 22, prop.y + 23);
      ctx.textAlign = 'left';

      // Username + timestamp (looks normal)
      ctx.fillStyle = '#5a5a5a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('@user_?   •   2 hours ago', prop.x + 44, prop.y + 8);

      // Comment text — innocuous but a touch too eager (the "fishy" tell)
      ctx.fillStyle = '#6a6a6a';
      ctx.font = '11px sans-serif';
      ctx.fillText("yeah totally, nothing weird going on here. move along.", prop.x + 44, prop.y + 28);

      // Footer (likes / reply)
      ctx.fillStyle = '#999999';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('👍 0   👎   reply', prop.x + 44, prop.y + 56);

      // Early drag hint
      if (!prop.dragging && !prop.revealed && state.time < 12) {
        const pulse = 0.5 + Math.sin(state.time * 4) * 0.3;
        ctx.fillStyle = 'rgba(230, 57, 70, ' + pulse + ')';
        ctx.font = 'bold 9px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('▸ drag this aside', prop.x + prop.w - 12, prop.y + prop.h - 14);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    }

    // cookie banner (driven by CrushingCookie agent state)
    CrushingCookie.drawBanner(ctx, state.agents.crushingCookie, state);


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

    // surface pickups
    for (const c of state.looseCookies) {
      if (c.taken) continue;
      ctx.fillStyle = '#C68642';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a1a05';
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y - 1, 1, 0, Math.PI * 2);
      ctx.arc(c.x + 2, c.y + 2, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== HIDDEN UNDER-LAYER =====
    {
      const p = state.player;
      const s = p.size;
      const ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, s, ph);
      ctx.clip();

      // under-layer background
      ctx.fillStyle = '#110214'; // dark purple-ish
      ctx.fillRect(px, py, s, ph);

      // cookie jar
      const cj = state.cookieJar;
      if (!cj.taken) {
        const pulse = 1 + Math.sin(state.time * 3) * 0.06;
        ctx.save();
        ctx.translate(cj.x, cj.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(244,211,94,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, cj.r + 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8e2c8';
        ctx.strokeStyle = '#1a1a1f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-cj.r, -cj.r * 0.6);
        ctx.lineTo(-cj.r, cj.r * 0.9);
        ctx.quadraticCurveTo(-cj.r, cj.r * 1.05, -cj.r * 0.85, cj.r * 1.05);
        ctx.lineTo(cj.r * 0.85, cj.r * 1.05);
        ctx.quadraticCurveTo(cj.r, cj.r * 1.05, cj.r, cj.r * 0.9);
        ctx.lineTo(cj.r, -cj.r * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#E63946';
        ctx.fillRect(-cj.r - 2, -cj.r * 0.95, cj.r * 2 + 4, cj.r * 0.4);
        ctx.strokeRect(-cj.r - 2, -cj.r * 0.95, cj.r * 2 + 4, cj.r * 0.4);
        const cookieColors = ['#A0522D', '#8B5A2B', '#C68642'];
        for (let i = 0; i < 6; i++) {
          const ccx = -cj.r * 0.6 + (i % 3) * cj.r * 0.55;
          const ccy = -cj.r * 0.3 + Math.floor(i / 3) * cj.r * 0.55;
          ctx.fillStyle = cookieColors[i % 3];
          ctx.beginPath();
          ctx.arc(ccx, ccy, cj.r * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a1a05';
          ctx.beginPath();
          ctx.arc(ccx - 1, ccy - 1, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ccx + 2, ccy + 1, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(-cj.r * 0.85, cj.r * 0.4, cj.r * 1.7, cj.r * 0.45);
        ctx.strokeRect(-cj.r * 0.85, cj.r * 0.4, cj.r * 1.7, cj.r * 0.45);
        ctx.fillStyle = '#1a1a1f';
        ctx.font = 'bold 10px Georgia, serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText('COOKIES', 0, cj.r * 0.62);
        ctx.textAlign = 'left';
        ctx.restore();
        const bobY = Math.sin(state.time * 2) * 4;
        ctx.fillStyle = '#1a1a1f';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText('↓ accept these to subscribe ↓', cj.x, cj.y - cj.r - 22 + bobY);
        ctx.textAlign = 'left';
      } else if (state.time - cj.takeT < 0.4) {
        const a = state.time - cj.takeT;
        ctx.strokeStyle = 'rgba(244,211,94,' + (1 - a / 0.4) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cj.x, cj.y, cj.r + a * 80, 0, Math.PI * 2);
        ctx.stroke();
      }

      // docs
      for (const d of state.docs) {
        if (d.taken) {
          if (state.time - d.takeT < 0.4) {
            const a = state.time - d.takeT;
            ctx.strokeStyle = 'rgba(244,211,94,' + (1 - a / 0.4) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r + a * 50, 0, Math.PI * 2);
            ctx.stroke();
          }
          continue;
        }
        const pulse = 1 + Math.sin(state.time * 4) * 0.12;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(244,211,94,0.45)';
        ctx.beginPath();
        ctx.arc(0, 0, d.r + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F4D35E';
        ctx.strokeStyle = '#1a1a1f';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
        ctx.strokeRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
        ctx.fillRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
        ctx.strokeRect(-d.r, -d.r * 0.95, d.r * 0.9, d.r * 0.3);
        ctx.fillStyle = '#1a1a1f';
        ctx.font = 'bold 6px ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('DOC', -7, 2);
        ctx.restore();
      }

      ctx.restore();
    }

    // Live X-ray decode of scan fragments — on top of the under-layer fill,
    // under the player chrome, so it reads as truth seen through the window.
    this.drawScanXray(ctx);

    // player
    {
      const p = state.player;
      const s = p.size;
      const ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      ctx.save();
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
  }

  // ===== HUD =====
  updateHUD() {
    const state = this.state;
    if (!this.hud.size) return;
    this.hud.size.textContent = Math.round(state.player.size) + 'px';
    this.hud.size.style.color =
      state.player.size < 40 ? '#E63946' : state.player.size < 60 ? '#F4D35E' : '#f5f5f5';
    this.hud.gaze.style.width = state.gaze + '%';
    this.hud.gaze.style.background =
      state.gaze < 50 ? '#2D8659' : state.gaze < 80 ? '#F4D35E' : '#E63946';
    this.hud.docs.textContent = state.docsCollected + ' / ' + state.docs.length;
    this.hud.cookie.textContent = state.cookieCollected ? 'YES' : 'no';
    this.hud.cookie.style.color = state.cookieCollected ? '#2D8659' : '#f5f5f5';
    this.hud.zoom.textContent = Math.round((state.cam.zoom / state.cam.baseZoom) * 100) + '%';

    const gun = state.agents.gunShooter;
    const prop = state.propaganda[0];
    const allDone = state.docsCollected === state.docs.length && state.cookieCollected;
    if (gun.state === 'aiming') this.hud.hint.textContent = '⚠ the avatar has a gun. of course it does. RUN AT IT';
    else if (gun.state === 'awakening') this.hud.hint.textContent = '⚠ avatar waking up. this is bad';
    else if (state.cursor) this.hud.hint.textContent = 'cursor is on you. break line of sight';
    else if (allDone && prop.revealed) this.hud.hint.textContent = 'everything\'s yours. slip through the hole to escape.';
    else if (allDone) this.hud.hint.textContent = 'drag the grey comment aside — there\'s a way out behind it.';
    else if (state.docsCollected === state.docs.length && !state.cookieCollected)
      this.hud.hint.textContent = 'docs got. now the cookies';
    else this.hud.hint.textContent = (state.docs.length - state.docsCollected) + ' more docs to grab';
  }

}
