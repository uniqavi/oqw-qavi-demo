import Phaser from 'phaser';
import { PLAYER, CAMERA, SCAN } from '../config.js';
import { initAudio, beep, noise } from '../game/audio.js';
import { crossfadeTo } from '../game/music.js';
import { drawHandRect } from '../game/draw.js';
import { markScanCoverage } from '../game/scan.js';

// LEVEL 1.0 — TUTORIAL
//
// A wireframe "dev sandbox" page styled like an unstyled website template
// (header, hero, content grid, footer) in the game's hand-drawn aesthetic.
// The player descends it while Toto narrates, learning the core mechanics
// with no real danger. See docs/LEVEL1.md §6.
//
// Standalone scene — reuses only shared draw/audio helpers and simplified
// self-contained enemies, so it never touches GameScene or the real agents.

// Tutorial page dimensions (taller than the real level to fit all lessons)
const W = 960;
const H = 1720;

// ── Wireframe website-template layout (world coords) ──
const TUT = {
  header:  { x: 0,   y: 0,   w: W,   h: 66 },
  logo:    { x: 22,  y: 20,  w: 130, h: 26 },
  nav:     [ { x: 320, y: 28, w: 64, h: 10 }, { x: 400, y: 28, w: 64, h: 10 }, { x: 480, y: 28, w: 64, h: 10 } ],
  search:  { x: 570, y: 18,  w: 250, h: 30 },
  account: { x: 894, y: 18,  w: 44,  h: 30 },

  hero:    { x: 40,  y: 96,  w: W - 80, h: 250 },   // SCAN target lives here

  // content grid row 1 (doc sits by the middle card)
  row1:    [ { x: 40, y: 390, w: 270, h: 200 }, { x: 345, y: 390, w: 270, h: 200 }, { x: 650, y: 390, w: 270, h: 200 } ],
  doc:     { x: 480, y: 490, r: 16, taken: false, takeT: 0 },

  // content grid row 2 (left card becomes the CHASER)
  row2:    [ { x: 40, y: 640, w: 270, h: 200 }, { x: 345, y: 640, w: 270, h: 200 }, { x: 650, y: 640, w: 270, h: 200 } ],

  // a "sponsored" avatar block lower down — becomes the GUN
  gunAvatar: { x: W / 2, y: 1020, r: 30 },

  footer:  { x: 0, y: H - 70, w: W, h: 70 },
  infiltrate: { x: W / 2 - 160, y: H - 250, w: 320, h: 86 },
};

// Steps the player progresses through
const STEP = { MOVE: 0, SCAN: 1, COLLECT: 2, CHASER: 3, GUN: 4, DONE: 5 };

export default class TutorialScene extends Phaser.Scene {
  constructor() { super('TutorialScene'); }

