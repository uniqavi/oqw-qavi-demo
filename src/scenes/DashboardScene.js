import Phaser from 'phaser';
import { initAudio, beep, noise, whoosh, whistle, hiss } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { dist, aabb } from '../game/physics.js';
import { damagePlayer } from '../game/combat.js';
import { PLAYER } from '../config.js';
import { togglePauseMenu, isPauseOpen, resetPauseMenu } from '../game/pauseMenu.js';
import { loadMusic, crossfadeTo } from '../game/music.js';
import { loadSfx, playSfx, playSfxLoop, stopAllSfxLoops } from '../game/sfx.js';
import { syncCracksToHp, drawCracks } from '../game/cracks.js';
import { saveLevelTime, getTotalRunTime, submitScore, fmtTime } from '../game/leaderboard.js';
import { drawCrashScreen } from '../game/crashScreen.js';
import { updateScan, drawScanPrompt } from '../game/scanDocs.js';
import { playKilogramCredits, removeKilogramCredits } from '../game/kilogram.js';

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
//   • Walk over a doc to collect it.
//
// Collect the required docs → "EXPORTING…" → the dashboard collapses, a panel
// falls away to open the exit → dash out.

// ── Maze geometry — an irregular grid of blocks; panels span 1+ blocks. ──
const COLX = [150, 560, 970, 1380, 1790, 2200, 2610];   // 7 columns
const ROWY = [200, 500, 800, 1100, 1400, 1700];          // 6 rows
const BLK_W = 300, BLK_H = 200;
const WORLD_W = COLX[COLX.length - 1] + BLK_W + 150;     // 3060
// World bottom sits flush with the spreadsheet's bottom boundary (grid ends
// at y=2640, +24px mirrored A–H header strip = 2664). There is NO walkable
// floor beneath the sheet — the minefield can't be skipped by walking under
// it. (Was 3000, which left a 336px bypass corridor.)
const WORLD_H = 2664;
const HEADER = { x: 0, y: 0, w: WORLD_W, h: 110 };

function blockRect(c1, r1, c2, r2) {
  return {
    x: COLX[c1], y: ROWY[r1],
    w: COLX[c2] + BLK_W - COLX[c1],
    h: ROWY[r2] + BLK_H - ROWY[r1],
  };
}

