import Phaser from 'phaser';
import { PW, PH, PLAYER, CAMERA, GAZE, PICKUPS, RENDER } from '../config.js';
import { createState, resetState } from '../game/state.js';
import { recSlots, commentSlots } from '../game/layout.js';
import { dist } from '../game/physics.js';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect, drawRecCard, drawComment } from '../game/draw.js';
import * as ExplodingLike from '../game/agents/explodingLike.js';

// Phase 3 — first playable.
// Renders the entire page chrome to a vanilla 2D canvas overlay (#oqw) layered
// over the Phaser canvas. Phaser handles input + scenes; this scene draws.
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.state = createState();
    this.state.status = 'playing';

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

    // Restart button (DOM)
    this.restartBtn = document.getElementById('restart');
    this.overlayEl = document.getElementById('overlay');
    this.overlayTagEl = document.getElementById('overlay-tag');
    this.overlayTitleEl = document.getElementById('overlay-title');
    this.overlaySubEl = document.getElementById('overlay-sub');
    this.onRestart = () => this.restart();
    this.restartBtn?.addEventListener('click', this.onRestart);

    // HUD DOM refs
    this.hud = {
      size: document.getElementById('ui-size'),
      gaze: document.getElementById('ui-gaze'),
      docs: document.getElementById('ui-docs'),
      cookie: document.getElementById('ui-cookie'),
      zoom: document.getElementById('ui-zoom'),
      hint: document.getElementById('ui-hint'),
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('mouseup', this.onMouseUp);
      this.restartBtn?.removeEventListener('click', this.onRestart);
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

  // ===== Restart =====
  restart() {
    if (this.overlayEl) this.overlayEl.classList.remove('show');
    resetState(this.state);
  }
  showOverlay() {
    if (!this.overlayEl) return;
    if (this.state.status === 'won') {
      this.overlayTagEl.textContent = '[ EXFILTRATED ]';
      this.overlayTagEl.style.color = '#2D8659';
      this.overlayTitleEl.textContent = 'MISSION COMPLETE';
      this.overlaySubEl.textContent = 'Five docs stolen, cookies accepted, subscribed. The page never knew.';
    } else {
      this.overlayTagEl.textContent = '[ TERMINATED ]';
      this.overlayTagEl.style.color = '#E63946';
      this.overlayTitleEl.textContent = this.state.lostReason || 'TERMINATED';
      this.overlaySubEl.textContent =
        this.state.lostReason === 'GARBAGE COLLECTED'
          ? 'You ran out of size. Maybe the gun. Maybe the comments. The page won.'
          : 'You exposed too much truth. The cursor caught up.';
    }
    this.overlayEl.classList.add('show');
  }

  // ===== Per-frame =====
  update(_time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.state.time += dt;

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

    if (this.state.status === 'playing') {
      this.runGameLogic(dt);
    }

    this.render();
    this.updateHUD();
    if (this.state.status !== 'playing' && !this.overlayEl?.classList.contains('show')) {
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

    // Truth coverage → gaze
    let exposed = 0;
    for (const t of state.truth) {
      let covered = false;
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      for (const prop of state.propaganda) {
        if (cx >= prop.x && cx <= prop.x + prop.w && cy >= prop.y && cy <= prop.y + prop.h) {
          covered = true;
          break;
        }
      }
      if (!covered) exposed++;
    }
    if (exposed > 0) {
      state.gaze = Math.min(GAZE.threshold, state.gaze + GAZE.raisePerSec * exposed * dt);
      if (Math.random() < 0.04) beep(180 + state.gaze * 5, 0.06, 'triangle', 0.018);
    } else {
      state.gaze = Math.max(0, state.gaze - GAZE.fallPerSec * dt);
    }

    // Cursor (gaze enforcer)
    if (state.gaze >= GAZE.threshold && !state.cursor) {
      state.cursor = { x: -40, y: 50, vx: 0, vy: 0, born: 0 };
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

    // Agents
    ExplodingLike.update(state.agents.explodingLike, dt, state);
    ExplodingLike.updateProjectiles(state, dt);

    // Win condition
    if (state.docsCollected === state.docs.length && state.cookieCollected) {
      const ex = state.layout.subscribe;
      if (p.x > ex.x - 10 && p.x < ex.x + ex.w + 10 && p.y > ex.y - 10 && p.y < ex.y + ex.h + 10) {
        state.status = 'won';
        beep(523, 0.1, 'sine', 0.1);
        setTimeout(() => beep(659, 0.1, 'sine', 0.1), 80);
        setTimeout(() => beep(784, 0.18, 'sine', 0.12), 180);
        setTimeout(() => beep(1047, 0.25, 'sine', 0.1), 320);
      }
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

    // search bar (idle in Phase 3)
    {
      const s = layout.search;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#888';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('search totallynormaltube', s.x + 10, s.y + s.h / 2);
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(s.x + s.w - 36, s.y, 36, s.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('🔍', s.x + s.w - 26, s.y + s.h / 2);
    }

    // account avatar (idle in Phase 3)
    {
      ctx.fillStyle = '#4A7BC8';
      ctx.beginPath();
      ctx.arc(layout.account.x + 12, layout.account.y + 12, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('U', layout.account.x + 12, layout.account.y + 13);
      ctx.textAlign = 'left';
    }

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
    ctx.fillStyle = '#1a1a1f';
    ctx.font = 'bold 16px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText("What They Don't Want You To See (full doc)", layout.title.x, layout.title.y);

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
      ctx.fillStyle = '#1a1a1f';
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('UnknownUploader  •  847K views  •  posted ████████', d.x + 10, d.y + 10);
      ctx.fillStyle = '#666';
      ctx.fillRect(d.x + 10, d.y + 30, 540, 4);
      ctx.fillRect(d.x + 10, d.y + 42, 480, 4);
      ctx.fillRect(d.x + 10, d.y + 54, 510, 4);
      ctx.fillRect(d.x + 10, d.y + 66, 300, 4);
    }

    // sidebar recs (idle for Phase 3 — Phase 4 wakes some up)
    for (let i = 0; i < recSlots.length; i++) {
      const slot = recSlots[i];
      drawRecCard(ctx, slot.x, slot.y, slot.w, slot.h, i, false, null, state.time);
    }

    // comments (idle)
    for (let i = 0; i < commentSlots.length; i++) {
      const slot = commentSlots[i];
      drawComment(ctx, slot.x, slot.y, slot.w, slot.h, i, false, null);
    }

    // truth + propaganda
    for (const t of state.truth) {
      drawHandRect(ctx, t.x, t.y, t.w, t.h, '#0c0c0e', '#0c0c0e', 100);
      ctx.fillStyle = '#E63946';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('CLASSIFIED // L4', t.x + 8, t.y + 8);
      ctx.fillStyle = 'rgba(245,245,245,0.85)';
      const lines = [110, 90, 100, 70];
      for (let i = 0; i < lines.length; i++) ctx.fillRect(t.x + 8, t.y + 26 + i * 11, lines[i], 5);
    }
    for (const prop of state.propaganda) {
      ctx.save();
      if (prop.dragging) {
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }
      drawHandRect(ctx, prop.x, prop.y, prop.w, prop.h, '#F4D35E', '#1a1a1f', 200);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(prop.x + 1, prop.y + 1, prop.w - 2, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('AD.iframe', prop.x + 5, prop.y + 8);
      ctx.fillStyle = '#E63946';
      ctx.fillRect(prop.x + prop.w - 13, prop.y + 3, 9, 9);
      ctx.fillStyle = '#fff';
      ctx.fillText('×', prop.x + prop.w - 11, prop.y + 8);
      ctx.fillStyle = '#1a1a1f';
      ctx.font = 'bold 32px Georgia, serif';
      ctx.textBaseline = 'top';
      ctx.fillText('AD', prop.x + 16, prop.y + 30);
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText('IGNORANCE', prop.x + 70, prop.y + 36);
      ctx.fillText('IS STRENGTH', prop.x + 70, prop.y + 52);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText('(skip ad in 5...)', prop.x + 16, prop.y + 90);
      if (!prop.dragging && state.time < 6) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('▸ drag me', prop.x + 16, prop.y + prop.h - 14);
      }
      ctx.restore();
    }

    // cookie banner (idle)
    {
      const cb = layout.cookie;
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍪 we use cookies. and other things. accept everything?', cb.x + 16, cb.y + 14);
      ctx.fillStyle = '#2D8659';
      ctx.fillRect(cb.x + cb.w - 240, cb.y + 6, 100, 22);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('ACCEPT ALL', cb.x + cb.w - 190, cb.y + 17);
      ctx.fillStyle = '#444';
      ctx.fillRect(cb.x + cb.w - 130, cb.y + 6, 100, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText('also accept all', cb.x + cb.w - 80, cb.y + 17);
      ctx.textAlign = 'left';
    }

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

    // subscribe
    {
      const ex = layout.subscribe;
      const allDocs = state.docsCollected === state.docs.length;
      const ready = allDocs && state.cookieCollected;
      const pulse = ready ? 1 + Math.sin(state.time * 4) * 0.05 : 1;
      ctx.save();
      ctx.translate(ex.x + ex.w / 2, ex.y + ex.h / 2);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = ready ? '#2D8659' : (allDocs ? '#B8860B' : '#666');
      ctx.fillRect(-ex.w / 2, -ex.h / 2, ex.w, ex.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(ready ? 'SUBSCRIBE ↗' : 'SUBSCRIBE', 0, -4);
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(
        ready ? '(exfiltrate)' :
          (allDocs ? '(accept cookies first)' :
            '(need ' + (state.docs.length - state.docsCollected) + ' more docs)'),
        0, 12,
      );
      ctx.textAlign = 'left';
      ctx.restore();
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

    // debris (from explodingLike)
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

    // player
    {
      const p = state.player;
      const s = p.size;
      const ph = s * 0.75;
      const px = p.x - s / 2, py = p.y - ph / 2;
      ctx.save();
      if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
      drawHandRect(ctx, px, py, s, ph, p.hitFlash > 0 ? '#fff' : '#E63946', '#1a1a1f', 50);
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(px + 1, py + 1, s - 2, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRIMITIVE_ERROR.exe', px + 5, py + 8);
      ctx.fillStyle = '#E63946';
      ctx.fillRect(px + s - 13, py + 3, 9, 9);
      ctx.fillStyle = '#fff';
      ctx.fillText('×', px + s - 11, py + 8);
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

    if (state.cursor) this.hud.hint.textContent = 'cursor active — break sight';
    else if (state.gaze > 60) this.hud.hint.textContent = 'gaze rising — cover the truth';
    else if (state.docsCollected === state.docs.length && !state.cookieCollected)
      this.hud.hint.textContent = 'all docs · grab the cookie jar';
    else if (state.docsCollected === state.docs.length && state.cookieCollected)
      this.hud.hint.textContent = 'subscribe to exfiltrate';
    else this.hud.hint.textContent = (state.docs.length - state.docsCollected) + ' more docs';
  }

}
