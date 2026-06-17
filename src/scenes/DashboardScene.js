import Phaser from 'phaser';
import { initAudio, beep, noise } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { dist, aabb } from '../game/physics.js';
import { damagePlayer } from '../game/combat.js';
import { PLAYER } from '../config.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';
import { loadMusic, crossfadeTo } from '../game/music.js';
import { loadSfx, playSfx, playSfxLoop, stopAllSfxLoops } from '../game/sfx.js';

// LEVEL 2 — "THE DASHBOARD" (HUSH's corrupted SEO / analytics backend)
//
// A dense, Salesforce-style analytics floor turned into a top-down UI MAZE. The
// tunnel shrank you (Toy Story effect): the page is huge, your window is a tiny
// disguised browser. Chart widgets are the WALLS — a tight corridor route with
// branches, dead ends and choke points.
//
//   • Two layers: the VISIBLE dashboard, and a HIDDEN data layer only your
//     window reveals. Drag the window over the page and it x-rays the region
//     beneath it (dark-blue wireframe) — hidden docs + armed mines only show
//     through the glass.
//   • Widgets LOOK like normal charts (real numbers, names, legends, axes)
//     until you enter their territory — then they redden and turn hostile:
//       PIE     → detaches, drops, rolls through the corridors like a tire.
//       GAUGE   → the NEEDLE is a laser turret: it tracks you, locks, charges,
//                 and fires a heavy beam straight down the needle. Dash.
//       BARS    → piston-crusher gauntlets (three of them) on fixed but
//                 irregular rhythms slamming mandatory corridors.
//       SHEET   → an Excel minefield. Some cells are mined; one step = instant
//                 death. Safe entry lip + subtle tells + x-ray read the path.
//   • Park over a doc and HOLD SPACE to scan it. The risk is holding still.
//
// Collect the required docs → "EXPORTING…" → the dashboard collapses, a panel
// falls away to open the exit → dash out.

// ── Maze geometry — an irregular grid of blocks; panels span 1+ blocks. ──
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

// Each panel spans a block range. `hostile`/`exit`/`mine` flag special panels.
const PANEL_SPECS = [
  // top band
  { kind: 'line',  label: 'SYSTEM UPTIME (30d)', c1: 0, r1: 0, c2: 1, r2: 0 },
  { kind: 'kpi',   label: 'TOTAL REVENUE',       c1: 2, r1: 0, c2: 2, r2: 0 },
  { kind: 'pie',   label: 'REVENUE SOURCE',      c1: 3, r1: 0, c2: 3, r2: 0, hostile: 'pie' },
  { kind: 'kpi',   label: 'NEW SIGNUPS',         c1: 4, r1: 0, c2: 4, r2: 0 },
  { kind: 'gauge', label: 'TRUST INDEX',         c1: 6, r1: 0, c2: 6, r2: 1, hostile: 'gauge' }, // tall
  // r1 — gauntlet #1
  { kind: 'kpi',   label: 'CHURN RATE',          c1: 0, r1: 1, c2: 0, r2: 1 },
  { kind: 'bar',   label: 'USERS / REGION',      c1: 1, r1: 1, c2: 3, r2: 1, hostile: 'bar' },   // wide
  { kind: 'donut', label: 'ENGAGEMENT MIX',      c1: 4, r1: 1, c2: 4, r2: 1 },
  // r2
  { kind: 'table', label: 'ASSET WATCHLIST',     c1: 0, r1: 2, c2: 0, r2: 3 },                   // tall
  { kind: 'area',  label: 'SENTIMENT TREND',     c1: 2, r1: 2, c2: 3, r2: 2 },                   // wide
  { kind: 'kpi',   label: 'ACTIVE ASSETS',       c1: 4, r1: 2, c2: 4, r2: 2 },
  { kind: 'kpi',   label: 'BOT TRAFFIC',         c1: 6, r1: 2, c2: 6, r2: 2 },
  // r3 — gauntlet #2
  { kind: 'hist',  label: 'PAYOUTS',             c1: 1, r1: 3, c2: 2, r2: 3 },                   // wide
  { kind: 'bar',   label: 'BUDGET BY DEPT',      c1: 4, r1: 3, c2: 5, r2: 3, hostile: 'bar' },
  { kind: 'line',  label: 'SUPPRESSION RATE',    c1: 6, r1: 3, c2: 6, r2: 4, exit: true },       // tall → exit
  // r4 — gauntlet #3 + minefield header
  { kind: 'kpi',   label: 'FLAGGED TODAY',       c1: 0, r1: 4, c2: 0, r2: 4 },
  { kind: 'bar',   label: 'OPS TEMPO',           c1: 1, r1: 4, c2: 2, r2: 4, hostile: 'bar' },
  { kind: 'sheet', label: 'RAW EXPORTS — Sheet1', c1: 3, r1: 4, c2: 5, r2: 4, mine: true },
  // r5
  { kind: 'table', label: 'FLAGGED STORIES',     c1: 0, r1: 5, c2: 1, r2: 5 },
  { kind: 'kpi',   label: 'COMPLIANCE',          c1: 2, r1: 5, c2: 2, r2: 5 },
  { kind: 'gauge', label: 'CAMPAIGN HEALTH',     c1: 6, r1: 5, c2: 6, r2: 5 },
  // filler widgets — these also wall off shortcut blocks to force the route
  { kind: 'kpi',   label: 'AD SPEND',            c1: 5, r1: 0, c2: 5, r2: 0 },
  { kind: 'donut', label: 'TRAFFIC MIX',         c1: 5, r1: 1, c2: 5, r2: 1 },
  { kind: 'kpi',   label: 'SESSIONS',            c1: 5, r1: 2, c2: 5, r2: 2 },
  { kind: 'kpi',   label: 'QUEUE DEPTH',         c1: 1, r1: 2, c2: 1, r2: 2 },
  { kind: 'area',  label: 'INCIDENTS',           c1: 3, r1: 3, c2: 3, r2: 3 },
];

