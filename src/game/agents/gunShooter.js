// Agent: the account avatar grows an arm holding a gun, aims at the player,
// fires one lethal bullet. Closing distance fast is the only dodge.
// Owns the account avatar visual + the arm + state.bullets.
// Phaser-free.

import { PW, PH, AGENTS, DAMAGE } from '../../config.js';
import { dist } from '../physics.js';
import { beep, noise } from '../audio.js';
import { playSfx } from '../sfx.js';
import { damagePlayer } from '../combat.js';

const T = AGENTS.gunShooter;

export function update(agent, dt, state) {
  const p = state.player;
  const muzzleX = () => agent.baseX + Math.cos(agent.currentAngle) * agent.armLength;
  const muzzleY = () => agent.baseY + Math.sin(agent.currentAngle) * agent.armLength;

  if (agent.state === 'idle') {
    if (dist(p.x, p.y, agent.baseX, agent.baseY) < agent.triggerR) {
      agent.state = 'awakening';
      agent.awakenT = 0;
      agent.armLength = 0;
      agent.currentAngle = Math.atan2(p.y - agent.baseY, p.x - agent.baseX);
      beep(120, 0.3, 'sawtooth', 0.08);
      beep(80, 0.3, 'sawtooth', 0.06);
    }
  } else if (agent.state === 'awakening') {
    agent.awakenT += dt;
    agent.armLength = Math.min(T.armMaxLength, agent.awakenT * T.armGrowSpeed);
    if (agent.awakenT >= T.awakenDuration) {
      agent.state = 'aiming';
      agent.aimT = 0;
    }
  } else if (agent.state === 'aiming') {
    agent.aimT += dt;
    const mx = muzzleX();
    const my = muzzleY();
    const targetAngle = Math.atan2(p.y - my, p.x - mx);
    let delta = targetAngle - agent.currentAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const maxRot = agent.rotateSpeed * dt;
    if (Math.abs(delta) < maxRot) agent.currentAngle = targetAngle;
    else agent.currentAngle += Math.sign(delta) * maxRot;
    if (Math.random() < 0.1) beep(2000, 0.01, 'square', 0.025);
    if (agent.aimT >= T.aimDuration) agent.state = 'firing';
  } else if (agent.state === 'firing') {
    const mx = muzzleX();
    const my = muzzleY();
    const fireDx = Math.cos(agent.currentAngle);
    const fireDy = Math.sin(agent.currentAngle);
    state.bullets.push({
      x: mx + fireDx * 40,
      y: my + fireDy * 40,
      vx: fireDx * T.bulletSpeed,
      vy: fireDy * T.bulletSpeed,
      life: T.bulletLife,
      damage: DAMAGE.gunBullet,
      trail: [],
    });
    for (let i = 0; i < 14; i++) {
      state.sparks.push({
        x: mx + fireDx * 40,
        y: my + fireDy * 40,
        vx: fireDx * 250 + (Math.random() - 0.5) * 150,
        vy: fireDy * 250 + (Math.random() - 0.5) * 150,
        life: 0.35, hit: true,
      });
    }
    noise(0.18, 0.2);
    beep(220, 0.18, 'square', 0.16);
    beep(80, 0.3, 'sawtooth', 0.12);
    playSfx('gun');
    agent.state = 'spent';
    agent.spentT = 0;
  } else if (agent.state === 'spent') {
    agent.spentT += dt;
    agent.armLength = Math.max(0, T.armMaxLength - agent.spentT * T.armRetractSpeed);
    if (agent.armLength <= 0) {
      agent.state = 'cooldown';
      agent.cooldown = T.cooldownDuration || 4;
    }
  } else if (agent.state === 'cooldown') {
    agent.cooldown -= dt;
    if (agent.cooldown <= 0) {
      agent.state = 'idle';
    }
  }
}

export function updateProjectiles(state, dt) {
  for (const b of state.bullets) {
    b.trail.push({ x: b.x, y: b.y, life: 0.18 });
    if (b.trail.length > 8) b.trail.shift();
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    const p = state.player;
    const s = p.size;
    const pbx = p.x - s / 2;
    const pby = p.y - s * 0.375;
    const pbw = s;
    const pbh = s * 0.75;
    if (b.x > pbx && b.x < pbx + pbw && b.y > pby && b.y < pby + pbh) {
      damagePlayer(state, b.damage, Math.sign(b.vx) * 30, Math.sign(b.vy) * 30);
      b.life = 0;
      for (let i = 0; i < 16; i++) {
        state.sparks.push({
          x: b.x, y: b.y, life: 0.4, hit: true,
          vx: (Math.random() - 0.5) * 400,
          vy: (Math.random() - 0.5) * 400,
        });
      }
    }
    const worldW = state.worldW || PW;
    if (b.x < 0 || b.x > worldW || b.y < 0 || b.y > PH) b.life = 0;
  }
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    if (state.bullets[i].life <= 0) state.bullets.splice(i, 1);
  }
}

