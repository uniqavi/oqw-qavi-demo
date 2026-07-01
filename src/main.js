import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import HomeScene from './scenes/HomeScene.js';
import GameScene from './scenes/GameScene.js';
import Level2Scene from './scenes/Level2Scene.js';
import DashboardScene from './scenes/DashboardScene.js';
import HUDScene from './scenes/HUDScene.js';
import { playMusic } from './game/music.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#181818',
  scene: [BootScene, MenuScene, HomeScene, GameScene, Level2Scene, DashboardScene, HUDScene],
  scale: {
    // Fixed 1920×1080 internal canvas. The `.viewport` div in index.html is
    // already CSS-scaled to fit the browser window, so we use Scale.NONE to
    // stop Phaser from also resizing/scaling the canvas — RESIZE used to
    // under-measure the parent on Safari/Mac and left the MenuScene desktop
    // background only filling ~75% of the screen, and FIT double-scaled it.
    // Gameplay scenes draw to the separate #oqw overlay canvas (their own
    // resize logic) so they're unaffected by this.
    mode: Phaser.Scale.NONE,
    width: 1920,
    height: 1080,
  },
};

const game = new Phaser.Game(config);

// Dev-only handle so the preview/verification workflow can jump straight to a
// scene (e.g. window.__game.scene.start('GameScene', { difficulty: 'easy' }))
// without clicking through the cutscene + tutorial. Vite strips this whole
// block from production builds (import.meta.env.DEV is statically false).
if (import.meta.env.DEV) {
  window.__game = game;
  buildDevJumpPanel(game);
}

// Floating "DEV JUMP" picker (DEV builds only) — jump straight into any scene
// for testing without playing through the whole flow. Stripped from prod.
function buildDevJumpPanel(game) {
  const XP_OVERLAYS = ['xp-welcome', 'xp-desktop', 'xp-call', 'xp-browser'];

  function stopAll() {
    game.scene.scenes.forEach((s) => {
      if (s.scene.isActive() && s.scene.key !== 'BootScene') game.scene.stop(s.scene.key);
    });
  }
  function jump(key, launchHud) {
    XP_OVERLAYS.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    document.body.classList.remove('menu-mode');
    stopAll();
    const difficulty = localStorage.getItem('oqw-difficulty') || 'easy';
    game.scene.start(key, { difficulty });
    if (launchHud) game.scene.launch('HUDScene');
  }
  function toOpening() {
    XP_OVERLAYS.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    stopAll();
    game.scene.start('MenuScene');   // MenuScene.create() re-shows the XP welcome
  }

  // [label, sceneKey, launchHUDScene?] — null key = the opening flow
  const TARGETS = [
    ['Opening (XP)', null],
    ['1.1 Home feed', 'HomeScene'],
    ['1.2 Runner', 'GameScene', true],
    ['2.0 Dashboard', 'DashboardScene'],
    ['SPYGRAM (L2 wip)', 'Level2Scene'],
  ];

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;font:11px ui-monospace,Consolas,monospace;user-select:none;';

  const toggle = document.createElement('button');
  toggle.textContent = 'DEV ▾';
  toggle.style.cssText = 'background:#E63946;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font:inherit;font-weight:bold;opacity:.85;';
  wrap.appendChild(toggle);

  const list = document.createElement('div');
  list.style.cssText = 'display:none;margin-top:4px;background:rgba(12,12,14,.92);border:1px solid #333;border-radius:4px;padding:6px;flex-direction:column;gap:4px;';
  wrap.appendChild(list);

  TARGETS.forEach(([label, key, hud]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:140px;text-align:left;background:#1d2740;color:#cfe0ff;border:1px solid #2c3a5c;padding:4px 8px;border-radius:3px;cursor:pointer;font:inherit;';
    b.onmouseenter = () => { b.style.background = '#2c3a5c'; };
    b.onmouseleave = () => { b.style.background = '#1d2740'; };
    b.onclick = () => { key ? jump(key, hud) : toOpening(); };
    list.appendChild(b);
  });

  toggle.onclick = () => {
    const open = list.style.display === 'flex';
    list.style.display = open ? 'none' : 'flex';
    toggle.textContent = open ? 'DEV ▾' : 'DEV ▴';
  };

  (document.body || document.documentElement).appendChild(wrap);
}

// Wire up the login screen button
const loginBtn = document.getElementById('login-btn');
const loginScreen = document.getElementById('login-screen');

if (loginBtn && loginScreen) {
  loginBtn.addEventListener('click', () => {
    // Hide the login overlay, revealing the game canvas (MenuScene desktop) underneath
    loginScreen.classList.add('hidden');
    loginScreen.classList.remove('flex');
    playMusic('menu', { fadeMs: 1200 });
  });
}

