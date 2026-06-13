import Phaser from 'phaser';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { COLORS, PLAYER } from '../config.js';

// LEVEL 1.1 — TOTALLYNORMALTUBE HOME PAGE ("Take Down the Feed")
//
// The home page is packed with videos. A few are viral PROPAGANDA with insane
// view counts (billions), hidden among normal low-view videos. You move the red
// window (WASD) over the page and HOLD it over a video to scan it down (~3.5s).
//   • Scan a propaganda video → taken down. Take down 4.
//   • Complete a scan on a NORMAL video → EXPOSED → retry.
//   • Go for the 5th (the boosted doc video) → it fights back → Level 1.2.
//
// Same control + scan feel as the tutorial and the 1.2 runner (you are the
// window). Camera follows the window down the tall page.

const DW = 1920;                       // logical design width (fit to canvas width)
const SCAN_TIME = 3.5;                 // seconds to fully scan a video

const LAYOUT = {
  topBar: { h: 56 },
  chips:  { y: 56, h: 48 },
  rail:   { w: 240 },
  content:{ x: 264, top: 128, right: 40 },
};
const CONTENT_W = DW - LAYOUT.content.x - LAYOUT.content.right;

const CHIPS = ['All', 'Brain Rot', 'Distractions', 'Outrage', 'Compliance',
  'Nothing', 'Mixes', 'Live', 'Comply', 'Trending', 'New to you'];
const RAIL = [
  ['⌂', 'Home', true], ['⚡', 'Shorts'], ['▷', 'Subscriptions'],
  ['—'], ['◐', 'You'], ['◷', 'History'], ['▤', 'Playlists'], ['♡', 'Liked'],
  ['—'], ['EXPLORE'], ['♪', 'Music'], ['⛶', 'Live'], ['◉', 'Gaming'],
];
const THUMB_COLORS = [COLORS.blue, COLORS.purple, COLORS.green, COLORS.yellow,
  COLORS.red, '#0fa3b1', '#e07a5f', '#3d5a80'];

