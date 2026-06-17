import Phaser from 'phaser';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { dist, aabb } from '../game/physics.js';
import { damagePlayer } from '../game/combat.js';
import { PLAYER, getDifficulty } from '../config.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';

// LEVEL 2 — "THE DASHBOARD" (HUSH's corrupted SEO / analytics backend)
//
// A dense top-down UI MAZE. The tunnel shrank you (Toy Story effect): the page
// is huge, your window is a tiny glass SCANNER, you glide with a little inertia.
// Chart widgets are the WALLS — branches, dead ends, choke points.
//
//   • The page has two layers: the VISIBLE dashboard, and a HIDDEN data layer
//     only your scanner reveals. Drag the scanner over the page and it x-rays
//     the region beneath it (dark-blue wireframe) — hidden docs + armed mines
//     only show up through the glass.
//   • Every widget LOOKS normal until you enter its territory — then it goes
//     red, twitches a warning, and turns hostile. Four threats:
//       PIE     → detaches, drops, and rolls through the corridors like a tire.
//       GAUGE   → needle tracks you, locks, charges, fires a heavy laser. Dash.
//       BARS    → a piston gauntlet on a fixed (learnable) rhythm; a mandatory
//                 route you must time your way through.
//       SHEET   → an Excel minefield. Some cells are mined; stepping on one is
//                 INSTANT DEATH. Subtle tells + the x-ray let you read the path.
//   • Park over a doc and HOLD SPACE to scan it. The risk is holding still.
//
// Collect the required docs → "EXPORTING…" → the dashboard collapses, a panel
// falls away to open the exit → dash out.

// ── Maze geometry — an irregular grid of blocks; panels span 1+ blocks so they
// come out long/tall/thick, and the un-used blocks + gaps form the corridors. ──
const COLX = [150, 560, 970, 1380, 1790, 2200, 2610];   // 7 columns
const ROWY = [200, 500, 800, 1100, 1400, 1700];          // 6 rows
const BLK_W = 300, BLK_H = 200;
const WORLD_W = COLX[COLX.length - 1] + BLK_W + 150;     // 3060
const WORLD_H = ROWY[ROWY.length - 1] + BLK_H + 170;     // 2070
const HEADER = { x: 0, y: 0, w: WORLD_W, h: 110 };

function blockRect(c1, r1, c2, r2) {
  return {
    x: COLX[c1], y: ROWY[r1],
    w: COLX[c2] + BLK_W - COLX[c1],
    h: ROWY[r2] + BLK_H - ROWY[r1],
  };
}

// Each panel spans a block range → varied shapes. `hostile` marks a threat;
// `exit` marks the panel that collapses to open the escape.
const PANEL_SPECS = [
  // top row — the "hero" strip
  { kind: 'line',  label: 'REACH OVER TIME',  c1: 0, r1: 0, c2: 1, r2: 0 },
  { kind: 'kpi',   label: 'DAILY ACTIVE',     c1: 2, r1: 0, c2: 2, r2: 0 },
  { kind: 'pie',   label: 'NARRATIVE SPLIT',  c1: 3, r1: 0, c2: 3, r2: 0, hostile: 'pie' },
  { kind: 'kpi',   label: 'IMPRESSIONS',      c1: 4, r1: 0, c2: 4, r2: 0 },
  { kind: 'gauge', label: 'TRUST INDEX',      c1: 6, r1: 0, c2: 6, r2: 1, hostile: 'gauge' }, // tall
  // second band
  { kind: 'kpi',   label: 'COMPLIANCE',       c1: 0, r1: 1, c2: 0, r2: 2 },                    // tall
  { kind: 'area',  label: 'SENTIMENT',        c1: 2, r1: 1, c2: 3, r2: 1 },                    // wide
  { kind: 'donut', label: 'BACKLINKS',        c1: 4, r1: 1, c2: 5, r2: 1 },                    // wide
  // piston gauntlet — a long panel; pistons drop into the corridor below it
  { kind: 'bar',   label: 'BUDGET BY DEPT',   c1: 1, r1: 2, c2: 4, r2: 2, hostile: 'bar' },    // long/wide
  { kind: 'kpi',   label: 'UPTIME',           c1: 6, r1: 2, c2: 6, r2: 2 },
  // fourth band
  { kind: 'hist',  label: 'PAYOUTS',          c1: 0, r1: 3, c2: 1, r2: 3 },                    // wide
  { kind: 'kpi',   label: 'CTR',              c1: 3, r1: 3, c2: 3, r2: 3 },
  { kind: 'line',  label: 'SUPPRESSION RATE', c1: 6, r1: 3, c2: 6, r2: 4, exit: true },        // tall → exit
  // bottom band — the minefield is labelled by this header panel
  { kind: 'table', label: 'WATCHLIST',        c1: 0, r1: 4, c2: 0, r2: 5 },                    // tall
  { kind: 'sheet', label: 'RAW EXPORTS — Sheet1', c1: 2, r1: 4, c2: 5, r2: 4, mine: true },    // minefield header
  { kind: 'kpi',   label: 'FLAGGED',          c1: 3, r1: 5, c2: 3, r2: 5 },
];

// ── Spreadsheet minefield — a walkable Excel grid (NOT a wall). Some cells are
// mined; a single misstep is instant death. Mine layout is FIXED so the path is
// learnable; the x-ray reveals armed mines in the scanner footprint. ──
const MINE_GRID = {
  x: 1790, y: 1620, cols: 8, rows: 4, cw: 132, ch: 100,
  // Column 0 is a SAFE entry lip (you can always step onto the sheet without
  // dying). The danger begins at col 1; a winding safe route threads to the
  // bonus doc at cell (4,1) and on to a far exit at (7,2). Everything else is
  // mined → instant death. Layout is FIXED so the path is learnable.
  mines: [
    [1, 0], [1, 1], [1, 3],
    [2, 0], [2, 3],
    [3, 0], [3, 3],
    [4, 0], [4, 3],
    [5, 0], [5, 2], [5, 3],
    [6, 0], [6, 3],
    [7, 0], [7, 1], [7, 3],
  ],
};

const DOCS_TARGET = 4;
const CAPTURE_TIME = 1.2;
const BASE_SPEED = 175;
const INTRO_TIME = 1.3;
const EXPORT_TIME = 4.0;

// Base damage — divided down by the difficulty modifier in damagePlayer (easy
// ≈ ×0.45). The level always runs Easy. Pie/bar land ~25-30 (~4 hits); the
// gauge laser is HEAVY (~50, half the bar) so two beams kill — dash to dodge.
// Mines are handled separately as instant death.
const DMG = { pie: 58, bar: 66, gauge: 112 };

