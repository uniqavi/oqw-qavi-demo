// Agent: the search bar charges then fires 5 text projectiles toward the
// player. Owns state.projectiles and the search bar visual.
// Phaser-free.

import { AGENTS, DAMAGE } from '../../config.js';
import { dist, playerBox } from '../physics.js';
import { beep, noise } from '../audio.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.shootingSearch;
const SHOT_TEXTS = [
  '"hidden truth"',
  '"is it safe"',
  '"how to escape"',
  '"who watches"',
  '"what they hide"',
];

export function update(agent, dt, state) {
  const p = state.player;
  const search = state.layout.search;
  const cx = search.x + search.w / 2;
  const cy = search.y + search.h / 2;

  if (agent.state === 'idle') {
    if (dist(p.x, p.y, cx, cy) < agent.triggerR && p.y < T.yMaxTrigger) {
      agent.state = 'charging';
      agent.charge = 0;
      beep(900, 0.04, 'square', 0.04);
      beep(1100, 0.04, 'square', 0.04);
    }
  } else if (agent.state === 'charging') {
    agent.charge += dt;
    if (agent.charge > T.chargeDuration) {
      agent.state = 'firing';
      agent.cooldown = 0;
      agent.shotsLeft = T.shotsPerVolley;
    }
  } else if (agent.state === 'firing') {
    agent.cooldown -= dt;
    if (agent.cooldown <= 0 && agent.shotsLeft > 0) {
      const sx = cx;
      const sy = search.y + search.h;
      const dx = p.x - sx;
      const dy = p.y - sy;
      const d = Math.hypot(dx, dy) || 1;
      state.projectiles.push({
        x: sx, y: sy,
        vx: (dx / d) * T.projectileSpeed,
        vy: (dy / d) * T.projectileSpeed,
        life: T.projectileLife,
        text: SHOT_TEXTS[agent.shotsLeft - 1] || '"???"',
      });
      agent.shotsLeft--;
      agent.cooldown = T.fireInterval;
      beep(1400, 0.04, 'square', 0.05);
      noise(0.04, 0.05);
    }
    if (agent.shotsLeft <= 0) {
      agent.state = 'cooldown';
      agent.cooldown = T.cooldownDuration;
    }
  } else if (agent.state === 'cooldown') {
    agent.cooldown -= dt;
    if (agent.cooldown <= 0) agent.state = 'idle';
  }
}

export function updateProjectiles(state, dt) {
  for (const pr of state.projectiles) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    const pb = playerBox(state.player);
    if (pr.x > pb.x && pr.x < pb.x + pb.w && pr.y > pb.y && pr.y < pb.y + pb.h) {
      damagePlayer(state, DAMAGE.searchProjectile);
      pr.life = 0;
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].life <= 0) state.projectiles.splice(i, 1);
  }
}

export function drawBar(ctx, agent, state) {
  const s = state.layout.search;
  const charging = agent.state === 'charging' || agent.state === 'firing';
  ctx.fillStyle = charging ? '#ffe5e5' : '#fff';
  ctx.strokeStyle = charging ? '#E63946' : '#bbb';
  ctx.lineWidth = charging ? 2 : 1;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = charging ? '#E63946' : '#888';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(charging ? 'searching for: targets...' : 'search totallynormaltube',
    s.x + 10, s.y + s.h / 2);
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(s.x + s.w - 36, s.y, 36, s.h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText('🔍', s.x + s.w - 26, s.y + s.h / 2);
  if (charging) {
    const pulse = 1 + Math.sin(state.time * 25) * 0.3;
    ctx.strokeStyle = 'rgba(230,57,70,' + (0.4 * pulse) + ')';
    ctx.lineWidth = 3;
    ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
  }
}

export function drawProjectiles(ctx, state) {
  for (const pr of state.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(Math.atan2(pr.vy, pr.vx));
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(-25, -8, 50, 16);
    ctx.fillStyle = '#E63946';
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(pr.text || '???', 0, 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