  create(data) {
    this.difficulty = data?.difficulty || localStorage.getItem('oqw-difficulty') || 'easy';

    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize = this.handleResize.bind(this);

    document.body.classList.remove('menu-mode');
    const urlBar = document.getElementById('browser-url');
    if (urlBar) urlBar.textContent = 'about:blank — totallynormaltube.gov.??/_dev/sandbox';

    crossfadeTo('level1', { fadeMs: 1200 });

    this.player = { x: W / 2, y: 130, size: PLAYER.startSize, invuln: 0, hitFlash: 0 };
    this.cam = { x: 0, y: 0, zoom: 1, baseZoom: 1 };
    this.time = 0;
    this.finished = false;
    this.step = STEP.MOVE;
    this.movedDistance = 0;

    // Scan target (the hero headline hides the truth). `font`/`tx` let the
    // shared scan helper measure the text width for spatial coverage.
    const scanRect = { x: TUT.hero.x + 24, y: TUT.hero.y + 150, w: TUT.hero.w - 48, h: 56 };
    this.scanTarget = {
      rect: scanRect,
      hidden: 'HUSH TRAINING ENV — subject not yet deployed',
      font: 'bold 16px ui-monospace, monospace',
      tx: scanRect.x + 12,
      progress: 0,
      scanned: false,
    };

    // Simplified enemies (self-contained — just to teach recognition).
    // State flow: idle → waking (reveal/activate) → spotlight (zoom+lesson)
    //             → chase / aim (combat demo)
    this.chaser = { ...TUT.row2[0], state: 'idle', vx: 0, vy: 0, taught: false, wakeT: 0 };
    this.gun = { x: TUT.gunAvatar.x, y: TUT.gunAvatar.y, r: TUT.gunAvatar.r,
                 state: 'idle', armLen: 0, angle: Math.PI / 2, aimT: 0, taught: false, wakeT: 0, firedT: -99 };
    this.bullets = [];
    this.sparks = [];

    // Spotlight pause state
    this.spot = { active: false, x: 0, y: 0, enemy: null };

    // Exit confirmation (Toto's farewell before leaving the tutorial)
    this.atExit = false;

    // Doc as INSTANCE state — TUT.doc is module-level, so mutating its
    // `.taken` directly softlocked the COLLECT step on a replay (the doc
    // stayed "taken" and never reappeared). Copy it fresh each run.
    this.doc = { ...TUT.doc };

    // Anti-softlock failsafe: tracks time on the current step so we can
    // escalate the hint and, if truly stuck, auto-complete the objective.
    this._lastStep = -1;
    this.stepT = 0;
    this._escalated = false;

    // Fade-from-black on entry (smooths the menu → tutorial transition)
    this.introFade = 1;

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Dialogue DOM
    this.dlg = {
      wrap: document.getElementById('tutorial-dialog'),
      speaker: document.getElementById('tutorial-speaker'),
      line: document.getElementById('tutorial-line'),
      hint: document.getElementById('tutorial-hint'),
      skip: document.getElementById('tutorial-skip'),
    };
    this.typeTimer = null;

    this.onSkip = () => this.finishTutorial(true);
    this.dlg.skip?.addEventListener('click', this.onSkip);

    // Click / Space: dismiss the spotlight, OR confirm the exit. ESC skips.
    this.onPointer = () => {
      if (this.spot.active) this.endSpotlight();
      else if (this.atExit) this.finishTutorial(false);
    };
    this.input.on('pointerdown', this.onPointer);
    this.onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.finishTutorial(true); return; }
      if (this.spot.active && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.endSpotlight(); return; }
      if (this.atExit && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.finishTutorial(false); }
    };
    document.addEventListener('keydown', this.onKey);

    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    initAudio();
    this.say('TOTO', "Easy — this is just a sandbox. A blank test page, no eyes on you. Let's calibrate before you go live. Use WASD, walk down.", 'WASD to move');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      this.input.off('pointerdown', this.onPointer);
      this.dlg.skip?.removeEventListener('click', this.onSkip);
      if (this.typeTimer) clearTimeout(this.typeTimer);
      this.dlg.wrap?.classList.add('hidden');
    });
  }

  // ── Toto dialogue (typewriter) ──
  say(speaker, text, hint = '') {
    if (!this.dlg.wrap) return;
    this.dlg.wrap.classList.remove('hidden');
    if (this.dlg.speaker) this.dlg.speaker.textContent = speaker;
    if (this.dlg.line) this.dlg.line.textContent = '';
    if (this.dlg.hint) { this.dlg.hint.textContent = '▸ ' + hint; this.dlg.hint.style.opacity = '0'; }
    if (this.typeTimer) clearTimeout(this.typeTimer);
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        i++;
        if (this.dlg.line) this.dlg.line.textContent = text.slice(0, i);
        if (text[i - 1] !== ' ' && Math.random() < 0.2) beep(1600 + Math.random() * 500, 0.005, 'square', 0.01);
        this.typeTimer = setTimeout(tick, 24);
      } else if (this.dlg.hint && hint) {
        this.dlg.hint.style.opacity = '0.7';
      }
    };
    tick();
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
    this.cam.baseZoom = w / W;
    if (!this.spot.active) this.cam.zoom = this.cam.baseZoom;
  }

  update(_time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.time += dt;
    if (this.introFade > 0) this.introFade = Math.max(0, this.introFade - dt * 1.4);
    if (this.player.invuln > 0) this.player.invuln -= dt;
    if (this.player.hitFlash > 0) this.player.hitFlash -= dt;

    if (this.spot.active) this.updateSpotlight(dt);
    else if (!this.finished) this.runLogic(dt);

    this.updateProjectiles(dt);
    this.render();
  }

  // ── Spotlight: freeze + slowly zoom camera onto the enemy ──
  startSpotlight(x, y, speaker, text, enemy) {
    this.spot.active = true;
    this.spot.x = x; this.spot.y = y; this.spot.enemy = enemy;
    noise(0.2, 0.08);
    beep(140, 0.4, 'sawtooth', 0.06);
    this.say(speaker, text, 'click or SPACE to continue');
  }
  updateSpotlight(dt) {
    const c = this.cam;
    const zoom = c.baseZoom * 1.7;
    const viewW = this.VW / zoom, viewH = this.VH / zoom;
    const tx = Phaser.Math.Clamp(this.spot.x - viewW / 2, 0, Math.max(0, W - viewW));
    const ty = Phaser.Math.Clamp(this.spot.y - viewH / 2, 0, Math.max(0, H - viewH));
    // Slow, cinematic zoom (was dt*6 — felt too snappy)
    c.zoom += (zoom - c.zoom) * Math.min(1, dt * 3);
    c.x += (tx - c.x) * Math.min(1, dt * 3);
    c.y += (ty - c.y) * Math.min(1, dt * 3);
  }
  endSpotlight() {
    this.spot.active = false;
    beep(660, 0.06, 'sine', 0.05);
    // Transition the spotlighted enemy into its combat demo
    if (this.spot.enemy === 'chaser') {
      this.chaser.state = 'chase';
      this.say('TOTO', "Now lose it. Just keep moving down — it can't keep up forever.", 'move away');
    } else if (this.spot.enemy === 'gun') {
      this.gun.state = 'aim'; this.gun.aimT = 0;
      this.say('TOTO', "Watch the laser. When it fires, rush it — closing the distance breaks the shot.", 'get past it');
    }
    this.spot.enemy = null;
  }

  runLogic(dt) {
    const p = this.player;

    // Movement
    const speed = PLAYER.baseSpeed * (1.5 - (p.size / 200) * 0.7);
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.wasd.down.isDown || this.cursors.down.isDown) vy += 1;
    if (vx || vy) { const l = Math.hypot(vx, vy); vx /= l; vy /= l; this.movedDistance += speed * dt; }
    p.x += vx * speed * dt; p.y += vy * speed * dt;
    p.x = Phaser.Math.Clamp(p.x, p.size / 2, W - p.size / 2);
    p.y = Phaser.Math.Clamp(p.y, p.size * 0.4, H - p.size * 0.4);

    // Camera follow (+ ease zoom back to base after a spotlight)
    const c = this.cam;
    c.zoom += (c.baseZoom - c.zoom) * Math.min(1, dt * 4);
    const viewW = this.VW / c.zoom, viewH = this.VH / c.zoom;
    c.x += ((W - viewW) / 2 - c.x) * Math.min(1, dt * 4);
    const ty = H > viewH ? Phaser.Math.Clamp(p.y - viewH / 2, 0, H - viewH) : (H - viewH) / 2;
    c.y += (ty - c.y) * Math.min(1, dt * CAMERA.followLerp);

    this.updateSteps(dt);
    this.updateEnemies(dt);
  }

  updateSteps(dt) {
    const p = this.player;
    const st = this.scanTarget;

    // Anti-softlock failsafe — escalate hints, then auto-complete if stuck
    if (this.step !== this._lastStep) { this._lastStep = this.step; this.stepT = 0; this._escalated = false; }
    else { this.stepT += dt; }
    this.checkStuck();

    if (this.step === STEP.MOVE) {
      if (this.movedDistance > 160) {
        this.step = STEP.SCAN;
        this.say('TOTO', "Good. Now — your window isn't just a window. It sees what they hide. Slide it over that banner headline.", 'scan the banner');
      }
    } else if (this.step === STEP.SCAN) {
      // Spatial scan: the truth shows only through the window. Sweep the
      // window across the headline; once enough of its width has been covered,
      // the reveal latches persistent (see drawPlayer for the X-ray lens).
      if (!st.scanned && this.windowOverlaps(st.rect)) {
        const s = p.size, px = p.x - s / 2;
        const { frac, gained } = markScanCoverage(st, px, s, this.ctx);
        st.progress = frac;
        if (gained > 0 && Math.random() < 0.5) beep(1500 + Math.random() * 600, 0.004, 'square', 0.012);
        if (frac >= SCAN.coverThreshold) {
          st.scanned = true;
          beep(880, 0.08, 'sine', 0.1);
          this.say('TOTO', "There it is. The visible part is decoration — the truth's underneath. On the real pages, scan everything.", 'now grab the file');
          this.step = STEP.COLLECT;
        }
      }
    } else if (this.step === STEP.COLLECT) {
      const d = this.doc;
      if (!d.taken && Math.hypot(p.x - d.x, p.y - d.y) < d.r + p.size * 0.32) {
        d.taken = true; d.takeT = this.time;
        beep(880, 0.08, 'sine', 0.13); beep(1320, 0.12, 'sine', 0.1);
        this.say('TOTO', "That's evidence. Collect enough across a page and we'll know exactly what they're burying.", 'keep going down');
        this.step = STEP.CHASER;
      }
    } else if (this.step === STEP.CHASER) {
      // First approach → enemy WAKES (visible activation). The spotlight zoom
      // happens later, after a short reveal delay (see updateEnemies).
      const cx = this.chaser.x + this.chaser.w / 2, cy = this.chaser.y + this.chaser.h / 2;
      if (!this.chaser.taught && Math.hypot(p.x - cx, p.y - cy) < 240) {
        this.chaser.taught = true;
        this.chaser.state = 'waking';
        this.chaser.wakeT = this.time;
        this.say('TOTO', "Hold on — something just woke up.", '');
        beep(120, 0.3, 'sawtooth', 0.06);
      }
      // Advance only after the spotlight is done (state has become 'chase')
      if (this.chaser.state === 'chase' && p.y > 940) this.step = STEP.GUN;
    } else if (this.step === STEP.GUN) {
      if (!this.gun.taught && Math.hypot(p.x - this.gun.x, p.y - this.gun.y) < 270) {
        this.gun.taught = true;
        this.gun.state = 'waking';
        this.gun.wakeT = this.time;
        this.say('TOTO', "Hold on — that one too.", '');
        beep(120, 0.3, 'sawtooth', 0.06);
      }
      if ((this.gun.state === 'aim' || this.gun.state === 'spent') && p.y > 1320) {
        this.step = STEP.DONE;
        this.say('TOTO', "That's everything. Head to the bottom and walk into INFILTRATE.", 'walk into INFILTRATE');
      }
    }

    // INFILTRATE — first contact triggers Toto's farewell; a second confirm
    // (SPACE / click) actually leaves. No more instant exit.
    const b = TUT.infiltrate;
    if (this.step === STEP.DONE && !this.atExit &&
        p.x > b.x - 10 && p.x < b.x + b.w + 10 && p.y > b.y - 10 && p.y < b.y + b.h + 10) {
      this.atExit = true;
      this.say('TOTO', "This is where I leave you. The next page is the real thing — I won't be on the line. Good luck.", 'press SPACE or click to go in');
      beep(440, 0.12, 'sine', 0.08);
    }
  }

  // Anti-softlock: if the player lingers on a step, escalate the hint, then
  // auto-complete the objective so the tutorial can NEVER permanently block.
  checkStuck() {
    if (this.spot.active) return;            // don't count time during a pause
    const st = this.scanTarget;
    if (!this._escalated && this.stepT > 10) {
      this._escalated = true;
      if (this.step === STEP.MOVE)      this.say('TOTO', "Use WASD or the arrow keys — walk down the page.", 'WASD to move');
      else if (this.step === STEP.SCAN) this.say('TOTO', "Put your red window right on top of that banner near the top, and hold it there.", 'hold over the banner');
      else if (this.step === STEP.COLLECT) this.say('TOTO', "The glowing yellow file — just walk into it.", 'touch the yellow file');
    }
    if (this.stepT > 20) {
      if (this.step === STEP.SCAN && !st.scanned) {
        st.progress = 1; st.scanned = true; this.step = STEP.COLLECT;
        this.say('TOTO', "...there, I pulled it for you. Now grab that yellow file.", 'grab the file');
      } else if (this.step === STEP.COLLECT && !this.doc.taken) {
        this.doc.taken = true; this.step = STEP.CHASER;
        this.say('TOTO', "Got it for you. Keep heading down.", 'keep going down');
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    const WAKE_DELAY = 1.2;  // time the enemy stays "revealing" before the zoom

    // ── WAKING → SPOTLIGHT: let the enemy show its activation, THEN zoom in ──
    if (this.chaser.state === 'waking' && this.time - this.chaser.wakeT > WAKE_DELAY) {
      this.chaser.state = 'spotlight';
      this.startSpotlight(this.chaser.x + this.chaser.w / 2, this.chaser.y + this.chaser.h / 2,
        'TOTO', "They hunt. A recommendation card that chases you — don't let it touch you.", 'chaser');
    }
    if (this.gun.state === 'waking' && this.time - this.gun.wakeT > WAKE_DELAY) {
      this.gun.state = 'spotlight';
      this.startSpotlight(this.gun.x, this.gun.y,
        'TOTO', "The account avatar pulls a gun. One shot fries you. When it aims, rush it — don't run.", 'gun');
    }

    // ── Chaser — slow homing (non-lethal: just flash + knockback) ──
    if (this.chaser.state === 'chase') {
      const cx = this.chaser.x + this.chaser.w / 2, cy = this.chaser.y + this.chaser.h / 2;
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1;
      const sp = 70; // gentle
      this.chaser.x += (dx / d) * sp * dt;
      this.chaser.y += (dy / d) * sp * dt;
      if (d < p.size * 0.5 && p.invuln <= 0) {
        p.invuln = 1.2; p.hitFlash = 0.3;
        p.x += (dx / d) * 26; p.y += (dy / d) * 26;
        noise(0.1, 0.1); beep(160, 0.12, 'sawtooth', 0.06);
      }
    }

    // ── Gun — grow arm, track the player, fire ONE telegraphed shot ──
    if (this.gun.state === 'aim') {
      this.gun.armLen = Math.min(48, this.gun.armLen + 90 * dt);
      const target = Math.atan2(p.y - this.gun.y, p.x - this.gun.x);
      let delta = target - this.gun.angle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      // Track at ~2.4 rad/s so the laser actually points at the player (the
      // old 0.8*dt was ~0.8 rad/s — far too slow, so it fired off-target).
      this.gun.angle += Math.sign(delta) * Math.min(Math.abs(delta), 2.4 * dt);
      this.gun.aimT += dt;
      // Fire only once the arm is extended AND it has aimed for a clear beat
      if (this.gun.aimT > 1.8 && this.gun.armLen >= 47) {
        const a = this.gun.angle;
        const mx = this.gun.x + Math.cos(a) * (this.gun.armLen + 12);
        const my = this.gun.y + Math.sin(a) * (this.gun.armLen + 12);
        this.bullets.push({ x: mx, y: my, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 3 });
        beep(220, 0.16, 'square', 0.12); noise(0.12, 0.12);
        this.gun.state = 'spent'; this.gun.firedT = this.time;
      }
    } else if (this.gun.state === 'spent') {
      this.gun.armLen = Math.max(0, this.gun.armLen - 60 * dt);
    }
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (p.invuln <= 0 && Math.abs(b.x - p.x) < p.size / 2 && Math.abs(b.y - p.y) < p.size * 0.375) {
        b.life = 0; p.invuln = 1.2; p.hitFlash = 0.3;
        noise(0.15, 0.12); beep(140, 0.18, 'sawtooth', 0.08);
      }
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) b.life = 0;
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.sparks = this.sparks.filter(s => s.life > 0);
  }

  finishTutorial(skipped) {
    if (this.finished) return;
    this.finished = true;
    localStorage.setItem('oqw-tutorial-done', 'yes');
    beep(523, 0.1, 'sine', 0.1);
    setTimeout(() => beep(784, 0.18, 'sine', 0.12), 110);
    this.dlg.wrap?.classList.add('hidden');
    this.scene.start('GameScene', { difficulty: this.difficulty });
    this.scene.launch('HUDScene');
  }

  // ── Render ──
  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;
    const c = this.cam;

    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);

    // Page bg + grid — soft warm off-white (less of a harsh bright slab
    // right after the dark menu room, eases the transition)
    ctx.fillStyle = '#e8e6e1';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= W; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
    for (let i = 0; i <= H; i += 40) { ctx.moveTo(0, i); ctx.lineTo(W, i); }
    ctx.stroke();

    this.drawHeader(ctx);
    this.drawHero(ctx);
    this.drawContentRow(ctx, TUT.row1);
    this.drawContentRow(ctx, TUT.row2, this.chaser);
    this.drawDoc(ctx);
    this.drawGun(ctx);
    this.drawFooter(ctx);
    this.drawInfiltrate(ctx);
    this.drawBullets(ctx);
    this.drawPlayer(ctx);

    ctx.restore();

    // Spotlight vignette (screen space) — darkens everything but the center
    if (this.spot.active) {
      const cx = VW / 2, cy = VH / 2;
      const g = ctx.createRadialGradient(cx, cy, VH * 0.12, cx, cy, VH * 0.65);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }

    // Fade-from-black on entry (smooths the menu → tutorial cut)
    if (this.introFade > 0) {
      ctx.fillStyle = 'rgba(8, 8, 10, ' + this.introFade + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  // ── wireframe component helpers ──
  bars(ctx, x, y, widths, gap = 16, h = 8, color = '#b0b0b0') {
    ctx.fillStyle = color;
    let yy = y;
    for (const w of widths) { ctx.fillRect(x, yy, w, h); yy += gap; }
  }

  drawHeader(ctx) {
    drawHandRect(ctx, TUT.header.x, TUT.header.y, TUT.header.w, TUT.header.h, '#ffffff', '#1a1a1f', 7, 2);
    // logo — neutral placeholder mark (this is an unstyled dev template, no
    // brand). Gray square with a simple diamond glyph + a gray name bar.
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(TUT.logo.x, TUT.logo.y, 26, 22);
    ctx.fillStyle = '#f0f0f0';
    const lx = TUT.logo.x + 13, ly = TUT.logo.y + 11;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 6); ctx.lineTo(lx + 6, ly); ctx.lineTo(lx, ly + 6); ctx.lineTo(lx - 6, ly);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(TUT.logo.x + 34, TUT.logo.y + 6, 90, 12);
    // nav bars
    for (const n of TUT.nav) { ctx.fillStyle = '#b0b0b0'; ctx.fillRect(n.x, n.y, n.w, n.h); }
    // search placeholder
    drawHandRect(ctx, TUT.search.x, TUT.search.y, TUT.search.w, TUT.search.h, '#f4f4f4', '#cfcfcf', 33, 1.5);
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(TUT.search.x + 12, TUT.search.y + 12, 120, 6);
    // account circle
    ctx.fillStyle = '#8a8a8a'; ctx.beginPath();
    ctx.arc(TUT.account.x + 22, TUT.account.y + 15, 15, 0, Math.PI * 2); ctx.fill();
  }

  drawHero(ctx) {
    const hero = TUT.hero;
    drawHandRect(ctx, hero.x, hero.y, hero.w, hero.h, '#ffffff', '#1a1a1f', 99, 2);
    // big image block
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(hero.x + 18, hero.y + 18, hero.w - 36, 110);
    // headline = scan target
    const st = this.scanTarget, r = st.rect;
    if (st.scanned) {
      // persistent reveal
      ctx.fillStyle = '#0c0c0e'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#E63946'; ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textBaseline = 'middle'; ctx.fillText(st.hidden, r.x + 12, r.y + r.h / 2);
    } else {
      // visible placeholder headline bars
      this.bars(ctx, r.x, r.y + 8, [r.w - 40, r.w - 160], 20, 12, '#c4c4c4');
      // hint glow if window is near
      if (this.windowOverlaps(r)) {
        ctx.strokeStyle = 'rgba(70,135,158,0.8)'; ctx.lineWidth = 2;
        ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      }
    }
    // (The in-window X-ray reveal is drawn by drawPlayer — the window itself
    // is the lens, so it must paint on top of the player rectangle.)
  }

  drawContentRow(ctx, cards, enemy = null) {
    for (const card of cards) {
      const isEnemy = enemy && card === TUT.row2[0] && this.chaser.taught;
      const x = isEnemy ? this.chaser.x : card.x;
      const y = isEnemy ? this.chaser.y : card.y;
      // "active" (red, threatening) during waking, spotlight, and chase
      const active = isEnemy && this.chaser.state !== 'idle';
      drawHandRect(ctx, x, y, card.w, card.h, active ? '#ffe5e5' : '#ffffff', active ? '#E63946' : '#1a1a1f', (x + y) | 0, active ? 3 : 2);
      ctx.fillStyle = active ? '#E63946' : '#8a8a8a';
      ctx.fillRect(x + 12, y + 12, card.w - 24, card.h * 0.55);
      this.bars(ctx, x + 14, y + card.h * 0.55 + 20, [card.w - 28, card.w - 70, card.w - 110]);
      // red activation outline (universal "this will attack you" cue)
      if (active) this.activationOutline(ctx, x, y, card.w, card.h);
      if (active) {
        const waking = this.chaser.state === 'waking' || this.chaser.state === 'spotlight';
        ctx.fillStyle = '#E63946'; ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(waking ? '⚠ WAKING ⚠' : '◣ CHASING ◢', x + card.w / 2, y + card.h * 0.28);
        ctx.textAlign = 'left';
      }
    }
  }

  drawDoc(ctx) {
    const d = this.doc;
    if (d.taken) return;
    const pulse = 1 + Math.sin(this.time * 4) * 0.12;
    ctx.save(); ctx.translate(d.x, d.y); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(244,211,94,0.45)'; ctx.beginPath(); ctx.arc(0, 0, d.r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F4D35E'; ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.4;
    ctx.fillRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5); ctx.strokeRect(-d.r, -d.r * 0.7, d.r * 2, d.r * 1.5);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText('DOC', 0, 2);
    ctx.textAlign = 'left'; ctx.restore();
  }

  drawGun(ctx) {
    const g = this.gun;
    // "active" = threatening (waking / spotlight / aiming)
    const active = g.state === 'aim' || g.state === 'waking' || g.state === 'spotlight';
    const spent = g.state === 'spent';
    // avatar circle
    ctx.fillStyle = active ? '#E63946' : (spent ? '#888' : '#8a8a8a');
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active ? '#fff' : '#1a1a1f'; ctx.lineWidth = active ? 2 : 1.4; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(spent ? '✕' : 'U', g.x, g.y + 1);
    ctx.textAlign = 'left';
    // arm + gun
    if (g.armLen > 0) {
      const mx = g.x + Math.cos(g.angle) * g.armLen, my = g.y + Math.sin(g.angle) * g.armLen;
      ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(mx, my); ctx.stroke();
      ctx.save(); ctx.translate(mx, my); ctx.rotate(g.angle);
      ctx.fillStyle = '#0c0c0e'; ctx.fillRect(2, -3, 18, 6); ctx.restore();
      // aim laser
      if (active) {
        ctx.strokeStyle = 'rgba(230,57,70,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(g.angle) * 1400, my + Math.sin(g.angle) * 1400); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (active) this.activationOutline(ctx, g.x - g.r - 6, g.y - g.r - 6, g.r * 2 + 12, g.r * 2 + 12);
    // label below
    ctx.fillStyle = '#9a9a9a'; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText('sponsored · account', g.x, g.y + g.r + 18); ctx.textAlign = 'left';
  }

  drawFooter(ctx) {
    drawHandRect(ctx, TUT.footer.x, TUT.footer.y, TUT.footer.w, TUT.footer.h, '#ffffff', '#1a1a1f', 222, 2);
    this.bars(ctx, 40, TUT.footer.y + 22, [180, 140], 16, 8, '#c4c4c4');
    this.bars(ctx, W - 240, TUT.footer.y + 22, [200, 160], 16, 8, '#c4c4c4');
  }

  drawInfiltrate(ctx) {
    const b = TUT.infiltrate, p = this.player;
    const near = p.y > b.y - 260 || this.atExit;
    const pulse = near ? 1 + Math.sin(this.time * 5) * 0.04 : 1;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(pulse, pulse);
    ctx.fillStyle = this.atExit ? '#1a0608' : '#0c0c0e'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.strokeStyle = '#E63946'; ctx.lineWidth = near ? 3 : 2; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px "Saira Condensed", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.atExit ? 'ENTER  →' : 'INFILTRATE  →', 0, -4);
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#E63946';
    ctx.fillText(this.atExit ? 'PRESS SPACE OR CLICK TO GO IN' : 'WALK IN TO BEGIN THE REAL MISSION', 0, b.h / 2 - 12);
    ctx.textAlign = 'left'; ctx.restore();
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.fillStyle = '#1a1a1f'; ctx.strokeStyle = '#E63946'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  drawPlayer(ctx) {
    const p = this.player, s = p.size, ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    const st = this.scanTarget;
    // When the window is over un-scanned hidden text, its body becomes a dark
    // X-ray "lens" that reveals the truth beneath — clipped to the window, so
    // you only ever see the slice physically under it.
    const xraying = st && !st.scanned && this.windowOverlaps(st.rect);
    ctx.save();
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    const body = p.hitFlash > 0 ? '#fff' : (xraying ? SCAN.xrayBg : '#E63946');
    drawHandRect(ctx, px, py, s, ph, body, '#1a1a1f', 50);
    if (xraying) {
      const r = st.rect;
      ctx.save();
      ctx.beginPath(); ctx.rect(px, py, s, ph); ctx.clip();
      ctx.fillStyle = SCAN.xrayColor;
      ctx.font = st.font; ctx.textBaseline = 'middle';
      ctx.fillText(st.hidden, r.x + 12, r.y + r.h / 2);
      ctx.restore();
    }
    // title bar (drawn on top of the glass)
    ctx.fillStyle = '#1a1a1f'; ctx.fillRect(px + 1, py + 1, s - 2, 14);
    // title text — clipped to the title bar so it can't overflow the window
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 4, py + 1, s - 8, 13); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.font = '8px ui-monospace, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText(s > 70 ? 'NormalBrowser/1.0' : 'NB/1.0', px + 5, py + 8);
    ctx.restore();
    ctx.restore();
  }

  // ── helpers ──
  windowOverlaps(r) {
    const p = this.player, s = p.size, ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    return px < r.x + r.w && px + s > r.x && py < r.y + r.h && py + ph > r.y;
  }

  activationOutline(ctx, x, y, w, h) {
    const pulse = 0.5 + Math.sin(this.time * 8) * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(230,57,70,' + (0.5 + pulse * 0.4) + ')';
    ctx.lineWidth = 3; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.restore();
  }
}
