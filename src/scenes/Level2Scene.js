import Phaser from 'phaser';
import { initAudio, beep } from '../game/audio.js';
import { crossfadeTo } from '../game/music.js';

// LEVEL 2 — SPYGRAM (HUSH's "private" chat. dark mode. obviously logged.)
//
// MVP scaffold for Wednesday peer testing. Goals at this stage:
//   - Render the SPYGRAM page (left rail / chat list / active panel)
//   - Move the player rectangle in the active panel with WASD/arrows
//   - Show a few static message bubbles
//   - One placeholder hazard (typing indicator → @mention) to prove the loop
//
// You're logged in as Lewis — night-shift analyst nobody pays attention to.
// All other chat handles are HUSH employees (F1-driver first names for
// in-house consistency; non-fans just see normal names).

// Palette (Telegram dark mode)
const COL = {
  bg:      '#17212b',
  side:    '#0e1621',
  hover:   '#2b5278',
  text:    '#ffffff',
  muted:   '#7d8e98',
  accent:  '#3390ec',
  bubble:  '#182533',
  outBub:  '#2b5278',
  hazard:  '#E63946',
  green:   '#2D8659',
};

// Approx world coords (logical px). The active chat panel is the play area.
const LAYOUT = {
  topBar:   { x: 0,    y: 0,    w: 1920, h: 50 },
  rail:     { x: 0,    y: 50,   w: 60,   h: 1030 },
  chatList: { x: 60,   y: 50,   w: 520,  h: 1030 },
  active:   { x: 580,  y: 100,  w: 1340, h: 900 },   // play area
  composer: { x: 580,  y: 1000, w: 1340, h: 80 },
};

// Chat list — HUSH employees, F1-driver first names. Reads as normal
// office Slack/Telegram for anyone who isn't an F1 fan, easter egg for
// anyone who is. `lewis` (you) doesn't appear here — you're impersonating
// him by being in the chat.
const CHAT_LIST = [
  { name: 'ANNOUNCEMENTS',  pin: true,  unread: 12, last: 'mandatory all-hands fri' },
  { name: 'vault-leaks',    lock: true, unread: 1,  last: '[1 pinned file]', highlight: true },
  { name: 'ops-channel',                 unread: 3,  last: 'whose dog is on the kitchen webcam' },
  { name: 'charles',                     unread: 0,  last: 'lewis you still up?' },
  { name: 'oscar',                       unread: 1,  last: 'eta on the q3 logs?' },
  { name: 'fernando',                    unread: 0,  last: 'this is a disaster' },
  { name: 'internal-audit', lock: true,  unread: 0,  last: '[restricted]' },
  { name: 'archive',                     unread: 0,  last: '' },
];

// Sample messages in the active channel. "lando" notices something is off —
// sets up the suspicion mechanic without the player having done anything yet.
const MESSAGES = [
  { from: 'charles',  text: 'Yo, weird question.', t: '22:51' },
  { from: 'charles',  text: 'why are the audit logs flagging tier-iv access at 3am?', t: '22:51' },
  { from: 'oscar',    text: 'idk, ask max', t: '22:53' },
  { from: 'charles',  text: "max is the one who flagged them", t: '22:53' },
  { from: 'lando',    text: "someone's in here. they're reading.", t: '22:54', menace: true },
];

export default class Level2Scene extends Phaser.Scene {
  constructor() {
    super('Level2Scene');
  }

