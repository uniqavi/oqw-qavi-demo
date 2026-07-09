// KiloGram — cinematic credits scene, played after the final level is won and
// BEFORE the existing name-entry/score popup.
//
//   Part 1 — dark-screen intro beats ("Thanks for tolerating our game." →
//            "Enjoy the credits….." / "…as a compensation")
//   Part 2 — the KiloGram feed: an Instagram-desktop-style page rendered in
//            the game's own design language (near-black #0a0a0a, game palette,
//            Saira Condensed / system fonts, hand-tuned SVG icons). The scene
//            auto-scrolls slowly through the developer posts; comments fade in
//            one by one with a soft ping. Fully non-interactive except SKIP
//            (button or ESC).
//
//   playKilogramCredits({ onComplete }) → returns a handle with .skip()
//   removeKilogramCredits()             → hard cleanup (scene shutdown safety)
//
// Developer photos are drop-in assets: /public/credits/<name>.jpg
// (qavi, afifa, ray, yongliang). Until they land, each post shows a styled
// placeholder card; the <img> overlays it automatically once the file exists.
// TOTO's avatar/post use his in-game SecureChat icon (blue circle silhouette).

import { beep } from './audio.js';

// ── Palette (game colors) ────────────────────────────────────────────────────
const P = {
  bg: '#0a0a0a', panel: '#141416', line: '#262626',
  fg: '#f5f5f5', dim: '#a8a8a8', dimmer: '#6b6b73',
  red: '#E63946', yellow: '#F4D35E', green: '#2D8659',
  blue: '#4A7BC8', purple: '#9b59b6', verified: '#3897f0',
};
const RING = `conic-gradient(${P.yellow}, ${P.red}, ${P.purple}, ${P.blue}, ${P.yellow})`;

// ── SVG icon helpers (single stroke weight everywhere = game's line style) ──
function svg(pathD, { size = 24, stroke = P.fg, fill = 'none', sw = 1.8 } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" ` +
    `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${pathD}"/></svg>`;
}
const ICONS = {
  home:    'M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z',
  search:  'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5',
  explore: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15.5 8.5l-2 5-5 2 2-5z',
  reels:   'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 8.5h18M8 4l3 4.5M14 4l3 4.5M10.5 12.5l4 2.5-4 2.5z',
  send:    'M21 3 3.5 10.2l6.3 2.9L21 3zM21 3l-5 17.5-6.2-7.4',
  heart:   'M12 20.5C7 16.5 3.5 13.4 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.1C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.8-3.5 6.9-8.5 10.9z',
  create:  'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 8.5v7M8.5 12h7',
  dash:    'M4 20V10M10 20V4M16 20v-8M21 20H3',
  comment: 'M21 12a9 9 0 0 1-13.4 7.9L3 21l1.2-4.5A9 9 0 1 1 21 12z',
  save:    'M6 3h12v18l-6-4.5L6 21z',
  dots:    'M5 12h.01M12 12h.01M19 12h.01',
  chevD:   'M6 9l6 6 6-6',
};

// Toto's in-game SecureChat avatar — blue disc, white head + shoulders.
function totoAvatarHtml(size) {
  const r = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="20" fill="#3498db"/>
    <circle cx="20" cy="15" r="7" fill="#ffffff"/>
    <path d="M8 34a12 11 0 0 1 24 0z" fill="#ffffff"/>
  </svg>`.replace(/\n\s*/g, '');
}

// Colored initial avatar (streamers / fallback for devs without photos).
function initialAvatarHtml(name, color, size) {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};` +
    `display:flex;align-items:center;justify-content:center;` +
    `font:bold ${Math.round(size * 0.48)}px 'Saira Condensed',sans-serif;color:#fff;">` +
    name[0].toUpperCase() + '</div>';
}

// Dev avatar/photo — /credits/<key>.jpg overlays the placeholder when present.
function devAvatarHtml(key, color, size) {
  return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex:none;">` +
    initialAvatarHtml(key, color, size) +
    `<img src="/credits/${key}.jpg" onerror="this.remove()" ` +
    `style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">` +
    `</div>`;
}

// ── Content ──────────────────────────────────────────────────────────────────
const STORIES = [
  { name: 'toto_',        avatar: (s) => totoAvatarHtml(s) },
  { name: 'xQcOW',        avatar: (s) => initialAvatarHtml('x', P.purple, s) },
  { name: 'Ninja',        avatar: (s) => initialAvatarHtml('N', P.blue, s) },
  { name: 'pokimane',     avatar: (s) => initialAvatarHtml('p', P.red, s) },
  { name: 'Markiplier',   avatar: (s) => initialAvatarHtml('M', P.green, s) },
  { name: 'dream',        avatar: (s) => initialAvatarHtml('d', P.yellow, s) },
  { name: 'MrBeastGaming',avatar: (s) => initialAvatarHtml('M', '#0fa3b1', s) },
];

