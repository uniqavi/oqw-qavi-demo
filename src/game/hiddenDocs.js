// Hidden-doc collectibles — the level's win-condition mechanic for the
// runner rework. Docs spawn from below the viewport at random X and drift
// UP (like the enemies and powerups), but they're invisible by default —
// only visible while the player's window is near (proximity-revealed, the
// "X-ray" idea). Touching a revealed doc collects it. After
// `state.docsTarget` (default 5) are collected, spawning stops and the
// scene flips into the "escape" state.
import { PW } from '../config.js';
import { effectiveSize } from './playerSize.js';
import { playSfx } from './sfx.js';

const DOC = {
  w: 36, h: 44,
  riseSpeed: 60,                // px/sec UP — slower than enemies so easier to catch
  // Rare on purpose — a full run (5 docs) should outlast the scroll-speed
  // ramp so the player reaches the fast phase before escaping.
  spawnIntervalMin: 15,         // seconds between spawns (random in this range)
  spawnIntervalMax: 26,
  revealRange: 160,             // window center within this distance → doc becomes visible
  enemyClearance: 150,          // min spawn distance from any live enemy
};

function spawn(state, camY, viewH) {
  // Pick a spawn X clear of enemies near the spawn line so a doc never pops
  // in on top of (or under) an enemy window. Best-of-N candidates.
  const spawnY = camY + viewH + 30 + Math.random() * 80;
  let bestX = 80 + Math.random() * Math.max(80, PW - DOC.w - 160);
  let bestClear = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const wx = 80 + Math.random() * Math.max(80, PW - DOC.w - 160);
    let clear = Infinity;
    for (const e of state.waveEnemies) {
      if (Math.abs(e.wy - spawnY) > 320) continue;    // only enemies near the spawn line matter
      clear = Math.min(clear, Math.hypot(e.wx + (e.w || 0) / 2 - wx, e.wy - spawnY));
    }
    if (clear >= DOC.enemyClearance + 100) { bestX = wx; bestClear = clear; break; }
    if (clear > bestClear) { bestClear = clear; bestX = wx; }
  }
  state.hiddenDocs.push({
    wx: bestX,
    wy: spawnY,
    w: DOC.w, h: DOC.h,
    vy: -DOC.riseSpeed,
    age: 0,
    reveal: 0,                  // 0..1 — proximity-driven visibility

    taken: false,
  });
}

// One-off timed BONUS doc (suggestion #3): bigger, blinking, on a deletion
// countdown. Grabbing it in time repairs one hit of glass. Extra credit —
// it never counts toward the win condition.
function spawnBonusDoc(state, camY, viewH) {
  state.hiddenDocs.push({
    wx: 120 + Math.random() * Math.max(80, PW - 240),
    wy: camY + viewH + 40,
    w: DOC.w * 1.5, h: DOC.h * 1.5,
    vy: -DOC.riseSpeed * 0.55,        // slower drift → catchable despite the timer
    age: 0, reveal: 1, taken: false,
    bonusTimed: true, ttl: 14,
  });
  playSfx('exportReady');
}