// `p` = propaganda (insane views, takedown target). `target` = the 5th that
// fights back. Everything else is normal traffic (scanning it = EXPOSED).
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
    this.taken = 0;             // propaganda taken down (0..4 in 1.1)
    this.target = 5;           // total across 1.1 + 1.2
    this.scanVid = null;       // video currently being scanned
    this.scanT = 0;            // 0..1
    this.failed = false;
    this.fighting = false;
    this.fightT = 0;

    this.buildVideos();        // sets this.videos + this.worldH

    // Player window (same feel as 1.2). Start in the gap BELOW the featured
    // row (not over any card) so it doesn't auto-scan on spawn.
    const fth = ((CONTENT_W - 48) / 3) * 9 / 16;
    this.player = { x: DW / 2, y: LAYOUT.content.top + fth + 46, w: 120, h: 90 };

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      scan: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.onKey = (e) => {
      // Narration takes priority — SPACE/Enter advance the line
      if (this.narration && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); this.advanceNarration(); return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        document.body.classList.add('menu-mode');
        this.scene.stop(); this.scene.start('MenuScene');
      } else if (this.failed && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault(); this.scene.restart({ difficulty: this.difficulty });
      }
    };
    document.addEventListener('keydown', this.onKey);

    // Reuse the runner's OBJECTIVE frame for the counter.
    this.taskFrame = document.getElementById('task-frame');
    this.taskLine = document.getElementById('task-line');
    this.taskProg = document.getElementById('task-progress');
    this.taskFrame?.classList.remove('hidden');

    // Narration: reuse the intel-dialog DOM (same look as the runner's
    // narration). Click anywhere or SPACE/Enter advances. While narration is
    // active the level is paused (no movement, no scan).
    this.intelDom = {
      wrap:    document.getElementById('intel-dialog'),
      speaker: document.getElementById('intel-speaker'),
      line:    document.getElementById('intel-line'),
      hint:    document.getElementById('intel-hint'),
    };
    this.narration = null;          // { lines, idx, typing, onDone, char, text }
    this.narrationTimer = null;
    this.onNarrationClick = (e) => {
      if (this.narration) { e.stopPropagation(); this.advanceNarration(); }
    };
    document.addEventListener('click', this.onNarrationClick);

    // Beat tracking — flag-driven narration so the same beat can't replay.
    this.beats = { intro: false, first: false, third: false, fourth: false, lost: false };
    // Kick off the intro narration after a short pause.
    setTimeout(() => this.playIntroNarration(), 600);

    this.handleResize();
    initAudio();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onNarrationClick);
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      this.taskFrame?.classList.add('hidden');
      this.intelDom?.wrap?.classList.add('hidden');
      this.intelDom?.wrap?.classList.remove('show');
    });
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

    // shorts row (decorative, not takedown-able)
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
    return { ...d, x, y, w, th, seed, removed: false, removeT: 0 };
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
  }

  update(_t, dms) {
    const dt = Math.min(0.05, dms / 1000);
    this.time += dt;

    if (this.fighting) { this.updateFight(dt); this.render(); this.updateHud(); return; }
    if (this.failed) { this.render(); return; }
    if (this.narration) { this.render(); this.updateHud(); return; }   // paused for narration

    // ── Player movement (WASD / arrows) ──
    const p = this.player;
    const speed = PLAYER.baseSpeed;
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.wasd.down.isDown || this.cursors.down.isDown) vy += 1;
    const moving = vx || vy;
    if (moving) { const l = Math.hypot(vx, vy); vx /= l; vy /= l; }
    p.x += vx * speed * dt; p.y += vy * speed * dt;
    p.x = Phaser.Math.Clamp(p.x, LAYOUT.content.x + p.w / 2, DW - LAYOUT.content.right - p.w / 2);
    p.y = Phaser.Math.Clamp(p.y, LAYOUT.chips.y + LAYOUT.chips.h + p.h / 2, this.worldH - p.h / 2);

    // ── Camera follows the window ──
    this.camY = Phaser.Math.Clamp(p.y - this.viewHW * 0.42, 0, Math.max(0, this.worldH - this.viewHW));

    // ── Scan: hover over a video shows the readout; HOLD SPACE to scan it.
    //  • Releasing SPACE (or moving off) resets progress — commitment matters.
    //  • The readout shows view count + SUSPICIOUS/normal so you can judge
    //    BEFORE committing.
    const hover = this.videoAt(p.x, p.y);
    this.hoverVid = hover;
    const holding = this.wasd.scan.isDown;
    if (holding && hover) {
      if (hover !== this.scanVid) { this.scanVid = hover; this.scanT = 0; }
      this.scanT += dt / SCAN_TIME;
      if (Math.random() < 0.18) beep(1400 + Math.random() * 500, 0.004, 'square', 0.01);
      if (this.scanT >= 1) this.resolveScan(this.scanVid);
    } else {
      // released or moved off — reset
      if (this.scanVid && this.scanT > 0) beep(220, 0.05, 'square', 0.03);
      this.scanVid = null; this.scanT = 0;
    }

    this.render();
    this.updateHud();
  }

  // Which (non-removed) video contains a world point.
  videoAt(x, y) {
    for (const v of this.videos) {
      if (v.removed) continue;
      if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.th) return v;
    }
    return null;
  }

  resolveScan(v) {
    this.scanVid = null; this.scanT = 0;
    if (v.target) {
      if (this.taken >= 4) this.startFight(v);
      else { /* the big one resists until the others are down */ this.bounceTarget(v); }
      return;
    }
    if (v.p) {                       // propaganda → taken down
      v.removed = true; v.removeT = this.time;
      this.taken++;
      beep(523, 0.09, 'sine', 0.1); setTimeout(() => beep(784, 0.14, 'sine', 0.1), 90);
      // Contextual narration beats
      if (this.taken === 1) setTimeout(() => this.playFirstTakedownNarration(), 350);
      else if (this.taken === 3) setTimeout(() => this.playThirdTakedownNarration(), 350);
      else if (this.taken === 4) setTimeout(() => this.playFourthTakedownNarration(), 350);
    } else {                         // legitimate traffic → exposed
      this.failLevel(v);
    }
  }

  // Target scanned too early — it shrugs you off.
  bounceTarget() {
    noise(0.12, 0.1); beep(160, 0.2, 'sawtooth', 0.08);
    this.flash = { t: 0.6, text: "It's too well-defended. Bring down the others first." };
  }

  failLevel() {
    this.failed = true;
    noise(0.4, 0.18); beep(90, 0.5, 'square', 0.12);
  }

  startFight(v) {
    this.fighting = true; this.fightT = 0; this.fightVid = v;
    noise(0.5, 0.2); beep(120, 0.5, 'sawtooth', 0.1);
    // Trigger the lost-contact narration. When the player dismisses the last
    // line, drop into 1.2 with `fromHomePage` so it plays its own intro.
    setTimeout(() => this.playLostContactNarration(() => {
      this.transitionToRunner();
    }), 450);
  }
  updateFight(dt) {
    this.fightT += dt;
    // Wait for narration to finish — transition is owned by playLostContact.
  }
  transitionToRunner() {
    this.scene.stop();
    this.scene.start('GameScene', { difficulty: this.difficulty, fromHomePage: true });
    this.scene.launch('HUDScene');
  }

  updateHud() {
    if (this.taskLine) {
      this.taskLine.textContent = this.taken >= 4
        ? 'Take down the BIG one (6.9B views).'
        : 'Take down the viral propaganda.';
    }
    if (this.taskProg) this.taskProg.textContent = this.taken + ' / ' + this.target;
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
    // rail (full height) + top chrome
    this.drawRail(ctx);
    this.drawChips(ctx);
    this.drawTopBar(ctx);

    // shorts row (decorative)
    this.drawShortsRow(ctx);
    // videos
    for (const v of this.videos) this.drawVideoCard(ctx, v);

    // player window
    this.drawWindow(ctx);

    // scan meter on the scanning video
    if (this.scanVid) this.drawScanMeter(ctx, this.scanVid);

    // fight glitch
    if (this.fighting) this.drawFight(ctx);

    ctx.restore();

    // screen-space: view-count readout + flash + fail overlay
    this.drawReadout(ctx);
    if (this.flash) {
      this.flash.t -= 1 / 60;
      if (this.flash.t <= 0) this.flash = null;
      else this.drawCaption(ctx, this.flash.text, '#E63946');
    }
    if (this.failed) this.drawFail(ctx);

    // hint
    ctx.fillStyle = '#9a9a9a'; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText('WASD to move  ·  HOLD SPACE on a video to scan it down  ·  ESC to exit', 18, VH - 16);
  }

  // ===== Narration (Toto + YOU exploring the level together) =====
  playIntroNarration() {
    if (this.beats.intro) return;
    this.beats.intro = true;
    this.startNarration([
      { speaker: 'TOTO', text: "Okay — I patched into HUSH's algorithm. You're standing on their home page." },
      { speaker: 'YOU',  text: "Yeah, I see it. It's all... clickbait. Endless." },
      { speaker: 'TOTO', text: "That's the point. The good stuff is buried in noise." },
      { speaker: 'TOTO', text: "Look at the view counts. Anything in the BILLIONS is a HUSH boost — that's the propaganda. Take down five of those." },
      { speaker: 'YOU',  text: "How do I take one down?" },
      { speaker: 'TOTO', text: "Move your window over a target and HOLD SPACE to scan it. Three and a half seconds, you're in." },
      { speaker: 'TOTO', text: "But scan a normal video by mistake and HUSH will flag you. Read the view counts. Be sure before you commit." },
      { speaker: 'YOU',  text: "Got it. Starting the sweep." },
    ]);
  }
  playFirstTakedownNarration() {
    if (this.beats.first) return;
    this.beats.first = true;
    this.startNarration([
      { speaker: 'YOU',  text: "One down." },
      { speaker: 'TOTO', text: "Nice. The algorithm just lost a load-bearing piece. Keep going." },
    ]);
  }
  playThirdTakedownNarration() {
    if (this.beats.third) return;
    this.beats.third = true;
    this.startNarration([
      { speaker: 'YOU',  text: "These view counts are insane." },
      { speaker: 'TOTO', text: "Manufactured. Every one of these is a bot farm pretending to be culture." },
    ]);
  }
  playFourthTakedownNarration() {
    if (this.beats.fourth) return;
    this.beats.fourth = true;
    this.startNarration([
      { speaker: 'TOTO', text: "Four down. The last one's the big one — 'What They Don't Want You To See.' That's the doc we've been after." },
      { speaker: 'YOU',  text: "Going for it." },
    ]);
  }
  // Triggered when scanning the target after 4 are down — Toto cuts out.
  playLostContactNarration(onDone) {
    if (this.beats.lost) return;
    this.beats.lost = true;
    this.startNarration([
      { speaker: 'TOTO', text: "Wait — it's pushing back. Something's wrong, I'm—" },
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
    drawHandRect(ctx, x, y, p.w, p.h, 'rgba(17,2,20,0.30)', '#1a1a1f', 50, 2);
    ctx.fillStyle = '#1a1a1f'; ctx.fillRect(x + 2, y + 2, p.w - 4, 18);
    ctx.fillStyle = '#E63946'; ctx.fillRect(x + p.w - 18, y + 5, 12, 12);
    ctx.fillStyle = '#fff'; ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('SCANNER.exe', x + 7, y + 11);
    // cyan border glow when over a scannable video
    if (this.scanVid) {
      const pulse = 0.5 + Math.sin(this.time * 8) * 0.5;
      ctx.strokeStyle = 'rgba(122,208,235,' + (0.5 + pulse * 0.4) + ')';
      ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, p.w + 4, p.h + 4);
    }
  }

  drawScanMeter(ctx, v) {
    const cx = v.x + v.w / 2, by = v.y + v.th + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(v.x + 20, by, v.w - 40, 10);
    ctx.fillStyle = '#7ad0eb'; ctx.fillRect(v.x + 20, by, (v.w - 40) * this.scanT, 10);
    ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1; ctx.strokeRect(v.x + 20, by, v.w - 40, 10);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SCANNING ' + Math.round(this.scanT * 100) + '%', cx, by + 24);
    ctx.textAlign = 'left';
  }

  // Read out the hovered video's view count near the window so the player can
  // judge propaganda (insane views) vs normal traffic before committing.
  drawReadout(ctx) {
    const v = this.scanVid || this.hoverVid;
    if (!v) return;
    const s = this.scale1;
    const sx = (this.player.x) * s, sy = (this.player.y - this.player.h / 2 - this.camY) * s - 14;
    const big = v.p || v.target;
    const verb = this.scanVid ? 'SCANNING' : 'HOLD SPACE';
    const text = v.v + ' views' + (big ? '  [!] SUSPICIOUS' : '  · normal traffic') + '   ' + verb;
    ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = big ? 'rgba(120,20,28,0.92)' : 'rgba(10,12,20,0.88)';
    ctx.fillRect(sx - w / 2, sy - 16, w, 26);
    ctx.fillStyle = big ? '#ffd5d8' : '#cfe8ff';
    ctx.fillText(text, sx, sy - 3);
    ctx.textAlign = 'left';
  }

  drawCaption(ctx, text, color) {
    const { VW } = this;
    ctx.font = "italic 600 24px 'Saira Condensed', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 40;
    ctx.fillStyle = 'rgba(10,12,20,0.88)'; ctx.fillRect(VW / 2 - w / 2, 64, w, 40);
    ctx.fillStyle = color || '#fff'; ctx.fillText(text, VW / 2, 85);
    ctx.textAlign = 'left';
  }

  drawFight(ctx) {
    // glitch bars across the target video
    const v = this.fightVid;
    const k = Math.min(1, this.fightT / 1.4);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(230,57,70,' + (0.3 + k * 0.5) + ')' : 'rgba(74,123,200,' + (0.3 + k * 0.5) + ')';
      const yy = v.y + Math.random() * v.th;
      ctx.fillRect(v.x - 10, yy, v.w + 20, 2 + Math.random() * 6);
    }
    ctx.fillStyle = 'rgba(0,0,0,' + (k * 0.6) + ')';
    ctx.fillRect(v.x - 10, v.y - 10, v.w + 20, v.th + 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText("IT'S FIGHTING BACK", v.x + v.w / 2, v.y + v.th / 2);
    ctx.textAlign = 'left';
  }

  drawFail(ctx) {
    const { VW, VH } = this;
    ctx.fillStyle = 'rgba(20,2,6,0.82)'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#E63946'; ctx.font = "bold 40px 'Saira Condensed', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EXPOSED', VW / 2, VH / 2 - 40);
    ctx.fillStyle = '#f0f0f0'; ctx.font = "20px 'Saira Condensed', sans-serif";
    ctx.fillText("That was legitimate traffic. HUSH flagged the takedown.", VW / 2, VH / 2 + 4);
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
    const sx = DW / 2 - 320, sw = 560;
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
    ctx.fillStyle = COLORS.purple; ctx.beginPath(); ctx.arc(DW - 130, 28, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
    ctx.fillText('R', DW - 130, 29); ctx.textAlign = 'left';
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
    // removed → "REMOVED" tombstone
    if (v.removed) {
      drawHandRect(ctx, x, y, w, th, '#ededed', '#d6d6d6', v.seed * 11 + 5, 1.4);
      ctx.fillStyle = '#bdbdbd'; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('▢ REMOVED', x + w / 2, y + th / 2); ctx.textAlign = 'left';
      return;
    }
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
    // avatar + title + channel + VIEWS (the tell)
    const ay = y + th + 14;
    ctx.fillStyle = THUMB_COLORS[(v.seed + 3) % THUMB_COLORS.length];
    ctx.beginPath(); ctx.arc(x + 18, ay + 6, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f0f0f'; ctx.font = 'bold 15px Arial'; ctx.textBaseline = 'top';
    this.wrap(ctx, v.t, x + 46, ay - 6, w - 50, 19, 2);
    ctx.fillStyle = '#606060'; ctx.font = '13px Arial'; ctx.fillText(v.c, x + 46, ay + 34);
    // view count — propaganda gets a bold red insane number
    const big = v.p || v.target;
    ctx.fillStyle = big ? '#c0392b' : '#606060';
    ctx.font = (big ? 'bold ' : '') + '13px Arial';
    ctx.fillText(v.v + ' views  ·  ' + (v.target ? 'pinned' : '2 hours ago'), x + 46, ay + 52);
  }

  drawShortCard(ctx, x, y, w, h, data, seed) {
    drawHandRect(ctx, x, y, w, h, THUMB_COLORS[(seed + 2) % THUMB_COLORS.length], '#cfcfcf', seed * 13 + 9, 1.4);
    // Placeholder face — a soft white circle where the Gemini art will go.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, w * 0.32, 0, Math.PI * 2); ctx.fill();
    // Title caption
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