const POSTS = [
  {
    key: 'qavi', user: 'qavi', color: P.blue, time: '2d', likes: '1,204 likes',
    caption: 'Gimme your Tokens',
    comments: [
      ['random_guy_1', 'my type 🌚'],
      ['fake_friend', 'I loved your game bro!'],
      ['metacritic', 'wtf did i just play 🤯'],
      ['luca', 'Who left the lab open again?!!'],
    ],
  },
  {
    key: 'afifa', user: 'afifa', color: P.red, time: '3d', likes: '2,001 likes',
    caption: 'You may call me HAL',
    comments: [
      ['crewmate_red', 'Maybe i was the imposter?'],
    ],
  },
  {
    key: 'ray', user: 'ray', color: P.green, time: '5d', likes: '847 likes',
    caption: 'Bug? No, that’s an undocumented feature.',
    comments: [
      ['console_log', 'Sleep not found'],
    ],
  },
  {
    key: 'yongliang', user: 'yongliang', color: P.purple, time: '1w', likes: '3,116 likes',
    caption: 'WFH King',
    comments: [
      ['commute_club', 'bed → desk in 12 seconds. new PB 🏆'],
      ['hr_bot', 'camera has been "broken" since 2024 💀'],
      ['status_checker', 'bro’s status: active 5m ago. for three years.'],
      ['pajama_meta', 'business on top, blanket on the bottom 🛌'],
    ],
  },
  {
    key: 'toto', user: 'toto_', color: '#3498db', time: 'now', likes: '9,999 likes',
    caption: 'Mission complete. The window is quiet.',
    isToto: true,
    comments: [
      ['toto_', '...for now. 🖥️'],
    ],
  },
];

// ── Small async helpers with skip-cancellation ───────────────────────────────
function makeState(onComplete) {
  return { dead: false, finished: false, timers: new Set(), raf: null, onComplete };
}
function sleep(state, ms) {
  return new Promise((res) => {
    const id = setTimeout(() => { state.timers.delete(id); res(); }, ms);
    state.timers.add(id);
  });
}
function ping(i = 0) {
  beep(1180 + i * 40, 0.05, 'sine', 0.05);
  setTimeout(() => beep(1660 + i * 40, 0.07, 'sine', 0.04), 55);
}

// Smooth scroll `el` to targetTop over `ms` (ease-in-out), skippable.
function scrollTo(state, el, targetTop, ms) {
  return new Promise((res) => {
    const from = el.scrollTop, delta = targetTop - from;
    if (Math.abs(delta) < 2 || ms <= 0) { el.scrollTop = targetTop; return res(); }
    const t0 = performance.now();
    const tick = (now) => {
      if (state.dead) return res();
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      el.scrollTop = from + delta * e;
      if (t < 1) state.raf = requestAnimationFrame(tick);
      else res();
    };
    state.raf = requestAnimationFrame(tick);
  });
}

// ── DOM builders ─────────────────────────────────────────────────────────────
function buildSidebar() {
  const items = ['home', 'search', 'explore', 'reels', 'send', 'heart', 'create', 'dash'];
  const rows = items.map((k, i) =>
    `<div style="padding:11px 0;display:flex;justify-content:center;opacity:${i === 0 ? 1 : 0.72};">` +
    svg(ICONS[k], { stroke: i === 0 ? P.fg : P.dim, sw: i === 0 ? 2.2 : 1.8 }) + '</div>').join('');
  return (
    `<div style="width:76px;flex:none;height:100%;border-right:1px solid ${P.line};` +
      `display:flex;flex-direction:column;align-items:stretch;padding:14px 0;">` +
      // KiloGram wordmark — shifted to the right of the DEV button, increased size
      `<div style="text-align:left;margin-left:14px;margin-bottom:18px;padding:0 4px;` +
        `font:italic bold 25px 'Brush Script MT','Segoe Script','Saira Condensed',cursive;` +
        `color:${P.fg};line-height:1.1;letter-spacing:0.5px;white-space:nowrap;transform:translateX(24px);">KiloGram</div>` +
      rows +
      `<div style="flex:1"></div>` +
      // profile pic at the very bottom
      `<div style="display:flex;justify-content:center;padding-bottom:6px;">` +
        `<div style="width:26px;height:26px;border-radius:50%;overflow:hidden;border:1.5px solid ${P.dim};">` +
          initialAvatarHtml('u', '#333340', 23) + `</div></div>` +
    `</div>`);
}