export function tick(state, dt, viewH) {
  // Stop spawning once the target is hit
  if (state.docsCollected < state.docsTarget) {
    state.hiddenDocSpawnT -= dt;
    if (state.hiddenDocSpawnT <= 0) {
      spawn(state, state.scrollY, viewH);
      state.hiddenDocSpawnT = DOC.spawnIntervalMin +
        Math.random() * (DOC.spawnIntervalMax - DOC.spawnIntervalMin);
    }
  }

  // The bonus doc appears once, after the second regular doc is secured
  if (!state.bonusDocSpawned && state.docsCollected >= 2) {
    state.bonusDocSpawned = true;
    spawnBonusDoc(state, state.scrollY, viewH);
  }

  const p = state.player;
  const s = effectiveSize(p), ph = s * 0.75;
  const px = p.x - s / 2, py = p.y - ph / 2;
  const pcx = p.x, pcy = p.y;
  // Magnet is active either via the MAGNET powerup buff OR the dev-panel toggle.
  const magnet = (p.buffs && p.buffs.magnet > 0) || (p.test && p.test.magnet);
  const MAGNET_RANGE = 320;     // px — docs within this get pulled to the player

  for (let i = state.hiddenDocs.length - 1; i >= 0; i--) {
    const d = state.hiddenDocs[i];
    if (d.taken) { state.hiddenDocs.splice(i, 1); continue; }
    d.wy += d.vy * dt;
    d.age += dt;

    // Timed bonus doc: deletion countdown
    if (d.bonusTimed) {
      d.ttl -= dt;
      if (d.ttl <= 0) { state.hiddenDocs.splice(i, 1); continue; }   // file deleted
    }

    // Magnet (testing) — pull nearby docs straight toward the player.
    if (magnet) {
      const mdx = pcx - (d.wx + d.w / 2);
      const mdy = pcy - (d.wy + d.h / 2);
      const md = Math.hypot(mdx, mdy) || 1;
      if (md < MAGNET_RANGE) {
        const pull = 600 * dt;     // strong attraction
        d.wx += (mdx / md) * Math.min(md, pull);
        d.wy += (mdy / md) * Math.min(md, pull);
        d.reveal = 1;              // magnetised docs are fully visible
      }
    }

    // Cull when fully above the viewport (uncollected docs just despawn)
    if (d.wy + d.h < state.scrollY - 60) { state.hiddenDocs.splice(i, 1); continue; }

    // Proximity reveal — distance from window center to doc center
    const dcx = d.wx + d.w / 2;
    const dcy = d.wy + d.h / 2;
    const distance = Math.hypot(pcx - dcx, pcy - dcy);
    const target = distance < DOC.revealRange
      ? (1 - distance / DOC.revealRange)
      : 0;
    // Smooth reveal so it fades in / out as you approach / leave
    d.reveal += (target - d.reveal) * Math.min(1, dt * 7);

    // Simple touch-to-collect — just overlap the doc to grab it
    const overlapping =
      d.wx < px + s && d.wx + d.w > px &&
      d.wy < py + ph && d.wy + d.h > py;
    d._near = overlapping;
    if (overlapping) d.reveal = 1;    // covered docs are always fully visible
    if (overlapping) {
      d.taken = true;
      state.hiddenDocs.splice(i, 1);
      playSfx('docScan');
      if (d.bonusTimed) {
        // Glass repair — extra credit, not part of the win condition
        const pl = state.player;
        pl.hp = Math.min(pl.maxHp, pl.hp + 1);
        state.bonusCollected = (state.bonusCollected || 0) + 1;
        playSfx('heal');
        state.floatingTexts.push({
          wx: d.wx + d.w / 2, wy: d.wy, text: 'GLASS REPAIRED', color: '#6dc89e',
          age: 0, life: 1.4,
        });
      } else {
        state.docsCollected++;
      }
    }
  }
}

export function draw(ctx, state) {
  for (const d of state.hiddenDocs) {
    if (d.taken) continue;
    const r = d.reveal;
    // Much more visible now (the light-yellow-on-white was too hard to spot).
    // Stays clearly readable even at zero reveal; brightens further when near.
    const ambient = 0.85;
    let alpha = Math.min(1, Math.max(ambient, r));
    ctx.save();

    // Timed bonus doc: hard blink + deletion countdown above it
    if (d.bonusTimed) {
      const urgent = d.ttl < 6;
      alpha = Math.sin(state.time * (urgent ? 12 : 6)) > -0.4 ? 1 : 0.25;
      ctx.globalAlpha = 1;
      ctx.fillStyle = urgent ? '#E63946' : '#1a1a1f';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DELETING IN ' + Math.ceil(d.ttl) + 's', d.wx + d.w / 2, d.wy - 22);
      ctx.textAlign = 'left';
    }
    // Soft halo grows with reveal
    if (r > 0.2) {
      ctx.globalAlpha = r * 0.5;
      ctx.fillStyle = '#F4D35E';
      ctx.fillRect(d.wx - 8, d.wy - 8, d.w + 16, d.h + 16);
    }
    ctx.globalAlpha = alpha;
    // Drop shadow so it pops against the white page
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    // A deeper-gold body reads better on white than the pale yellow
    ctx.fillStyle = '#F2C200';
    ctx.fillRect(d.wx, d.wy, d.w, d.h);
    ctx.restore();
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.wx, d.wy, d.w, d.h);
    // Dog-ear corner
    ctx.fillStyle = '#d4b94a';
    ctx.beginPath();
    ctx.moveTo(d.wx + d.w - 10, d.wy);
    ctx.lineTo(d.wx + d.w, d.wy + 10);
    ctx.lineTo(d.wx + d.w - 10, d.wy + 10);
    ctx.closePath();
    ctx.fill();
    // Text lines
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(d.wx + 5, d.wy + 16, d.w - 10, 2);
    ctx.fillRect(d.wx + 5, d.wy + 22, d.w - 14, 2);
    ctx.fillRect(d.wx + 5, d.wy + 28, d.w - 8,  2);
    ctx.fillRect(d.wx + 5, d.wy + 34, d.w - 20, 2);
    // Pulsing border when fully revealed
    if (r > 0.6) {
      const pulse = 0.6 + Math.sin(state.time * 8 + d.age * 5) * 0.4;
      ctx.strokeStyle = 'rgba(244, 211, 94, ' + (0.5 + pulse * 0.5) + ')';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(d.wx - 2, d.wy - 2, d.w + 4, d.h + 4);
    }

    ctx.restore();
  }
}