  create() {
    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    crossfadeTo('level2', { fadeMs: 1500 });

    // Simple player — top-down rectangle constrained to the active panel
    this.player = {
      x: LAYOUT.active.x + LAYOUT.active.w / 2,
      y: LAYOUT.active.y + LAYOUT.active.h - 80,
      w: 60, h: 40,
      vx: 0, vy: 0,
    };

    this.time = 0;
    this.suspicion = 0;
    this.credentialTimer = 240;   // seconds (4:00 on normal — see DIFFICULTY)
    this.activeChannel = 'vault-leaks';

    // Placeholder hazard: a periodic @mention bubble that fires from the top
    // and chases the player for a few seconds. Just to prove the loop.
    this.hazards = [];
    this.hazardSpawnT = 0;

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // ESC → main menu
    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        crossfadeTo('menu', { fadeMs: 800 });
        document.body.classList.add('menu-mode');
        this.scene.stop();
        this.scene.start('MenuScene');
      }
    };
    document.addEventListener('keydown', this.onKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
    });
  }

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
  }

  update(_time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.time += dt;
    this.credentialTimer = Math.max(0, this.credentialTimer - dt);

    // Player movement
    let vx = 0, vy = 0;
    if (this.wasd.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.wasd.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.wasd.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.wasd.down.isDown || this.cursors.down.isDown) vy += 1;
    if (vx || vy) { const len = Math.hypot(vx, vy); vx /= len; vy /= len; }
    const speed = 280;
    this.player.x += vx * speed * dt;
    this.player.y += vy * speed * dt;
    // Clamp to active panel
    this.player.x = Phaser.Math.Clamp(this.player.x, LAYOUT.active.x + this.player.w / 2, LAYOUT.active.x + LAYOUT.active.w - this.player.w / 2);
    this.player.y = Phaser.Math.Clamp(this.player.y, LAYOUT.active.y + this.player.h / 2, LAYOUT.active.y + LAYOUT.active.h - this.player.h / 2);

    // Hazard spawn — @mention from top, chases player briefly
    this.hazardSpawnT -= dt;
    if (this.hazardSpawnT <= 0) {
      this.hazardSpawnT = 6 + Math.random() * 4;
      this.hazards.push({
        type: 'mention',
        x: LAYOUT.active.x + LAYOUT.active.w / 2,
        y: LAYOUT.active.y + 20,
        vx: 0, vy: 0,
        life: 5,
      });
      beep(880, 0.06, 'square', 0.05);
    }
    // Update hazards
    for (const h of this.hazards) {
      h.life -= dt;
      // Slow homing
      const dx = this.player.x - h.x;
      const dy = this.player.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      h.vx += (dx / d) * 120 * dt;
      h.vy += (dy / d) * 120 * dt;
      h.vx *= 0.95; h.vy *= 0.95;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (Math.abs(dx) < 40 && Math.abs(dy) < 30) {
        h.life = 0;
        this.suspicion = Math.min(100, this.suspicion + 12);
        beep(220, 0.15, 'sawtooth', 0.1);
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);

    this.render();
  }

  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;

    // World-space scale: fit Lattice's 1920×1080 logical layout to the canvas
    const sX = VW / 1920;
    const sY = VH / 1080;
    const s = Math.min(sX, sY);
    const offX = (VW - 1920 * s) / 2;
    const offY = (VH - 1080 * s) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(s, s);

    // Top bar
    ctx.fillStyle = COL.side;
    ctx.fillRect(LAYOUT.topBar.x, LAYOUT.topBar.y, LAYOUT.topBar.w, LAYOUT.topBar.h);
    ctx.fillStyle = COL.text;
    ctx.font = 'bold 14px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('# ' + this.activeChannel, 600, 28);
    ctx.fillStyle = COL.muted;
    ctx.font = '11px Consolas, monospace';
    ctx.fillText('4 members', 600, 44);

    // Top-right: suspicion + timer (HUD)
    const susPct = Math.round(this.suspicion);
    ctx.fillStyle = COL.muted;
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('LOGGED IN AS: lewis', 1380, 20);
    ctx.fillText('SUSPICION: ', 1380, 36);
    ctx.fillStyle = '#1a1f29';
    ctx.fillRect(1480, 30, 200, 10);
    ctx.fillStyle = this.suspicion < 40 ? COL.green : (this.suspicion < 75 ? '#E6A817' : COL.hazard);
    ctx.fillRect(1480, 30, 200 * (this.suspicion / 100), 10);
    ctx.fillStyle = COL.muted;
    const min = Math.floor(this.credentialTimer / 60);
    const sec = Math.floor(this.credentialTimer % 60);
    ctx.fillText('CHECK: ' + min + ':' + (sec < 10 ? '0' : '') + sec, 1700, 28);

    // Left icon rail
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(LAYOUT.rail.x, LAYOUT.rail.y, LAYOUT.rail.w, LAYOUT.rail.h);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 0 ? COL.accent : '#1a2230';
      ctx.beginPath();
      ctx.arc(LAYOUT.rail.x + 30, LAYOUT.rail.y + 50 + i * 60, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Chat list
    ctx.fillStyle = COL.side;
    ctx.fillRect(LAYOUT.chatList.x, LAYOUT.chatList.y, LAYOUT.chatList.w, LAYOUT.chatList.h);
    CHAT_LIST.forEach((chat, i) => {
      const y = LAYOUT.chatList.y + 10 + i * 85;
      const isActive = chat.name === this.activeChannel;
      if (isActive) {
        ctx.fillStyle = COL.hover;
        ctx.fillRect(LAYOUT.chatList.x, y, LAYOUT.chatList.w, 80);
      }
      // Avatar circle
      ctx.fillStyle = chat.highlight ? COL.hazard : '#3a4654';
      ctx.beginPath();
      ctx.arc(LAYOUT.chatList.x + 36, y + 40, 22, 0, Math.PI * 2);
      ctx.fill();
      // Name + lock/pin
      ctx.fillStyle = COL.text;
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.textBaseline = 'middle';
      const prefix = chat.lock ? '🔒 ' : (chat.pin ? '📌 ' : '');
      ctx.fillText(prefix + chat.name, LAYOUT.chatList.x + 70, y + 30);
      // Last message
      ctx.fillStyle = COL.muted;
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(chat.last.slice(0, 40), LAYOUT.chatList.x + 70, y + 52);
      // Unread badge
      if (chat.unread > 0) {
        ctx.fillStyle = chat.highlight ? COL.hazard : COL.accent;
        ctx.beginPath();
        ctx.arc(LAYOUT.chatList.x + LAYOUT.chatList.w - 26, y + 40, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COL.text;
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(chat.unread), LAYOUT.chatList.x + LAYOUT.chatList.w - 26, y + 41);
        ctx.textAlign = 'left';
      }
    });

    // Active panel (play area)
    ctx.fillStyle = COL.bg;
    ctx.fillRect(LAYOUT.active.x, LAYOUT.active.y, LAYOUT.active.w, LAYOUT.active.h);
    // Pinned banner
    ctx.fillStyle = '#1a2433';
    ctx.fillRect(LAYOUT.active.x, LAYOUT.active.y, LAYOUT.active.w, 36);
    ctx.fillStyle = COL.accent;
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('📌  PROJECT WHITEWASH — pinned file', LAYOUT.active.x + 20, LAYOUT.active.y + 18);

    // Messages
    MESSAGES.forEach((msg, i) => {
      const y = LAYOUT.active.y + 80 + i * 90;
      const isOut = msg.from === 'e.warner';
      const x = isOut ? LAYOUT.active.x + LAYOUT.active.w - 480 : LAYOUT.active.x + 70;
      // Avatar
      if (!isOut) {
        ctx.fillStyle = '#3a4654';
        ctx.beginPath();
        ctx.arc(LAYOUT.active.x + 30, y + 30, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bubble
      ctx.fillStyle = msg.menace ? '#3a1820' : (isOut ? COL.outBub : COL.bubble);
      ctx.fillRect(x, y, 460, 60);
      ctx.strokeStyle = msg.menace ? COL.hazard : '#252e3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 460, 60);
      // Sender + time
      ctx.fillStyle = msg.menace ? COL.hazard : COL.accent;
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.fillText(msg.from + '  ·  ' + msg.t, x + 12, y + 16);
      // Text
      ctx.fillStyle = msg.menace ? '#ffdde0' : COL.text;
      ctx.font = '13px Consolas, monospace';
      ctx.fillText(msg.text, x + 12, y + 42);
    });

    // Composer
    ctx.fillStyle = COL.side;
    ctx.fillRect(LAYOUT.composer.x, LAYOUT.composer.y, LAYOUT.composer.w, LAYOUT.composer.h);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(LAYOUT.composer.x + 16, LAYOUT.composer.y + 18, LAYOUT.composer.w - 32, 44);
    ctx.fillStyle = COL.muted;
    ctx.font = '13px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('📎  write a message...', LAYOUT.composer.x + 36, LAYOUT.composer.y + 40);

    // Hazards
    for (const h of this.hazards) {
      const pulse = 0.6 + Math.sin(this.time * 14) * 0.4;
      ctx.fillStyle = 'rgba(230,57,70,' + (0.4 + pulse * 0.3) + ')';
      ctx.fillRect(h.x - 60, h.y - 18, 120, 36);
      ctx.strokeStyle = COL.hazard;
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x - 60, h.y - 18, 120, 36);
      ctx.fillStyle = COL.text;
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('@lewis', h.x, h.y + 1);
      ctx.textAlign = 'left';
    }

    // Player
    const p = this.player;
    ctx.fillStyle = COL.hazard;
    ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(p.x - p.w / 2 + 2, p.y - p.h / 2 + 2, p.w - 4, 10);
    ctx.fillStyle = COL.text;
    ctx.font = '8px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('lewis.session', p.x - p.w / 2 + 4, p.y - p.h / 2 + 7);

    ctx.restore();

    // Bottom-of-screen hint
    ctx.fillStyle = COL.muted;
    ctx.font = '11px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('WASD / arrows to move  ·  dodge red @mentions  ·  ESC to exit', 24, VH - 16);
  }
}
