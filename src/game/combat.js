// Player damage helper. Phaser-free — agents and projectile loops can import this.

import { PLAYER, getDifficulty } from '../config.js';
import { beep, noise } from './audio.js';

export function damagePlayer(state, amount, knockX, knockY, ignoreInvuln = false) {
  const p = state.player;
  if (p.invuln > 0 && !ignoreInvuln) return;
  if (p.test && p.test.immune) return;        // dev immune toggle
  // Apply difficulty modifier so EASY hits land softer, HARD lands harder.
  const dmg = amount * getDifficulty().agentDamage;
  // Three damage models share this path:
  //   • p.useHits — discrete hits (Level 1.1 lethality redesign): hp counts
  //     hits remaining; every hit costs 1, heavy hitters (gun, amount>=60)
  //     cost 2. No difficulty multiplier — the forgiveness levers there are
  //     the invuln window and agent trigger ranges.
  //   • p.useHp — HP pool (the 1.2 runner), window stays a fixed size.
  //   • legacy — the original discovery design shrank the window itself.
  if (p.useHits) {
    p.hp = Math.max(0, p.hp - (amount >= 70 ? 2 : 1));
  } else if (p.useHp) {
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
