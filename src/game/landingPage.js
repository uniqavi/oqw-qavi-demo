// Landing page — the game's default entry screen ("/" route equivalent).
//
// Shown on every page load, above the whole app. Light futuristic dashboard
// look that reuses the HUSH-analytics design language already in the game
// (light page + soft grid, white rounded cards, Saira Condensed titles,
// Consolas mono details, red accent).
//
//   showLandingPage({ onStart })
//     onStart — Start Game card → the existing desktop dashboard flow
//
// Component structure (kept as small builders, not one blob):
//   LandingPage ├ Background/Grid ├ ActionScene (window dodging enemies)
//               ├ HeroSection    ├ StartGameCard └ LeaderboardCard
//
// The background "action scene" is a frozen frame of gameplay: the SCAN.exe
// window mid-dodge, red-outlined enemies and bullets around it. Nothing
// travels anywhere — every prop just breathes in place (tiny bob/tilt
// loops) so the still image reads as motion.
//
// The leaderboard is hardcoded top-3 for now — swap fetchTopPlayers() for a
// real API call later; the card renders whatever it resolves.

import { initAudio, beep } from './audio.js';
import { getLeaderboard, fmtTime } from './leaderboard.js';

// ── Palette (mirrors DashboardScene's light "HUSH analytics" theme) ─────────
const C = {
  page: '#f4f6fb', grid: 'rgba(40,70,120,0.06)',
  card: '#ffffff', border: '#dde3f0',
  ink: '#1a1a1f', title: '#2b3a55', sub: '#8a97ad',
  red: '#E63946', redSoft: 'rgba(230,57,70,0.08)',
  cyan: '#17a2b8', cyanSoft: 'rgba(23,162,184,0.09)',
  gold: '#F4D35E',
};

// ── Leaderboard data provider — loads from shared leaderboard module. ─────────
// Shape: [{ rank, player, bestTime }] — the card is agnostic to the source.
export async function fetchTopPlayers() {
  const board = getLeaderboard();
  return board.map((r, i) => ({
    rank: i + 1,
    player: r.name,
    bestTime: fmtTime(r.time)
  }));
}

// ── Icons (same single-stroke hand-drawn weight as the rest of the game) ────
function crosshairIcon(color) {
  return `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round">
    <circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.4" fill="${color}" stroke="none"/>
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`.replace(/\n\s*/g, '');
}

// ── Components ───────────────────────────────────────────────────────────────
function buildStyles() {
  return `<style id="landing-styles">
    #landing-page * { box-sizing: border-box; }
    @keyframes lp-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .lp-rise { opacity: 0; animation: lp-rise .7s ease forwards; }
    .lp-card {
      background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px;
      box-shadow: 0 6px 22px rgba(40,60,90,0.10);
      transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
      cursor: pointer; user-select: none;
    }
    .lp-card:hover { transform: translateY(-5px); box-shadow: 0 14px 34px rgba(40,60,90,0.16); }
    .lp-card:active { transform: translateY(-1px) scale(0.98); transition-duration: .08s; }
    .lp-card.lp-red:hover  { border-color: ${C.red}; }
    /* positioning lives here (not inline) so the media query can override it */
    #lp-board { position: absolute; right: 26px; top: 74px; width: 250px; }
    @media (max-width: 760px) {
      #lp-cards { flex-direction: column; align-items: stretch; }
      #lp-board { position: static; width: 250px; margin: 4px auto 0; }
      #lp-main  { padding-top: 46px; }
      .lp-prop  { display: none; }   /* the action scene needs elbow room */
    }
    /* ── Frozen-action scene: everything breathes in place, travels nowhere ── */
    @keyframes lp-dodge { 0%,100% { transform: translate(0,0) rotate(-2.5deg); } 30% { transform: translate(-7px,5px) rotate(-4deg); } 65% { transform: translate(5px,-4px) rotate(-1deg); } }
    @keyframes lp-hover1 { 0%,100% { transform: translate(0,0) rotate(6deg); } 50% { transform: translate(4px,6px) rotate(8deg); } }
    @keyframes lp-hover2 { 0%,100% { transform: translate(0,0) rotate(-8deg); } 50% { transform: translate(-5px,4px) rotate(-5.5deg); } }
    @keyframes lp-hover3 { 0%,100% { transform: translate(0,0) rotate(12deg); } 50% { transform: translate(3px,-5px) rotate(14deg); } }
    @keyframes lp-bullet { 0%,100% { transform: translate(0,0); opacity:.85; } 50% { transform: translate(6px,-2px); opacity:1; } }
    @keyframes lp-spark  { 0%,100% { opacity:.5; transform: scale(1); } 50% { opacity:1; transform: scale(1.25); } }
    .lp-prop { position: absolute; pointer-events: none; }
  </style>`;
}