// Light theme palette (only the X-ray layer is dark).
const C = {
  page:    '#eef1f6',
  grid:    'rgba(40,70,120,0.06)',
  header:  '#ffffff',
  headBd:  '#d7deea',
  panel:   '#ffffff',
  panelBd: '#cdd6e6',
  title:   '#5c6b86',
  hostile: '#fdeaea',
  hostBd:  '#E63946',
  hostTtl: '#c0392b',
  ink:     '#33405a',
  blue:    '#4A7BC8',
  purple:  '#9b59b6',
  yellow:  '#F4D35E',
  red:     '#E63946',
  green:   '#2D8659',
};

export default class DashboardScene extends Phaser.Scene {
  constructor() { super('DashboardScene'); }

  create(data) {
    this.difficulty = data?.difficulty || localStorage.getItem('oqw-difficulty') || 'easy';
    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    document.body.classList.remove('menu-mode');
    const urlBar = document.getElementById('browser-url');
    if (urlBar) urlBar.textContent = 'https://internal.hush/analytics/?session=expired';

    this.time = 0;
    this.introT = 0;
    this.started = false;
    this.failed = false;
    this.crashShown = false;
    this.captured = 0;
    this.captureProg = 0;
    this.exporting = false;
    this.exportT = 0;
    this.escapeReady = false;
    this.done = false;

    const player = {
      x: 330, y: 1985, w: 50, h: 36, size: 50,
      vx: 0, vy: 0,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, useHp: true,
      invuln: 0, hitFlash: 0,
      test: { immune: false },
    };
    this.player = player;
    this.gs = {
      player, sparks: [],
      stats: { damageTaken: 0, hitsReceived: 0, endedAt: 0 },
      status: 'playing', lostReason: '', time: 0,
    };

    this.panels = PANEL_SPECS.map(s => ({ ...s, ...blockRect(s.c1, s.r1, s.c2, s.r2), shake: 0, collapsed: 0, hostileActive: false }));
    this.solids = this.panels;
    this.exitPanel = this.panels.find(p => p.exit);

    this.hazards = this.buildHazards();
    this.docs = this.buildDocs();
    this.exit = null;

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.onKey = (e) => {
      if (this.narration && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); this.advanceNarration(); return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePauseMenu({ onQuit: () => this.quitToMenu() });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault(); this.restartLevel();
      }
    };
    document.addEventListener('keydown', this.onKey);

    // HUD
    this.taskFrame = document.getElementById('task-frame');
    this.taskLine = document.getElementById('task-line');
    this.taskProg = document.getElementById('task-progress');
    this.hpFrame = document.getElementById('hp-frame');
    this.hpFill = document.getElementById('hp-fill');
    this.hpNumber = document.getElementById('hp-number');
    this.taskFrame?.classList.remove('hidden');
    this.hpFrame?.classList.remove('hidden');

    // Narration
    this.intelDom = {
      wrap:    document.getElementById('intel-dialog'),
      speaker: document.getElementById('intel-speaker'),
      line:    document.getElementById('intel-line'),
      hint:    document.getElementById('intel-hint'),
    };
    this.narration = null;
    this.narrationTimer = null;
    this.onNarrationClick = (e) => { if (this.narration) { e.stopPropagation(); this.advanceNarration(); } };
    document.addEventListener('click', this.onNarrationClick);

    this.buildCrashPopup();

