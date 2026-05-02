import Phaser from 'phaser';
import { PW, PH, PLAYER, CAMERA } from '../config.js';
import { createState } from '../game/state.js';

// Phase 2: blank page + player + camera/zoom plumbing only.
// No agents, no page chrome, no projectiles yet.
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.state = createState();
    this.state.status = 'playing';

    // World background — white page rect (PW × PH)
    this.pageBg = this.add.rectangle(0, 0, PW, PH, 0xf5f5f5).setOrigin(0, 0);

    // Subtle grid so panning is visible
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x000000, 0.03);
    for (let i = 0; i <= PW; i += 40) { grid.moveTo(i, 0); grid.lineTo(i, PH); }
    for (let i = 0; i <= PH; i += 40) { grid.moveTo(0, i); grid.lineTo(PW, i); }
    grid.strokePath();

    // Placeholder player — red rectangle
    const ph = PLAYER.startSize * 0.75;
    this.playerSprite = this.add
      .rectangle(this.state.player.x, this.state.player.y, PLAYER.startSize, ph, 0xE63946)
      .setStrokeStyle(1, 0x1a1a1f);

    // Camera setup
    const cam = this.cameras.main;
    cam.setBounds(0, 0, PW, PH);
    cam.setBackgroundColor(0x181818);
    this.applyFitZoom();

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.zoomKeys = this.input.keyboard.addKeys({
      plus: Phaser.Input.Keyboard.KeyCodes.PLUS,
      equals: Phaser.Input.Keyboard.KeyCodes.EQUALS,
      minus: Phaser.Input.Keyboard.KeyCodes.MINUS,
      underscore: Phaser.Input.Keyboard.KeyCodes.UNDERSCORE,
    });
    this.input.keyboard.on('keydown-PLUS', this.zoomInStep, this);
    this.input.keyboard.on('keydown-EQUALS', this.zoomInStep, this);
    this.input.keyboard.on('keydown-MINUS', this.zoomOutStep, this);
    this.input.keyboard.on('keydown-UNDERSCORE', this.zoomOutStep, this);

    this.input.on('wheel', (_pointer, _gos, _dx, dy) => {
      const factor = dy > 0 ? 1 / CAMERA.wheelZoomFactor : CAMERA.wheelZoomFactor;
      const c = this.state.cam;
      c.targetZoom = Phaser.Math.Clamp(c.targetZoom * factor, c.minZoom, c.maxZoom);
    });

    // Resize handling — recompute fit-to-width zoom
    this.scale.on('resize', this.applyFitZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.applyFitZoom, this);
    });
  }

  applyFitZoom() {
    const c = this.state.cam;
    const w = this.scale.width;
    const fitZoom = w / PW;
    c.baseZoom = fitZoom;
    c.minZoom = fitZoom * CAMERA.minZoomMult;
    c.maxZoom = fitZoom * CAMERA.maxZoomMult;
    if (!c.initialized) {
      c.zoom = fitZoom;
      c.targetZoom = fitZoom;
      c.initialized = true;
      this.cameras.main.setZoom(fitZoom);
    } else {
      c.zoom = Phaser.Math.Clamp(c.zoom, c.minZoom, c.maxZoom);
      c.targetZoom = Phaser.Math.Clamp(c.targetZoom, c.minZoom, c.maxZoom);
    }
  }

  zoomInStep() {
    const c = this.state.cam;
    c.targetZoom = Phaser.Math.Clamp(c.targetZoom * CAMERA.keyZoomFactor, c.minZoom, c.maxZoom);
  }

  zoomOutStep() {
    const c = this.state.cam;
    c.targetZoom = Phaser.Math.Clamp(c.targetZoom / CAMERA.keyZoomFactor, c.minZoom, c.maxZoom);
  }

  update(_time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000);
    const state = this.state;
    state.time += dt;

    // Smooth zoom toward target
    const c = state.cam;
    c.zoom += (c.targetZoom - c.zoom) * Math.min(1, dt * CAMERA.zoomLerp);
    this.cameras.main.setZoom(c.zoom);

    if (state.status !== 'playing') return;

    // Player movement (size-scaled speed, exactly per source)
    const p = state.player;
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
    }
    p.x += vx * speed * dt;
    p.y += vy * speed * dt;
    p.x = Phaser.Math.Clamp(p.x, p.size / 2, PW - p.size / 2);
    p.y = Phaser.Math.Clamp(p.y, p.size * 0.4, PH - p.size * 0.4);

    this.playerSprite.x = p.x;
    this.playerSprite.y = p.y;

    // Smooth camera follow (manual — matches source's scrollX/Y lerp)
    const cam = this.cameras.main;
    const viewW = this.scale.width / c.zoom;
    const viewH = this.scale.height / c.zoom;
    const followLerp = Math.min(1, dt * CAMERA.followLerp);
    let targetX = p.x - viewW / 2;
    let targetY = p.y - viewH / 2;
    targetX = PW > viewW ? Phaser.Math.Clamp(targetX, 0, PW - viewW) : (PW - viewW) / 2;
    targetY = PH > viewH ? Phaser.Math.Clamp(targetY, 0, PH - viewH) : (PH - viewH) / 2;
    c.x += (targetX - c.x) * followLerp;
    c.y += (targetY - c.y) * followLerp;
    cam.setScroll(c.x, c.y);
  }
}
