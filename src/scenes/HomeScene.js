import Phaser from 'phaser';
import { initAudio, beep } from '../game/audio.js';
import { drawHandRect } from '../game/draw.js';
import { COLORS } from '../config.js';

// LEVEL 1.1 — TOTALLYNORMALTUBE HOME PAGE ("The Feed")
//
// BASE LAYOUT ONLY (no gameplay yet). A fake YouTube home page drawn in our
// hand-drawn wobble aesthetic: top bar, category chips, left rail, a featured
// row, a Shorts row, and a video grid. Most cards are algorithm brain-rot; one
// grey "buried" card is the real target (the video the rest of L1 is about).
//
// Design intent (see docs/LEVEL1.md §5 + the runner direction): the player
// will eventually scan thumbnails to tell bait from truth, find the buried
// video, and click it to drop into the 1.2 video-page runner. For now this
// scene just renders the page so we can iterate on the look.

// Logical design width — everything is laid out at 1920 wide then scaled to
// fit the canvas width; the page is tall and scrolls vertically.
const DW = 1920;

const LAYOUT = {
  topBar:  { h: 56 },
  chips:   { y: 56, h: 48 },
  rail:    { w: 240 },
  content: { x: 264, top: 128, right: 40 },  // content starts after the rail
};
const CONTENT_W = DW - LAYOUT.content.x - LAYOUT.content.right;  // 1616

// Category chips (HUSH-flavoured brain-rot taxonomy)
const CHIPS = ['All', 'Brain Rot', 'Distractions', 'Outrage', 'Compliance',
  'Nothing', 'Mixes', 'Live', 'Comply', 'Trending', 'New to you'];

// Left rail entries (icon glyph + label)
const RAIL = [
  ['⌂', 'Home', true], ['⚡', 'Shorts'], ['▷', 'Subscriptions'],
  ['—'], ['◐', 'You'], ['◷', 'History'], ['▤', 'Playlists'], ['♡', 'Liked'],
  ['—'], ['EXPLORE'], ['♪', 'Music'], ['⛶', 'Live'], ['◉', 'Gaming'],
];

// Thumbnail palette (cycled) + satirical titles for the grid/featured.
const THUMB_COLORS = [COLORS.blue, COLORS.purple, COLORS.green, COLORS.yellow,
  COLORS.red, '#0fa3b1', '#e07a5f', '#3d5a80'];

const FEATURED = [
  { t: '10 REASONS TO STAY INSIDE TODAY', c: 'StayHome Media', v: '4.1M', d: '21:49' },
  { t: 'CELEBRITY DOES NOTHING FOR 3 HOURS (RELAXING)', c: 'NoThoughts', v: '205K', d: '16:31' },
  { t: 'BREAKING: ABSOLUTELY NOTHING HAPPENED', c: 'HUSH News', v: '92K', d: '13:43' },
];

const SHORTS = [
  { t: 'stay calm', e: '😌' }, { t: "don't look up", e: '🙃' },
  { t: 'nothing to see', e: '👀' }, { t: 'keep scrolling', e: '⬇️' },
  { t: 'obey', e: '🫡' },
];

// Grid videos. `target:true` is the buried real video (rendered greyer).
const GRID = [
  { t: 'why thinking is bad for you', c: 'BoredAbove', v: '8.8M', d: '9:41' },
  { t: 'this video has NO information (calming)', c: 'EmptyChannel', v: '1.4M', d: '12:00' },
  { t: 'watch this INSTEAD of the news', c: 'TotallyNormal', v: '3.2M', d: '7:07' },
  { t: 'What They Don\'t Want You To See (full doc)', c: 'UnknownUploader', v: '847K', d: '3:14', target: true },
  { t: 'ASMR: corporate compliance training', c: 'HUSH HR', v: '512K', d: '45:00' },
  { t: 'TOP 10 tabs you should NOT open', c: 'ClickFarm', v: '6.1M', d: '14:22' },
  { t: 'i scrolled for 9 hours straight', c: 'DoomScroll', v: '2.7M', d: '9:09:09' },
  { t: '[REDACTED] (do not watch)', c: '████████', v: '4 views', d: '0:04' },
  { t: 'the algorithm loves you (proof inside)', c: 'HUSH Labs', v: '9.9M', d: '6:66' },
];