    this.beats = { intro: false, firstDoc: false, allDocs: false };
    setTimeout(() => this.playIntroNarration(), INTRO_TIME * 1000 + 200);

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
      this.crashEl?.remove();
    });
  }

  // ── Hazards ──
  buildHazards() {
    const mul = { easy: 0.8, normal: 1, hard: 1.15 }[this.difficulty] || 0.8;
    const list = [];
    for (const p of this.panels) {
      if (p.hostile === 'pie') {
        list.push({
          type: 'pie', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0,
          r: 46, x: p.x + p.w / 2, y: p.y + p.h / 2, vx: 0, vy: 0, dir: 1, spin: 0,
          rollSpeed: 250 * mul, triggerR: 560,
        });
      } else if (p.hostile === 'bar') {
        // Piston gauntlet: a row of pistons that slam into the corridor BELOW the
        // panel on a fixed cyclic rhythm (alternating phases → a learnable wave).
        const corridorTop = p.y + p.h;
        const n = 5;
        const pistons = [];
        for (let i = 0; i < n; i++) {
          pistons.push({
            x: p.x + (i + 0.5) * (p.w / n),
            w: 78,
            phase: i % 2 === 0 ? 0 : 0.5,   // two interleaved groups
          });
        }
        list.push({
          type: 'bar', panel: p, activated: false, alertT: 0,
          corridorTop, maxLen: 100, pistons,
          period: 2.6 / mul, struck: 0,
        });
      } else if (p.hostile === 'gauge') {
        list.push({
          type: 'gauge', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0,
          cx: p.x + p.w / 2, cy: p.y + p.h * 0.55,
          angle: Math.PI / 2, aimDur: 1.25, beamT: 0, fireAngle: 0,
          triggerR: 680, beamLen: 1800,
        });
      } else if (p.mine) {
        // Excel minefield (instant death). The panel is the header/label; the
        // grid itself is a walkable region defined by MINE_GRID.
        const g = MINE_GRID;
        const mineSet = new Set(g.mines.map(([c, r]) => c + ',' + r));
        list.push({
          type: 'sheet', panel: p, activated: false, alertT: 0,
          grid: g, mineSet,
        });
      }
    }
    return list;
  }

  buildDocs() {
    // Required (4) → tucked past each gauntlet so you must run the threats.
    // Bonus (2) → beside the pie and in the minefield, pure risk/reward.
    return [
      { x: 1230, y: 360,  required: true,  taken: false, takeT: 0 },  // top-middle, past the pie corridor
      { x: 2380, y: 760,  required: true,  taken: false, takeT: 0 },  // upper-right, under the gauge
      { x: 1240, y: 1050, required: true,  taken: false, takeT: 0 },  // inside the piston corridor
      { x: 2380, y: 1300, required: true,  taken: false, takeT: 0 },  // right side, after the gauntlet
      { x: 1230, y: 110 + 40, required: false, taken: false, takeT: 0 }, // bonus near header
      { x: 2386, y: 1720, required: false, taken: false, takeT: 0 },  // bonus — deep in the minefield
    ];
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
    this.viewWW = 1180;             // ~1180 world px visible wide (zoomed in)
    this.scale = w / this.viewWW;
    this.viewHW = h / this.scale;
  }

  quitToMenu() {
    resetPauseMenu();
    document.body.classList.add('menu-mode');
    this.scene.stop();
    this.scene.start('MenuScene');
  }
  restartLevel() {
    this.hideCrash();
    this.scene.restart({ difficulty: this.difficulty });
  }

  // ── Collision ──
  hits(x, y, w, h) {
    const box = { x: x - w / 2, y: y - h / 2, w, h };
    if (aabb(box, HEADER)) return true;
    for (const p of this.solids) { if (p.collapsed < 1 && aabb(box, p)) return true; }
    return false;
  }
  clampWorld(p) {
    p.x = Phaser.Math.Clamp(p.x, p.w / 2, WORLD_W - p.w / 2);
    p.y = Phaser.Math.Clamp(p.y, p.h / 2, WORLD_H - p.h / 2);
  }
  surfaceBelow(x, r, curY) {
    let best = WORLD_H;
    for (const s of this.solids) {
      if (s.collapsed >= 1) continue;
      if (x > s.x && x < s.x + s.w && s.y >= curY - r * 0.5 && s.y < best) best = s.y;
    }
    return best;
  }
  boulderBlocked(x, y, r) {
    for (const s of this.solids) {
      if (s.collapsed >= 1) continue;
      if (x + r > s.x && x - r < s.x + s.w && y + r > s.y + 6 && y - r < s.y + s.h - 6) return true;
    }
    return false;
  }
  resolveStuck(p) {
    for (let iter = 0; iter < 6; iter++) {
      const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      let hit = null;
      if (aabb(box, HEADER)) hit = HEADER;
      else for (const s of this.solids) { if (s.collapsed < 1 && aabb(box, s)) { hit = s; break; } }
      if (!hit) break;
      const left = hit.x - (box.x + box.w), right = (hit.x + hit.w) - box.x;
      const up = hit.y - (box.y + box.h), down = (hit.y + hit.h) - box.y;
      const px = Math.abs(left) < Math.abs(right) ? left : right;
      const py = Math.abs(up) < Math.abs(down) ? up : down;
      if (Math.abs(px) < Math.abs(py)) p.x += px; else p.y += py;
    }
    this.clampWorld(p);
  }

  // Instant death (minefield). Respects invuln + dev immune.
  killPlayer(reason) {
    const p = this.player;
    if (p.invuln > 0 || (p.test && p.test.immune)) return;
    p.hp = 0;
    this.gs.status = 'lost';
    this.gs.lostReason = reason;
    this.gs.stats.endedAt = this.time;
    noise(0.6, 0.22); beep(80, 0.5, 'square', 0.13);
    for (let i = 0; i < 22; i++) this.gs.sparks.push({
      x: p.x, y: p.y, life: 0.6, hit: true,
      vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420,
    });
  }

  update(_t, dms) {
    const dt = Math.min(0.05, dms / 1000);
    if (isPauseOpen()) { this.render(); return; }
    this.time += dt;
    this.gs.time = this.time;
    if (this.introT < INTRO_TIME) this.introT += dt;

    this.gs.sparks = this.gs.sparks.filter(s => {
      s.life -= dt; s.x += (s.vx || 0) * dt; s.y += (s.vy || 0) * dt;
      if (s.vx !== undefined) { s.vx *= 0.92; s.vy *= 0.92; }
      return s.life > 0;
    });

    if (this.gs.status === 'lost') this.failed = true;
    if (this.failed) { if (!this.crashShown) this.showCrash(); this.render(); this.updateHud(); return; }
    if (this.done) { this.render(); this.updateHud(); return; }
    if (this.narration) { this.render(); this.updateHud(); return; }

    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;

    // ── Movement with a little glass-y inertia ──
    const sp = BASE_SPEED * (this.keys.shift.isDown ? PLAYER.boostMul : 1);
    let ix = 0, iy = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) ix -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) ix += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) iy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) iy += 1;
    if (ix || iy) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; }
    const dvx = ix * sp, dvy = iy * sp;
    const rate = (ix || iy) ? 9 : 5.5;        // snappier to start, slight glide to stop
    p.vx += (dvx - p.vx) * Math.min(1, dt * rate);
    p.vy += (dvy - p.vy) * Math.min(1, dt * rate);

    const stuck = this.hits(p.x, p.y, p.w, p.h);
    const nx = p.x + p.vx * dt;
    if (stuck || !this.hits(nx, p.y, p.w, p.h)) p.x = nx; else p.vx = 0;
    const ny = p.y + p.vy * dt;
    if (stuck || !this.hits(p.x, ny, p.w, p.h)) p.y = ny; else p.vy = 0;
    this.clampWorld(p);

    this.camX = Phaser.Math.Clamp(p.x - this.viewWW / 2, 0, Math.max(0, WORLD_W - this.viewWW));
    this.camY = Phaser.Math.Clamp(p.y - this.viewHW / 2, 0, Math.max(0, WORLD_H - this.viewHW));

    if (this.started) this.updateHazards(dt);
    this.updateCapture(dt);
    this.updateEscape(dt);

    this.render();
    this.updateHud();
  }

  // ── Activation: a widget stays inert until you enter its territory, then it
  // reddens, twitches a warning, and turns hostile. ──
  tryActivate(hz, px, py, range) {
    if (hz.activated) { if (hz.alertT < 1) hz.alertT = Math.min(1, hz.alertT + 0.05); return; }
    const c = { x: hz.panel.x + hz.panel.w / 2, y: hz.panel.y + hz.panel.h / 2 };
    if (dist(px, py, c.x, c.y) < range) {
      hz.activated = true; hz.alertT = 0;
      hz.panel.hostileActive = true; hz.panel.shake = 1;
      beep(240, 0.16, 'sawtooth', 0.07); setTimeout(() => beep(180, 0.2, 'square', 0.06), 110);
    }
  }

  // ── Hazard behaviors ──
  updateHazards(dt) {
    const p = this.player;
    for (const hz of this.hazards) {
      if (hz.panel) hz.panel.shake = Math.max(0, hz.panel.shake - dt * 3);
      if (hz.type === 'pie') this.updatePie(hz, dt, p);
      else if (hz.type === 'bar') this.updateBar(hz, dt, p);
      else if (hz.type === 'gauge') this.updateGauge(hz, dt, p);
      else if (hz.type === 'sheet') this.updateSheet(hz, dt, p);
    }
  }

  updatePie(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.55);
    const cx = hz.panel.x + hz.panel.w / 2, cy = hz.panel.y + hz.panel.h / 2;
    const near = dist(p.x, p.y, cx, cy) < hz.triggerR;
    if (hz.state === 'idle') {
      if (hz.cooldown > 0) hz.cooldown -= dt;
      if (hz.activated && near && hz.cooldown <= 0) { hz.state = 'windup'; hz.t = 0; hz.panel.shake = 1; beep(180, 0.2, 'sawtooth', 0.07); }
      return;
    }
    if (hz.state === 'windup') {
      hz.t += dt; hz.panel.shake = 1;
      if (hz.t > 0.7) {
        hz.state = 'active'; hz.t = 0;
        hz.dir = p.x >= cx ? 1 : -1;
        hz.x = cx; hz.y = hz.panel.y + hz.panel.h - hz.r - 2;
        hz.vx = hz.dir * hz.rollSpeed; hz.vy = 0;
        noise(0.25, 0.12); beep(90, 0.4, 'square', 0.09);
      }
      return;
    }
    // rolling tire — gravity + rolls over surfaces and drops through gaps
    const GRAV = 1700;
    hz.vy += GRAV * dt;
    let ny = hz.y + hz.vy * dt;
    if (hz.vy > 0) {
      const surf = this.surfaceBelow(hz.x, hz.r, hz.y);
      if (ny + hz.r >= surf) { ny = surf - hz.r; hz.vy = 0; }
    }
    hz.y = ny;
    hz.vx = hz.dir * hz.rollSpeed;
    const nx = hz.x + hz.vx * dt;
    const grounded = hz.vy === 0;
    if (grounded && this.boulderBlocked(nx, hz.y, hz.r)) hz.dir *= -1;
    else hz.x = nx;
    if (hz.x < hz.r) { hz.x = hz.r; hz.dir = 1; }
    if (hz.x > WORLD_W - hz.r) { hz.x = WORLD_W - hz.r; hz.dir = -1; }
    hz.spin += hz.vx / hz.r * dt;
    if (p.invuln <= 0 && dist(p.x, p.y, hz.x, hz.y) < hz.r + p.h * 0.4) {
      damagePlayer(this.gs, DMG.pie, (p.x - hz.x) >= 0 ? 70 : -70, -18);
      this.resolveStuck(p);
    }
    hz.t += dt;
    if (hz.t > 9) { hz.state = 'idle'; hz.cooldown = 3; hz.x = cx; hz.y = cy; hz.vx = hz.vy = 0; }
  }

  // Piston gauntlet — fixed cyclic rhythm; deadly only while a piston is
  // extended into the corridor. Damage is heavy but it's not lethal.
  updateBar(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, 360);
    if (hz.struck > 0) hz.struck -= dt;
    if (!hz.activated) return;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (const pis of hz.pistons) {
      const ext = pistonExt((this.time / hz.period + pis.phase) % 1);
      pis.ext = ext;
      if (ext > 0.5) {
        const len = ext * hz.maxLen;
        const rect = { x: pis.x - pis.w / 2, y: hz.corridorTop, w: pis.w, h: len };
        if (p.invuln <= 0 && aabb(rect, pb)) {
          damagePlayer(this.gs, DMG.bar, 0, 46); this.resolveStuck(p); hz.struck = 0.2;
        }
      }
    }
  }

  updateGauge(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.6);
    const near = dist(p.x, p.y, hz.cx, hz.cy) < hz.triggerR;
    if (hz.state === 'idle') {
      if (hz.cooldown > 0) hz.cooldown -= dt;
      if (hz.activated && near && hz.cooldown <= 0) { hz.state = 'aim'; hz.t = 0; hz.panel.shake = 0.6; beep(300, 0.25, 'sine', 0.06); }
      return;
    }
    if (hz.state === 'aim') {
      hz.t += dt;
      const target = Math.atan2(p.y - hz.cy, p.x - hz.cx);
      let d = target - hz.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      hz.angle += d * Math.min(1, dt * 3.2);       // eased track → dodgeable
      // a rising charge tone in the last third telegraphs the shot
      if (hz.t > hz.aimDur * 0.66 && Math.random() < 0.4) beep(500 + hz.t * 220, 0.03, 'sine', 0.05);
      if (hz.t > hz.aimDur) {
        hz.state = 'fire'; hz.beamT = 0.18; hz.fireAngle = hz.angle;
        noise(0.2, 0.1); beep(1200, 0.08, 'square', 0.13);
        if (p.invuln <= 0 && this.rayHitsPlayer(hz.cx, hz.cy, hz.fireAngle, hz.beamLen, p.h * 0.6 + 8, p)) {
          const kx = Math.cos(hz.fireAngle) * 90, ky = Math.sin(hz.fireAngle) * 90;
          damagePlayer(this.gs, DMG.gauge, kx, ky);
          this.resolveStuck(p);
        }
      }
      return;
    }
    if (hz.state === 'fire') {
      hz.beamT -= dt;
      if (hz.beamT <= 0) { hz.state = 'idle'; hz.cooldown = 3.0; }
    }
  }
  rayHitsPlayer(ox, oy, ang, maxLen, halfW, p) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const t = (p.x - ox) * dx + (p.y - oy) * dy;
    if (t < 0 || t > maxLen) return false;
    const projx = ox + dx * t, projy = oy + dy * t;
    return Math.hypot(p.x - projx, p.y - projy) < halfW;
  }

  // Spreadsheet minefield — instant death on a mined cell.
  updateSheet(hz, dt, p) {
    const g = hz.grid;
    if (p.x < g.x || p.x > g.x + g.cols * g.cw || p.y < g.y || p.y > g.y + g.rows * g.ch) return;
    this.tryActivate(hz, p.x, p.y, 9999);    // entering the sheet reveals it
    const col = Math.floor((p.x - g.x) / g.cw);
    const row = Math.floor((p.y - g.y) / g.ch);
    if (!hz.mineSet.has(col + ',' + row)) return;
    // only trip near the cell centre so edge-grazing is survivable
    const ccx = g.x + (col + 0.5) * g.cw, ccy = g.y + (row + 0.5) * g.ch;
    if (Math.abs(p.x - ccx) < g.cw * 0.4 && Math.abs(p.y - ccy) < g.ch * 0.4) {
      this.killPlayer('STEPPED ON A MINE');
    }
  }

  // ── Doc capture ──
  updateCapture(dt) {
    const p = this.player;
    const holding = this.keys.space.isDown;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    let target = null;
    for (const d of this.docs) {
      if (d.taken) continue;
      if (d.x > pb.x && d.x < pb.x + pb.w && d.y > pb.y && d.y < pb.y + pb.h) { target = d; break; }
    }
    this.captureTarget = target;
    if (target && holding) {
      this.captureProg += dt / CAPTURE_TIME;
      if (Math.random() < 0.3) beep(1400 + Math.random() * 400, 0.01, 'square', 0.02);
      if (this.captureProg >= 1) { this.collectDoc(target); this.captureProg = 0; }
    } else {
      this.captureProg = Math.max(0, this.captureProg - dt * 2);
    }
  }
  collectDoc(d) {
    d.taken = true; d.takeT = this.time;
    beep(880, 0.08, 'sine', 0.13); setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
    if (d.required) this.captured++;
    if (this.captured === 1 && d.required) setTimeout(() => this.playFirstDocNarration(), 250);
    else if (this.captured >= DOCS_TARGET) setTimeout(() => this.playAllDocsNarration(), 250);
  }

  // ── Escape ──
  updateEscape(dt) {
    if (!this.exporting) return;
    const p = this.player;
    p.invuln = Math.max(p.invuln, 0.2);
    this.exportT = Math.min(EXPORT_TIME, this.exportT + dt);
    const frac = this.exportT / EXPORT_TIME;
    for (const pnl of this.panels) {
      const target = pnl.exit ? 1 : Math.min(0.6, frac * 0.6);
      pnl.collapsed = Math.min(target, pnl.collapsed + dt * 0.6);
    }
    if (this.exportT >= EXPORT_TIME && !this.escapeReady) {
      this.escapeReady = true;
      this.exit = { x: this.exitPanel.x + this.exitPanel.w / 2, y: this.exitPanel.y + this.exitPanel.h / 2, r: 78 };
      beep(523, 0.1, 'sine', 0.1); setTimeout(() => beep(784, 0.2, 'sine', 0.12), 120);
    }
    if (this.escapeReady && this.exit && dist(p.x, p.y, this.exit.x, this.exit.y) < this.exit.r) this.finishLevel();
  }
  startExport() {
    if (this.exporting) return;
    this.exporting = true;
    noise(0.4, 0.15); beep(120, 0.5, 'sawtooth', 0.09);
  }
  finishLevel() {
    if (this.done) return;
    this.done = true;
    beep(659, 0.12, 'sine', 0.12); setTimeout(() => beep(988, 0.25, 'sine', 0.12), 130);
    this.startNarration([
      { speaker: 'YOU', text: 'Files are out. So am I.' },
      { speaker: 'SYSTEM', text: '> EXFILTRATION COMPLETE' },
    ], () => { this.quitToMenu(); });
  }

  // ── Crash / restart popup (DOM) ──
  buildCrashPopup() {
    const el = document.createElement('div');
    el.id = 'dash-crash';
    el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99990;background:rgba(30,40,60,0.35);font-family:Tahoma,Arial,sans-serif;';
    el.innerHTML = `
      <div style="width:380px;background:#ece9d8;border:1px solid #0a246a;border-radius:7px;overflow:hidden;box-shadow:0 14px 50px rgba(0,0,0,.45);">
        <div style="background:linear-gradient(180deg,#2a64d8,#0a246a);color:#fff;font-weight:bold;font-size:13px;padding:6px 10px;">window.exe — Not Responding</div>
        <div style="padding:20px 22px;display:flex;gap:16px;align-items:flex-start;">
          <div style="font-size:34px;line-height:1;">⛔</div>
          <div style="font-size:13px;color:#1a1a1a;line-height:1.5;">
            <b>The window has crashed.</b><br><br>
            <span id="dash-crash-reason">HUSH's dashboard caught up with you and your session was terminated.</span>
          </div>
        </div>
        <div style="padding:0 22px 20px;text-align:right;">
          <button id="dash-restart" style="font:bold 13px Tahoma,Arial;padding:6px 16px;margin-right:8px;border:1px solid #0a246a;border-radius:4px;background:#3a78e0;color:#fff;cursor:pointer;">Restart level</button>
          <button id="dash-menu" style="font:13px Tahoma,Arial;padding:6px 16px;border:1px solid #888;border-radius:4px;background:#f3f1e6;color:#222;cursor:pointer;">Main menu</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#dash-restart').onclick = () => this.restartLevel();
    el.querySelector('#dash-menu').onclick = () => { this.hideCrash(); this.quitToMenu(); };
    this.crashEl = el;
    this.crashReasonEl = el.querySelector('#dash-crash-reason');
  }
  showCrash() {
    this.crashShown = true;
    if (this.crashReasonEl) {
      this.crashReasonEl.textContent = this.gs.lostReason === 'STEPPED ON A MINE'
        ? 'A spreadsheet cell was mined. The window was vaporised instantly.'
        : "HUSH's dashboard caught up with you and your session was terminated.";
    }
    if (this.crashEl) this.crashEl.style.display = 'flex';
  }
  hideCrash() { this.crashShown = false; if (this.crashEl) this.crashEl.style.display = 'none'; }

  updateHud() {
    if (this.taskLine) {
      this.taskLine.textContent = this.escapeReady ? 'Get to the exit!'
        : this.exporting ? 'Exporting evidence… hold on.'
        : 'X-ray the page. Hold SPACE on a doc to grab it.';
    }
    if (this.taskProg) this.taskProg.textContent = this.captured + ' / ' + DOCS_TARGET;
    const p = this.player;
    const pct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    if (this.hpFill) {
      this.hpFill.style.width = (pct * 100) + '%';
      this.hpFill.style.background = pct > 0.5 ? C.green : pct > 0.25 ? C.yellow : C.red;
    }
    if (this.hpNumber) this.hpNumber.textContent = Math.max(0, Math.round(p.hp));
  }

  // ===== Render =====
  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;

    ctx.fillStyle = C.page; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX, -this.camY);

    ctx.fillStyle = C.page; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let gx = 0; gx < WORLD_W; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke(); }
    for (let gy = 0; gy < WORLD_H; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke(); }

    this.drawHeader(ctx);
    this.drawMinefield(ctx);
    for (const pnl of this.panels) this.drawPanel(ctx, pnl);

    // piston gauntlet
    for (const hz of this.hazards) if (hz.type === 'bar' && hz.activated) this.drawPistons(ctx, hz);
    // gauge beams
    for (const hz of this.hazards) if (hz.type === 'gauge' && (hz.state === 'aim' || hz.state === 'fire')) this.drawGaugeBeam(ctx, hz);
    // pie boulders
    for (const hz of this.hazards) if (hz.type === 'pie' && hz.state === 'active') this.drawBoulder(ctx, hz);

    if (this.exit && this.escapeReady) this.drawExit(ctx);

    for (const s of this.gs.sparks) {
      ctx.fillStyle = s.hit ? 'rgba(230,57,70,' + (s.life * 1.6) + ')' : 'rgba(60,60,60,' + (s.life * 0.3) + ')';
      ctx.fillRect(s.x, s.y, 3, 3);
    }

    this.drawXray(ctx);
    this.drawWindow(ctx);

    ctx.restore();

    if (this.introT < INTRO_TIME) this.drawIntroIris(ctx);
    if (this.exporting && !this.done) this.drawExportBar(ctx);
    if (this.failed) { ctx.fillStyle = 'rgba(238,241,246,0.5)'; ctx.fillRect(0, 0, VW, VH); }
    else {
      ctx.fillStyle = C.title; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText('WASD move  ·  SHIFT dash  ·  HOLD SPACE to scan  ·  R restart  ·  ESC to exit', 18, VH - 16);
    }
  }

  drawHeader(ctx) {
    drawHandRect(ctx, HEADER.x, HEADER.y, HEADER.w, HEADER.h, C.header, C.headBd, 3, 2);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(64, 55, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = 'bold 36px "Saira Condensed", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('HUSH  ·  SEO / ANALYTICS', 100, 56);
    ctx.fillStyle = '#9aa6bd'; ctx.font = '18px Consolas, monospace';
    ctx.fillText('INTERNAL  //  DO NOT DISTRIBUTE', WORLD_W - 430, 56);
  }

  drawPanel(ctx, pnl) {
    if (pnl.collapsed >= 1) {
      ctx.strokeStyle = 'rgba(120,150,200,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.strokeRect(pnl.x, pnl.y, pnl.w, pnl.h); ctx.setLineDash([]);
      return;
    }
    ctx.save();
    const sh = pnl.shake > 0 ? Math.sin(this.time * 60) * pnl.shake * 3 : 0;
    ctx.translate(sh, 0);
    if (pnl.collapsed > 0) ctx.globalAlpha = 1 - pnl.collapsed;
    const hostile = pnl.hostileActive;
    const fill = hostile ? this.lerpHostileFill(pnl) : C.panel;
    drawHandRect(ctx, pnl.x, pnl.y, pnl.w, pnl.h, fill, hostile ? C.hostBd : C.panelBd, pnl.x + pnl.y, 2);
    ctx.fillStyle = hostile ? C.hostTtl : C.title; ctx.font = 'bold 20px Consolas, monospace';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(pnl.label, pnl.x + 20, pnl.y + 16);
    if (hostile) {
      ctx.fillStyle = C.red; ctx.font = 'bold 14px Consolas, monospace'; ctx.textAlign = 'right';
      const blink = Math.sin(this.time * 8) > 0;
      if (blink) ctx.fillText('● HOSTILE', pnl.x + pnl.w - 18, pnl.y + 20);
      ctx.textAlign = 'left';
    }
    const cx = pnl.x + 20, cy = pnl.y + 56, cw = pnl.w - 40, ch = pnl.h - 78;
    if (ch > 30) switch (pnl.kind) {
      case 'kpi':   this.artKpi(ctx, cx, cy, cw, ch, pnl); break;
      case 'line':  this.artLine(ctx, cx, cy, cw, ch, pnl); break;
      case 'area':  this.artArea(ctx, cx, cy, cw, ch, pnl); break;
      case 'table': this.artTable(ctx, cx, cy, cw, ch); break;
      case 'sheet': this.artTable(ctx, cx, cy, cw, ch); break;
      case 'gauge': this.artGauge(ctx, cx, cy, cw, ch); break;
      case 'hist':  this.artBars(ctx, cx, cy, cw, ch, pnl, false); break;
      case 'donut': this.artDonut(ctx, cx, cy, cw, ch); break;
      case 'pie':   this.artPie(ctx, cx, cy, cw, ch, pnl); break;
      case 'bar':   this.artBars(ctx, cx, cy, cw, ch, pnl, true); break;
    }
    ctx.restore();
  }
  // Hostile panels fade from white → alarm-red over their first ~0.4s active.
  lerpHostileFill(pnl) {
    const hz = this.hazards.find(h => h.panel === pnl);
    const a = hz ? hz.alertT : 1;
    return a < 1 ? `rgba(253,234,234,${0.3 + a * 0.7})` : C.hostile;
  }

  artKpi(ctx, x, y, w, h, pnl) {
    ctx.fillStyle = C.ink; ctx.font = 'bold 52px "Saira Condensed", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const vals = { 'DAILY ACTIVE': '4.2M', COMPLIANCE: '100%', UPTIME: '99.99%', IMPRESSIONS: '262K', CTR: '4.0%', FLAGGED: '1,204' };
    ctx.fillText(vals[pnl.label] || '∞', x, y + Math.min(h * 0.45, 56));
    ctx.fillStyle = C.green; ctx.font = '16px Consolas, monospace';
    if (h > 120) ctx.fillText('▲ on target', x, y + h * 0.82);
  }
  artLine(ctx, x, y, w, h, pnl) {
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const px = x + (w * i / 10), py = y + h * 0.5 + Math.sin(i * 0.9 + pnl.x) * h * 0.34;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  artArea(ctx, x, y, w, h, pnl) {
    ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 10; i++) ctx.lineTo(x + (w * i / 10), y + h * 0.55 + Math.cos(i * 0.8 + pnl.x) * h * 0.3);
    ctx.lineTo(x + w, y + h); ctx.closePath();
    ctx.fillStyle = 'rgba(155,89,182,0.3)'; ctx.fill();
    ctx.strokeStyle = C.purple; ctx.lineWidth = 2; ctx.stroke();
  }
  artTable(ctx, x, y, w, h) {
    const rows = Math.max(2, Math.floor(h / 46)), rh = h / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(40,70,120,0.05)' : 'rgba(40,70,120,0.1)';
      ctx.fillRect(x, y + i * rh, w, rh - 4);
      ctx.fillStyle = '#9fb0cc';
      ctx.fillRect(x + 8, y + i * rh + rh / 2 - 4, w * (0.3 + (i % 3) * 0.2), 8);
      ctx.fillStyle = '#c2ccdd';
      ctx.fillRect(x + w - 90, y + i * rh + rh / 2 - 4, 70, 8);
    }
  }
  artGauge(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + Math.min(h * 0.9, h - 6), r = Math.min(w * 0.42, h * 0.7);
    ctx.strokeStyle = '#d2dae8'; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = C.yellow; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(Math.PI * 1.3) * r, cy + Math.sin(Math.PI * 1.3) * r); ctx.stroke();
  }
  artDonut(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.42, ir = r * 0.58;
    const segs = [0.4, 0.25, 0.2, 0.15], cols = [C.blue, C.green, C.yellow, C.purple];
    let a = -Math.PI / 2;
    for (let i = 0; i < segs.length; i++) {
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + segs[i] * Math.PI * 2); ctx.closePath(); ctx.fill();
      a += segs[i] * Math.PI * 2;
    }
    ctx.fillStyle = C.panel; ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
  }
  artPie(ctx, x, y, w, h, pnl) {
    const hz = this.hazards.find(z => z.panel === pnl);
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.46;
    // when the tire has detached, leave an empty dashed socket
    if (hz && (hz.state === 'windup' || hz.state === 'active')) {
      ctx.strokeStyle = 'rgba(192,57,43,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    const segs = [0.45, 0.3, 0.25], cols = [C.red, C.blue, C.yellow];
    let a = -Math.PI / 2;
    for (let i = 0; i < segs.length; i++) {
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + segs[i] * Math.PI * 2); ctx.closePath(); ctx.fill();
      a += segs[i] * Math.PI * 2;
    }
  }
  artBars(ctx, x, y, w, h, pnl, hostile) {
    const n = 5, gap = w / n, bw = gap * 0.6;
    for (let i = 0; i < n; i++) {
      const bh = h * (0.3 + ((i * 7 + Math.floor(pnl.x)) % 10) / 14);
      ctx.fillStyle = (hostile && pnl.hostileActive) ? C.red : C.blue;
      ctx.fillRect(x + i * gap + (gap - bw) / 2, y + h - bh, bw, bh);
    }
  }

  // ── Minefield floor (drawn under the panels pass so the header sits on top) ──
  drawMinefield(ctx) {
    const hz = this.hazards.find(h => h.type === 'sheet');
    if (!hz) return;
    const g = hz.grid;
    const W = g.cols * g.cw, H = g.rows * g.ch;
    ctx.fillStyle = '#fbfdff'; ctx.fillRect(g.x, g.y, W, H);
    // column letters + row numbers (Excel chrome)
    ctx.fillStyle = '#e7edf6'; ctx.fillRect(g.x, g.y - 24, W, 24); ctx.fillRect(g.x - 30, g.y, 30, H);
    ctx.fillStyle = '#8a99b5'; ctx.font = '13px Consolas, monospace'; ctx.textBaseline = 'middle';
    for (let c = 0; c < g.cols; c++) { ctx.textAlign = 'center'; ctx.fillText(String.fromCharCode(65 + c), g.x + (c + 0.5) * g.cw, g.y - 12); }
    for (let r = 0; r < g.rows; r++) { ctx.textAlign = 'center'; ctx.fillText(String(r + 1), g.x - 15, g.y + (r + 0.5) * g.ch); }
    ctx.textAlign = 'left';
    // grid lines
    ctx.strokeStyle = '#d6deeb'; ctx.lineWidth = 1;
    for (let c = 0; c <= g.cols; c++) { ctx.beginPath(); ctx.moveTo(g.x + c * g.cw, g.y); ctx.lineTo(g.x + c * g.cw, g.y + H); ctx.stroke(); }
    for (let r = 0; r <= g.rows; r++) { ctx.beginPath(); ctx.moveTo(g.x, g.y + r * g.ch); ctx.lineTo(g.x + W, g.y + r * g.ch); ctx.stroke(); }
    // EXTREMELY subtle tell on mined cells: a hair-darker fill + a tiny corner tick
    for (const key of hz.mineSet) {
      const [c, r] = key.split(',').map(Number);
      const cx = g.x + c * g.cw, cy = g.y + r * g.ch;
      ctx.fillStyle = hz.activated ? 'rgba(230,57,70,0.05)' : 'rgba(40,60,90,0.035)';
      ctx.fillRect(cx + 1, cy + 1, g.cw - 2, g.ch - 2);
      ctx.fillStyle = hz.activated ? 'rgba(230,57,70,0.5)' : 'rgba(120,135,160,0.5)';
      ctx.fillRect(cx + g.cw - 7, cy + 4, 3, 3);
    }
  }

  drawPistons(ctx, hz) {
    for (const pis of hz.pistons) {
      const ext = pis.ext ?? pistonExt((this.time / hz.period + pis.phase) % 1);
      const len = ext * hz.maxLen;
      const x = pis.x - pis.w / 2;
      // telegraph: a faint danger column when winding up
      if (ext > 0.05 && ext <= 0.5) {
        ctx.fillStyle = 'rgba(230,57,70,' + (0.06 + ext * 0.12) + ')';
        ctx.fillRect(x, hz.corridorTop, pis.w, hz.maxLen);
      }
      if (len > 1) {
        drawHandRect(ctx, x, hz.corridorTop, pis.w, len, 'rgba(230,57,70,0.92)', '#7a1420', pis.x, 2);
        // piston head
        ctx.fillStyle = '#9a1a28'; ctx.fillRect(x - 4, hz.corridorTop + len - 12, pis.w + 8, 14);
      }
    }
  }

  drawBoulder(ctx, hz) {
    ctx.save();
    ctx.translate(hz.x, hz.y);
    ctx.rotate(hz.spin);
    const segs = [0.45, 0.3, 0.25], cols = ['#E63946', '#b71c2b', '#7a1420'];
    let a = 0;
    for (let i = 0; i < segs.length; i++) {
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, hz.r, a, a + segs[i] * Math.PI * 2); ctx.closePath(); ctx.fill();
      a += segs[i] * Math.PI * 2;
    }
    ctx.strokeStyle = '#3a0008'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, hz.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawGaugeBeam(ctx, hz) {
    const firing = hz.state === 'fire';
    const ang = firing ? hz.fireAngle : hz.angle;
    const ex = hz.cx + Math.cos(ang) * hz.beamLen, ey = hz.cy + Math.sin(ang) * hz.beamLen;
    ctx.save();
    if (firing) {
      ctx.strokeStyle = 'rgba(230,57,70,0.95)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(hz.cx, hz.cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,220,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hz.cx, hz.cy); ctx.lineTo(ex, ey); ctx.stroke();
    } else {
      // charge tell: dashed aim line that thickens as the lock completes
      const f = Math.min(1, hz.t / hz.aimDur);
      const pulse = 0.35 + Math.sin(this.time * 30) * 0.25 + f * 0.3;
      ctx.strokeStyle = 'rgba(230,57,70,' + pulse + ')'; ctx.lineWidth = 1.5 + f * 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(hz.cx, hz.cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(hz.cx, hz.cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawExit(ctx) {
    const e = this.exit, pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
    ctx.fillStyle = 'rgba(45,134,89,' + (0.3 + pulse * 0.3) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + pulse * 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.green; ctx.font = 'bold 28px "Saira Condensed", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('▶ EXIT', e.x, e.y); ctx.textAlign = 'left';
  }

  // X-ray: the region under the window → dark blue wireframe (the only dark
  // layer in this light level). Reveals hidden docs + armed minefield cells.
  drawXray(ctx) {
    const p = this.player, pad = 6;
    const rx = p.x - p.w / 2 - pad, ry = p.y - p.h / 2 - pad, rw = p.w + pad * 2, rh = p.h + pad * 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.fillStyle = '#06223a'; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(150,225,255,0.85)'; ctx.lineWidth = 1.5;
    const region = { x: rx, y: ry, w: rw, h: rh };
    for (const pnl of [HEADER, ...this.panels]) {
      if (pnl.collapsed >= 1) continue;
      if (!aabb(region, pnl)) continue;
      ctx.strokeRect(pnl.x, pnl.y, pnl.w, pnl.h);
      ctx.beginPath(); ctx.moveTo(pnl.x, pnl.y); ctx.lineTo(pnl.x + pnl.w, pnl.y + pnl.h); ctx.stroke();
    }
    // minefield cells in the footprint → bright red armed mines
    const sheet = this.hazards.find(h => h.type === 'sheet');
    if (sheet) {
      const g = sheet.grid;
      for (const key of sheet.mineSet) {
        const [c, r] = key.split(',').map(Number);
        const mx = g.x + (c + 0.5) * g.cw, my = g.y + (r + 0.5) * g.ch;
        if (mx < rx || mx > rx + rw || my < ry || my > ry + rh) continue;
        this.drawMineSkeleton(ctx, mx, my);
      }
    }
    for (const d of this.docs) {
      if (d.taken) continue;
      if (d.x < rx || d.x > rx + rw || d.y < ry || d.y > ry + rh) continue;
      this.drawDocSkeleton(ctx, d.x, d.y, d.required);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,225,255,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh);

    // "Hold SPACE to Scan" prompt when a doc is framed
    if (this.captureTarget) {
      const d = this.captureTarget;
      ctx.save();
      ctx.fillStyle = 'rgba(6,34,58,0.92)';
      ctx.font = 'bold 13px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const txt = this.captureProg > 0 ? 'SCANNING…' : 'Hold SPACE to Scan';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(189,252,255,0.95)'; ctx.fillRect(d.x - tw / 2 - 8, d.y - 44, tw + 16, 20);
      ctx.fillStyle = '#06223a'; ctx.fillText(txt, d.x, d.y - 27);
      ctx.restore();
    }
  }
  drawDocSkeleton(ctx, x, y, required) {
    const pulse = 0.6 + Math.sin(this.time * 6) * 0.4;
    ctx.save(); ctx.globalAlpha = pulse;
    ctx.strokeStyle = required ? '#bdfcff' : '#ffe08a'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 12, y - 16, 24, 32);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(x - 7, y - 9 + i * 7); ctx.lineTo(x + 7, y - 9 + i * 7); }
    ctx.stroke();
    if (this.captureTarget && this.captureTarget.x === x && this.captureTarget.y === y && this.captureProg > 0) {
      ctx.globalAlpha = 1; ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + this.captureProg * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  drawMineSkeleton(ctx, x, y) {
    const pulse = 0.5 + Math.sin(this.time * 10) * 0.5;
    ctx.save(); ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.strokeStyle = '#ff7a7a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
      ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); ctx.stroke();
    }
    ctx.restore();
  }

  // Polished glass scanner window (a cleaner take on the L1.2 red window).
  drawWindow(ctx) {
    const p = this.player, x = p.x - p.w / 2, y = p.y - p.h / 2, r = 8;
    ctx.save();
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.5;
    // soft outer glow
    ctx.shadowColor = 'rgba(120,200,255,0.6)'; ctx.shadowBlur = 14;
    roundRectPath(ctx, x, y, p.w, p.h, r);
    if (p.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
    } else {
      const grad = ctx.createLinearGradient(x, y, x, y + p.h);
      grad.addColorStop(0, 'rgba(180,225,255,0.30)');
      grad.addColorStop(1, 'rgba(90,150,210,0.14)');
      ctx.fillStyle = grad;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    // crisp glass border
    ctx.strokeStyle = 'rgba(20,60,100,0.85)'; ctx.lineWidth = 2; roundRectPath(ctx, x, y, p.w, p.h, r); ctx.stroke();
    // slim title bar
    ctx.save();
    roundRectPath(ctx, x, y, p.w, 11, r); ctx.clip();
    ctx.fillStyle = 'rgba(15,45,75,0.9)'; ctx.fillRect(x, y, p.w, 11);
    ctx.restore();
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + p.w - 8, y + 6, 2.6, 0, Math.PI * 2); ctx.fill();
    // diagonal highlight streak (glass)
    ctx.save();
    roundRectPath(ctx, x, y, p.w, p.h, r); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + 4, y + p.h * 0.7); ctx.lineTo(x + p.w * 0.55, y + 12); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawIntroIris(ctx) {
    const { VW, VH } = this;
    const f = this.introT / INTRO_TIME;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
    const px = (this.player.x - this.camX) * this.scale, py = (this.player.y - this.camY) * this.scale;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(px, py, f * Math.hypot(VW, VH) * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawExportBar(ctx) {
    const { VW } = this, w = 420, x = VW / 2 - w / 2, y = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x - 14, y - 14, w + 28, 64);
    ctx.strokeStyle = C.panelBd; ctx.lineWidth = 2; ctx.strokeRect(x - 14, y - 14, w + 28, 64);
    ctx.fillStyle = C.ink; ctx.font = 'bold 16px Consolas, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(this.escapeReady ? 'EXPORT COMPLETE — GET TO THE EXIT' : 'EXPORTING EVIDENCE…', x, y - 6);
    ctx.fillStyle = '#dfe5ef'; ctx.fillRect(x, y + 20, w, 16);
    ctx.fillStyle = C.green; ctx.fillRect(x, y + 20, w * (this.exportT / EXPORT_TIME), 16);
  }

  // ===== Narration =====
  playIntroNarration() {
    if (this.beats.intro) return;
    this.beats.intro = true;
    this.startNarration([
      { speaker: 'TOTO', text: 'HUSH’s analytics floor. The tunnel shrank you on the way down — that’s why it’s all so big.' },
      { speaker: 'TOTO', text: 'Window’s a scanner now. Drag it over the page, hold SPACE on whatever lights up. I need four files.' },
      { speaker: 'YOU',  text: 'Everything looks… normal.' },
      { speaker: 'TOTO', text: 'It does — until you get close. Then the charts turn red and turn on you. Pies roll, bars slam, the gauge shoots.' },
      { speaker: 'TOTO', text: 'And do NOT trust the spreadsheet. Some cells are mined. One wrong step and you’re gone. Read it through the glass.' },
    ], () => { this.started = true; });
  }
  playFirstDocNarration() {
    if (this.beats.firstDoc) return;
    this.beats.firstDoc = true;
    this.startNarration([{ speaker: 'TOTO', text: 'One down. Three more — and they’re in the nasty corners.' }]);
  }
  playAllDocsNarration() {
    if (this.beats.allDocs) return;
    this.beats.allDocs = true;
    this.startNarration([
      { speaker: 'TOTO', text: 'That’s four. Pulling them now — the floor’s about to come apart. Find the gap.' },
    ], () => this.startExport());
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
      if (!nn || !nn.typing) { if (this.intelDom.line) this.intelDom.line.textContent = text; return; }
      if (isPauseOpen()) { this.narrationTimer = setTimeout(tick, 90); return; }
      if (chars < text.length) {
        chars++;
        if (this.intelDom.line) this.intelDom.line.textContent = text.slice(0, chars);
        if (text[chars - 1] !== ' ' && Math.random() < 0.22) beep(1600 + Math.random() * 600, 0.005, 'square', 0.011);
        this.narrationTimer = setTimeout(tick, 28);
      } else { this.narration.typing = false; }
    };
    tick();
  }
  advanceNarration() {
    if (isPauseOpen()) return;
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
}

// Piston extension over one normalized cycle f∈[0,1):
//   0.00–0.12 windup (creak, no reach)   0.12–0.25 SLAM (0→1 fast)
//   0.25–0.45 hold extended (deadly)     0.45–0.60 retract (1→0)
//   0.60–1.00 idle/safe
function pistonExt(f) {
  if (f < 0.12) return 0.12 * (f / 0.12);        // tiny twitch
  if (f < 0.25) return 0.12 + 0.88 * ((f - 0.12) / 0.13);
  if (f < 0.45) return 1;
  if (f < 0.60) return 1 - ((f - 0.45) / 0.15);
  return 0;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
