// Wave-spawn enemy system for the runner-shooter rework.
//
// Enemies spawn JUST BELOW the viewport and fly UP at the player, tracking the
// player's x only briefly (homeDuration) then going straight up. On contact
// they damage the player, then blink/blast and vanish ON THE SPOT.
//
// Three flavours, evoking a sketchy "you clicked the wrong link" web page:
//   • rec   — a small SQUARE recommended-video card (easy to dodge)
//   • ad    — a fishy ad popup with double-meaning gamer/PC copy
//   • virus — a fake-antivirus "threat detected" popup
import { PW, WAVE } from '../config.js';
import { effectiveSize } from './playerSize.js';
import { beep, noise } from './audio.js';

const AD_TEXTS = [
  'DOWNLOAD MORE RAM — FREE',
  'YOUR DEVICE IS AT RISK!!',
  'CLEAR JUNK FROM STORAGE',
  'BOOST YOUR PHONE NOW',
  '1 WEIRD TRICK FOR FREE GBs',
  'YOU WON A FREE GPU',
  'HOT TABS IN YOUR SUBNET',
  'SPEED UP YOUR PC 300%',
];
const VIRUS_TEXTS = [
  '47 THREATS FOUND',
  'VIRUS DETECTED',
  'SYSTEM INFECTED',
  'TROJAN ON THIS PAGE',
];

const TYPES = {
  rec:   { shape: 'square', w: 56,  h: 56, color: '#E63946', damage: 10, weight: 5 },
  ad:    { shape: 'popup',  w: 132, h: 80, color: '#F4D35E', damage: 11, weight: 4 },
  virus: { shape: 'popup',  w: 124, h: 76, color: '#9b59b6', damage: 13, weight: 3 },
};

const SPAWN_TABLE = (() => {
  const t = [];
  for (const [k, def] of Object.entries(TYPES)) for (let i = 0; i < def.weight; i++) t.push(k);
  return t;
})();

export function spawn(state, camY, viewH) {
  const type = SPAWN_TABLE[Math.floor(Math.random() * SPAWN_TABLE.length)];
  const def = TYPES[type];
  const wx = 40 + Math.random() * Math.max(40, PW - def.w - 80);
  const wy = camY + viewH + 40 + Math.random() * 60;
  const text = type === 'ad' ? AD_TEXTS[Math.floor(Math.random() * AD_TEXTS.length)]
            : type === 'virus' ? VIRUS_TEXTS[Math.floor(Math.random() * VIRUS_TEXTS.length)]
            : 'rec';
  state.waveEnemies.push({
    type, wx, wy, text,
    w: def.w, h: def.h,
    vy: -WAVE.speed,        // constant slow speed (only the scroll ramps)
    age: 0, dying: 0,
  });
}

export function update(state, dt, viewH) {
  const p = state.player;
  const camY = state.scrollY;
  const list = state.waveEnemies;
  const immune = p.buffs.immune > 0 || (p.test && p.test.immune);

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const def = TYPES[e.type];
    if (!def) { list.splice(i, 1); continue; }

    if (e.dying > 0) {                       // blast-out, then remove
      e.dying -= dt;
      if (e.dying <= 0) list.splice(i, 1);
      continue;
    }

    e.age += dt;
    if (e.age < WAVE.homeDuration) {         // brief homing, then straight up
      const dx = p.x - (e.wx + e.w / 2);
      const step = WAVE.homingX * dt;
      if (Math.abs(dx) > 4) e.wx += Math.sign(dx) * Math.min(Math.abs(dx), step);
    }
    e.wy += e.vy * dt;

    if (e.wy + e.h < camY - 80) { list.splice(i, 1); continue; }

    const s = effectiveSize(p), ph = s * 0.75;
    const px = p.x - s / 2, py = p.y - ph / 2;
    const hit = e.wx < px + s && e.wx + e.w > px && e.wy < py + ph && e.wy + e.h > py;
    if (hit && e.dying <= 0) {
      if (!immune && p.invuln <= 0) {
        p.hp = Math.max(0, p.hp - def.damage);
        p.invuln = 0.6; p.hitFlash = 0.25;
        state.hitCount = (state.hitCount || 0) + 1;
        if (p.hp === 0) state.gameOver = true;
      }
      e.dying = 0.22;
      noise(0.08, 0.06); beep(180, 0.1, 'square', 0.08);
    }
  }
}

export function tickSpawner(state, dt, viewH) {
  state.waveSpawnT -= dt;
  if (state.waveSpawnT > 0) return false;
  const depthFactor = Math.min(1, state.scrollY / WAVE.rampDepth);
  const interval = WAVE.startInterval - (WAVE.startInterval - WAVE.minInterval) * depthFactor;
  state.waveSpawnT = Math.max(WAVE.minInterval, interval);
  spawn(state, state.scrollY, viewH);
  return true;
}