function buildStories() {
  const bubbles = STORIES.map((s) =>
    `<div style="width:76px;flex:none;text-align:center;">` +
      `<div style="width:62px;height:62px;margin:0 auto;border-radius:50%;padding:2.5px;background:${RING};">` +
        `<div style="width:100%;height:100%;border-radius:50%;padding:2.5px;background:${P.bg};box-sizing:border-box;">` +
          `<div style="width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;">${s.avatar(52)}</div>` +
        `</div>` +
      `</div>` +
      `<div style="font:11px 'Segoe UI',Arial,sans-serif;color:${P.dim};margin-top:5px;` +
        `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>` +
    `</div>`).join('');
  return (
    `<div style="display:flex;align-items:center;gap:4px;padding:10px 6px 12px;border-bottom:1px solid ${P.line};">` +
      `<div style="display:flex;gap:6px;overflow:hidden;">${bubbles}</div>` +
      `<div style="flex:none;color:${P.fg};font:bold 20px 'Segoe UI',Arial;padding:0 6px;opacity:.85;">›</div>` +
    `</div>`);
}

const CHECK = `<span style="display:inline-flex;width:14px;height:14px;border-radius:50%;background:${P.verified};` +
  `color:#fff;font:bold 10px Arial;align-items:center;justify-content:center;flex:none;">✓</span>`;