// Background/Grid — soft blueprint grid on the light page, red corner accents.
function buildBackground() {
  return (
    `<div style="position:absolute;inset:0;background:${C.page};` +
      `background-image:linear-gradient(${C.grid} 1px, transparent 1px),` +
      `linear-gradient(90deg, ${C.grid} 1px, transparent 1px);background-size:44px 44px;"></div>` +
    // faint red radial glow behind the hero
    `<div style="position:absolute;left:50%;top:42%;width:720px;height:420px;transform:translate(-50%,-50%);` +
      `background:radial-gradient(ellipse, rgba(230,57,70,0.06) 0%, transparent 65%);pointer-events:none;"></div>`);
}

// ActionScene — a frozen frame of gameplay behind the hero: the SCAN.exe
// window mid-dodge with red-outlined enemies and bullets around it. Static
// placement, subtle in-place animation loops only.
function buildActionScene() {
  const R = C.red;
  // the player window — big, tilted, "dodging"
  const player =
    `<div class="lp-prop" style="left:7%;top:30%;animation:lp-dodge 3.2s ease-in-out infinite;">` +
      // speed streaks behind the window
      `<svg width="290" height="200" viewBox="0 0 290 200">` +
        `<g stroke="#9aa7bd" stroke-width="3" stroke-linecap="round" opacity="0.55">` +
          `<line x1="6" y1="70" x2="52" y2="66"/><line x1="0" y1="102" x2="60" y2="98"/><line x1="10" y1="134" x2="48" y2="131"/>` +
        `</g>` +
        `<g transform="translate(70,20)">` +
          `<rect x="0" y="0" width="200" height="150" rx="6" fill="#ffffff" stroke="#1a1a1f" stroke-width="4"/>` +
          `<rect x="3" y="3" width="194" height="30" rx="3" fill="#1a1a1f"/>` +
          `<rect x="172" y="9" width="18" height="18" fill="${R}"/>` +
          `<text x="180.5" y="22" fill="#fff" font-family="ui-monospace,monospace" font-size="13" text-anchor="middle">×</text>` +
          `<text x="12" y="24" fill="#fff" font-family="ui-monospace,monospace" font-size="14">SCAN.exe</text>` +
          `<text x="100" y="98" fill="#8a97ad" font-family="ui-monospace,monospace" font-size="16" font-weight="bold" text-anchor="middle">0x7F4C</text>` +
          // one glass crack — it's been grazed
          `<g stroke="#1a1a1f" stroke-width="1.6" opacity="0.5">` +
            `<path d="M158 52 l14 9 l-5 11 M158 52 l-8 13 M158 52 l16 -4" fill="none"/>` +
          `</g>` +
        `</g>` +
      `</svg>` +
    `</div>`;

  // hostile props — game-style widgets gone red
  const enemyPopup =
    `<div class="lp-prop" style="right:9%;top:16%;animation:lp-hover1 3.8s ease-in-out infinite;">` +
      `<svg width="150" height="110" viewBox="0 0 150 110">` +
        `<rect x="4" y="4" width="140" height="100" rx="5" fill="rgba(230,57,70,0.05)" stroke="${R}" stroke-width="3.5"/>` +
        `<rect x="4" y="4" width="140" height="24" fill="${R}" opacity="0.9"/>` +
        `<text x="14" y="21" fill="#fff" font-family="ui-monospace,monospace" font-size="12" font-weight="bold">AD.exe</text>` +
        `<text x="74" y="74" fill="${R}" font-family="'Saira Condensed',sans-serif" font-size="34" font-weight="bold" text-anchor="middle">!</text>` +
      `</svg>` +
    `</div>`;
  const enemyChaser =
    `<div class="lp-prop" style="right:16%;top:56%;animation:lp-hover2 3.1s ease-in-out infinite;">` +
      `<svg width="130" height="96" viewBox="0 0 130 96">` +
        `<rect x="4" y="4" width="122" height="88" rx="6" fill="none" stroke="${R}" stroke-width="3.5"/>` +
        `<rect x="14" y="14" width="70" height="42" rx="3" fill="rgba(230,57,70,0.14)" stroke="${R}" stroke-width="2"/>` +
        `<circle cx="104" cy="30" r="9" fill="none" stroke="${R}" stroke-width="2.5"/>` +
        `<circle cx="107" cy="30" r="3" fill="${R}"/>` +
        `<line x1="14" y1="68" x2="96" y2="68" stroke="${R}" stroke-width="3"/>` +
        `<line x1="14" y1="78" x2="64" y2="78" stroke="${R}" stroke-width="3"/>` +
      `</svg>` +
    `</div>`;
  const enemyCookie =
    `<div class="lp-prop" style="left:6%;top:66%;animation:lp-hover3 4.1s ease-in-out infinite;">` +
      `<svg width="110" height="110" viewBox="0 0 110 110">` +
        `<circle cx="55" cy="55" r="44" fill="rgba(230,57,70,0.06)" stroke="${R}" stroke-width="3.5"/>` +
        `<circle cx="40" cy="44" r="5" fill="${R}"/><circle cx="70" cy="42" r="5" fill="${R}"/>` +
        `<path d="M38 74 q17 -12 34 0" fill="none" stroke="${R}" stroke-width="3.5" stroke-linecap="round"/>` +
        `<circle cx="57" cy="60" r="3.5" fill="${R}" opacity="0.5"/><circle cx="30" cy="62" r="3" fill="${R}" opacity="0.5"/>` +
      `</svg>` +
    `</div>`;

  // bullets frozen mid-flight — capsule + dash trail, pointed at the window
  const bullet = (styles, rot, dur) =>
    `<div class="lp-prop" style="${styles}animation:lp-bullet ${dur}s ease-in-out infinite;">` +
      `<svg width="86" height="18" viewBox="0 0 86 18" style="transform:rotate(${rot}deg);">` +
        `<line x1="2" y1="9" x2="30" y2="9" stroke="${R}" stroke-width="3" stroke-linecap="round" opacity="0.30"/>` +
        `<line x1="22" y1="9" x2="48" y2="9" stroke="${R}" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>` +
        `<rect x="56" y="4" width="24" height="10" rx="5" fill="${R}"/>` +
      `</svg>` +
    `</div>`;

  // impact sparks near the window's dodge path
  const spark = (styles, size, dur, delay) =>
    `<div class="lp-prop" style="${styles}animation:lp-spark ${dur}s ease-in-out ${delay}s infinite;">` +
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24">` +
        `<path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="${C.gold}" stroke-width="3" stroke-linecap="round"/>` +
      `</svg>` +
    `</div>`;

  return player + enemyPopup + enemyChaser + enemyCookie +
    bullet('right:26%;top:30%;', 197, 2.2) +
    bullet('right:31%;top:70%;', 152, 2.7) +
    bullet('left:24%;top:22%;', 20, 2.4) +
    spark('left:22%;top:56%;', 22, 1.9, 0.3) +
    spark('right:38%;top:44%;', 16, 2.3, 1.1);
}

