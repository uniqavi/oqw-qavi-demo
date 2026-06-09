// Single source of truth for the player window's effective size — used by
// collision (waveEnemies, powerups, hiddenDocs) and the player render so they
// stay in sync. The window shrinks with HP (visual + collider both), and the
// SIZE+ powerup multiplies on top of that. Floor of 40% so the window can't
// disappear entirely even at 1 HP.
import { POWERUP } from '../config.js';

export const HP_SIZE_FLOOR = 0.45;   // 45% size at 0 HP

export function effectiveSize(p) {
  const hpRatio = Math.max(0, p.hp / p.maxHp);
  const hpScale = HP_SIZE_FLOOR + (1 - HP_SIZE_FLOOR) * hpRatio;
  const big = p.buffs.size > 0 || (p.test && p.test.size);
  const buffScale = big ? POWERUP.sizeMul : 1;
  return p.size * hpScale * buffScale;
}