function buildPost(post) {
  const avatar = post.isToto
    ? `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none;">${totoAvatarHtml(36)}</div>`
    : devAvatarHtml(post.key, post.color, 36);

  // Post image: styled placeholder card; the drop-in photo overlays it.
  const media = post.isToto
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;` +
        `background:radial-gradient(circle at 50% 42%, #14304a 0%, #0d1826 70%);">${totoAvatarHtml(190)}</div>`
    : `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;` +
        `background:linear-gradient(160deg, ${post.color}33 0%, #101014 70%);">` +
        `<div style="width:120px;height:120px;border-radius:50%;overflow:hidden;">${initialAvatarHtml(post.user, post.color, 120)}</div>` +
        `<div style="font:bold 22px 'Saira Condensed',sans-serif;color:${P.dim};letter-spacing:3px;">@${post.user.toUpperCase()}</div>` +
      `</div>` +
      `<img src="/credits/${post.key}.jpg" onerror="this.remove()" ` +
        `style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">`;

  const comments = post.comments.map(([u, t]) =>
    `<div class="kg-comment" style="opacity:0;transform:translateY(7px);transition:opacity 1.8s ease,transform 1.8s ease;` +
      `font:13.5px 'Segoe UI',Arial,sans-serif;color:${P.fg};margin-top:8px;">` +
      `<b>${u}</b>&nbsp; ${t}</div>`).join('');

  return (
    `<div class="kg-post" style="margin:0 auto 380px;max-width:580px;">` +
      // header
      `<div style="display:flex;align-items:center;gap:10px;padding:8px 2px;">` +
        avatar +
        `<div style="flex:1;min-width:0;">` +
          `<div style="display:flex;align-items:center;gap:5px;font:600 14px 'Segoe UI',Arial,sans-serif;color:${P.fg};">` +
            `${post.user} ${CHECK}` +
            `<span style="color:${P.dimmer};font-weight:400;">• ${post.time}</span>` +
          `</div>` +
          `<div style="font:12px 'Segoe UI',Arial,sans-serif;color:${P.dim};">Original audio</div>` +
        `</div>` +
        `<div style="flex:none;opacity:.85;">${svg(ICONS.dots, { size: 22, sw: 2.4 })}</div>` +
      `</div>` +
      // media (square, slightly rounded)
      `<div style="position:relative;width:100%;aspect-ratio:1/1;border-radius:6px;overflow:hidden;` +
        `border:1px solid ${P.line};">${media}</div>` +
      // actions
      `<div style="display:flex;gap:14px;padding:10px 2px 4px;align-items:center;">` +
        svg(ICONS.heart, { size: 25 }) + svg(ICONS.comment, { size: 25 }) + svg(ICONS.send, { size: 25 }) +
        `<div style="flex:1"></div>` + svg(ICONS.save, { size: 25 }) +
      `</div>` +
      `<div style="font:600 13.5px 'Segoe UI',Arial,sans-serif;color:${P.fg};padding:2px 2px;">${post.likes}</div>` +
      `<div style="font:13.5px 'Segoe UI',Arial,sans-serif;color:${P.fg};padding:4px 2px 0;"><b>${post.user}</b>&nbsp; ${post.caption}</div>` +
      `<div class="kg-comments" style="padding:2px 2px 0;">${comments}</div>` +
    `</div>`);
}

function buildMessagesWidget() {
  return (
    `<div style="position:absolute;right:22px;bottom:20px;width:190px;background:${P.panel};` +
      `border:1px solid ${P.line};border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:8px;` +
      `box-shadow:0 4px 18px rgba(0,0,0,0.5);">` +
      `<div style="position:relative;width:34px;height:22px;flex:none;">` +
        `<div style="position:absolute;left:0;top:0;width:22px;height:22px;border-radius:50%;overflow:hidden;border:2px solid ${P.panel};">${initialAvatarHtml('N', P.blue, 18)}</div>` +
        `<div style="position:absolute;left:12px;top:0;width:22px;height:22px;border-radius:50%;overflow:hidden;border:2px solid ${P.panel};">${totoAvatarHtml(18)}</div>` +
      `</div>` +
      `<div style="flex:1;font:600 14px 'Segoe UI',Arial,sans-serif;color:${P.fg};">Messages</div>` +
      `<div style="opacity:.7;transform:rotate(180deg);">${svg(ICONS.chevD, { size: 18, stroke: P.dim })}</div>` +
    `</div>`);
}

// ── Scene assembly + orchestration ───────────────────────────────────────────
let activeState = null;

export function playKilogramCredits({ onComplete, zIndex = 210 } = {}) {
  removeKilogramCredits();
  const state = makeState(onComplete);
  activeState = state;

  const root = document.createElement('div');
  root.id = 'kilogram-credits';
  root.style.cssText =
    `position:fixed;inset:0;z-index:${zIndex};background:${P.bg};opacity:0;transition:opacity 1s ease;` +
    `font-family:'Segoe UI',Arial,sans-serif;user-select:none;cursor:default;`;

  // Part 1 — intro beats layer
  const intro = document.createElement('div');
  intro.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  intro.innerHTML =
    `<div id="kg-line1" style="opacity:0;transition:opacity 1.1s ease;` +
      `font:26px 'Saira Condensed',sans-serif;letter-spacing:1px;color:${P.fg};">Thanks for tolerating our game.</div>` +
    `<div id="kg-line2" style="opacity:0;transition:opacity 1.1s ease;` +
      `font:26px 'Saira Condensed',sans-serif;letter-spacing:1px;color:${P.fg};">Enjoy the credits.....</div>` +
    `<div id="kg-line3" style="opacity:0;transition:opacity 1.1s ease;margin-top:14px;transform:translateX(90px);` +
      `font:italic 21px 'Saira Condensed',sans-serif;color:${P.dim};">...as a compensation</div>` +
    `<div id="kg-line4" style="opacity:0;transition:opacity 1.1s ease;` +
      `font:26px 'Saira Condensed',sans-serif;letter-spacing:1px;color:${P.fg};">meet the creators</div>`;

  // Part 2 — the KiloGram page (hidden until the intro finishes)
  const app = document.createElement('div');
  app.style.cssText = 'position:absolute;inset:0;display:flex;opacity:0;transition:opacity 1.2s ease;';
  const feedCol =
    `<div style="flex:1;display:flex;flex-direction:column;min-width:0;max-width:640px;margin:0 auto;height:100%;">` +
      // header: tabs (static)
      `<div style="display:flex;gap:26px;padding:16px 8px 8px;justify-content:center;">` +
        `<div style="font:600 15px 'Segoe UI',Arial,sans-serif;color:${P.fg};border-bottom:2px solid ${P.fg};padding-bottom:4px;">For You</div>` +
        `<div style="font:600 15px 'Segoe UI',Arial,sans-serif;color:${P.dimmer};padding-bottom:4px;">Following</div>` +
      `</div>` +
      // stories (static, always visible)
      buildStories() +
      // scrolling feed
      `<div id="kg-feed" style="flex:1;overflow:hidden;padding:26px 8px 0;">` +
        POSTS.map(buildPost).join('') +
        `<div style="height:55vh;"></div>` +   // tail room so the last post can sit high
      `</div>` +
    `</div>`;
  app.innerHTML =
    buildSidebar() +
    `<div style="flex:1;position:relative;min-width:0;display:flex;">${feedCol}</div>` +
    buildMessagesWidget();

  // Skip affordance — the scene's only interaction
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'SKIP  ›';
  skipBtn.style.cssText =
    `position:absolute;right:22px;top:18px;z-index:5;background:rgba(20,20,22,0.7);color:${P.dim};` +
    `border:1px solid ${P.line};border-radius:6px;padding:6px 14px;cursor:pointer;` +
    `font:bold 12px ui-monospace,Consolas,monospace;letter-spacing:1px;`;
  skipBtn.onmouseenter = () => { skipBtn.style.color = P.fg; };
  skipBtn.onmouseleave = () => { skipBtn.style.color = P.dim; };
  skipBtn.onclick = () => finish(state, root, true);

  root.appendChild(intro);
  root.appendChild(app);
  root.appendChild(skipBtn);
  document.body.appendChild(root);

  state.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(state, root, true); } };
  // capture phase so the game scenes underneath never see ESC
  document.addEventListener('keydown', state.onKey, true);

  run(state, root, intro, app).catch(() => {});
  return { skip: () => finish(state, root, true) };
}