// ── Rendering ──
export function draw(ctx, state) {
  for (const e of state.waveEnemies) {
    const def = TYPES[e.type];
    if (!def) continue;

    if (e.dying > 0) { drawBlast(ctx, e, def); continue; }

    if (e.type === 'rec') drawRec(ctx, e, def, state);
    else if (e.type === 'ad') drawAd(ctx, e, def, state);
    else if (e.type === 'virus') drawVirus(ctx, e, def, state);

    // Up-arrow "incoming" marker on every type
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(e.wx + e.w / 2 - 7, e.wy + 2);
    ctx.lineTo(e.wx + e.w / 2 + 7, e.wy + 2);
    ctx.lineTo(e.wx + e.w / 2, e.wy - 6);
    ctx.closePath();
    ctx.fill();
  }
}

function pulseStroke(ctx, e, color, t) {
  const pulse = 0.5 + Math.sin(t * 8 + e.age * 3) * 0.5;
  ctx.strokeStyle = color.replace('ALPHA', (0.45 + pulse * 0.45).toFixed(2));
  ctx.lineWidth = 2;
  ctx.strokeRect(e.wx, e.wy, e.w, e.h);
}

function drawRec(ctx, e, def, state) {
  ctx.fillStyle = def.color;
  ctx.fillRect(e.wx, e.wy, e.w, e.h);
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(e.wx + 7, e.wy + 7, e.w - 14, e.h - 22);
  // play triangle
  ctx.fillStyle = '#fff';
  const cx = e.wx + e.w / 2, cy = e.wy + (e.h - 14) / 2 + 3;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 8); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 6, cy + 8);
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 8px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('rec', cx, e.wy + e.h - 4);
  ctx.textAlign = 'left';
  pulseStroke(ctx, e, 'rgba(255,255,255,ALPHA)', state.time);
}

function drawAd(ctx, e, def, state) {
  // Yellow popup with a title bar + fake close button + funny copy
  ctx.fillStyle = '#fff7d6';
  ctx.fillRect(e.wx, e.wy, e.w, e.h);
  ctx.fillStyle = def.color;
  ctx.fillRect(e.wx, e.wy, e.w, 18);
  ctx.fillStyle = '#1a1a1f';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('AD  ·  sponsored', e.wx + 6, e.wy + 9);
  // fake close
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(e.wx + e.w - 16, e.wy + 4, 11, 11);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('x', e.wx + e.w - 10, e.wy + 10);
  // copy (wrapped, kept inside the box)
  ctx.fillStyle = '#7a3b00';
  ctx.font = 'bold 10px sans-serif';
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  wrapText(ctx, e.text, e.wx + 8, e.wy + 24, e.w - 16, 12, 2);
  // fake button
  ctx.fillStyle = '#E63946';
  ctx.fillRect(e.wx + e.w / 2 - 34, e.wy + e.h - 22, 68, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CLAIM', e.wx + e.w / 2, e.wy + e.h - 14);
  ctx.textAlign = 'left';
  pulseStroke(ctx, e, 'rgba(230,57,70,ALPHA)', state.time);
}

function drawVirus(ctx, e, def, state) {
  // Dark scary "antivirus" popup
  ctx.fillStyle = '#15101c';
  ctx.fillRect(e.wx, e.wy, e.w, e.h);
  ctx.fillStyle = def.color;
  ctx.fillRect(e.wx, e.wy, e.w, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('⚠ SECURITY ALERT', e.wx + 6, e.wy + 9);
  // big warning glyph
  ctx.fillStyle = '#F4D35E';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚠', e.wx + 24, e.wy + e.h / 2 + 6);
  // text
  ctx.fillStyle = '#ffdde0';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  wrapText(ctx, e.text, e.wx + 42, e.wy + 28, e.w - 50, 14, 2);
  // scan button
  ctx.fillStyle = '#2D8659';
  ctx.fillRect(e.wx + e.w - 60, e.wy + e.h - 22, 52, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SCAN', e.wx + e.w - 34, e.wy + e.h - 14);
  ctx.textAlign = 'left';
  pulseStroke(ctx, e, 'rgba(155,89,182,ALPHA)', state.time);
}

function drawBlast(ctx, e, def) {
  const k = 1 - e.dying / 0.22;
  const cx = e.wx + e.w / 2, cy = e.wy + e.h / 2;
  const grow = 1 + k * 0.6;
  const blink = Math.floor(e.dying * 30) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.fillStyle = blink ? '#ffffff' : def.color;
  const bw = e.w * grow, bh = e.h * grow;
  ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - bw / 2 - 3, cy - bh / 2 - 3, bw + 6, bh + 6);
  ctx.restore();
}

// Tiny word-wrap helper (max `maxLines` lines, clipped to width).
function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(' ');
  let line = '', yy = y, lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = words[i]; yy += lineH; lines++;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}
