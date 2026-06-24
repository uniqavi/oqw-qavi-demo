// Agent: the cookie banner pushes upward to crush the player when they
// approach the bottom of the page. Mutates state.layout.cookie y/h.
// Phaser-free.
//
// Trigger key off the banner's current home position (agent.homeY) rather
// than the page bottom (PH=1e9), so the agent works correctly in both the
// scroller (banner pinned at PH-40) and Phase A static (banner pinned in
// the visible viewport).

import { AGENTS, DAMAGE } from '../../config.js';
import { beep } from '../audio.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.crushingCookie;

export function update(agent, dt, state) {
  const p = state.player;
  const layout = state.layout;
  const homeY = agent.homeY ?? layout.cookie.y;
  const homeH = agent.homeH ?? 40;

  if (agent.state === 'idle') {
    if (p.y > homeY - agent.triggerR) {
      agent.state = 'crushing';
      agent.vy = 0;
      beep(180, 0.4, 'sawtooth', 0.1);
    }
  } else if (agent.state === 'crushing') {
    agent.vy = T.crushSpeed;
    layout.cookie.y -= agent.vy * dt;
    layout.cookie.h += agent.vy * dt;
    if (p.y > layout.cookie.y) damagePlayer(state, DAMAGE.crushingCookie, 0, T.knockY);
    if (layout.cookie.y < p.y - 100 || layout.cookie.y < homeY - 240) {
      agent.state = 'returning';
    }
  } else if (agent.state === 'returning') {
    layout.cookie.y += (homeY - layout.cookie.y) * Math.min(1, dt * 2);
    layout.cookie.h += (homeH - layout.cookie.h) * Math.min(1, dt * 2);
    if (Math.abs(layout.cookie.y - homeY) < 1) {
      layout.cookie.y = homeY;
      layout.cookie.h = homeH;
      agent.state = 'idle';
    }
  }
}

// Render the cookie banner reflecting agent state. Replaces inline cookie
// banner drawing in GameScene.
export function drawBanner(ctx, agent, state) {
  const cb = state.layout.cookie;
  const crushing = agent.state === 'crushing' || agent.state === 'returning';
  const p = state.player;
  // Telegraph: when player is close to the trigger but not yet crushing,
  // a warning shadow appears on the floor under the banner. Gives the
  // player a visible "back away or face the wall" signal.
  if (agent.state === 'idle') {
    // Distance from the banner's home (top edge) — works for both Phase A
    // (banner pinned near viewport bottom) and Phase B (PH-40, far away).
    const homeY = agent.homeY ?? cb.y;
    const distFromBottom = (homeY - p.y);
    const proximity = 1 - Math.min(1, distFromBottom / agent.triggerR);
    if (proximity > 0.05) {
      const flash = 0.35 + Math.sin(state.time * 14) * 0.15 * proximity;
      ctx.save();
      ctx.fillStyle = 'rgba(230, 57, 70, ' + (flash * proximity) + ')';
      // Striped warning hatch above the banner
      const stripeH = 14;
      const stripeY = cb.y - stripeH;
      ctx.fillRect(cb.x, stripeY, cb.w, stripeH);
      ctx.strokeStyle = 'rgba(255, 220, 60, ' + (0.6 * proximity) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(cb.x, cb.y - 1);
      ctx.lineTo(cb.x + cb.w, cb.y - 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  ctx.fillStyle = crushing ? '#E63946' : '#1a1a1f';
  ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('🍪 we use cookies. and other things. accept everything?', cb.x + 16, cb.y + 14);
  ctx.fillStyle = '#2D8659';
  ctx.fillRect(cb.x + cb.w - 240, cb.y + 6, 100, 22);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('ACCEPT ALL', cb.x + cb.w - 190, cb.y + 17);
  ctx.fillStyle = '#444';
  ctx.fillRect(cb.x + cb.w - 130, cb.y + 6, 100, 22);
  ctx.fillStyle = '#fff';
  ctx.fillText('also accept all', cb.x + cb.w - 80, cb.y + 17);
  ctx.textAlign = 'left';
}