export default class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  create() {
    this.canvas = document.getElementById('oqw');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    document.body.classList.remove('menu-mode');
    const urlBar = document.getElementById('browser-url');
    if (urlBar) urlBar.textContent = 'https://totallynormaltube.gov.??/';

    this.scrollY = 0;
    this.maxScroll = 0;
    this.time = 0;

    // Scroll: wheel + up/down arrows
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.on('wheel', (_p, _g, _dx, dy) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.6, 0, this.maxScroll);
    });
    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        document.body.classList.add('menu-mode');
        this.scene.stop();
        this.scene.start('MenuScene');
      }
    };
    document.addEventListener('keydown', this.onKey);

    this.handleResize();
    initAudio();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('keydown', this.onKey);
    });
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
    this.scale1 = w / DW;            // fit width
  }

  update(_t, dms) {
    const dt = Math.min(0.05, dms / 1000);
    this.time += dt;
    // Arrow-key scroll
    const sp = 900 * dt;
    if (this.cursors.down.isDown) this.scrollY = Phaser.Math.Clamp(this.scrollY + sp, 0, this.maxScroll);
    if (this.cursors.up.isDown) this.scrollY = Phaser.Math.Clamp(this.scrollY - sp, 0, this.maxScroll);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const { VW, VH } = this;
    if (!VW || !VH) return;
    const s = this.scale1;

    // page bg
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    ctx.scale(s, s);

    // ── Scrolling content (clipped below the chips bar) ──
    const contentTopPx = LAYOUT.chips.y + LAYOUT.chips.h;   // logical
    ctx.save();
    ctx.beginPath();
    ctx.rect(LAYOUT.rail.w, contentTopPx, DW - LAYOUT.rail.w, (VH / s) - contentTopPx);
    ctx.clip();
    ctx.translate(0, -this.scrollY);
    const bottom = this.drawContent(ctx);
    ctx.restore();
    // page height → clamp scroll
    this.maxScroll = Math.max(0, (bottom - (VH / s)) * s + 40 * s);

    // ── Fixed left rail ──
    this.drawRail(ctx, VH / s);

    // ── Fixed top bar + chips (drawn last so content scrolls under them) ──
    this.drawTopBar(ctx);
    this.drawChips(ctx);

    ctx.restore();

    // hint
    ctx.fillStyle = '#9a9a9a';
    ctx.font = '12px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('scroll / arrows to browse  ·  ESC to exit  ·  [ LEVEL 1.1 — base layout ]', 18, VH - 16);
  }

  // ===== Top bar =====
  drawTopBar(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, DW, LAYOUT.topBar.h);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, LAYOUT.topBar.h - 1, DW, 1);

    // hamburger
    ctx.fillStyle = '#1a1a1f';
    for (let i = 0; i < 3; i++) ctx.fillRect(24, 20 + i * 6, 22, 2.5);
    // logo: red play chip + wordmark
    ctx.fillStyle = COLORS.red;
    drawHandRect(ctx, 64, 16, 34, 24, COLORS.red, '#b71c2b', 12, 1.5);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(76, 22); ctx.lineTo(88, 28); ctx.lineTo(76, 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a1f';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('TotallyNormalTube', 108, 28);
    ctx.fillStyle = '#909090';
    ctx.font = '11px Arial';
    ctx.fillText('Premium', 318, 22);

    // search bar (centered)
    const sx = DW / 2 - 320, sw = 560;
    drawHandRect(ctx, sx, 12, sw, 32, '#f7f7f7', '#cfcfcf', 40, 1.4);
    ctx.fillStyle = '#9a9a9a';
    ctx.font = '14px Arial';
    ctx.fillText('Search', sx + 16, 29);
    // search button
    drawHandRect(ctx, sx + sw, 12, 56, 32, '#f0f0f0', '#cfcfcf', 70, 1.4);
    ctx.fillStyle = '#606060';
    ctx.fillText('⌕', sx + sw + 24, 29);
    // mic
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath(); ctx.arc(sx + sw + 86, 28, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#606060'; ctx.fillText('🎙', sx + sw + 78, 29);

    // right side: create / bell / avatar
    ctx.fillStyle = '#f0f0f0';
    drawHandRect(ctx, DW - 300, 14, 96, 28, '#f0f0f0', '#dcdcdc', 90, 1.2);
    ctx.fillStyle = '#1a1a1f'; ctx.font = 'bold 13px Arial';
    ctx.fillText('＋ Create', DW - 288, 29);
    ctx.font = '16px Arial';
    ctx.fillText('🔔', DW - 188, 30);
    // notif badge
    ctx.fillStyle = COLORS.red;
    ctx.beginPath(); ctx.arc(DW - 168, 18, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center'; ctx.fillText('9+', DW - 168, 19); ctx.textAlign = 'left';
    // avatar
    ctx.fillStyle = COLORS.purple;
    ctx.beginPath(); ctx.arc(DW - 130, 28, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center'; ctx.fillText('R', DW - 130, 29); ctx.textAlign = 'left';
  }

  // ===== Category chips =====
  drawChips(ctx) {
    const y = LAYOUT.chips.y;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(LAYOUT.rail.w, y, DW - LAYOUT.rail.w, LAYOUT.chips.h);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(LAYOUT.rail.w, y + LAYOUT.chips.h - 1, DW - LAYOUT.rail.w, 1);
    let x = LAYOUT.content.x;
    ctx.font = '13px Arial';
    for (let i = 0; i < CHIPS.length; i++) {
      const label = CHIPS[i];
      const w = ctx.measureText(label).width + 28;
      const active = i === 0;
      drawHandRect(ctx, x, y + 9, w, 30, active ? '#1a1a1f' : '#f0f0f0',
        active ? '#1a1a1f' : '#dcdcdc', i * 7 + 3, 1.2);
      ctx.fillStyle = active ? '#fff' : '#1a1a1f';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 14, y + 24);
      x += w + 10;
      if (x > DW - 120) break;
    }
  }

  // ===== Left rail =====
  drawRail(ctx, viewH) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, LAYOUT.topBar.h, LAYOUT.rail.w, viewH - LAYOUT.topBar.h);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(LAYOUT.rail.w - 1, LAYOUT.topBar.h, 1, viewH - LAYOUT.topBar.h);
    let y = LAYOUT.topBar.h + 16;
    for (const item of RAIL) {
      if (item[0] === '—') { ctx.fillStyle = '#ececec'; ctx.fillRect(14, y + 4, LAYOUT.rail.w - 28, 1); y += 18; continue; }
      if (item.length === 1) {   // section header
        ctx.fillStyle = '#909090'; ctx.font = 'bold 11px Arial'; ctx.textBaseline = 'middle';
        ctx.fillText(item[0], 22, y + 14); y += 34; continue;
      }
      const [glyph, label, active] = item;
      if (active) { drawHandRect(ctx, 10, y, LAYOUT.rail.w - 20, 40, '#efefef', '#e3e3e3', 33, 1); }
      ctx.fillStyle = '#1a1a1f'; ctx.font = '17px Arial'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, 24, y + 21);
      ctx.font = (active ? 'bold ' : '') + '14px Arial';
      ctx.fillText(label, 54, y + 21);
      y += 44;
    }
  }

  // ===== Scrolling content: featured row, shorts row, grid =====
  drawContent(ctx) {
    let y = LAYOUT.content.top;
    const x0 = LAYOUT.content.x;
    const gap = 24;

    // ── Featured row (3 large cards) ──
    const fw = (CONTENT_W - gap * 2) / 3;
    for (let i = 0; i < FEATURED.length; i++) {
      this.drawVideoCard(ctx, x0 + i * (fw + gap), y, fw, FEATURED[i], i);
    }
    y += fw * 9 / 16 + 92;

    // ── Shorts row ──
    ctx.fillStyle = COLORS.red; ctx.font = 'bold 20px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡', x0, y); ctx.fillStyle = '#1a1a1f';
    ctx.fillText('Shorts', x0 + 26, y);
    y += 28;
    const sw = (CONTENT_W - gap * 4) / 5, sh = sw * 16 / 9;
    for (let i = 0; i < SHORTS.length; i++) {
      this.drawShortCard(ctx, x0 + i * (sw + gap), y, sw, sh, SHORTS[i], i);
    }
    y += sh + 64;

    // ── Video grid (rows of 3) ──
    const gw = (CONTENT_W - gap * 2) / 3;
    for (let i = 0; i < GRID.length; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const cx = x0 + col * (gw + gap);
      const cy = y + row * (gw * 9 / 16 + 96);
      this.drawVideoCard(ctx, cx, cy, gw, GRID[i], i + 7);
    }
    y += Math.ceil(GRID.length / 3) * (gw * 9 / 16 + 96);

    return y;   // total content bottom (logical)
  }

  // A standard video card: thumbnail + duration badge + avatar + title + meta.
  drawVideoCard(ctx, x, y, w, data, seed) {
    const th = w * 9 / 16;
    const target = !!data.target;
    // thumbnail
    const col = target ? '#c9c9c9' : THUMB_COLORS[seed % THUMB_COLORS.length];
    drawHandRect(ctx, x, y, w, th, col, '#cfcfcf', seed * 11 + 5, 1.4);
    // faux thumbnail content — a couple of abstract shapes
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, th); ctx.clip();
    ctx.globalAlpha = target ? 0.25 : 0.35;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + w * 0.1, y + th * 0.55, w * 0.8, th * 0.34);
    ctx.globalAlpha = 1; ctx.restore();
    // duration badge
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    const bw = ctx.measureText(data.d).width;
    ctx.fillRect(x + w - bw - 22, y + th - 22, bw + 14, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(data.d, x + w - bw - 15, y + th - 14);
    // target marker — a faint grey "?" tile so it reads as "off"
    if (target) {
      ctx.fillStyle = 'rgba(120,120,120,0.55)';
      ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, y + th / 2); ctx.textAlign = 'left';
    }

    // avatar
    const ay = y + th + 14;
    ctx.fillStyle = target ? '#9a9a9a' : THUMB_COLORS[(seed + 3) % THUMB_COLORS.length];
    ctx.beginPath(); ctx.arc(x + 18, ay + 6, 16, 0, Math.PI * 2); ctx.fill();
    // title (2 lines, clipped)
    ctx.fillStyle = '#0f0f0f'; ctx.font = 'bold 15px Arial'; ctx.textBaseline = 'top';
    this.wrap(ctx, data.t, x + 46, ay - 6, w - 50, 19, 2);
    // channel + meta
    ctx.fillStyle = '#606060'; ctx.font = '13px Arial';
    ctx.fillText(data.c, x + 46, ay + 34);
    ctx.fillText(data.v + ' views  ·  ' + (target ? 'just now' : '2 hours ago'), x + 46, ay + 52);
  }

  drawShortCard(ctx, x, y, w, h, data, seed) {
    drawHandRect(ctx, x, y, w, h, THUMB_COLORS[(seed + 2) % THUMB_COLORS.length], '#cfcfcf', seed * 13 + 9, 1.4);
    // big emoji center
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '54px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(data.e, x + w / 2, y + h * 0.42);
    // caption
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial';
    this.wrapCentered(ctx, data.t, x + w / 2, y + h - 54, w - 16, 20, 2);
    ctx.textAlign = 'left';
    // views
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText((seed + 1) + '.' + seed + 'M views', x + w / 2, y + h - 14);
    ctx.textAlign = 'left';
  }

  // word-wrap helpers
  wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = text.split(' '); let line = '', yy = y, n = 0;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy); line = word; yy += lh; n++;
        if (n >= maxLines - 1) {
          // last line — truncate with ellipsis if needed
          let last = line;
          while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
          ctx.fillText((words.indexOf(word) < words.length - 1 ? last + '…' : line), x, yy);
          return;
        }
      } else line = test;
    }
    ctx.fillText(line, x, yy);
  }
  wrapCentered(ctx, text, cx, y, maxW, lh, maxLines) {
    const words = text.split(' '); let line = '', yy = y, n = 0; const lines = [];
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; n++; if (n >= maxLines) break; }
      else line = test;
    }
    if (lines.length < maxLines) lines.push(line);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, yy + i * lh);
  }
}
