// Agent: one of the comment rows rumbles, then falls onto the player.
// Owns the "agent comment" rendering (the regular idle comments are drawn
// by GameScene). Phaser-free.

import { PH, AGENTS, DAMAGE } from '../../config.js';
import { commentSlots } from '../layout.js';
import { aabb, playerBox, dist } from '../physics.js';
import { beep, noise } from '../audio.js';
import { drawComment } from '../draw.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.fallingComment;

export function update(agent, dt, state) {
  const p = state.player;
  const slot = commentSlots[agent.commentIdx];
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;

  if (agent.state === 'idle') {
    agent.x = slot.x;
    agent.y = slot.y;
    if (dist(p.x, p.y, cx, cy) < agent.triggerR) {
      agent.state = 'rumbling';
      agent.life = 0;
      beep(120, 0.4, 'sawtooth', 0.08);
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
    if (aabb(playerBox(p), agent)) {
      damagePlayer(state, DAMAGE.fallingComment, 0, T.knockY);
      agent.state = 'returning';
      beep(80, 0.3, 'square', 0.1);
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

// Returns true if the comment slot at idx is currently the falling/rumbling
// agent (so GameScene can skip drawing the idle version of that slot).
export function isAgentSlot(agent, idx) {
  return agent.commentIdx === idx && agent.state !== 'idle';
}

// Draw the agent comment at its current x/y with state-aware styling.
export function drawAgent(ctx, agent) {
  const slot = commentSlots[agent.commentIdx];
  drawComment(ctx, agent.x, agent.y, slot.w, slot.h, agent.commentIdx, true, agent.state);
}
