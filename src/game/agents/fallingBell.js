// Agent: the bell icon rumbles and falls if the player passes below it.
// Phaser-free.

import { PH, AGENTS, DAMAGE } from '../../config.js';
import { dist, aabb, playerBox } from '../physics.js';
import { beep, noise } from '../audio.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.fallingBell;

export function update(agent, dt, state) {
  const p = state.player;
  const slot = state.layout.bellBtn;
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;

  if (agent.state === 'idle') {
    agent.x = slot.x;
    agent.y = slot.y;
    // Trigger if player goes below the bell: p.y > slot.y + slot.h and p.x is horizontally aligned
    if (p.y > slot.y + slot.h && Math.abs(p.x - cx) < (slot.w / 2 + T.triggerW)) {
      agent.state = 'rumbling';
      agent.life = 0;
      beep(180, 0.4, 'sawtooth', 0.08);
    }
  } else if (agent.state === 'rumbling') {
    agent.life += dt;
    agent.x = slot.x + Math.sin(agent.life * 30) * 3;
    if (agent.life > T.rumbleDuration) {
      agent.state = 'falling';
      agent.vy = 0;
    }
  } else if (agent.state === 'falling') {
    agent.vy += T.gravity * dt;
    agent.y += agent.vy * dt;
    
    // Collision detection with player
    const bellBox = { x: agent.x, y: agent.y, w: slot.w, h: slot.h };
    if (aabb(playerBox(p), bellBox)) {
      damagePlayer(state, DAMAGE.fallingBell, 0, T.knockY);
      agent.state = 'returning';
      beep(90, 0.3, 'square', 0.1);
      noise(0.2, 0.12);
    }
    if (agent.y > PH) agent.state = 'returning';
  } else if (agent.state === 'returning') {
    agent.y += (slot.y - agent.y) * Math.min(1, dt * 2);
    agent.x += (slot.x - agent.x) * Math.min(1, dt * 2);
    agent.vy = 0;
    if (dist(agent.x, agent.y, slot.x, slot.y) < 5) agent.state = 'idle';
  }
}

export function drawAgent(ctx, agent, state) {
  const slot = state.layout.bellBtn;

  // Warning shadow/outline during rumble
  if (agent.state === 'rumbling') {
    const T = AGENTS.fallingBell.rumbleDuration;
    const progress = Math.min(1, agent.life / T);
    if (state) {
      const shadowY = agent.y + slot.h + 80;
      const flash = 0.3 + Math.sin(state.time * 22) * 0.2;
      ctx.save();
      ctx.fillStyle = 'rgba(230, 57, 70, ' + (flash * progress) + ')';
      ctx.fillRect(agent.x, shadowY, slot.w, 10);
      ctx.strokeStyle = 'rgba(255, 220, 60, ' + (0.6 * progress) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(agent.x, shadowY, slot.w, 10);
      ctx.restore();
    }
    // Red flash border around bell
    const borderFlash = 0.5 + Math.sin(state ? state.time * 30 : 0) * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 57, 70, ' + borderFlash + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(agent.x - 2, agent.y - 2, slot.w + 4, slot.h + 4);
    ctx.restore();
  }

  // Draw the actual bell button
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1a1a1f';
  ctx.lineWidth = 1;
  ctx.fillRect(agent.x, agent.y, slot.w, slot.h);
  ctx.strokeRect(agent.x, agent.y, slot.w, slot.h);
  ctx.fillStyle = '#1a1a1f';
  ctx.font = '14px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('🔔', agent.x + slot.w / 2, agent.y + slot.h / 2 + 1);
  ctx.restore();
}