function buildBrand() {
  return (
    `<div class="lp-rise" style="position:absolute;left:26px;top:22px;display:flex;align-items:center;gap:10px;">` +
      // mini SCAN.exe window glyph
      `<div style="width:30px;height:23px;border:2px solid ${C.ink};border-radius:3px;position:relative;background:#fff;">` +
        `<div style="position:absolute;left:0;right:0;top:0;height:7px;background:${C.ink};"></div>` +
        `<div style="position:absolute;right:1.5px;top:1.5px;width:4px;height:4px;background:${C.red};"></div>` +
      `</div>` +
      `<div style="font:bold 20px 'Saira Condensed',sans-serif;letter-spacing:2.5px;color:${C.ink};">OPERATION QUIET WINDOW</div>` +
    `</div>`);
}

// HeroSection — big title + subtitle.
function buildHero() {
  return (
    `<div class="lp-rise" style="text-align:center;animation-delay:.08s;">` +
      `<div style="font:bold 13px Consolas,monospace;letter-spacing:4px;color:${C.red};margin-bottom:10px;">[ TERMINAL ACCESS GRANTED ]</div>` +
      `<h1 style="margin:0;font:bold clamp(46px,7vw,84px)/1 'Saira Condensed',sans-serif;letter-spacing:6px;color:${C.ink};">START GAME</h1>` +
      `<p style="margin:14px auto 0;max-width:520px;font:15px 'Segoe UI',Arial,sans-serif;color:${C.sub};">` +
        `Assemble your team, prepare for the mission, and start the hunt.</p>` +
    `</div>`);
}

