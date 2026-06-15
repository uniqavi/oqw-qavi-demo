// Player damage helper. Phaser-free — agents and projectile loops can import this.

import { PLAYER, getDifficulty } from '../config.js';
import { beep, noise } from './audio.js';

export function damagePlayer(state, amount, knockX, knockY) {
  const p = state.player;
  if (p.invuln > 0) return;
  if (p.test && p.test.immune) return;        // dev immune toggle
  // Apply difficulty modifier so EASY hits land softer, HARD lands harder.
  const dmg = amount * getDifficulty().agentDamage;
  // Two damage models share this path. The runner / Level 1.1 use an HP bar
  // (p.useHp) where the window stays a fixed size and an HP pool drains; the
  // original discovery design shrank the window itself. Death is hp<=0 or
  // size<=deathSize respectively.
  if (p.useHp) {
    p.hp = Math.max(0, p.hp - dmg);
  } else {
    p.size = Math.max(0, p.size - dmg);
  }
  p.invuln = PLAYER.invulnDuration;
  p.hitFlash = PLAYER.hitFlashDuration;
  if (knockX !== undefined) {
    p.x += knockX;
    p.y += knockY;
  }
  // Track for results screen
  state.stats.damageTaken += dmg;
  state.stats.hitsReceived++;

  noise(0.12, 0.14);
  beep(140, 0.18, 'sawtooth', 0.09);
  for (let i = 0; i < 8; i++) {
    state.sparks.push({
      x: p.x, y: p.y, life: 0.4, hit: true,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200,
    });
  }
  const dead = p.useHp ? p.hp <= 0 : p.size <= PLAYER.deathSize;
  if (dead) {
    state.status = 'lost';
    state.lostReason = 'GARBAGE COLLECTED';
    state.stats.endedAt = state.time;
    noise(0.6, 0.2);
    beep(80, 0.5, 'square', 0.12);
  }
}
