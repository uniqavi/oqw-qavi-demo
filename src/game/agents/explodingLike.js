// Agent: the like button charges up, then explodes into 14 thumbs-up debris.
// Owns: the like button visual (idle / charging / exploded) and state.debris.
// Phaser-free.

import { AGENTS, DAMAGE } from '../../config.js';
import { dist, playerBox } from '../physics.js';
import { beep, noise } from '../audio.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.explodingLike;

export function update(agent, dt, state) {
  const p = state.player;
  const layout = state.layout;
  const cx = layout.likeBtn.x + layout.likeBtn.w / 2;
  const cy = layout.likeBtn.y + layout.likeBtn.h / 2;

  if (agent.state === 'idle') {
    if (dist(p.x, p.y, cx, cy) < agent.triggerR) {
      agent.state = 'charging';
      agent.charge = 0;
      beep(600, 0.05, 'square', 0.05);
    }
  } else if (agent.state === 'charging') {
    agent.charge += dt;
    if (agent.charge > T.chargeDuration) {
      agent.state = 'exploded';
      for (let i = 0; i < T.debrisCount; i++) {
        const angle = (i / T.debrisCount) * Math.PI * 2;
        const sp = T.debrisSpeedBase + Math.random() * T.debrisSpeedSpread;
        state.debris.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * sp,
          vy: Math.sin(angle) * sp,
          rot: 0, vrot: (Math.random() - 0.5) * 10,
          life: T.debrisLife, size: T.debrisSize,
        });
      }
      noise(0.3, 0.18);
      beep(110, 0.3, 'sawtooth', 0.12);
      agent.charge = 0;
    }
  } else if (agent.state === 'exploded') {
    agent.charge += dt;
    if (agent.charge > T.cooldownDuration) {
      agent.state = 'idle';
      agent.charge = 0;
    }
  }
}

// Debris physics + collision. Mutates state.debris in place.
export function updateProjectiles(state, dt) {
  for (const d of state.debris) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 200 * dt;
    d.vx *= 0.99;
    d.rot += d.vrot * dt;
    d.life -= dt;
    const pb = playerBox(state.player);
    if (d.x > pb.x && d.x < pb.x + pb.w && d.y > pb.y && d.y < pb.y + pb.h && d.life > 0.5) {
      damagePlayer(state, DAMAGE.explodingDebris);
      d.life = Math.min(d.life, 0.2);
    }
  }
  for (let i = state.debris.length - 1; i >= 0; i--) {
    if (state.debris[i].life <= 0) state.debris.splice(i, 1);
  }
}

// Render the like button reflecting agent state (idle / charging / exploded).
// Replaces the inline like-button drawing in GameScene.
export function drawButton(ctx, agent, state) {
  const lb = state.layout.likeBtn;
  const charging = agent.state === 'charging';
  const exploded = agent.state === 'exploded';
  const pulse = charging ? 1 + Math.sin(state.time * 30) * 0.05 : 1;
  const cx = lb.x + lb.w / 2;
  const cy = lb.y + lb.h / 2;

  // TELEGRAPH: visible charge ring that fills as the button approaches detonation.
  // Outer radius grows + thickens; gives the player a clear "back off NOW" cue.
  if (charging) {
    const T = 0.6; // charge duration from AGENTS.explodingLike.chargeDuration
    const progress = Math.min(1, agent.charge / T);
    const outerR = 22 + progress * (agent.triggerR - 22);
    ctx.save();
    // Outer warning ring
    ctx.strokeStyle = 'rgba(230, 57, 70, ' + (0.35 + progress * 0.5) + ')';
    ctx.lineWidth = 2 + progress * 3;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = state.time * -30;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Filled progress arc (top, clockwise)
    ctx.strokeStyle = 'rgba(255, 220, 60, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = exploded ? '#888' : (charging ? '#E63946' : '#fff');
  ctx.strokeStyle = '#1a1a1f';
  ctx.lineWidth = 1;
  ctx.fillRect(-lb.w / 2, -lb.h / 2, lb.w, lb.h);
  ctx.strokeRect(-lb.w / 2, -lb.h / 2, lb.w, lb.h);
  ctx.fillStyle = exploded ? '#fff' : (charging ? '#fff' : '#1a1a1f');
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('👍 1.4M', 0, 1);
  ctx.textAlign = 'left';
  ctx.restore();
}

export function drawProjectiles(ctx, state) {
  for (const d of state.debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life);
    ctx.fillStyle = '#F4D35E';
    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
    ctx.fillStyle = '#1a1a1f';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('👍', 0, 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