// StartGameCard — primary CTA (red accent).
function buildStartCard() {
  return (
    `<div id="lp-start" class="lp-card lp-red lp-rise" style="animation-delay:.18s;width:300px;padding:26px 26px 24px;">` +
      `<div style="width:72px;height:72px;border-radius:12px;background:${C.redSoft};display:flex;align-items:center;justify-content:center;margin-bottom:16px;">` +
        crosshairIcon(C.red) + `</div>` +
      `<div style="font:bold 28px 'Saira Condensed',sans-serif;letter-spacing:1.5px;color:${C.ink};">Start Game</div>` +
      `<div style="font:13.5px 'Segoe UI',Arial,sans-serif;color:${C.sub};margin-top:4px;">Begin the mission</div>` +
      `<div style="margin-top:16px;font:bold 12px Consolas,monospace;letter-spacing:2px;color:${C.red};">ENTER SYSTEM →</div>` +
    `</div>`);
}

// LeaderboardCard — compact top-10, right side.
function buildLeaderboardCard(rows) {
  const medals = ['🥇', '🥈', '🥉'];
  const rowsHtml = rows.length === 0
    ? `<div style="text-align:center;padding:24px 10px;font:italic 13px 'Segoe UI',Arial,sans-serif;color:${C.sub};">No completed runs yet</div>`
    : rows.map((r, i) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;` +
          `${i < rows.length - 1 ? `border-bottom:1px solid ${C.border};` : ''}">` +
          `<div style="flex:none;font-size:17px;width:24px;text-align:center;">${medals[i] || r.rank}</div>` +
          `<div style="flex:1;font:600 14px 'Segoe UI',Arial,sans-serif;color:${C.ink};">${r.player}</div>` +
          `<div style="font:bold 13px Consolas,monospace;color:#2D8659;">${r.bestTime}</div>` +
        `</div>`).join('');
  return (
    `<div id="lp-board" class="lp-rise" style="animation-delay:.34s;` +
      `background:${C.card};border:1px solid ${C.border};border-radius:14px;box-shadow:0 6px 22px rgba(40,60,90,0.10);overflow:hidden;">` +
      `<div style="background:${C.gold};padding:9px 14px;display:flex;align-items:center;gap:8px;">` +
        `<span style="font-size:14px;">🏆</span>` +
        `<span style="font:bold 14px 'Saira Condensed',sans-serif;letter-spacing:2px;color:${C.ink};">LEADERBOARD</span>` +
      `</div>` +
      `<div style="padding:6px 14px 10px;">` +
        `<div style="font:10.5px Consolas,monospace;color:${C.sub};padding:6px 4px 2px;">fastest full runs — top agents</div>` +
        rowsHtml +
      `</div>` +
    `</div>`);
}

// ── LandingPage ──────────────────────────────────────────────────────────────
export function showLandingPage({ onStart, onTeam } = {}) {
  document.body.classList.add('landing-active');
  document.getElementById('landing-page')?.remove();

  const root = document.createElement('div');
  root.id = 'landing-page';
  root.style.cssText =
    'position:fixed;inset:0;z-index:20000;overflow:auto;' +
    "font-family:'Segoe UI',Arial,sans-serif;opacity:0;transition:opacity .55s ease;";

  root.innerHTML =
    buildStyles() +
    `<div style="position:absolute;inset:0;overflow:hidden;">` +
      buildBackground() +
      buildActionScene() +
    `</div>` +
    `<div style="position:relative;min-height:100%;">` +
      buildBrand() +
      `<div id="lp-main" style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px 60px;gap:38px;">` +
      buildHero() +
        `<div id="lp-cards" style="display:flex;gap:26px;justify-content:center;flex-wrap:wrap;">` +
          buildStartCard() +
        `</div>` +
        buildLeaderboardCard([]) +    // placeholder; filled async below
      `</div>` +
    `</div>`;

  document.body.appendChild(root);
  requestAnimationFrame(() => { root.style.opacity = '1'; });

  // Leaderboard: async-ready (hardcoded provider for now, API later)
  fetchTopPlayers().then((rows) => {
    const board = root.querySelector('#lp-board');
    if (board) board.outerHTML = buildLeaderboardCard(rows);
  });

  const leave = (cb) => {
    document.body.classList.remove('landing-active');
    root.style.opacity = '0';
    setTimeout(() => { root.remove(); cb?.(); }, 560);
  };

  root.querySelector('#lp-start')?.addEventListener('click', () => {
    initAudio();
    beep(880, 0.07, 'sine', 0.07);
    setTimeout(() => beep(1320, 0.09, 'sine', 0.06), 80);
    leave(onStart);
  });
  return root;
}

export function removeLandingPage() {
  document.body.classList.remove('landing-active');
  document.getElementById('landing-page')?.remove();
}