async function run(state, root, intro, app) {
  const $ = (id) => root.querySelector(id);

  // fade the black screen in
  requestAnimationFrame(() => { root.style.opacity = '1'; });
  await sleep(state, 1400); if (state.dead) return;

  // Beat 1
  $('#kg-line1').style.opacity = '1';
  await sleep(state, 2600); if (state.dead) return;
  $('#kg-line1').style.opacity = '0';
  await sleep(state, 1400); if (state.dead) return;
  $('#kg-line1').style.display = 'none';

  // Beat 2 + 3
  $('#kg-line2').style.opacity = '1';
  await sleep(state, 2200); if (state.dead) return;
  $('#kg-line3').style.opacity = '1';
  await sleep(state, 2400); if (state.dead) return;
  $('#kg-line2').style.opacity = '0';
  $('#kg-line3').style.opacity = '0';
  await sleep(state, 1300); if (state.dead) return;
  $('#kg-line2').style.display = 'none';
  $('#kg-line3').style.display = 'none';

  // Beat 4 (meet the creators)
  $('#kg-line4').style.opacity = '1';
  await sleep(state, 2400); if (state.dead) return;
  $('#kg-line4').style.opacity = '0';
  await sleep(state, 1300); if (state.dead) return;
  $('#kg-line4').style.display = 'none';
  intro.style.display = 'none';

  // KiloGram fades in, holds still
  app.style.opacity = '1';
  beep(660, 0.08, 'sine', 0.05);
  await sleep(state, 2600); if (state.dead) return;

  const feed = $('#kg-feed');
  const posts = [...root.querySelectorAll('.kg-post')];
  for (let i = 0; i < posts.length; i++) {
    if (state.dead) return;
    const post = posts[i];
    const isLast = i === posts.length - 1;
    // extremely slow cinematic scroll — duration scales with distance
    const target = Math.max(0, post.offsetTop - 10);
    const dist = Math.abs(target - feed.scrollTop);
    await scrollTo(state, feed, target, Math.max(2200, dist * 6.5)); if (state.dead) return;
    await sleep(state, isLast ? 2600 : 900); if (state.dead) return;

    // comments fade in one by one, each with a soft ping
    const comments = [...post.querySelectorAll('.kg-comment')];
    for (let c = 0; c < comments.length; c++) {
      if (state.dead) return;
      comments[c].style.opacity = '1';
      comments[c].style.transform = 'translateY(0)';
      ping(c);
      await sleep(state, 3200);
    }
    await sleep(state, isLast ? 2000 : 1300); if (state.dead) return;
  }

  finish(state, root, false);
}

function finish(state, root, skipped) {
  if (state.finished) return;
  state.finished = true;
  state.dead = true;
  state.timers.forEach(clearTimeout);
  if (state.raf) cancelAnimationFrame(state.raf);
  document.removeEventListener('keydown', state.onKey, true);
  root.style.transition = 'opacity ' + (skipped ? 0.5 : 1.4) + 's ease';
  root.style.opacity = '0';
  setTimeout(() => {
    root.remove();
    if (activeState === state) activeState = null;
    state.onComplete?.();
  }, skipped ? 550 : 1500);
}

export function removeKilogramCredits() {
  if (activeState) {
    activeState.dead = true;
    activeState.finished = true;
    activeState.timers.forEach(clearTimeout);
    if (activeState.raf) cancelAnimationFrame(activeState.raf);
    document.removeEventListener('keydown', activeState.onKey, true);
    activeState = null;
  }
  document.getElementById('kilogram-credits')?.remove();
}