// Draw the account avatar reflecting agent state, plus the arm if extended,
// plus the AIM laser dot when aiming. Replaces inline avatar drawing.
export function drawAvatar(ctx, agent, state) {
  const layout = state.layout;
  const isSpent = agent.state === 'spent' && agent.armLength <= 0;
  const isActive = agent.state !== 'idle' && agent.state !== 'spent';
  const isAwake = agent.state === 'awakening';
  const isAiming = agent.state === 'aiming';

  const cx = layout.account.x + layout.account.w / 2;
  const cy = layout.account.y + layout.account.h / 2;
  const r = layout.account.w / 2 - 1;

  ctx.fillStyle = isSpent ? '#666' : (isActive ? '#E63946' : '#4A7BC8');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isActive ? '#fff' : '#1a1a1f';
  ctx.lineWidth = isActive ? 1.5 : 1;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  const fontSize = Math.floor(layout.account.w * 0.45);
  ctx.font = 'bold ' + fontSize + 'px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(isSpent ? '✕' : 'U', cx, cy + 1);
  ctx.textAlign = 'left';

  if (isAwake || isAiming) {
    const pulse = 1 + Math.sin(state.time * 18) * 0.15;
    ctx.strokeStyle = 'rgba(230,57,70,' + (isAiming ? 0.7 : 0.5) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, (r + 3) * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (isActive) {
    const txt = isAwake ? '🔒 PREMIUM SECURITY ENGAGING' : isAiming ? '⚠ TARGET LOCK' : '';
    if (txt) {
      ctx.fillStyle = '#1a1a1f';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 12;
      ctx.fillRect(layout.account.x - w + 30, layout.account.y + layout.account.h + 6, w, 16);
      ctx.fillStyle = '#E63946';
      ctx.fillText(txt, layout.account.x - w + 36, layout.account.y + layout.account.h + 14);
    }
  }
  drawArm(ctx, agent, state);
}

function drawArm(ctx, agent, state) {
  if (agent.armLength <= 0) return;
  const mx = agent.baseX + Math.cos(agent.currentAngle) * agent.armLength;
  const my = agent.baseY + Math.sin(agent.currentAngle) * agent.armLength;
  ctx.strokeStyle = '#1a1a1f';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(agent.baseX, agent.baseY);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(agent.baseX, agent.baseY);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1f';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(agent.currentAngle);
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, -4, 14, 8);
  ctx.fillRect(-12, -3, 12, 6);
  ctx.fillRect(-12, 3, 4, 6);
  ctx.fillRect(3, 4, 4, 8);
  ctx.fillRect(14, -2, 22, 3);
  ctx.fillRect(2, -8, 10, 3);
  ctx.fillRect(4, -5, 2, 2);
  ctx.fillRect(8, -5, 2, 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(36, -3, 4, 5);
  ctx.restore();
  if (agent.state === 'aiming') {
    const dotPulse = 0.5 + Math.sin(state.time * 25) * 0.5;
    ctx.strokeStyle = 'rgba(230,57,70,' + (0.4 + dotPulse * 0.3) + ')';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(agent.currentAngle) * 40, my + Math.sin(agent.currentAngle) * 40);
    ctx.lineTo(mx + Math.cos(agent.currentAngle) * 2000, my + Math.sin(agent.currentAngle) * 2000);
    ctx.stroke();
    ctx.setLineDash([]);
    const dotX = mx + Math.cos(agent.currentAngle) * 250;
    const dotY = my + Math.sin(agent.currentAngle) * 250;
    ctx.fillStyle = 'rgba(230,57,70,' + (0.6 + dotPulse * 0.4) + ')';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawProjectiles(ctx, state) {
  for (const b of state.bullets) {
    for (let i = 0; i < b.trail.length; i++) {
      const t = b.trail[i];
      const a = (i / b.trail.length) * 0.6;
      ctx.fillStyle = 'rgba(230,57,70,' + a + ')';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3 + (i / b.trail.length) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1a1a1f';
    ctx.strokeStyle = '#E63946';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