// Each panel spans a block range. `hostile`/`exit`/`mine` flag special panels.
// Every graph TYPE fights back with its own attack (hostile flags below):
//   pie   → rolling boulder          bar   → piston crushers
//   gauge → tracking laser needle    sheet → minefield
//   donut → segment grenades (arc + blast)
//   area  → lava eruption (the ridge is a volcano)
//   kpi   → poison gas vent (green cloud clings to the window, minor DoT)
//   hist  → bars compress into a cannonball and launch
//   table → rows eject as flying shards
//   line  → the chart line snaps taut and fires a horizontal beam
// The EXIT line panel stays safe; only a spread of panels is armed so the
// route stays learnable.
const PANEL_SPECS = [
  // top band
  { kind: 'line',  label: 'SYSTEM UPTIME (30d)', c1: 0, r1: 0, c2: 1, r2: 0, hostile: 'line' },
  { kind: 'kpi',   label: 'TOTAL REVENUE',       c1: 2, r1: 0, c2: 2, r2: 0 },
  { kind: 'pie',   label: 'REVENUE SOURCE',      c1: 3, r1: 0, c2: 3, r2: 0, hostile: 'pie' },
  { kind: 'kpi',   label: 'NEW SIGNUPS',         c1: 4, r1: 0, c2: 4, r2: 0 },
  { kind: 'gauge', label: 'TRUST INDEX',         c1: 6, r1: 0, c2: 6, r2: 1, hostile: 'gauge' }, // tall
  // r1 — gauntlet #1
  { kind: 'kpi',   label: 'CHURN RATE',          c1: 0, r1: 1, c2: 0, r2: 1, hostile: 'kpi' },
  { kind: 'bar',   label: 'USERS / REGION',      c1: 1, r1: 1, c2: 3, r2: 1, hostile: 'bar' },   // wide
  { kind: 'donut', label: 'ENGAGEMENT MIX',      c1: 4, r1: 1, c2: 4, r2: 1, hostile: 'donut' },
  // r2
  { kind: 'table', label: 'ASSET WATCHLIST',     c1: 0, r1: 2, c2: 0, r2: 3, hostile: 'table' }, // tall
  { kind: 'area',  label: 'SENTIMENT TREND',     c1: 2, r1: 2, c2: 3, r2: 2, hostile: 'area' },  // wide
  { kind: 'kpi',   label: 'ACTIVE ASSETS',       c1: 4, r1: 2, c2: 4, r2: 2, hostile: 'kpi' },
  { kind: 'kpi',   label: 'BOT TRAFFIC',         c1: 6, r1: 2, c2: 6, r2: 2 },
  // r3 — gauntlet #2
  { kind: 'hist',  label: 'PAYOUTS',             c1: 1, r1: 3, c2: 2, r2: 3, hostile: 'hist' },  // wide
  { kind: 'bar',   label: 'BUDGET BY DEPT',      c1: 4, r1: 3, c2: 5, r2: 3, hostile: 'bar' },
  { kind: 'line',  label: 'SUPPRESSION RATE',    c1: 6, r1: 3, c2: 6, r2: 4, exit: true },       // tall → exit
  // r4 — gauntlet #3 + minefield header
  { kind: 'kpi',   label: 'FLAGGED TODAY',       c1: 0, r1: 4, c2: 0, r2: 4, hostile: 'kpi' },
  { kind: 'bar',   label: 'OPS TEMPO',           c1: 1, r1: 4, c2: 2, r2: 4, hostile: 'bar' },
  { kind: 'sheet', label: 'RAW EXPORTS — Sheet1', c1: 3, r1: 4, c2: 5, r2: 4, mine: true },
  // r5
  { kind: 'table', label: 'FLAGGED STORIES',     c1: 0, r1: 5, c2: 1, r2: 5, hostile: 'table' },
  { kind: 'kpi',   label: 'COMPLIANCE',          c1: 2, r1: 5, c2: 2, r2: 5 },
  { kind: 'gauge', label: 'CAMPAIGN HEALTH',     c1: 6, r1: 5, c2: 6, r2: 5 },
  // filler widgets — these also wall off shortcut blocks to force the route
  { kind: 'kpi',   label: 'AD SPEND',            c1: 5, r1: 0, c2: 5, r2: 0 },
  { kind: 'donut', label: 'TRAFFIC MIX',         c1: 5, r1: 1, c2: 5, r2: 1, hostile: 'donut' },
  { kind: 'kpi',   label: 'SESSIONS',            c1: 5, r1: 2, c2: 5, r2: 2 },
  { kind: 'kpi',   label: 'QUEUE DEPTH',         c1: 1, r1: 2, c2: 1, r2: 2 },
  { kind: 'area',  label: 'INCIDENTS',           c1: 3, r1: 3, c2: 3, r2: 3, hostile: 'area' },
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
const SAFE_PATH_SET = new Set([
  '3,0', '4,0', '5,0', '6,0',
  '3,1', '6,1',
  '3,2', '4,2', '6,2',
  '0,3', '1,3', '4,3', '6,3',
  '1,4', '2,4', '3,4', '4,4', '6,4',
  '6,5',
  '4,6', '5,6', '6,6',
  '3,7', '4,7',
  '3,8', '7,8',
  '3,9', '4,9', '5,9', '6,9', '7,9'
]);

const MINE_GRID = {
  x: 1410, y: 1640, cols: 8, rows: 10, cw: 132, ch: 100,
  mines: []
};

// ── Spreadsheet perimeter barriers — use the existing header chrome as walls. ──
// Dimensions match the actual header strips:
//   SIDE_WALL_W = 30px  (the grey number column on left/right)
//   TOP_WALL_H  = 24px  (the grey A-H letter row on top/bottom)
// Two 1-row gaps:
//   ENTRANCE — left wall,  row 3 (0-idx) = row 4 label: col A safe cell '0,3'
//   EXIT     — right wall, row 8 (0-idx) = row 9 label: col H safe cell '7,8'
const SIDE_WALL_W  = 30;
const TOP_WALL_H   = 24;
const ENTER_ROW    = 3;   // 0-indexed
const EXIT_ROW     = 8;   // 0-indexed
const SG  = MINE_GRID;
const SW  = SG.cols * SG.cw;   // 1056
const SH  = SG.rows * SG.ch;   // 1000
const SHEET_WALLS = [
  // Top barrier  (A-H header strip)
  { x: SG.x, y: SG.y - TOP_WALL_H, w: SW, h: TOP_WALL_H,
    collapsed: 0, sheetWall: true },
  // Bottom barrier (mirrored A-H strip)
  { x: SG.x, y: SG.y + SH, w: SW, h: TOP_WALL_H,
    collapsed: 0, sheetWall: true },
  // Left barrier — above entrance (rows 0..ENTER_ROW-1)
  { x: SG.x - SIDE_WALL_W, y: SG.y,
    w: SIDE_WALL_W, h: ENTER_ROW * SG.ch,
    collapsed: 0, sheetWall: true },
  // Left barrier — below entrance (rows ENTER_ROW+1..rows-1)
  { x: SG.x - SIDE_WALL_W, y: SG.y + (ENTER_ROW + 1) * SG.ch,
    w: SIDE_WALL_W, h: SH - (ENTER_ROW + 1) * SG.ch,
    collapsed: 0, sheetWall: true },
  // Right barrier — above exit (rows 0..EXIT_ROW-1)
  { x: SG.x + SW, y: SG.y,
    w: SIDE_WALL_W, h: EXIT_ROW * SG.ch,
    collapsed: 0, sheetWall: true },
  // Right barrier — below exit (row EXIT_ROW+1..rows-1  — closes row 9 on the right)
  { x: SG.x + SW, y: SG.y + (EXIT_ROW + 1) * SG.ch,
    w: SIDE_WALL_W, h: SH - (EXIT_ROW + 1) * SG.ch,
    collapsed: 0, sheetWall: true },
];

for (let c = 0; c < MINE_GRID.cols; c++) {
  for (let r = 0; r < MINE_GRID.rows; r++) {
    if (!SAFE_PATH_SET.has(c + ',' + r)) {
      MINE_GRID.mines.push([c, r]);
    }
  }
}

const DOCS_TARGET = 5;
// Movement speed is shared across every level (see PLAYER.baseSpeed) so the
// window handles identically in 1.1, 1.2 and here.
const BASE_SPEED = PLAYER.baseSpeed;
const INTRO_TIME = 1.3;
const EXPORT_TIME = 4.0;

// Base damage. With the discrete-hits model (6 hits on this level; the
// earlier levels use 3): amounts < 70 cost ONE hit, >= 70 cost TWO (see
// combat.js).
// Balance pass: the gauge laser used to cost TWO hits (112) — that was a
// near-instant kill, so it's now a single (still the scariest telegraph in
// the level). Gas (kpi) no longer damages at all — it blinds instead (see
// triggerGasScreen).
const DMG = { pie: 58, bar: 66, gauge: 68, donut: 30, area: 30, kpi: 0, hist: 66, table: 30, line: 40 };

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
    this.revealedGrid = data?.revealedGrid || {};
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
    this.bonusCaptured = 0;   // spreadsheet-path + timed docs (★, not required)
    this.exporting = false;
    this.exportT = 0;
    this.escapeReady = false;
    this.done = false;

    // Discrete-hits health — this level runs 6 hits (slightly higher than the 3 the
    // earlier levels use) because it's a long, dense gauntlet.
    // Damage still shows as glass cracks on the window (no HP bar).
    const player = {
      x: 330, y: 1990, w: 56, h: 40, size: 56,
      vx: 0, vy: 0,
      hp: 6, maxHp: 6, useHp: true, useHits: true,
      invuln: 0, hitFlash: 0,
      test: { immune: false },
    };
    this.player = player;
    this.cracks = [];
    this._lastHp = player.hp;
    this.shots = [];             // live enemy projectiles (grenades/blobs/balls/shards)
    this.gasScreen = null;       // fullscreen poison-blind: { t, dur, seed }
    this.gs = {
      player, sparks: [],
      stats: { damageTaken: 0, hitsReceived: 0, endedAt: 0 },
      status: 'playing', lostReason: '', time: 0,
    };

    this.panels = PANEL_SPECS.map(s => ({ ...s, ...blockRect(s.c1, s.r1, s.c2, s.r2), shake: 0, collapsed: 0, hostileActive: false }));
    this.panels.forEach(p => { p.data = genData(p); });
    this.seals = this.buildSeals();
    this.solids = this.panels.filter(p => p.kind !== 'sheet').concat(this.seals).concat(SHEET_WALLS);
    this.exitPanel = this.panels.find(p => p.exit);

    this.hazards = this.buildHazards();
    this.docs = this.buildDocs();
    this.exit = null;
    this.detonatingMine = null;

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.onKey = (e) => {
      // Completion popup is up — keys belong to the name input, not the game
      if (this.done) return;
      if (this.narration && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); this.advanceNarration(); return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // When crashed: ESC goes straight to main menu (matches Level 1.1 behaviour).
        if (this.failed) { this.quitToMenu(); return; }
        togglePauseMenu({ onQuit: () => this.quitToMenu() });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault(); this.restartLevel();
      }
    };
    document.addEventListener('keydown', this.onKey);

    // HUD — no HP bar; health is the glass-crack state of the window itself
    // (Level 1.1 consistency).
    this.taskFrame = document.getElementById('task-frame');
    this.taskLine = document.getElementById('task-line');
    this.taskProg = document.getElementById('task-progress');
    this.taskFrame?.classList.remove('hidden');
    this.taskFrame?.classList.remove('cleared');

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

    this.beats = { intro: false, firstDoc: false, allDocs: false };
    setTimeout(() => this.playIntroNarration(), INTRO_TIME * 1000 + 200);

    this.handleResize();
    initAudio();
    loadMusic(); loadSfx();
    // Finale gets its own driving 8-bit electro loop ("Cyborg Ninja").
    crossfadeTo('level3', { fadeMs: 1500 });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onNarrationClick);
      if (this.narrationTimer) clearTimeout(this.narrationTimer);
      resetPauseMenu();
      stopAllSfxLoops();
      this.taskFrame?.classList.add('hidden');
      this.intelDom?.wrap?.classList.add('hidden');
      this.intelDom?.wrap?.classList.remove('show');
      this.crashEl?.remove();
      removeKilogramCredits();
      document.getElementById('dash-complete')?.remove();
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
          rollSpeed: 230 * mul, triggerR: 560,
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
          angle: -Math.PI / 2 + 0.5, aimDur: 1.5, beamT: 0, fireAngle: 0,
          triggerR: 700, beamLen: 2200,
        });
      } else if (p.hostile === 'donut') {
        // Grenade lobber — donut segments break off and arc toward the player,
        // exploding after a short fuse.
        list.push({
          type: 'donut', panel: p, activated: false, alertT: 0,
          cooldown: 1.2, interval: 3.4 / mul, triggerR: 520,
          cx: p.x + p.w / 2, cy: p.y + p.h * 0.55,
        });
      } else if (p.hostile === 'area') {
        // Lava erupter — the chart ridge is a volcano; molten blobs spray up
        // and rain back down through the corridor.
        list.push({
          type: 'area', panel: p, activated: false, alertT: 0,
          cooldown: 1.5, interval: 3.8 / mul, triggerR: 480,
        });
      } else if (p.hostile === 'kpi') {
        // Poison gas PIPE — a visible metal pipe runs along the panel's
        // bottom edge and vents gas VERTICALLY down into the corridor on a
        // readable cycle (hiss telegraph → vent → idle). Touching an active
        // gas column doesn't damage HP — it blinds: a fullscreen green gas
        // effect covers the whole game window (duration scales with
        // difficulty). See triggerGasScreen().
        const pipeY = p.y + p.h;
        const nVents = Math.max(2, Math.round(p.w / 160));
        const vents = [];
        for (let i = 0; i < nVents; i++) {
          vents.push({
            x: p.x + (i + 0.5) * (p.w / nVents),
            phase: i / nVents,             // staggered so the corridor is never fully sealed
          });
        }
        list.push({
          type: 'kpi', panel: p, activated: false, alertT: 0,
          pipeY, vents, ventLen: 150, ventW: 30,
          period: 4.6 / mul,               // full cycle length
          warmFrac: 0.22,                  // first fraction of the cycle = hiss telegraph
          ventFrac: 0.34,                  // next fraction = venting (rest is idle)
          t: Math.random() * 2,            // desync the three pipes from each other
          triggerR: 520,
          cx: p.x + p.w / 2, cy: p.y + p.h / 2,
        });
      } else if (p.hostile === 'hist') {
        // Cannonball transformer — the histogram compresses its bars into a
        // ball and launches it ballistically at the player.
        list.push({
          type: 'hist', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0, triggerR: 560, squish: 0,
          cx: p.x + p.w / 2, cy: p.y + p.h - 40,
        });
      } else if (p.hostile === 'table') {
        // Row-shard thrower — table rows eject sideways as flying shards.
        list.push({
          type: 'table', panel: p, activated: false, alertT: 0,
          cooldown: 1.0, interval: 3.0 / mul, triggerR: 500, rowFlash: -1,
        });
      } else if (p.hostile === 'line') {
        // Beam line — the chart's polyline pulls taut, glows, then fires a
        // horizontal beam across the corridor beneath the panel.
        list.push({
          type: 'line', panel: p, state: 'idle', t: 0, cooldown: 0,
          activated: false, alertT: 0, triggerR: 520,
          beamY: p.y + p.h + 55,          // corridor row below the panel
          beamX0: p.x - 420, beamX1: p.x + p.w + 420,
        });
      } else if (p.mine) {
        const g = MINE_GRID;
        const mineSet = new Set(g.mines.map(([c, r]) => c + ',' + r));
        list.push({ type: 'sheet', panel: p, activated: false, alertT: 0, grid: g, mineSet });
      }
    }

    // The STALKER — the BOT TRAFFIC KPI widget detaches and slowly follows
    // the player for the entire level. Much slower than the player, but it
    // never stops: scanning in place means it WILL catch up.
    const botPanel = this.panels.find(pn => pn.label === 'BOT TRAFFIC');
    if (botPanel) {
      list.push({
        type: 'stalker', panel: botPanel,
        x: botPanel.x + botPanel.w / 2, y: botPanel.y + botPanel.h / 2,
        w: 150, h: 96,
        // Balance pass: slower + later detach + longer post-hit daze so it
        // pressures scanning without dominating the whole level.
        speed: 64 * mul, delay: 8, stun: 0, wob: 0,
        detached: false,
      });
    }
    return list;
  }

  buildDocs() {
    // Required (5) → one behind each hazard along the forced snake + one under FLAGGED TODAY.
    // Bonus (3) → placed along the spreadsheet green safe path.
    return [
      { x: 2555, y: 300,  required: true,  taken: false, takeT: 0 },  // by the gauge (snake end)
      { x: 1100, y: 750,  required: true,  taken: false, takeT: 0 },  // gauntlet #1 corridor
      { x: 2140, y: 1350, required: true,  taken: false, takeT: 0 },  // gauntlet #2 corridor
      { x: 900,  y: 1650, required: true,  taken: false, takeT: 0 },  // gauntlet #3 corridor
      { x: 250,  y: 1650, required: true,  taken: false, takeT: 0 },  // under FLAGGED TODAY
      // Spreadsheet green path docs:
      { x: 1872, y: 2090, required: false, taken: false, takeT: 0 },  // D5 (index 3,4)
      { x: 2268, y: 1690, required: false, taken: false, takeT: 0 },  // G1 (index 6,0)
      { x: 2004, y: 2290, required: false, taken: false, takeT: 0 },  // E7 (index 4,6)
      // Timed bonus doc: bigger, blinking, on a deletion countdown — scan it
      // in time for a glass repair. Same corridor as the gauntlet #1 doc.
      { x: 950,  y: 750,  required: false, taken: false, takeT: 0, bonusTimed: true, ttl: 45 },
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
        // Exit pathway: keep the far-right connector (gap 5, x=2500) OPEN on
        // rows 4 + 5 as well. Together with row 3 (already the open connector
        // there) this forms a continuous vertical corridor from the
        // spreadsheet's right-side exit gap straight up to the EXIT panel —
        // emerging from the minefield leads somewhere instead of a dead end.
        if (g === 5 && (r === 4 || r === 5)) continue;
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
    crossfadeTo('level1', { fadeMs: 800 });
    document.body.classList.add('menu-mode');
    this.scene.stop();
    this.scene.start('MenuScene');
  }
  // (restartLevel defined once below, next to the completion popup.)

  hits(x, y, w, h) {
    const box = { x: x - w / 2, y: y - h / 2, w, h };
    if (aabb(box, HEADER)) return true;
    const inSheet = (box.x + box.w > 1410 && box.x < 2466 && box.y + box.h > 1640 && box.y < 2640);
    for (const p of this.solids) {
      if (p.collapsed < 1 && aabb(box, p)) {
        // sheetWall barriers are ALWAYS solid — they form the perimeter of the
        // minefield and must block the player from exiting/entering the sheet
        // from outside the designated entrance.
        if (p.sheetWall) return true;
        if (inSheet && p.kind === undefined && p.margin === undefined) continue;
        return true;
      }
    }
    return false;
  }
  clampWorld(p) {
    p.x = Phaser.Math.Clamp(p.x, p.w / 2, WORLD_W - p.w / 2);
    p.y = Phaser.Math.Clamp(p.y, p.h / 2, WORLD_H - p.h / 2);
  }
  // minTop (optional): ignore surfaces whose top edge is above it — used by
  // grenades so they arc over their own panel instead of landing on its roof.
  surfaceBelow(x, r, curY, minTop = 0) {
    let best = WORLD_H;
    for (const s of this.solids) {
      if (s.collapsed >= 1) continue;
      if (s.y < minTop) continue;
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
      else {
        const inSheet = (box.x + box.w > 1410 && box.x < 2466 && box.y + box.h > 1640 && box.y < 2640);
        for (const s of this.solids) {
          if (s.collapsed < 1 && aabb(box, s)) {
            // sheetWall barriers are always solid — never skip them
            if (!s.sheetWall && inSheet && s.kind === undefined && s.margin === undefined) continue;
            hit = s;
            break;
          }
        }
      }
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

    if (this.started && !this.failed && !this.done && !this.narration && !this.exitPan) {
      try {
        const currentAccum = parseFloat(localStorage.getItem('oqw-accum-l3') || '0');
        localStorage.setItem('oqw-accum-l3', String(currentAccum + dt));
      } catch (e) {}
    }
    if (this.introT < INTRO_TIME) this.introT += dt;

    this.gs.sparks = this.gs.sparks.filter(s => {
      s.life -= dt; s.x += (s.vx || 0) * dt; s.y += (s.vy || 0) * dt;
      if (s.vx !== undefined) { s.vx *= 0.92; s.vy *= 0.92; }
      return s.life > 0;
    });

    if (this.gs.status === 'lost') this.failed = true;
    if (this.failed) {
      if (!this.crashSfxPlayed) { this.crashSfxPlayed = true; playSfx('gameOver'); stopAllSfxLoops(); }
      this.render(); this.updateHud(); return;
    }
    if (this.done) { this.render(); this.updateHud(); return; }
    if (this.narration) { this.render(); this.updateHud(); return; }
    if (this.exitPan) { this.updateExitPan(dt); this.render(); this.updateHud(); return; }

    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;

    // Fullscreen poison-blind decay (re-touching a vent keeps it maxed)
    if (this.gasScreen) {
      this.gasScreen.t -= dt;
      if (this.gasScreen.t <= 0) this.gasScreen = null;
    }

    // Glass cracks track the discrete-hits HP (grow on hit, repair on heal).
    // Scan-interrupt mercy: a hit mid-scan halves progress instead of wiping it.
    this._lastHp = syncCracksToHp(this.cracks, this._lastHp, p.hp, p.w, p.h);

    // Timed bonus doc: countdown once the level has started
    if (this.started) {
      for (const d of this.docs) {
        if (d.bonusTimed && !d.taken) {
          d.ttl -= dt;
          if (d.ttl <= 0) {
            d.taken = true; d.takeT = this.time; d.expired = true;
            beep(180, 0.25, 'sawtooth', 0.08);   // fizzle — file deleted
          }
        }
      }
    }

    if (this.detonatingMine) {
      p.vx = 0;
      p.vy = 0;
      this.detonatingMine.t += dt;
      if (!this.detonatingMine.exploded) {
        if (this.detonatingMine.t >= this.detonatingMine.duration) {
          this.detonatingMine.exploded = true;
          this.detonatingMine.blastT = 0;
          playSfx('mineBoom');
          for (let j = 0; j < 24; j++) {
            this.gs.sparks.push({
              x: this.detonatingMine.cx, y: this.detonatingMine.cy, life: 0.6, hit: true,
              vx: (Math.random() - 0.5) * 450, vy: (Math.random() - 0.5) * 450,
            });
          }
        }
      } else {
        this.detonatingMine.blastT += dt;
        if (this.detonatingMine.blastT >= 0.4) {
          this.killPlayer('STEPPED ON A MINE');
          this.detonatingMine = null;
        }
      }
    } else {
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
    }

    this.camX = Phaser.Math.Clamp(p.x - this.viewWW / 2, 0, Math.max(0, WORLD_W - this.viewWW));
    this.camY = Phaser.Math.Clamp(p.y - this.viewHW / 2, 0, Math.max(0, WORLD_H - this.viewHW));

    if (this.started && !this.detonatingMine) this.updateHazards(dt);
    this.updateCapture(dt);
    this.updateEscape(dt);

    this.render();
    this.updateHud();
  }

  tryActivate(hz, px, py, range) {
    if (hz.activated) { if (hz.alertT < 1) hz.alertT = Math.min(1, hz.alertT + 0.05); return; }
    const c = { x: hz.panel.x + hz.panel.w / 2, y: hz.panel.y + hz.panel.h / 2 };
    if (dist(px, py, c.x, c.y) < range) {
      // Silent activation — the panel shake is the tell. (The old
      // "enemy spotted" hostile-alert sting was removed by request: only the
      // background music and actual hit sounds should play.)
      hz.activated = true; hz.alertT = 0;
      hz.panel.hostileActive = true; hz.panel.shake = 1;
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
      else if (hz.type === 'donut') this.updateDonut(hz, dt, p);
      else if (hz.type === 'area') this.updateArea(hz, dt, p);
      else if (hz.type === 'kpi') this.updateKpiGas(hz, dt, p);
      else if (hz.type === 'hist') this.updateHist(hz, dt, p);
      else if (hz.type === 'table') this.updateTable(hz, dt, p);
      else if (hz.type === 'line') this.updateLine(hz, dt, p);
      else if (hz.type === 'stalker') this.updateStalker(hz, dt, p);
    }
    this.updateShots(dt, p);
  }

  // ── Stalker: the BOT TRAFFIC widget hunts you all level ──
  updateStalker(hz, dt, p) {
    if (hz.delay > 0) {
      hz.delay -= dt;
      if (hz.delay <= 0) {
        hz.detached = true;
        hz.panel.stalkerGone = true;
        whoosh(0.5, 200, 900, 0.1);   // tears free of its slot
        beep(140, 0.35, 'sawtooth', 0.08);
      }
      return;
    }
    hz.wob += dt;
    if (hz.stun > 0) { hz.stun -= dt; return; }
    const d = dist(p.x, p.y, hz.x, hz.y) || 1;
    // Floats OVER the maze straight at the player — walls don't apply to it
    hz.x += ((p.x - hz.x) / d) * hz.speed * dt;
    hz.y += ((p.y - hz.y) / d) * hz.speed * dt;
    if (p.invuln <= 0 && d < 62) {
      damagePlayer(this.gs, 30, ((p.x - hz.x) / d) * 90, ((p.y - hz.y) / d) * 90);
      this.resolveStuck(p);
      hz.stun = 2.2;   // backs off after a hit so it can't chain through invuln
    }
  }

  // ── Donut → grenade lobber (tactical-shooter model) ──
  // The DONUT panel is the visible thrower: it winds up (panel shake +
  // pin-plink), lobs a grenade on a ballistic arc, and the grenade then
  // LANDS and sits on the floor for a readable fuse window (blinking faster
  // and faster) before detonating — the player gets a beat to clear out.
  updateDonut(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.7);
    if (!hz.activated) return;
    hz.cooldown -= dt;
    if (hz.cooldown > 0 || dist(p.x, p.y, hz.cx, hz.cy) > hz.triggerR) return;
    hz.cooldown = hz.interval;
    hz.panel.shake = 0.7;
    // Solve a simple ballistic arc to (roughly) the player's position
    const flight = 1.0;
    const GRAV = 1500;
    const vx = (p.x - hz.cx) / flight + (Math.random() - 0.5) * 60;
    const vy = (p.y - hz.cy) / flight - GRAV * flight / 2;
    this.shots.push({
      kind: 'grenade', x: hz.cx, y: hz.cy, vx, vy, grav: GRAV,
      landed: false,
      airTimeout: flight + 2.5,   // fallback: detonate mid-air if it never lands
      fuseLand: 1.7,              // seconds sitting on the floor before the blast
      floorMin: hz.panel.y + hz.panel.h,   // don't land on the thrower's own roof
      r: 12, spin: 0,
    });
    // grenade: pin "plink" + falling-bomb whistle for the whole arc
    beep(1150, 0.05, 'triangle', 0.08);
    whistle(flight + 0.1, 1500, 350, 0.055);
  }

  // ── Area chart → lava eruption ──
  updateArea(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.7);
    if (!hz.activated) return;
    hz.cooldown -= dt;
    const cx = hz.panel.x + hz.panel.w / 2, cy = hz.panel.y + hz.panel.h / 2;
    if (hz.cooldown > 0 || dist(p.x, p.y, cx, cy) > hz.triggerR) return;
    hz.cooldown = hz.interval;
    hz.panel.shake = 1;
    // volcanic rumble + gurgle
    noise(0.45, 0.14); beep(70, 0.5, 'sawtooth', 0.09);
    whoosh(0.4, 200, 700, 0.09);
    // Blobs erupt from the ridge (panel top area) and rain down
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.shots.push({
        kind: 'blob',
        x: hz.panel.x + 30 + Math.random() * (hz.panel.w - 60),
        y: hz.panel.y + hz.panel.h * 0.45,
        vx: (Math.random() - 0.5) * 260,
        vy: -(260 + Math.random() * 220),
        grav: 1300, life: 2.6, r: 9 + Math.random() * 6, wob: Math.random() * 6,
      });
    }
  }

  // ── KPI → poison gas pipe (vents vertically into the corridor below) ──
  // Cycle per vent (staggered by phase): idle → hiss telegraph → gas column.
  // Contact with an active column triggers the fullscreen gas-blind effect
  // (no HP damage — the impact is that you can't see; see triggerGasScreen).
  updateKpiGas(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.8);
    if (!hz.activated) return;
    hz.t += dt;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (const v of hz.vents) {
      const f = ((hz.t / hz.period) + v.phase) % 1;
      const wasState = v.state;
      v.state = f < hz.warmFrac ? 'warm'
              : f < hz.warmFrac + hz.ventFrac ? 'vent' : 'idle';
      // vent ramp 0..1 for the draw (grow fast, fade at the tail)
      if (v.state === 'vent') {
        const vf = (f - hz.warmFrac) / hz.ventFrac;
        v.flow = vf < 0.15 ? vf / 0.15 : vf > 0.85 ? (1 - vf) / 0.15 : 1;
      } else v.flow = 0;
      if (v.state === 'warm' && wasState !== 'warm') hiss(0.7, 0.05);   // telegraph
      if (v.state === 'vent' && wasState !== 'vent') hiss(1.3, 0.09);   // pressurised release
      // Collision — only while flowing hard enough to read as "on"
      if (v.state === 'vent' && v.flow > 0.25) {
        const col = { x: v.x - hz.ventW / 2, y: hz.pipeY, w: hz.ventW, h: hz.ventLen * v.flow };
        if (aabb(col, pb)) this.triggerGasScreen();
      }
    }
  }

  // Fullscreen poison-blind. Duration scales with difficulty — short but
  // highly impactful (the whole game window fogs over, not just SCAN.exe).
  // Standing in the column keeps it maxed; it fades once you're clear.
  triggerGasScreen() {
    const dur = { easy: 1.3, normal: 2.0, hard: 2.8 }[this.difficulty] || 1.3;
    if (!this.gasScreen) {
      this.gasScreen = { t: dur, dur, seed: Math.random() * 100 };
      hiss(1.2, 0.1);
      beep(160, 0.3, 'sawtooth', 0.06);
    } else {
      this.gasScreen.t = Math.max(this.gasScreen.t, dur);
      this.gasScreen.dur = dur;
    }
  }

  // ── Histogram → cannonball transformer ──
  updateHist(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.7);
    const near = dist(p.x, p.y, hz.cx, hz.cy) < hz.triggerR;
    if (hz.state === 'idle') {
      hz.squish = Math.max(0, hz.squish - dt * 2);
      if (hz.cooldown > 0) hz.cooldown -= dt;
      if (hz.activated && near && hz.cooldown <= 0) {
        hz.state = 'windup'; hz.t = 0;
        beep(160, 0.25, 'sawtooth', 0.07);
      }
      return;
    }
    if (hz.state === 'windup') {
      hz.t += dt;
      hz.squish = Math.min(1, hz.t / 0.8);   // bars visibly compress into a ball
      hz.panel.shake = 0.8;
      if (hz.t >= 0.8) {
        hz.state = 'idle'; hz.cooldown = 4.2; hz.t = 0;
        const flight = 0.9;
        const GRAV = 1500;
        this.shots.push({
          kind: 'ball', x: hz.cx, y: hz.cy,
          vx: (p.x - hz.cx) / flight,
          vy: (p.y - hz.cy) / flight - GRAV * flight / 2,
          grav: GRAV, life: 4, r: 20, bounces: 1, spin: 0,
        });
        playSfx('boulderLaunch');
        noise(0.2, 0.12);
      }
    }
  }

  // ── Table → row shards ──
  updateTable(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.7);
    if (!hz.activated) return;
    hz.cooldown -= dt;
    if (hz.rowFlash >= 0) hz.rowFlash -= dt * 3;
    const cx = hz.panel.x + hz.panel.w / 2, cy = hz.panel.y + hz.panel.h / 2;
    if (hz.cooldown > 0 || dist(p.x, p.y, cx, cy) > hz.triggerR) return;
    hz.cooldown = hz.interval;
    hz.rowFlash = 1;
    hz.panel.shake = 0.5;
    // Shard flies horizontally out of the panel edge nearest the player, at
    // the player's current height (clamped to the panel's rows).
    const dir = p.x >= cx ? 1 : -1;
    const sy = Phaser.Math.Clamp(p.y, hz.panel.y + 46, hz.panel.y + hz.panel.h - 16);
    this.shots.push({
      kind: 'shard',
      x: dir > 0 ? hz.panel.x + hz.panel.w : hz.panel.x,
      y: sy, vx: dir * 420, vy: 0, grav: 0, life: 2.2,
      w: 46, h: 12, spin: 0,
    });
    // sharp whip-crack as the row tears free
    whoosh(0.28, 2200, 500, 0.13);
  }

  // ── Line chart → taut-line beam ──
  updateLine(hz, dt, p) {
    this.tryActivate(hz, p.x, p.y, hz.triggerR * 0.7);
    const cx = hz.panel.x + hz.panel.w / 2, cy = hz.panel.y + hz.panel.h / 2;
    const near = dist(p.x, p.y, cx, cy) < hz.triggerR;
    if (hz.state === 'idle') {
      if (hz.cooldown > 0) hz.cooldown -= dt;
      if (hz.activated && near && hz.cooldown <= 0) {
        hz.state = 'charge'; hz.t = 0;
        playSfx('laserCharge');
      }
      return;
    }
    if (hz.state === 'charge') {
      hz.t += dt;
      hz.panel.shake = 0.4;
      if (hz.t >= 1.0) {
        hz.state = 'fire'; hz.t = 0;
        playSfx('laserFire');
        noise(0.18, 0.09);
        // Damage anyone in the beam band on the firing frame window
        const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        const beam = { x: hz.beamX0, y: hz.beamY - 10, w: hz.beamX1 - hz.beamX0, h: 20 };
        if (p.invuln <= 0 && aabb(beam, pb)) {
          damagePlayer(this.gs, DMG.line, 0, 30);
          this.resolveStuck(p);
        }
      }
      return;
    }
    if (hz.state === 'fire') {
      hz.t += dt;
      // sustained beam for a short window — re-check contact while it burns
      const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      const beam = { x: hz.beamX0, y: hz.beamY - 10, w: hz.beamX1 - hz.beamX0, h: 20 };
      if (p.invuln <= 0 && aabb(beam, pb)) {
        damagePlayer(this.gs, DMG.line, 0, 30);
        this.resolveStuck(p);
      }
      if (hz.t >= 0.3) { hz.state = 'idle'; hz.cooldown = 3.2; }
    }
  }

  // ── Shared projectile system for the new enemies ──
  updateShots(dt, p) {
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.vy += (s.grav || 0) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.spin !== undefined) s.spin += dt * 9;

      if (s.kind === 'grenade') {
        if (!s.landed) {
          s.airTimeout -= dt;
          const surf = this.surfaceBelow(s.x, s.r, s.y, s.floorMin || 0);
          if (s.vy > 0 && s.y + s.r >= surf) {
            // LAND — settle on the floor and start the visible fuse window
            s.landed = true;
            s.y = surf - s.r;
            s.vx = 0; s.vy = 0; s.grav = 0;
            s.armT = s.fuseLand;
            beep(220, 0.08, 'triangle', 0.07);   // metal clink
            noise(0.06, 0.05);
          } else if (s.airTimeout <= 0) {
            this.explodeGrenade(s, p);           // never found a floor — air burst
            this.shots.splice(i, 1);
            continue;
          }
        } else {
          s.armT -= dt;
          if (s.armT <= 0) {
            this.explodeGrenade(s, p);
            this.shots.splice(i, 1);
            continue;
          }
        }
      } else if (s.kind === 'blob') {
        s.life -= dt;
        const landed = s.vy > 0 && s.y + s.r >= this.surfaceBelow(s.x, s.r, s.y);
        if (p.invuln <= 0 && dist(p.x, p.y, s.x, s.y) < s.r + p.h * 0.45) {
          damagePlayer(this.gs, DMG.area, s.vx * 0.05, 20);
          this.resolveStuck(p);
          this.shots.splice(i, 1);
          continue;
        }
        if (s.life <= 0 || landed) {
          whoosh(0.12, 320, 80, 0.07);   // molten splat
          for (let j = 0; j < 5; j++) this.gs.sparks.push({
            x: s.x, y: s.y, life: 0.35, hit: true,
            vx: (Math.random() - 0.5) * 180, vy: -Math.random() * 140,
          });
          this.shots.splice(i, 1);
          continue;
        }
      } else if (s.kind === 'ball') {
        s.life -= dt;
        const surf = this.surfaceBelow(s.x, s.r, s.y);
        if (s.vy > 0 && s.y + s.r >= surf) {
          if (s.bounces > 0) {
            s.bounces--; s.y = surf - s.r; s.vy *= -0.55;
            noise(0.12, 0.1); beep(65, 0.22, 'sine', 0.12);   // heavy iron thump
          } else { this.shots.splice(i, 1); continue; }
        }
        if (p.invuln <= 0 && dist(p.x, p.y, s.x, s.y) < s.r + p.h * 0.4) {
          damagePlayer(this.gs, DMG.hist, (p.x - s.x) >= 0 ? 60 : -60, -16);
          this.resolveStuck(p);
          this.shots.splice(i, 1);
          continue;
        }
        if (s.life <= 0) { this.shots.splice(i, 1); continue; }
      } else if (s.kind === 'shard') {
        s.life -= dt;
        const box = { x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h };
        if (p.invuln <= 0 && aabb(box, pb)) {
          damagePlayer(this.gs, DMG.table, s.vx * 0.08, 0);
          this.resolveStuck(p);
          this.shots.splice(i, 1);
          continue;
        }
        if (s.life <= 0) { this.shots.splice(i, 1); continue; }
      }
    }
  }

  // Grenade blast — shared by the landed fuse and the air-burst fallback.
  explodeGrenade(s, p) {
    playSfx('mineBoom', { volume: 0.45 });
    for (let j = 0; j < 18; j++) this.gs.sparks.push({
      x: s.x, y: s.y, life: 0.55, hit: true,
      vx: (Math.random() - 0.5) * 460, vy: (Math.random() - 0.5) * 460,
    });
    if (p.invuln <= 0 && dist(p.x, p.y, s.x, s.y) < 95) {
      damagePlayer(this.gs, DMG.donut, (p.x - s.x) * 0.5, (p.y - s.y) * 0.5);
      this.resolveStuck(p);
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
    if (hz.t > 7) {
      hz.state = 'idle'; hz.cooldown = 3.4; hz.x = cx; hz.y = cy; hz.vx = hz.vy = 0;
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
    
    const pBox = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (let c = 0; c < g.cols; c++) {
      for (let r = 0; r < g.rows; r++) {
        const cx = g.x + c * g.cw, cy = g.y + r * g.ch;
        const cellBox = { x: cx, y: cy, w: g.cw, h: g.ch };
        if (aabb(pBox, cellBox)) {
          const isMine = hz.mineSet.has(c + ',' + r);
          if (isMine) {
            this.revealedGrid[c + ',' + r] = 'mine';
            if (!this.detonatingMine) {
              this.detonatingMine = {
                col: c, row: r,
                cx: cx + g.cw / 2, cy: cy + g.ch / 2,
                x: cx, y: cy, w: g.cw, h: g.ch,
                t: 0, duration: 0.6,
                exploded: false, blastT: 0
              };
              beep(200, 0.15, 'sawtooth', 0.1);
            }
          } else {
            this.revealedGrid[c + ',' + r] = 'safe';
          }
        }
      }
    }
  }

  // ── Doc collection: park the window over a doc and HOLD SPACE to scan ──
  updateCapture(dt) {
    const p = this.player;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    const scanHeld = this.keys.space.isDown;
    for (const d of this.docs) {
      if (d.taken) continue;
      const overlapping = d.x > pb.x && d.x < pb.x + pb.w && d.y > pb.y && d.y < pb.y + pb.h;
      d._near = overlapping;
      if (updateScan(d, overlapping, scanHeld, dt)) this.collectDoc(d);
    }
  }
  collectDoc(d) {
    d.taken = true; d.takeT = this.time;
    playSfx('docScan');
    if (d.bonusTimed) {
      // Bonus intel scanned in time → one hit of glass repaired
      this.bonusCaptured++;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      playSfx('heal');
      beep(660, 0.1, 'sine', 0.12); setTimeout(() => beep(990, 0.16, 'sine', 0.1), 90);
      return;
    }
    beep(880, 0.08, 'sine', 0.13); setTimeout(() => beep(1320, 0.12, 'sine', 0.1), 70);
    if (d.required) this.captured++;
    else this.bonusCaptured++;
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
    // Speedrun clock: time spent actively playing this level across all attempts
    saveLevelTime('l3', parseFloat(localStorage.getItem('oqw-accum-l3') || '0'));
    // Campaign complete — Toto's wrap-up chat waits on the desktop
    try { localStorage.setItem('oqw-level3-cleared', 'true'); } catch (e) {}
    // KiloGram credits play first; the existing name-entry/score popup
    // follows when the credits finish (or are skipped).
    playKilogramCredits({ onComplete: () => this.showCompletePopup() });
  }

  // Mission-complete popup: total run time + name entry for the TOP AGENTS
  // leaderboard on the desktop. Skipping just returns to the desktop.
  // Victory finale — big popping "HUSH'S OPERATION IS EXPOSED!" animation
  // (plays after the KiloGram credits), then the name entry for the TOP
  // AGENTS leaderboard. Same save/skip logic as before, bigger ceremony.
  showCompletePopup() {
    const total = getTotalRunTime();
    const el = document.createElement('div');
    el.id = 'dash-complete';
    el.style.cssText =
      'position:fixed;inset:0;z-index:215;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(6,8,12,0.88);font-family:Tahoma,Arial,sans-serif;overflow:hidden;';

    // Confetti burst — game-palette shards popping out from the headline
    const CONF = ['#E63946', '#F4D35E', '#2D8659', '#4A7BC8', '#9b59b6', '#17a2b8'];
    let confetti = '';
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + Math.random() * 0.4;
      const d = 180 + Math.random() * 340;
      const tx = Math.cos(ang) * d, ty = Math.sin(ang) * d * 0.72;
      const s = 6 + Math.random() * 9;
      confetti +=
        '<div style="position:absolute;left:50%;top:42%;width:' + s + 'px;height:' + (s * 0.55) + 'px;' +
        'background:' + CONF[i % CONF.length] + ';border-radius:1.5px;opacity:0;' +
        'animation:vic-conf .95s cubic-bezier(.16,.8,.35,1) ' + (0.45 + Math.random() * 0.25).toFixed(2) + 's forwards;' +
        '--tx:' + tx.toFixed(0) + 'px;--ty:' + ty.toFixed(0) + 'px;--rot:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;"></div>';
    }

    const timeRows = total != null
      ? '<div style="font:12px Consolas,monospace;letter-spacing:2px;color:#8a97ad;margin:2px 0 2px;">TOTAL RUN TIME</div>' +
        '<div style="font:bold 40px Consolas,monospace;color:#2D8659;margin-bottom:12px;">' + fmtTime(total) + '</div>' +
        '<div style="font:13px Tahoma,Arial;color:#555;margin-bottom:8px;">Write your name to enter the leaderboard:</div>' +
        '<input id="dash-name" maxlength="12" placeholder="AGENT" style="width:210px;padding:8px 10px;text-align:center;' +
          'font:bold 16px Consolas,monospace;color:#1a1a1f;border:2px inset #dfe5ef;outline:none;text-transform:uppercase;' +
          'background:#fff;">' +
        '<style>#dash-name::placeholder{color:#b0b8c8;opacity:1;}</style>'
      : '<div style="font:13px Tahoma,Arial;color:#555;margin:12px 0;">Full-run time unavailable — beat all three levels in one save to post a score.</div>';

    el.innerHTML =
      '<style>' +
        '@keyframes vic-pop { 0% { opacity:0; transform:scale(0.2); } 60% { opacity:1; transform:scale(1.14); } 80% { transform:scale(0.96); } 100% { opacity:1; transform:scale(1); } }' +
        '@keyframes vic-rise { from { opacity:0; transform:translateY(26px); } to { opacity:1; transform:none; } }' +
        '@keyframes vic-conf { 0% { opacity:1; transform:translate(0,0) rotate(0); } 100% { opacity:0; transform:translate(var(--tx),var(--ty)) rotate(var(--rot)); } }' +
        '@keyframes vic-glow { 0%,100% { text-shadow:0 0 18px rgba(230,57,70,0.55); } 50% { text-shadow:0 0 42px rgba(230,57,70,0.9); } }' +
      '</style>' +
      confetti +
      // Big popping headline
      '<div style="opacity:0;animation:vic-pop .8s cubic-bezier(.2,1.4,.4,1) .35s forwards;text-align:center;">' +
        '<div style="font:bold clamp(44px,7vw,92px)/1.02 \'Saira Condensed\',sans-serif;letter-spacing:4px;color:#E63946;' +
          'animation:vic-glow 2.4s ease-in-out infinite;">HUSH\'S OPERATION<br>IS EXPOSED!</div>' +
      '</div>' +
      '<div style="opacity:0;animation:vic-pop .7s cubic-bezier(.2,1.4,.4,1) 1.05s forwards;margin-top:14px;' +
        'font:bold clamp(20px,3vw,34px) \'Saira Condensed\',sans-serif;letter-spacing:3px;color:#F4D35E;">YOU HAVE SAVED THE WORLD.</div>' +
      // Name-entry panel rises in once the headline lands
      '<div style="opacity:0;animation:vic-rise .6s ease 1.8s forwards;margin-top:30px;width:400px;max-width:92vw;' +
        'background:#ece9d8;border:2px solid #0a246a;box-shadow:6px 6px 0 rgba(0,0,0,0.45);">' +
        '<div style="background:#0a246a;color:#fff;font-weight:bold;font-size:13px;padding:6px 10px;">MISSION COMPLETE — SCAN.exe</div>' +
        '<div style="padding:16px 18px;text-align:center;">' +
          timeRows +
          '<div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">' +
            (total != null
              ? '<button id="dash-save" style="padding:10px 24px;font:bold 13px Tahoma;background:#2D8659;color:#fff;border:2px outset #6dc89e;cursor:pointer;letter-spacing:1px;">SAVE SCORE</button>'
              : '<button id="dash-skip" style="padding:10px 24px;font:bold 13px Tahoma;background:#2D8659;color:#fff;border:2px outset #6dc89e;cursor:pointer;letter-spacing:1px;">GO BACK TO DESKTOP</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    // Victory sting synced to the pops
    setTimeout(() => { playSfx('exportReady'); beep(523, 0.12, 'sine', 0.12); }, 380);
    setTimeout(() => beep(784, 0.14, 'sine', 0.12), 700);
    setTimeout(() => beep(1047, 0.22, 'sine', 0.13), 1080);

    const close = () => { el.remove(); this.quitToMenu(); };
    el.querySelector('#dash-save')?.addEventListener('click', () => {
      const name = (el.querySelector('#dash-name')?.value || 'AGENT').toUpperCase();
      submitScore(name, total);
      playSfx('exportReady');
      close();
    });
    el.querySelector('#dash-skip')?.addEventListener('click', close);
    setTimeout(() => el.querySelector('#dash-name')?.focus(), 2200);
  }

  // (crash popup removed — unified canvas crash screen used instead, see drawCrashScreen)
  restartLevel() {
    this.scene.restart({ difficulty: this.difficulty, revealedGrid: this.revealedGrid });
  }

  updateHud() {
    if (this.taskLine) {
      this.taskLine.textContent = this.escapeReady ? 'Get to the exit!'
        : this.exporting ? 'Exporting evidence… hold on.'
        : 'Hold SPACE over the gold docs to scan them. X-ray reveals mines.';
    }
    if (this.taskProg) {
      this.taskProg.innerHTML = this.captured + ' / ' + DOCS_TARGET +
        '  ·  <span style="color: #9ed6b5;">Bonus docs: ' + this.bonusCaptured + ' / 4</span>';
    }
    // (HP bar removed — health is the glass-crack state of the window itself.)
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
    
    // Draw guide arrows
    this.drawGuideArrows(ctx);

    // Draw mine detonation animation
    this.drawMineDetonation(ctx);

    for (const hz of this.hazards) if (hz.type === 'kpi') this.drawGasPipe(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'bar' && hz.activated) this.drawPistons(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'gauge') this.drawGauge(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'pie' && hz.state === 'active') this.drawBoulder(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'line' && hz.state !== 'idle') this.drawLineBeam(ctx, hz);
    for (const hz of this.hazards) if (hz.type === 'hist' && hz.squish > 0) this.drawHistWindup(ctx, hz);
    this.drawDocs(ctx);
    this.drawShots(ctx);
    for (const hz of this.hazards) if (hz.type === 'stalker' && hz.detached) this.drawStalker(ctx, hz);

    if (this.exit && this.escapeReady) this.drawExit(ctx);

    for (const s of this.gs.sparks) {
      ctx.fillStyle = s.hit ? 'rgba(230,57,70,' + (s.life * 1.6) + ')' : 'rgba(60,60,60,' + (s.life * 0.3) + ')';
      ctx.fillRect(s.x, s.y, 3, 3);
    }

    this.drawXray(ctx);
    this.drawWindow(ctx);

    ctx.restore();

    // Fullscreen poison-blind — covers the ENTIRE game window (not just the
    // SCAN.exe window). Drawn in screen space, before the fail overlay.
    if (this.gasScreen) this.drawGasScreen(ctx);

    if (this.introT < INTRO_TIME) this.drawIntroIris(ctx);
    if (this.exitPan && this.exitPan.t > 0.45 && this.exitPan.t < 1.9) this.drawExitSpotlight(ctx);
    if (this.exporting && !this.done) this.drawExportBar(ctx);
    if (this.failed) {
      // Unified death screen — same as Level 1.1 (HomeScene).
      drawCrashScreen(ctx, VW, VH);
    } else {
      ctx.fillStyle = C.sub; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText('WASD move  ·  SHIFT dash  ·  hold SPACE on docs to scan  ·  R restart  ·  ESC to exit', 18, VH - 16);
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
    
    // 1. Draw base white sheet background
    ctx.fillStyle = '#fcfdff'; ctx.fillRect(g.x, g.y, W, H);

    // 2. Draw revealed green/red cell overlays
    for (let c = 0; c < g.cols; c++) {
      for (let r = 0; r < g.rows; r++) {
        const cx = g.x + c * g.cw, cy = g.y + r * g.ch;
        const status = this.revealedGrid[c + ',' + r];
        if (status === 'safe') {
          ctx.fillStyle = '#2ca55c'; // green path
          ctx.fillRect(cx + 1, cy + 1, g.cw - 2, g.ch - 2);
        } else if (status === 'mine') {
          ctx.fillStyle = '#e63946'; // red mine
          ctx.fillRect(cx + 1, cy + 1, g.cw - 2, g.ch - 2);
        }
      }
    }

    // 3. Draw headers — these ARE the physical boundary walls.
    //    Left header (row numbers): drawn per-row, skipping the entrance row.
    //    Right header: mirror of left, skipping the exit row.
    //    Top header (A–H letters): drawn full-width (existing).
    //    Bottom header: mirror of top.
    const hdrBg  = '#e7edf6';
    const hdrTxt = '#8a99b5';
    ctx.font = '13px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Top header strip (A B C … H) — unchanged from before
    ctx.fillStyle = hdrBg;
    ctx.fillRect(g.x, g.y - 24, W, 24);
    ctx.fillStyle = hdrTxt;
    for (let c = 0; c < g.cols; c++)
      ctx.fillText(String.fromCharCode(65 + c), g.x + (c + 0.5) * g.cw, g.y - 12);

    // Bottom header strip — mirror of top
    ctx.fillStyle = hdrBg;
    ctx.fillRect(g.x, g.y + H, W, 24);
    ctx.fillStyle = hdrTxt;
    for (let c = 0; c < g.cols; c++)
      ctx.fillText(String.fromCharCode(65 + c), g.x + (c + 0.5) * g.cw, g.y + H + 12);

    // Left header strip — row numbers, gap at ENTER_ROW (row 3 = label "4")
    for (let r = 0; r < g.rows; r++) {
      if (r === ENTER_ROW) continue;   // entrance gap: no background, no number
      ctx.fillStyle = hdrBg;
      ctx.fillRect(g.x - 30, g.y + r * g.ch, 30, g.ch);
      ctx.fillStyle = hdrTxt;
      ctx.fillText(String(r + 1), g.x - 15, g.y + (r + 0.5) * g.ch);
    }

    // Right header strip — mirror of left, gap at EXIT_ROW (row 8 = label "9")
    for (let r = 0; r < g.rows; r++) {
      if (r === EXIT_ROW) continue;    // exit gap: no background, no number
      ctx.fillStyle = hdrBg;
      ctx.fillRect(g.x + W, g.y + r * g.ch, 30, g.ch);
      ctx.fillStyle = hdrTxt;
      ctx.fillText(String(r + 1), g.x + W + 15, g.y + (r + 0.5) * g.ch);
    }

    ctx.textAlign = 'left';
    ctx.strokeStyle = '#d6deeb'; ctx.lineWidth = 1;
    for (let c = 0; c <= g.cols; c++) { ctx.beginPath(); ctx.moveTo(g.x + c * g.cw, g.y); ctx.lineTo(g.x + c * g.cw, g.y + H); ctx.stroke(); }
    for (let r = 0; r <= g.rows; r++) { ctx.beginPath(); ctx.moveTo(g.x, g.y + r * g.ch); ctx.lineTo(g.x + W, g.y + r * g.ch); ctx.stroke(); }

    // 4. faint fake cell values for texture — drawn on all cells so they look uniform
    ctx.fillStyle = 'rgba(120,135,160,0.5)'; ctx.font = '10px Consolas, monospace'; ctx.textBaseline = 'middle';
    for (let c = 0; c < g.cols; c++) {
      for (let r = 0; r < g.rows; r++) {
        // Draw normal text in contrasting color if safe (green) or mine (red) to keep it readable, or default
        const status = this.revealedGrid[c + ',' + r];
        if (status === 'safe') ctx.fillStyle = 'rgba(255,255,255,0.7)';
        else if (status === 'mine') ctx.fillStyle = 'rgba(255,255,255,0.7)';
        else ctx.fillStyle = 'rgba(120,135,160,0.5)';
        ctx.fillText(g.cellText[r * g.cols + c], g.x + c * g.cw + 8, g.y + (r + 0.5) * g.ch);
      }
    }

    // 5. Guide arrows at the entrance of the safe path
    ctx.fillStyle = '#1e5c3c';
    ctx.font = 'bold 15px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('▶', g.x + 0.5 * g.cw - 15, g.y + 3.5 * g.ch);
    ctx.fillText('▶', g.x + 0.5 * g.cw + 15, g.y + 3.5 * g.ch);
    ctx.fillText('▶', g.x + 1.5 * g.cw - 15, g.y + 3.5 * g.ch);
    ctx.fillText('▶', g.x + 1.5 * g.cw + 15, g.y + 3.5 * g.ch);
    ctx.textAlign = 'left';
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
    // (capture prompt/progress now lives with the visible docs — drawDocs)
  }
  // Docs are drawn in the OPEN now (no x-ray needed to spot them) — same
  // gold-file look as Level 1.1. Walking over one collects it.
  drawDocs(ctx) {
    for (const d of this.docs) {
      if (d.taken) {
        const a = this.time - d.takeT;
        if (a < 0.4 && !d.expired) {
          ctx.strokeStyle = 'rgba(244,211,94,' + (1 - a / 0.4) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(d.x, d.y, 16 + a * 70, 0, Math.PI * 2); ctx.stroke();
        }
        continue;
      }
      const pulse = 1 + Math.sin(this.time * 4 + d.x * 0.01) * 0.12;
      const big = d.bonusTimed ? 1.6 : 1;   // timed bonus doc is noticeably bigger
      ctx.save();
      // Timed bonus doc: hard blink + deletion countdown
      if (d.bonusTimed && this.started) {
        const urgent = d.ttl < 12;
        ctx.globalAlpha = Math.sin(this.time * (urgent ? 11 : 5.5)) > -0.4 ? 1 : 0.25;
        ctx.fillStyle = urgent ? C.red : C.ink;
        ctx.font = 'bold 16px Consolas, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('DELETING IN ' + Math.ceil(d.ttl) + 's', d.x, d.y - 46);
      }
      ctx.translate(d.x, d.y); ctx.scale(pulse * big, pulse * big);
      // glow halo
      ctx.fillStyle = d.required ? 'rgba(244,211,94,0.4)' : 'rgba(45,134,89,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
      // gold file body (green-tinged for bonus docs)
      ctx.fillStyle = d.required ? '#F4D35E' : '#9ed6b5';
      ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5;
      ctx.fillRect(-13, -16, 26, 32);
      ctx.strokeRect(-13, -16, 26, 32);
      // text lines
      ctx.fillStyle = '#1a1a1f';
      for (let i = 0; i < 4; i++) ctx.fillRect(-8, -9 + i * 7, 16 - (i === 3 ? 6 : 0), 2);
      ctx.restore();

      // Hold-to-scan prompt + progress while the window covers the doc
      if (d._near || (d.scanP || 0) > 0) {
        drawScanPrompt(ctx, d, d.x, d.y, { above: 42 * big, scale: 0.95 });
      }
    }
  }

  drawDocSkeleton(ctx, x, y, required) {
    const pulse = 0.6 + Math.sin(this.time * 6) * 0.4;
    ctx.save(); ctx.globalAlpha = pulse;
    ctx.strokeStyle = required ? '#bdfcff' : '#ffe08a'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 12, y - 16, 24, 32);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(x - 7, y - 9 + i * 7); ctx.lineTo(x + 7, y - 9 + i * 7); }
    ctx.stroke();    ctx.restore();
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

  // The stalker — a floating KPI card that hunts the player. Its home panel
  // dims to "SIGNAL LOST" once it detaches.
  drawStalker(ctx, hz) {
    // dim the vacated panel slot
    const pn = hz.panel;
    ctx.save();
    ctx.fillStyle = 'rgba(238,241,246,0.75)';
    ctx.fillRect(pn.x + 2, pn.y + 2, pn.w - 4, pn.h - 4);
    ctx.strokeStyle = '#c3ccd9'; ctx.lineWidth = 1.4; ctx.setLineDash([7, 6]);
    ctx.strokeRect(pn.x + 8, pn.y + 8, pn.w - 16, pn.h - 16);
    ctx.setLineDash([]);
    ctx.fillStyle = '#9aa7b8'; ctx.font = 'bold 15px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('[ SIGNAL LOST ]', pn.x + pn.w / 2, pn.y + pn.h / 2);
    ctx.restore();

    // the card itself — hovering wobble + drop shadow
    const bobY = Math.sin(hz.wob * 3) * 5;
    const x = hz.x - hz.w / 2, y = hz.y - hz.h / 2 + bobY;
    ctx.save();
    if (hz.stun > 0) ctx.globalAlpha = 0.55;    // dazed after landing a hit
    ctx.fillStyle = 'rgba(30,40,60,0.18)';
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y + hz.h / 2 + 16, hz.w * 0.4, 9, 0, 0, Math.PI * 2); ctx.fill();
    drawHandRect(ctx, x, y, hz.w, hz.h, '#ffffff', C.red, 21, 2.2);
    ctx.fillStyle = C.red; ctx.font = 'bold 12px Consolas, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('BOT TRAFFIC', x + 10, y + 9);
    ctx.fillStyle = C.ink; ctx.font = 'bold 26px "Saira Condensed", sans-serif';
    ctx.fillText('99.9%', x + 10, y + 26);
    // angry rising trend line
    ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + hz.h - 14);
    ctx.lineTo(x + hz.w * 0.4, y + hz.h - 22 + Math.sin(hz.wob * 8) * 3);
    ctx.lineTo(x + hz.w * 0.7, y + hz.h - 34);
    ctx.lineTo(x + hz.w - 12, y + hz.h - 44);
    ctx.stroke();
    // little eye so it reads as "watching you"
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.arc(x + hz.w - 20, y + 16, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + hz.w - 20 + Math.sin(hz.wob * 2) * 1.5, y + 16, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── New-enemy drawing (same hand-drawn canvas style as the rest) ──
  drawLineBeam(ctx, hz) {
    ctx.save();
    if (hz.state === 'charge') {
      // taut line telegraph — dashes tighten and pulse as it charges
      const a = 0.25 + (hz.t / 1.0) * 0.6;
      ctx.strokeStyle = 'rgba(230,57,70,' + a + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([14 - hz.t * 10, 10 - hz.t * 7]);
      ctx.beginPath(); ctx.moveTo(hz.beamX0, hz.beamY); ctx.lineTo(hz.beamX1, hz.beamY); ctx.stroke();
      ctx.setLineDash([]);
    } else if (hz.state === 'fire') {
      const a = 1 - hz.t / 0.3;
      ctx.fillStyle = 'rgba(230,57,70,' + (0.75 * a) + ')';
      ctx.fillRect(hz.beamX0, hz.beamY - 9, hz.beamX1 - hz.beamX0, 18);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * a) + ')';
      ctx.fillRect(hz.beamX0, hz.beamY - 3, hz.beamX1 - hz.beamX0, 6);
    }
    ctx.restore();
  }

  drawHistWindup(ctx, hz) {
    // Bars compressing into a ball — a dark sphere grows at the muzzle point
    const r = 6 + hz.squish * 15;
    ctx.save();
    ctx.fillStyle = '#1a1a1f';
    ctx.beginPath(); ctx.arc(hz.cx, hz.cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.red; ctx.lineWidth = 2;
    const pulse = 0.5 + Math.sin(this.time * 20) * 0.5;
    ctx.globalAlpha = 0.4 + pulse * 0.5;
    ctx.beginPath(); ctx.arc(hz.cx, hz.cy, r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawShots(ctx) {
    for (const s of this.shots) {
      ctx.save();
      if (s.kind === 'grenade') {
        // Realistic frag grenade: dark-green oval body with a checkered
        // "pineapple" grid, metal fuse cap + pin/lever on top. Tumbles in
        // the air, sits upright once landed, blinks red faster as the fuse
        // runs out.
        const rx = s.r * 0.78, ry = s.r * 1.05;
        ctx.translate(s.x, s.y);
        ctx.rotate(s.landed ? 0 : s.spin);
        // landed danger telegraph — pulsing blast-radius ring on the floor
        if (s.landed) {
          const urgency = 1 - s.armT / s.fuseLand;               // 0 → 1
          const pulse = 0.5 + Math.sin(this.time * (8 + urgency * 18)) * 0.5;
          ctx.strokeStyle = 'rgba(230,57,70,' + (0.15 + urgency * 0.45 * pulse) + ')';
          ctx.lineWidth = 2 + urgency * 2;
          ctx.setLineDash([8, 7]);
          ctx.beginPath(); ctx.arc(0, 0, 95, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        // body
        ctx.fillStyle = '#2f4a26';
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#141d10'; ctx.lineWidth = 1.6; ctx.stroke();
        // pineapple grid, clipped to the oval
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(16,24,12,0.85)'; ctx.lineWidth = 1.4;
        for (let gx = -rx; gx <= rx; gx += rx * 0.55) {
          ctx.beginPath(); ctx.moveTo(gx, -ry); ctx.lineTo(gx, ry); ctx.stroke();
        }
        for (let gy = -ry; gy <= ry; gy += ry * 0.42) {
          ctx.beginPath(); ctx.moveTo(-rx, gy); ctx.lineTo(rx, gy); ctx.stroke();
        }
        // top-left sheen
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.ellipse(-rx * 0.35, -ry * 0.4, rx * 0.35, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // metal fuse cap + lever + pin ring on top
        ctx.fillStyle = '#9aa3b5';
        ctx.fillRect(-3.5, -ry - 6, 7, 7);                       // cap
        ctx.strokeStyle = '#6e7787'; ctx.lineWidth = 1;
        ctx.strokeRect(-3.5, -ry - 6, 7, 7);
        ctx.strokeStyle = '#8d96a8'; ctx.lineWidth = 2;          // lever (spoon)
        ctx.beginPath(); ctx.moveTo(3, -ry - 5); ctx.quadraticCurveTo(rx + 4, -ry, rx * 0.8, -ry * 0.2); ctx.stroke();
        ctx.strokeStyle = '#c9cfda'; ctx.lineWidth = 1.6;        // pin ring
        ctx.beginPath(); ctx.arc(-6, -ry - 7, 4, 0, Math.PI * 2); ctx.stroke();
        // blinking fuse light — faster as detonation nears
        const blinkHz = s.landed ? 8 + (1 - s.armT / s.fuseLand) * 26 : 10;
        if (Math.sin(this.time * blinkHz) > 0) {
          ctx.fillStyle = C.red;
          ctx.beginPath(); ctx.arc(0, -ry - 2.5, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (s.kind === 'blob') {
        // molten blob — hot core + darker rim, slight wobble
        const w = 1 + Math.sin(this.time * 10 + s.wob) * 0.15;
        ctx.translate(s.x, s.y); ctx.scale(w, 2 - w);
        ctx.fillStyle = '#E63946';
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#F4D35E';
        ctx.beginPath(); ctx.arc(0, 0, s.r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.stroke();
      } else if (s.kind === 'ball') {
        // compressed-histogram cannonball — dark sphere with bar stripes
        ctx.translate(s.x, s.y); ctx.rotate(s.spin * 0.5);
        ctx.fillStyle = '#1a1a1f';
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4A7BC8'; ctx.lineWidth = 2.5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * 8, -s.r * 0.7); ctx.lineTo(i * 8, s.r * 0.7); ctx.stroke();
        }
        ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.stroke();
      } else if (s.kind === 'shard') {
        // ejected table row — white strip with data lines, spinning slightly
        ctx.translate(s.x, s.y); ctx.rotate(Math.sin(s.spin) * 0.12);
        drawHandRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, '#ffffff', '#1a1a1f', 7, 1.4);
        ctx.fillStyle = '#9aa7b8';
        ctx.fillRect(-s.w / 2 + 5, -1.5, s.w * 0.4, 3);
        ctx.fillStyle = C.red;
        ctx.fillRect(s.w / 2 - 14, -1.5, 9, 3);
      }
      ctx.restore();
    }
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

    // Glass cracks — the window IS the health display (no HP bar)
    drawCracks(ctx, this.cracks, p.x, p.y, p.w, p.h);
    ctx.restore();
  }

  // ── Gas pipe — visible metal pipe along the KPI panel's bottom edge,
  // venting animated gas columns straight down into the corridor. ──
  drawGasPipe(ctx, hz) {
    if (hz.panel.collapsed >= 1) return;
    const p = hz.panel, y = hz.pipeY;
    const armed = hz.activated;
    ctx.save();
    // pipe body (slightly wider than the panel so it reads as bolted on)
    ctx.fillStyle = armed ? '#435062' : '#5b677a';
    ctx.fillRect(p.x - 8, y - 5, p.w + 16, 12);
    // top highlight + bottom shade so it reads as a cylinder
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(p.x - 8, y - 5, p.w + 16, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x - 8, y + 4, p.w + 16, 3);
    // end flanges + bolts
    for (const fx of [p.x - 8, p.x + p.w - 4]) {
      ctx.fillStyle = '#37404f';
      ctx.fillRect(fx, y - 8, 12, 18);
      ctx.fillStyle = '#8a97ad';
      ctx.fillRect(fx + 4, y - 6, 3, 3);
      ctx.fillRect(fx + 4, y + 5, 3, 3);
    }
    // hazard tag
    if (armed) {
      ctx.fillStyle = '#b7cf3f';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('☣ GAS', p.x + 6, y + 1);
    }
    // nozzles + gas columns
    for (const v of hz.vents) {
      // nozzle stub
      ctx.fillStyle = '#37404f';
      ctx.fillRect(v.x - 7, y + 5, 14, 8);
      const state = v.state || 'idle';
      if (state === 'warm') {
        // telegraph: tiny sputtering puffs at the nozzle
        const s = 3 + Math.sin(this.time * 22 + v.x) * 2;
        ctx.fillStyle = 'rgba(140,190,90,0.45)';
        ctx.beginPath(); ctx.arc(v.x + Math.sin(this.time * 17) * 3, y + 16 + s, 5 + s, 0, Math.PI * 2); ctx.fill();
      } else if (state === 'vent' && v.flow > 0.02) {
        // vertical gas column — stacked wobbling puffs, denser near the pipe
        const len = hz.ventLen * v.flow;
        const n = Math.max(3, Math.round(len / 22));
        for (let i = 0; i < n; i++) {
          const f = i / n;
          const gy = y + 12 + f * len;
          const wob = Math.sin(this.time * 6 + v.x * 0.13 + i * 1.7) * (3 + f * 7);
          const r = (hz.ventW * 0.42) * (0.7 + f * 0.65);
          const a = (0.5 - f * 0.28) * Math.min(1, v.flow * 1.4);
          ctx.fillStyle = i % 2 ? 'rgba(106,168,79,' + a + ')' : 'rgba(140,190,90,' + a + ')';
          ctx.beginPath(); ctx.arc(v.x + wob, gy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ── Fullscreen poison-blind — green gas cloud + vignette over the whole
  // viewport. Alpha eases in fast and fades out with the timer. ──
  drawGasScreen(ctx) {
    const { VW, VH } = this;
    const g = this.gasScreen;
    const f = Math.max(0, Math.min(1, g.t / g.dur));            // 1 → 0
    const inRamp = Math.min(1, (g.dur - g.t) / 0.18);           // fast attack
    const a = Math.min(1, inRamp) * (f < 0.35 ? f / 0.35 : 1);  // hold, then fade tail
    if (a <= 0) return;
    ctx.save();
    // base green film
    ctx.fillStyle = 'rgba(96,148,72,' + (0.38 * a) + ')';
    ctx.fillRect(0, 0, VW, VH);
    // drifting cloud blobs — big, soft, layered
    for (let i = 0; i < 7; i++) {
      const cx = ((Math.sin(g.seed + i * 2.3) * 0.5 + 0.5) * VW + this.time * (26 + i * 9)) % (VW + 340) - 170;
      const cy = (Math.cos(g.seed * 1.7 + i * 1.9) * 0.5 + 0.5) * VH + Math.sin(this.time * 0.9 + i) * 26;
      const r = Math.max(VW, VH) * (0.16 + (i % 3) * 0.07);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(120,175,88,' + (0.34 * a) + ')');
      grad.addColorStop(1, 'rgba(120,175,88,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // heavy edge vignette — the "inhaled poison" tunnel-vision read
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.22, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
    vg.addColorStop(0, 'rgba(30,60,24,0)');
    vg.addColorStop(1, 'rgba(22,48,18,' + (0.85 * a) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, VH);
    // caption
    ctx.globalAlpha = a;
    ctx.fillStyle = '#d7f0c0';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☣ POISON GAS INHALED', VW / 2, 64);
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
    // Exit spotlight (suggestion #7): before control starts, the camera pans
    // to the exit panel for a beat so the player knows where they're headed,
    // then returns. `started` flips on when the pan lands back.
    this.exitPan = { t: 0 };
  }

  updateExitPan(dt) {
    const OUT = 0.9, HOLD = 1.0, BACK = 0.9;
    const e = this.exitPan;
    e.t += dt;
    const target = e.t < OUT + HOLD
      ? { x: this.exitPanel.x + this.exitPanel.w / 2, y: this.exitPanel.y + this.exitPanel.h / 2 }
      : { x: this.player.x, y: this.player.y };
    const tx = Phaser.Math.Clamp(target.x - this.viewWW / 2, 0, Math.max(0, WORLD_W - this.viewWW));
    const ty = Phaser.Math.Clamp(target.y - this.viewHW / 2, 0, Math.max(0, WORLD_H - this.viewHW));
    this.camX += (tx - this.camX) * Math.min(1, dt * 4);
    this.camY += (ty - this.camY) * Math.min(1, dt * 4);
    if (e.t >= OUT + HOLD + BACK) {
      this.exitPan = null;
      this.started = true;
      this.runStartT = this.time;   // speedrun clock starts with control
    }
  }

  drawExitSpotlight(ctx) {
    const { VW, VH } = this;
    const wx = this.exitPanel.x + this.exitPanel.w / 2;
    const wy = this.exitPanel.y + this.exitPanel.h / 2;
    const sx = (wx - this.camX) * this.scale;
    const sy = (wy - this.camY) * this.scale;
    const r = Math.max(this.exitPanel.w, this.exitPanel.h) * 0.62 * this.scale;
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, r * 0.7, sx, sy, r * 1.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(6,34,58,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    ctx.strokeStyle = '#F4D35E'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#F4D35E'; ctx.font = 'bold 20px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('THE EXIT — opens once all ' + DOCS_TARGET + ' docs are exported', sx, sy - r - 24);
    ctx.restore();
  }
  playFirstDocNarration() {}
  playAllDocsNarration() {
    this.startExport();
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

  drawGuideArrows(ctx) {
    const drawThickArrow = (x, y, angle, size = 45) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#b4ec12';
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(0, -size * 0.4);
      ctx.lineTo(0, -size * 0.15);
      ctx.lineTo(-size * 0.5, -size * 0.15);
      ctx.lineTo(-size * 0.5, size * 0.15);
      ctx.lineTo(0, size * 0.15);
      ctx.lineTo(0, size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // UP path (1 arrow)
    drawThickArrow(910, 1850, -Math.PI / 2);

    // RIGHT path (1 arrow)
    drawThickArrow(1200, 2030, 0);

    // Exit pathway — from the spreadsheet's right exit gap, a chain of UP
    // arrows leads through the (now open) far-right connectors toward the
    // EXIT panel, then one RIGHT arrow points into it.
    drawThickArrow(2555, 2350, -Math.PI / 2);
    drawThickArrow(2555, 1800, -Math.PI / 2);
    drawThickArrow(2555, 1500, -Math.PI / 2);
    drawThickArrow(2555, 1350, 0);
  }

  drawMineDetonation(ctx) {
    if (!this.detonatingMine) return;
    const m = this.detonatingMine;
    if (!m.exploded) {
      // Blinking red before explosion
      const alpha = 0.15 + Math.sin(m.t * 26) * 0.12;
      ctx.fillStyle = 'rgba(230, 57, 70, ' + alpha + ')';
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.strokeStyle = '#E63946';
      ctx.lineWidth = 3;
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    } else {
      // Expanding explosion ripple circle
      const p = m.blastT / 0.4;
      const r = p * 90;
      const a = 1 - p;
      ctx.save();
      ctx.fillStyle = 'rgba(244, 211, 94, ' + (a * 0.45) + ')';
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 57, 70, ' + a + ')';
      ctx.lineWidth = 4 * (1 - p);
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
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