// ── Forced route — the corridor grid is otherwise wide open, so we seal all
// but one alternating vertical connector per panel-row to make a boustrophedon
// snake: spawn → gauntlet#3 → gauntlet#2 → gauntlet#1 → gauge → exit. The
// minefield is an optional bonus detour off the lower lanes. ──
const GAPS = [
  { x: 450, w: 110 }, { x: 860, w: 110 }, { x: 1270, w: 110 },
  { x: 1680, w: 110 }, { x: 2090, w: 110 }, { x: 2500, w: 110 },
];
const OPEN_CONNECTOR = { 0: 5, 1: 3, 2: 0, 3: 5, 4: 2, 5: 1 };  // open GAPS index per row

// ── Spreadsheet minefield — a walkable Excel grid (NOT a wall). ──
const MINE_GRID = {
  x: 1410, y: 1640, cols: 8, rows: 4, cw: 132, ch: 100,
  // Column 0 is a SAFE entry lip; danger begins at col 1. A winding safe route
  // threads to the bonus doc at cell (4,1) and on to a far exit at (7,2).
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
const BASE_SPEED = 178;
const INTRO_TIME = 1.3;
const EXPORT_TIME = 4.0;

// Base damage — divided by difficulty in damagePlayer (easy ≈ ×0.45).
const DMG = { pie: 58, bar: 66, gauge: 112 };

// Light "Salesforce" palette (only the X-ray layer is dark).
const C = {
  page:    '#eef2f7',
  grid:    'rgba(40,70,120,0.05)',
  header:  '#ffffff',
  headBd:  '#d7deea',
  panel:   '#ffffff',
  panelBd: '#d5dded',
  title:   '#2b3a55',
  sub:     '#8a97ad',
  hostile: '#fdeaea',
  hostBd:  '#E63946',
  hostTtl: '#c0392b',
  ink:     '#1f2c44',
  blue:    '#3a86c8',
  teal:    '#17a2b8',
  green:   '#27ae60',
  orange:  '#e67e22',
  purple:  '#8e6fc9',
  yellow:  '#f0b429',
  red:     '#E63946',
  pink:    '#d6618f',
};
const SERIES = [C.blue, C.green, C.orange, C.purple, C.teal];

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
      x: 330, y: 1990, w: 56, h: 40, size: 56,
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
    this.panels.forEach(p => { p.data = genData(p); });
    this.seals = this.buildSeals();
    this.solids = this.panels.concat(this.seals);
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
    loadMusic(); loadSfx();
    crossfadeTo('level2', { fadeMs: 1500 });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onNarrationClick);
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      resetPauseMenu();
      stopAllSfxLoops();
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
    let gauntletN = 0;
    for (const p of this.panels) {
      if (p.hostile === 'pie') {
        list.push({
          type: 'pie', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0,
          r: 46, x: p.x + p.w / 2, y: p.y + p.h / 2, vx: 0, vy: 0, dir: 1, spin: 0,
          rollSpeed: 250 * mul, triggerR: 560,
        });
      } else if (p.hostile === 'bar') {
        // Piston gauntlet: a row of crushers that slam into the corridor below
        // on a fixed but irregular rhythm. Each gauntlet uses a different period
        // and phase pattern so they don't all read the same.
        const corridorTop = p.y + p.h;
        const PATTERNS = [
          [0.00, 0.45, 0.15, 0.60, 0.30],   // travelling wave
          [0.00, 0.50, 0.00, 0.50],         // strict alternate
          [0.00, 0.25, 0.70, 0.20],         // syncopated
        ];
        const pattern = PATTERNS[gauntletN % PATTERNS.length];
        const period = [2.7, 2.2, 3.1][gauntletN % 3] / mul;
        const n = pattern.length;
        const pistons = [];
        for (let i = 0; i < n; i++) {
          pistons.push({ x: p.x + (i + 0.5) * (p.w / n), w: Math.min(86, p.w / n - 26), phase: pattern[i] });
        }
        list.push({ type: 'bar', panel: p, activated: false, alertT: 0, corridorTop, maxLen: 100, pistons, period, struck: 0 });
        gauntletN++;
      } else if (p.hostile === 'gauge') {
        // The needle IS the laser. Hub at the dial centre; the needle rotates a
        // full circle to track the player and fires straight down its length.
        list.push({
          type: 'gauge', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0,
          cx: p.x + p.w / 2, cy: p.y + p.h * 0.52,
          needleLen: Math.min(p.w * 0.34, 96),
          angle: -Math.PI / 2 + 0.5, aimDur: 1.25, beamT: 0, fireAngle: 0,
          triggerR: 700, beamLen: 2200,
        });
      } else if (p.mine) {
        const g = MINE_GRID;
        const mineSet = new Set(g.mines.map(([c, r]) => c + ',' + r));
        list.push({ type: 'sheet', panel: p, activated: false, alertT: 0, grid: g, mineSet });
      }
    }
    return list;
  }

  buildDocs() {
    // Required (4) → one behind each hazard along the forced snake.
    // Bonus (2) → both in the minefield (an optional, deadly detour).
    return [
      { x: 2555, y: 300,  required: true,  taken: false, takeT: 0 },  // by the gauge (snake end)
      { x: 1100, y: 750,  required: true,  taken: false, takeT: 0 },  // gauntlet #1 corridor
      { x: 2140, y: 1350, required: true,  taken: false, takeT: 0 },  // gauntlet #2 corridor
      { x: 900,  y: 1650, required: true,  taken: false, takeT: 0 },  // gauntlet #3 corridor
      { x: 1740, y: 1890, required: false, taken: false, takeT: 0 },  // bonus — minefield cell (2,2)
      { x: 2004, y: 1790, required: false, taken: false, takeT: 0 },  // bonus — minefield cell (4,1)
    ];
  }

  // Seal every vertical connector except one alternating gap per panel-row.
  buildSeals() {
    const inPanel = (x, y) => this.panels.some(p => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
    const seals = [];
    for (let r = 0; r < 6; r++) {
      const y = 200 + r * 300;
      for (let g = 0; g < 6; g++) {
        if (g === OPEN_CONNECTOR[r]) continue;
        const gap = GAPS[g];
        if (inPanel(gap.x + gap.w / 2, y + 100)) continue;   // already walled by a panel
        seals.push({ x: gap.x, y, w: gap.w, h: 200, collapsed: 0 });
      }
    }
    // page side-rails (the open margins outside the columns)
    seals.push({ x: 0, y: 110, w: COLX[0], h: WORLD_H - 110, collapsed: 0, margin: true });
    seals.push({ x: 2910, y: 110, w: WORLD_W - 2910, h: WORLD_H - 110, collapsed: 0, margin: true });
    return seals;
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
    this.viewWW = 1180;
    this.scale = w / this.viewWW;
    this.viewHW = h / this.scale;
  }

  quitToMenu() {
    resetPauseMenu();
    stopAllSfxLoops();
    crossfadeTo('menu', { fadeMs: 800 });
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
    if (this.failed) {
      if (!this.crashShown) { this.showCrash(); playSfx('gameOver'); stopAllSfxLoops(); }
      this.render(); this.updateHud(); return;
    }
    if (this.done) { this.render(); this.updateHud(); return; }
    if (this.narration) { this.render(); this.updateHud(); return; }

    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;

    // movement with a little inertia
    const sp = BASE_SPEED * (this.keys.shift.isDown ? PLAYER.boostMul : 1);
    let ix = 0, iy = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) ix -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) ix += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) iy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) iy += 1;
    if (ix || iy) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; }
    const dvx = ix * sp, dvy = iy * sp;
    const rate = (ix || iy) ? 9 : 5.5;
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

  tryActivate(hz, px, py, range) {
    if (hz.activated) { if (hz.alertT < 1) hz.alertT = Math.min(1, hz.alertT + 0.05); return; }
    const c = { x: hz.panel.x + hz.panel.w / 2, y: hz.panel.y + hz.panel.h / 2 };
    if (dist(px, py, c.x, c.y) < range) {
      hz.activated = true; hz.alertT = 0;
      hz.panel.hostileActive = true; hz.panel.shake = 1;
      playSfx('hostileAlert');
      beep(240, 0.16, 'sawtooth', 0.07); setTimeout(() => beep(180, 0.2, 'square', 0.06), 110);
    }
  }

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
        playSfx('boulderLaunch');
        hz.rollLoop = playSfxLoop('boulderRoll', { volume: 0.0 });
        noise(0.25, 0.12); beep(90, 0.4, 'square', 0.09);
      }
      return;
    }
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
    // proximity-based roll volume — louder when the boulder is on-screen near you
    if (hz.rollLoop) {
      const d = dist(p.x, p.y, hz.x, hz.y);
      const vol = Math.max(0, Math.min(1, 1 - d / 900));
      hz.rollLoop.setVolume(vol);
    }
    if (p.invuln <= 0 && dist(p.x, p.y, hz.x, hz.y) < hz.r + p.h * 0.4) {
      damagePlayer(this.gs, DMG.pie, (p.x - hz.x) >= 0 ? 70 : -70, -18);
      this.resolveStuck(p);
    }
    hz.t += dt;
    if (hz.t > 9) {
      hz.state = 'idle'; hz.cooldown = 3; hz.x = cx; hz.y = cy; hz.vx = hz.vy = 0;
      if (hz.rollLoop) { hz.rollLoop.stop(); hz.rollLoop = null; }
    }
  }

  updateBar(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, 360);
    if (hz.struck > 0) hz.struck -= dt;
    if (!hz.activated) return;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (const pis of hz.pistons) {
      const prevExt = pis.ext ?? 0;
      const ext = pistonExt((this.time / hz.period + pis.phase) % 1);
      pis.ext = ext;
      // crusher slam: triggered on the rising edge crossing 0.99 (one shot per cycle).
      // attenuate by camera distance so a far-off gauntlet isn't deafening.
      if (ext >= 0.99 && prevExt < 0.99) {
        const d = dist(p.x, p.y, pis.x, hz.corridorTop);
        const vol = Math.max(0.18, Math.min(1, 1 - d / 1100));
        playSfx('crusherSlam', { volume: vol });
      }
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
      // idle drift so the needle isn't frozen
      hz.angle += Math.sin(this.time * 0.7 + hz.cx) * dt * 0.3;
      if (hz.activated && near && hz.cooldown <= 0) {
        hz.state = 'aim'; hz.t = 0; hz.panel.shake = 0.6;
        playSfx('laserCharge');
        beep(300, 0.25, 'sine', 0.06);
      }
      return;
    }
    if (hz.state === 'aim') {
      hz.t += dt;
      const target = Math.atan2(p.y - hz.cy, p.x - hz.cx);
      let d = target - hz.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      hz.angle += d * Math.min(1, dt * 3.2);     // eased track → dodgeable
      if (hz.t > hz.aimDur * 0.66 && Math.random() < 0.4) beep(500 + hz.t * 220, 0.03, 'sine', 0.05);
      if (hz.t > hz.aimDur) {
        hz.state = 'fire'; hz.beamT = 0.2; hz.fireAngle = hz.angle;
        playSfx('laserFire');
        noise(0.2, 0.1); beep(1200, 0.08, 'square', 0.13);
        const tip = this.gaugeTip(hz, hz.fireAngle);
        if (p.invuln <= 0 && this.rayHitsPlayer(tip.x, tip.y, hz.fireAngle, hz.beamLen, p.h * 0.6 + 8, p)) {
          const kx = Math.cos(hz.fireAngle) * 90, ky = Math.sin(hz.fireAngle) * 90;
          damagePlayer(this.gs, DMG.gauge, kx, ky);
          this.resolveStuck(p);
        }
      }
      return;
    }
    if (hz.state === 'fire') {
      hz.beamT -= dt;
      if (hz.beamT <= 0) { hz.state = 'idle'; hz.cooldown = 2.8; }
    }
  }
  gaugeTip(hz, ang) {
    return { x: hz.cx + Math.cos(ang) * hz.needleLen, y: hz.cy + Math.sin(ang) * hz.needleLen };
  }
  rayHitsPlayer(ox, oy, ang, maxLen, halfW, p) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const t = (p.x - ox) * dx + (p.y - oy) * dy;
    if (t < 0 || t > maxLen) return false;
    const projx = ox + dx * t, projy = oy + dy * t;
    return Math.hypot(p.x - projx, p.y - projy) < halfW;
  }

  updateSheet(hz, dt, p) {
    const g = hz.grid;
    if (p.x < g.x || p.x > g.x + g.cols * g.cw || p.y < g.y || p.y > g.y + g.rows * g.ch) return;
    this.tryActivate(hz, p.x, p.y, 9999);
    const col = Math.floor((p.x - g.x) / g.cw);
    const row = Math.floor((p.y - g.y) / g.ch);
    if (!hz.mineSet.has(col + ',' + row)) return;
    const ccx = g.x + (col + 0.5) * g.cw, ccy = g.y + (row + 0.5) * g.ch;
    if (Math.abs(p.x - ccx) < g.cw * 0.4 && Math.abs(p.y - ccy) < g.ch * 0.4) {
      playSfx('mineBoom');
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
      if (!this._scanLoop) this._scanLoop = playSfxLoop('docScanLoop', { volume: 0.9 });
      if (Math.random() < 0.3) beep(1400 + Math.random() * 400, 0.01, 'square', 0.02);
      if (this.captureProg >= 1) { this.collectDoc(target); this.captureProg = 0; }
    } else {
      this.captureProg = Math.max(0, this.captureProg - dt * 2);
      if (this._scanLoop) { this._scanLoop.stop(); this._scanLoop = null; }
    }
  }
  collectDoc(d) {
    d.taken = true; d.takeT = this.time;
    if (this._scanLoop) { this._scanLoop.stop(); this._scanLoop = null; }
    playSfx('docScan');
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
      playSfx('exportReady');
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

    const view = { x: this.camX, y: this.camY, w: this.viewWW, h: this.viewHW };

    ctx.fillStyle = C.page; ctx.fillRect(this.camX, this.camY, this.viewWW, this.viewHW);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    const gx0 = Math.floor(this.camX / 80) * 80, gy0 = Math.floor(this.camY / 80) * 80;
    for (let gx = gx0; gx < this.camX + this.viewWW; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, this.camY); ctx.lineTo(gx, this.camY + this.viewHW); ctx.stroke(); }
    for (let gy = gy0; gy < this.camY + this.viewHW; gy += 80) { ctx.beginPath(); ctx.moveTo(this.camX, gy); ctx.lineTo(this.camX + this.viewWW, gy); ctx.stroke(); }

    this.drawHeader(ctx);
    this.drawSeals(ctx, view);
    this.drawMinefield(ctx, view);
    for (const pnl of this.panels) { if (aabb(view, pnl) || pnl.collapsed > 0) this.drawPanel(ctx, pnl); }

    for (const hz of this.hazards) if (hz.type === 'bar' && hz.activated) this.drawPistons(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'gauge') this.drawGauge(ctx, hz);
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
      ctx.fillStyle = C.sub; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText('WASD move  ·  SHIFT dash  ·  HOLD SPACE to scan  ·  R restart  ·  ESC to exit', 18, VH - 16);
    }
  }

  drawHeader(ctx) {
    drawHandRect(ctx, HEADER.x, HEADER.y, HEADER.w, HEADER.h, C.header, C.headBd, 3, 2);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(64, 55, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px "Saira Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', 64, 56);
    ctx.fillStyle = C.ink; ctx.font = 'bold 34px "Saira Condensed", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('HUSH', 100, 50);
    ctx.fillStyle = C.sub; ctx.font = '16px Consolas, monospace';
    ctx.fillText('Analytics Cloud  ›  Executive Overview', 178, 54);
    // fake nav tabs
    ctx.font = '15px Consolas, monospace';
    const tabs = ['Home', 'Reports', 'Dashboards', 'Assets', 'Admin'];
    let tx = WORLD_W - 720;
    for (const t of tabs) { ctx.fillStyle = t === 'Dashboards' ? C.blue : C.sub; ctx.fillText(t, tx, 54); tx += ctx.measureText(t).width + 34; }
    ctx.fillStyle = '#9aa6bd'; ctx.font = '13px Consolas, monospace'; ctx.textAlign = 'right';
    ctx.fillText('INTERNAL // DO NOT DISTRIBUTE', WORLD_W - 30, 54); ctx.textAlign = 'left';
  }

  drawSeals(ctx, view) {
    for (const s of this.seals) {
      if (!aabb(view, s)) continue;
      if (s.margin) {
        ctx.fillStyle = '#e7ecf4'; ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = C.panelBd; ctx.lineWidth = 1; ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else {
        // a blank "spacer" card so the gap reads as solid dashboard chrome
        drawHandRect(ctx, s.x, s.y + 6, s.w, s.h - 12, '#eef2f8', C.panelBd, s.x + s.y, 1.5);
      }
    }
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
    // soft card shadow
    ctx.save(); ctx.shadowColor = 'rgba(40,60,90,0.12)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    drawHandRect(ctx, pnl.x, pnl.y, pnl.w, pnl.h, fill, hostile ? C.hostBd : C.panelBd, pnl.x + pnl.y, 2);
    ctx.restore();
    // title row + rule
    ctx.fillStyle = hostile ? C.hostTtl : C.title; ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(pnl.label, pnl.x + 18, pnl.y + 14);
    ctx.strokeStyle = hostile ? 'rgba(230,57,70,0.25)' : 'rgba(40,70,120,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pnl.x + 14, pnl.y + 40); ctx.lineTo(pnl.x + pnl.w - 14, pnl.y + 40); ctx.stroke();
    if (hostile) {
      ctx.fillStyle = C.red; ctx.font = 'bold 12px Consolas, monospace'; ctx.textAlign = 'right';
      if (Math.sin(this.time * 8) > 0) ctx.fillText('● HOSTILE', pnl.x + pnl.w - 16, pnl.y + 17);
      ctx.textAlign = 'left';
    }
    const cx = pnl.x + 18, cy = pnl.y + 52, cw = pnl.w - 36, ch = pnl.h - 70;
    if (ch > 26 && cw > 40) {
      ctx.save(); ctx.beginPath(); ctx.rect(pnl.x + 6, pnl.y + 44, pnl.w - 12, pnl.h - 50); ctx.clip();
      switch (pnl.kind) {
        case 'kpi':   this.artKpi(ctx, cx, cy, cw, ch, pnl); break;
        case 'line':  this.artLine(ctx, cx, cy, cw, ch, pnl); break;
        case 'area':  this.artArea(ctx, cx, cy, cw, ch, pnl); break;
        case 'table': this.artTable(ctx, cx, cy, cw, ch, pnl); break;
        case 'sheet': this.artTable(ctx, cx, cy, cw, ch, pnl); break;
        case 'gauge': if (!pnl.hostile) this.artGauge(ctx, cx, cy, cw, ch, pnl); break;
        case 'hist':  this.artHist(ctx, cx, cy, cw, ch, pnl); break;
        case 'donut': this.artDonut(ctx, cx, cy, cw, ch, pnl); break;
        case 'pie':   this.artPie(ctx, cx, cy, cw, ch, pnl); break;
        case 'bar':   this.artBars(ctx, cx, cy, cw, ch, pnl); break;
      }
      ctx.restore();
    }
    ctx.restore();
  }
  lerpHostileFill(pnl) {
    const hz = this.hazards.find(h => h.panel === pnl);
    const a = hz ? hz.alertT : 1;
    return a < 1 ? `rgba(253,234,234,${0.3 + a * 0.7})` : C.hostile;
  }

  // ===== Rich "Salesforce" chart art =====
  artKpi(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink; ctx.font = 'bold ' + Math.min(46, h * 0.42) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText(d.value, x, y + Math.min(h * 0.5, 46));
    ctx.fillStyle = d.up ? C.green : C.red; ctx.font = 'bold 14px "Segoe UI", Arial';
    ctx.fillText((d.up ? '▲ ' : '▼ ') + d.delta, x, y + Math.min(h * 0.5, 46) + 22);
    ctx.fillStyle = C.sub; ctx.font = '12px "Segoe UI", Arial';
    ctx.fillText('vs last period', x + 64, y + Math.min(h * 0.5, 46) + 22);
    // mini sparkline bottom-right
    const sw = Math.min(w * 0.5, 120), sh = Math.min(h * 0.3, 30), sx = x + w - sw, sy = y + h - 6;
    ctx.strokeStyle = d.up ? C.green : C.red; ctx.lineWidth = 2; ctx.beginPath();
    d.spark.forEach((v, i) => { const px = sx + sw * i / (d.spark.length - 1), py = sy - v * sh; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  }

  artLine(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    const plotY = y + 16, plotH = h - 38, plotX = x + 30, plotW = w - 36;
    // y grid + labels
    ctx.strokeStyle = 'rgba(40,70,120,0.07)'; ctx.lineWidth = 1;
    ctx.fillStyle = C.sub; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const yy = plotY + plotH * i / 3;
      ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke();
      ctx.fillText(Math.round(d.yMax * (1 - i / 3)), plotX - 4, yy);
    }
    // series
    d.series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      s.pts.forEach((v, i) => { const px = plotX + plotW * i / (s.pts.length - 1), py = plotY + plotH * (1 - v / d.yMax); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    });
    // x labels
    ctx.fillStyle = C.sub; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    d.xLabels.forEach((lab, i) => ctx.fillText(lab, plotX + plotW * i / (d.xLabels.length - 1), plotY + plotH + 4));
    // legend (top-right)
    if (w > 280) {
      let lx = plotX + plotW; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '11px "Segoe UI", Arial';
      for (let i = d.series.length - 1; i >= 0; i--) {
        const s = d.series[i]; const tw = ctx.measureText(s.name).width;
        ctx.fillStyle = C.sub; ctx.fillText(s.name, lx, plotY - 6); lx -= tw + 8;
        ctx.fillStyle = s.color; ctx.fillRect(lx - 4, plotY - 10, 8, 8); lx -= 14;
      }
    }
  }

  artArea(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    const plotY = y + 8, plotH = h - 26, plotX = x + 8, plotW = w - 16;
    ctx.strokeStyle = 'rgba(40,70,120,0.07)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) { const yy = plotY + plotH * i / 2; ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); }
    d.series.forEach((s, si) => {
      ctx.beginPath(); ctx.moveTo(plotX, plotY + plotH);
      s.pts.forEach((v, i) => ctx.lineTo(plotX + plotW * i / (s.pts.length - 1), plotY + plotH * (1 - v / d.yMax)));
      ctx.lineTo(plotX + plotW, plotY + plotH); ctx.closePath();
      ctx.fillStyle = hexA(s.color, 0.22); ctx.fill();
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      s.pts.forEach((v, i) => { const px = plotX + plotW * i / (s.pts.length - 1), py = plotY + plotH * (1 - v / d.yMax); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    });
  }

  artHist(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    const plotY = y + 8, plotH = h - 26, plotX = x + 24, plotW = w - 30;
    ctx.fillStyle = C.sub; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) { const yy = plotY + plotH * i / 2; ctx.strokeStyle = 'rgba(40,70,120,0.07)'; ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); ctx.fillText(Math.round(d.yMax * (1 - i / 2)), plotX - 4, yy); }
    const n = d.bins.length, gap = plotW / n, bw = gap * 0.66;
    d.bins.forEach((v, i) => {
      const bh = plotH * v / d.yMax;
      ctx.fillStyle = hexA(C.teal, 0.85);
      ctx.fillRect(plotX + i * gap + (gap - bw) / 2, plotY + plotH - bh, bw, bh);
    });
  }

  artBars(ctx, x, y, w, h, pnl) {
    const d = pnl.data, hostile = pnl.hostileActive;
    const plotY = y + 8, plotH = h - 30, plotX = x + 26, plotW = w - 32;
    ctx.fillStyle = C.sub; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) { const yy = plotY + plotH * i / 2; ctx.strokeStyle = 'rgba(40,70,120,0.07)'; ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); ctx.fillText(Math.round(d.yMax * (1 - i / 2)), plotX - 4, yy); }
    const n = d.cats.length, gap = plotW / n, bw = gap * 0.56;
    d.cats.forEach((cat, i) => {
      const bh = plotH * cat.val / d.yMax;
      const bx = plotX + i * gap + (gap - bw) / 2;
      ctx.fillStyle = hostile ? C.red : cat.color;
      ctx.fillRect(bx, plotY + plotH - bh, bw, bh);
      ctx.fillStyle = C.ink; ctx.font = '10px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(cat.val, bx + bw / 2, plotY + plotH - bh - 2);
      ctx.fillStyle = C.sub; ctx.textBaseline = 'top';
      ctx.fillText(cat.name, bx + bw / 2, plotY + plotH + 4);
    });
  }

  artPie(ctx, x, y, w, h, pnl) {
    const hz = this.hazards.find(z => z.panel === pnl);
    const legend = w > 230 ? 96 : 0;
    const cx = x + (w - legend) / 2, cy = y + h / 2, r = Math.min(w - legend, h) * 0.46;
    const d = pnl.data;
    if (hz && (hz.state === 'windup' || hz.state === 'active')) {
      ctx.strokeStyle = 'rgba(192,57,43,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(192,57,43,0.5)'; ctx.font = '11px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText('— detached —', cx, cy); ctx.textAlign = 'left';
      return;
    }
    let a = -Math.PI / 2;
    d.segs.forEach(s => {
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + s.frac * Math.PI * 2); ctx.closePath(); ctx.fill();
      a += s.frac * Math.PI * 2;
    });
    if (legend) this.drawLegend(ctx, x + w - legend + 6, y + 6, d.segs);
  }

  artDonut(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    const legend = w > 230 ? 96 : 0;
    const cx = x + (w - legend) / 2, cy = y + h / 2, r = Math.min(w - legend, h) * 0.46, ir = r * 0.6;
    let a = -Math.PI / 2;
    d.segs.forEach(s => {
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + s.frac * Math.PI * 2); ctx.closePath(); ctx.fill();
      a += s.frac * Math.PI * 2;
    });
    ctx.fillStyle = C.panel; ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = 'bold 18px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.center, cx, cy); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (legend) this.drawLegend(ctx, x + w - legend + 6, y + 6, d.segs);
  }

  artGauge(ctx, x, y, w, h, pnl) {
    const cx = x + w / 2, cy = y + Math.min(h * 0.78, h - 6), r = Math.min(w * 0.42, h * 0.72);
    ctx.strokeStyle = '#d2dae8'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = C.green; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.55); ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(Math.PI * 1.25) * r, cy + Math.sin(Math.PI * 1.25) * r); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.title; ctx.font = 'bold 16px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pnl.data.value, cx, cy - r * 0.35);
  }

  drawLegend(ctx, x, y, segs) {
    ctx.font = '11px "Segoe UI", Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    segs.forEach((s, i) => {
      const yy = y + 10 + i * 17;
      ctx.fillStyle = s.color; ctx.fillRect(x, yy - 5, 10, 10);
      ctx.fillStyle = C.sub; ctx.fillText(s.label + ' ' + Math.round(s.frac * 100) + '%', x + 15, yy);
    });
  }

  artTable(ctx, x, y, w, h, pnl) {
    const d = pnl.data;
    let yy = y + 2;
    ctx.font = '11px Consolas, monospace'; ctx.textBaseline = 'middle';
    // header
    ctx.fillStyle = C.sub; ctx.textAlign = 'left'; ctx.fillText('NAME', x + 4, yy + 8);
    ctx.textAlign = 'right'; ctx.fillText('VALUE', x + w - 70, yy + 8); ctx.fillText('STATUS', x + w - 6, yy + 8);
    yy += 22;
    const rh = 26;
    for (const row of d.rows) {
      if (yy + rh > y + h) break;
      ctx.fillStyle = 'rgba(40,70,120,0.035)'; ctx.fillRect(x, yy, w, rh - 4);
      ctx.fillStyle = C.ink; ctx.font = '12px "Segoe UI", Arial'; ctx.textAlign = 'left';
      ctx.fillText(row.name, x + 6, yy + rh / 2 - 2);
      ctx.fillStyle = C.title; ctx.textAlign = 'right'; ctx.font = 'bold 12px "Segoe UI", Arial';
      ctx.fillText(row.val, x + w - 70, yy + rh / 2 - 2);
      // status pill
      const pw = 56, px = x + w - pw - 4, py = yy + rh / 2 - 10;
      ctx.fillStyle = hexA(row.color, 0.18); roundRectPath(ctx, px, py, pw, 16, 8); ctx.fill();
      ctx.fillStyle = row.color; ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(row.status, px + pw / 2, yy + rh / 2 - 1);
      yy += rh;
    }
  }

  // ── Minefield floor ──
  drawMinefield(ctx, view) {
    const hz = this.hazards.find(h => h.type === 'sheet');
    if (!hz) return;
    const g = hz.grid;
    const W = g.cols * g.cw, H = g.rows * g.ch;
    if (!aabb(view, { x: g.x - 30, y: g.y - 24, w: W + 30, h: H + 24 })) return;
    ctx.fillStyle = '#fcfdff'; ctx.fillRect(g.x, g.y, W, H);
    ctx.fillStyle = '#e7edf6'; ctx.fillRect(g.x, g.y - 24, W, 24); ctx.fillRect(g.x - 30, g.y, 30, H);
    ctx.fillStyle = '#8a99b5'; ctx.font = '13px Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let c = 0; c < g.cols; c++) ctx.fillText(String.fromCharCode(65 + c), g.x + (c + 0.5) * g.cw, g.y - 12);
    for (let r = 0; r < g.rows; r++) ctx.fillText(String(r + 1), g.x - 15, g.y + (r + 0.5) * g.ch);
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#d6deeb'; ctx.lineWidth = 1;
    for (let c = 0; c <= g.cols; c++) { ctx.beginPath(); ctx.moveTo(g.x + c * g.cw, g.y); ctx.lineTo(g.x + c * g.cw, g.y + H); ctx.stroke(); }
    for (let r = 0; r <= g.rows; r++) { ctx.beginPath(); ctx.moveTo(g.x, g.y + r * g.ch); ctx.lineTo(g.x + W, g.y + r * g.ch); ctx.stroke(); }
    // faint fake cell values for texture
    ctx.fillStyle = 'rgba(120,135,160,0.5)'; ctx.font = '10px Consolas, monospace'; ctx.textBaseline = 'middle';
    for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) {
      if (hz.mineSet.has(c + ',' + r)) continue;
      ctx.fillText(g.cellText[r * g.cols + c], g.x + c * g.cw + 8, g.y + (r + 0.5) * g.ch);
    }
    // EXTREMELY subtle tells on mined cells
    for (const key of hz.mineSet) {
      const [c, r] = key.split(',').map(Number);
      const cx = g.x + c * g.cw, cy = g.y + r * g.ch;
      ctx.fillStyle = hz.activated ? 'rgba(230,57,70,0.05)' : 'rgba(40,60,90,0.035)';
      ctx.fillRect(cx + 1, cy + 1, g.cw - 2, g.ch - 2);
      ctx.fillStyle = hz.activated ? 'rgba(230,57,70,0.5)' : 'rgba(120,135,160,0.5)';
      ctx.fillRect(cx + g.cw - 7, cy + 4, 3, 3);
    }
  }

  // ── Hydraulic piston crushers ──
  drawPistons(ctx, hz) {
    for (const pis of hz.pistons) {
      const ext = pis.ext ?? pistonExt((this.time / hz.period + pis.phase) % 1);
      const len = ext * hz.maxLen;
      const x = pis.x - pis.w / 2;
      // danger column telegraph while winding up
      if (ext > 0.04 && ext <= 0.5) {
        ctx.fillStyle = 'rgba(230,57,70,' + (0.05 + ext * 0.12) + ')';
        ctx.fillRect(x, hz.corridorTop, pis.w, hz.maxLen);
      }
      // housing flush with the panel bottom
      ctx.fillStyle = '#2b3346'; ctx.fillRect(x - 5, hz.corridorTop - 8, pis.w + 10, 10);
      if (len > 1) {
        // shaft (metal)
        const shaftW = pis.w * 0.5;
        ctx.fillStyle = '#9aa3b5'; ctx.fillRect(pis.x - shaftW / 2, hz.corridorTop, shaftW, len);
        ctx.strokeStyle = '#7e8799'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pis.x - shaftW / 2, hz.corridorTop); ctx.lineTo(pis.x - shaftW / 2, hz.corridorTop + len); ctx.stroke();
        // heavy head with hazard chevrons
        const headH = 16, hy = hz.corridorTop + len - headH;
        ctx.fillStyle = ext >= 1 ? '#c0392b' : '#7a1420';
        ctx.fillRect(x, hy, pis.w, headH);
        ctx.save(); ctx.beginPath(); ctx.rect(x, hy, pis.w, headH); ctx.clip();
        ctx.strokeStyle = '#f0b429'; ctx.lineWidth = 5;
        for (let cxp = x - pis.w; cxp < x + pis.w * 2; cxp += 16) {
          ctx.beginPath(); ctx.moveTo(cxp, hy + headH + 4); ctx.lineTo(cxp + 12, hy - 4); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = '#3a0008'; ctx.lineWidth = 1.5; ctx.strokeRect(x, hy, pis.w, headH);
        // impact glow when fully slammed
        if (ext >= 1) {
          ctx.fillStyle = 'rgba(230,57,70,0.25)';
          ctx.beginPath(); ctx.ellipse(pis.x, hz.corridorTop + len, pis.w * 0.7, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
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
    // hub
    ctx.fillStyle = '#3a0008'; ctx.beginPath(); ctx.arc(0, 0, hz.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Gauge turret — the NEEDLE is the laser ──
  drawGauge(ctx, hz) {
    const p = hz.panel;
    if (p.collapsed >= 1) return;
    const armed = hz.activated;
    const cx = hz.cx, cy = hz.cy, r = hz.needleLen + 14;
    // dial face
    ctx.save();
    ctx.fillStyle = armed ? '#fff4f4' : '#f4f7fb';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = armed ? hexA(C.red, 0.6) : '#cdd6e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // tick marks
    ctx.strokeStyle = armed ? hexA(C.red, 0.5) : '#b9c4d8'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10)); ctx.stroke();
    }
    // colored value arc (decorative)
    ctx.strokeStyle = armed ? C.red : C.yellow; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, r - 16, -Math.PI / 2, -Math.PI / 2 + 1.6); ctx.stroke();
    // value readout
    ctx.fillStyle = armed ? C.hostTtl : C.title; ctx.font = 'bold 16px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.data.value, cx, cy + r * 0.42);

    // beam telegraph / fire (drawn from the needle tip, along the needle)
    const ang = hz.state === 'fire' ? hz.fireAngle : hz.angle;
    const tip = this.gaugeTip(hz, ang);
    if (hz.state === 'aim' || hz.state === 'fire') {
      const ex = tip.x + Math.cos(ang) * hz.beamLen, ey = tip.y + Math.sin(ang) * hz.beamLen;
      if (hz.state === 'fire') {
        ctx.strokeStyle = 'rgba(230,57,70,0.95)'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,225,225,0.95)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.lineCap = 'butt';
      } else {
        const f = Math.min(1, hz.t / hz.aimDur);
        ctx.strokeStyle = 'rgba(230,57,70,' + (0.3 + f * 0.4) + ')'; ctx.lineWidth = 1.5 + f * 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // the needle (a tapered lance) — glows when armed
    const nx = Math.cos(ang), ny = Math.sin(ang);     // direction
    const ox = -ny, oy = nx;                            // perpendicular
    const baseW = 7;
    const tailLen = hz.needleLen * 0.32;
    if (armed) { ctx.shadowColor = 'rgba(230,57,70,0.9)'; ctx.shadowBlur = 12; }
    ctx.fillStyle = armed ? '#e23b48' : '#33405a';
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(cx + ox * baseW, cy + oy * baseW);
    ctx.lineTo(cx - nx * tailLen, cy - ny * tailLen);     // counterweight tail
    ctx.lineTo(cx - ox * baseW, cy - oy * baseW);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // hub
    ctx.fillStyle = armed ? '#7a1420' : '#2b3a55'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = armed ? '#ffd6d6' : '#aab6cc'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawExit(ctx) {
    const e = this.exit, pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
    ctx.fillStyle = 'rgba(39,174,96,' + (0.3 + pulse * 0.3) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + pulse * 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.green; ctx.font = 'bold 28px "Saira Condensed", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('▶ EXIT', e.x, e.y); ctx.textAlign = 'left';
  }

  // ── X-ray (dark wireframe under the window) ──
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

    if (this.captureTarget) {
      const d = this.captureTarget;
      ctx.save();
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

  // ── Player window — the disguised L1.2 browser/error window (consistent art) ──
  drawWindow(ctx) {
    const p = this.player, x = p.x - p.w / 2, y = p.y - p.h / 2;
    ctx.save();
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    // subtle scan glow
    ctx.shadowColor = 'rgba(122,208,235,0.7)'; ctx.shadowBlur = 10;
    drawHandRect(ctx, x, y, p.w, p.h, p.hitFlash > 0 ? '#ffffff' : 'transparent', '#1a1a1f', 50, 2.5);
    ctx.shadowBlur = 0;
    // dark title bar
    ctx.fillStyle = '#1a1a1f'; ctx.fillRect(x + 1, y + 1, p.w - 2, 13);
    // red close button + ×
    ctx.fillStyle = C.red; ctx.fillRect(x + p.w - 13, y + 3, 9, 9);
    ctx.fillStyle = '#fff'; ctx.font = '8px ui-monospace, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText('×', x + p.w - 8.5, y + 8);
    // title label (clipped) + center hex, matching L1.2
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 1, p.w - 20, 12); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.font = '8px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('SCAN.exe', x + 5, y + 8);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('0x7F4C', x + p.w / 2, y + p.h / 2 + 5);
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
      { speaker: 'YOU',  text: 'It just looks like a dashboard. Charts, numbers…' },
      { speaker: 'TOTO', text: 'It does — until you get close. Then they go red and turn on you. Pies roll, the gauge needle’s a laser, and those bar charts? Crushers.' },
      { speaker: 'TOTO', text: 'And do NOT trust the spreadsheet. Some cells are mined. One wrong step and you’re gone. Read it through the glass.' },
    ], () => { this.started = true; });
  }
  playFirstDocNarration() {
    if (this.beats.firstDoc) return;
    this.beats.firstDoc = true;
    this.startNarration([{ speaker: 'TOTO', text: 'One down. Three more — and they’re tucked behind the nasty widgets.' }]);
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

// ── Piston extension over one cycle f∈[0,1) ──
function pistonExt(f) {
  if (f < 0.12) return 0.12 * (f / 0.12);
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

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ===== Seeded fake-data generation (stable per panel) =====
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const KPI_VALUES = {
  'TOTAL REVENUE': { value: '$2.1M', up: true }, 'NEW SIGNUPS': { value: '57K', up: true },
  'CHURN RATE': { value: '2.1%', up: false }, 'ACTIVE ASSETS': { value: '4,820', up: true },
  'BOT TRAFFIC': { value: '38%', up: true }, 'FLAGGED TODAY': { value: '1,204', up: false },
  'COMPLIANCE': { value: '100%', up: true },
};
const TABLE_NAMES = ['Project Nightingale', 'Op. Dustpan', 'Narrative A/B-12', 'Asset 0x19F', 'Channel Drift', 'Story 4471', 'Ghostwriter', 'Sock-Puppet Net', 'Sentiment Farm', 'Payload Echo'];
const STATUSES = [['ACTIVE', C.green], ['FLAGGED', C.red], ['HOLD', C.orange], ['LIVE', C.blue]];

function genData(pnl) {
  const rnd = mulberry32(hashStr(pnl.label));
  const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  switch (pnl.kind) {
    case 'kpi': {
      const k = KPI_VALUES[pnl.label] || { value: ri(10, 99) + 'K', up: rnd() > 0.4 };
      const spark = Array.from({ length: 10 }, () => rnd());
      return { value: k.value, up: k.up, delta: ri(2, 24) + '%', spark };
    }
    case 'line': {
      const nSeries = pnl.w > 600 ? 5 : 3;
      const names = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];
      const series = Array.from({ length: nSeries }, (_, s) => ({
        name: names[s], color: SERIES[s % SERIES.length],
        pts: Array.from({ length: 12 }, () => 30 + rnd() * 110),
      }));
      return { series, yMax: 150, xLabels: ['Day 3', 'Day 9', 'Day 15', 'Day 21', 'Day 30'] };
    }
    case 'area': {
      const series = [{ name: 'Sentiment', color: C.purple, pts: Array.from({ length: 12 }, () => 20 + rnd() * 80) }];
      return { series, yMax: 100 };
    }
    case 'hist': return { bins: Array.from({ length: 9 }, () => 15 + rnd() * 85), yMax: 100 };
    case 'bar': {
      const cats = ['N.Am', 'EMEA', 'APAC', 'LATAM', 'MEA'].slice(0, pnl.w > 600 ? 5 : 4)
        .map((name, i) => ({ name, val: ri(20, 190), color: SERIES[i % SERIES.length] }));
      return { cats, yMax: 200 };
    }
    case 'pie': {
      const raw = [rnd() + 0.3, rnd() + 0.2, rnd() + 0.15, rnd() + 0.1]; const sum = raw.reduce((a, b) => a + b, 0);
      const labels = ['Organic', 'Paid', 'Referral', 'Direct'];
      return { segs: raw.map((v, i) => ({ label: labels[i], frac: v / sum, color: SERIES[i % SERIES.length] })) };
    }
    case 'donut': {
      const raw = [rnd() + 0.3, rnd() + 0.2, rnd() + 0.15, rnd() + 0.1]; const sum = raw.reduce((a, b) => a + b, 0);
      const labels = ['Likes', 'Shares', 'Saves', 'Other'];
      return { center: ri(2, 9) + '.' + ri(0, 9) + 'M', segs: raw.map((v, i) => ({ label: labels[i], frac: v / sum, color: SERIES[i % SERIES.length] })) };
    }
    case 'gauge': return { value: ri(60, 98) + '/100' };
    case 'table': case 'sheet': {
      const rows = Array.from({ length: 6 }, () => {
        const st = STATUSES[ri(0, STATUSES.length - 1)];
        return { name: TABLE_NAMES[ri(0, TABLE_NAMES.length - 1)], val: ri(12, 990) + '', status: st[0], color: st[1] };
      });
      return { rows };
    }
    default: return {};
  }
}

// attach minefield cell text once
MINE_GRID.cellText = Array.from({ length: MINE_GRID.cols * MINE_GRID.rows }, (_, i) => {
  const r = mulberry32(i * 2654435761 >>> 0);
  return ['#REF!', '0', '—', String(Math.floor(r() * 900)), '$' + Math.floor(r() * 90), 'TRUE', 'FALSE', '…'][Math.floor(r() * 8)];
});
