// Glass-crack health display, shared by every level (Phaser-free canvas
// helpers). The player window IS the health bar: each hit taken grows a
// cluster of jagged cracks on the glass; healing repairs the newest cluster.
// Scenes keep an array of clusters and call spawnCrackClusters / drawCracks.

// One cluster of jagged crack lines. Coordinates are relative to the window
// centre so cracks ride along with the player. `w`/`h` are the window size
// the cluster should fit inside.
export function spawnCrackClusters(cracks, units, w, h) {
  for (let u = 0; u < units; u++) {
    const ox = (Math.random() - 0.5) * w * 0.7;
    const oy = (Math.random() - 0.3) * h * 0.6;
    const lines = [];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.7;
      const len = (18 + Math.random() * 30) * Math.min(1, w / 120);
      const pts = [{ x: ox, y: oy }];
      let px = ox, py = oy, a = ang;
      const segs = 3 + Math.floor(Math.random() * 2);
      for (let s = 0; s < segs; s++) {
        a += (Math.random() - 0.5) * 0.9;
        px += Math.cos(a) * (len / segs);
        py += Math.sin(a) * (len / segs);
        pts.push({ x: px, y: py });
      }
      lines.push(pts);
    }
    cracks.push({ ox, oy, lines });
  }
}

// Sync the crack list against the player's hit count: grows clusters when hp
// drops, repairs the newest cluster(s) when hp rises (heal powerup). Returns
// the new lastHp. Call once per frame from the scene's update.
export function syncCracksToHp(cracks, lastHp, hp, w, h) {
  if (hp < lastHp) spawnCrackClusters(cracks, lastHp - hp, w, h);
  else if (hp > lastHp) cracks.splice(-(hp - lastHp));
  return hp;
}

// Draw all clusters clipped to the window rect (cx/cy = window centre).
export function drawCracks(ctx, cracks, cx, cy, w, h) {
  if (!cracks.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, cy - h / 2, w, h);
  ctx.clip();
  for (const c of cracks) {
    // impact shatter point
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(cx + c.ox, cy + c.oy, 2.5, 0, Math.PI * 2); ctx.fill();
    for (const pts of c.lines) {
      ctx.strokeStyle = 'rgba(26,26,31,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + pts[0].x, cy + pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(cx + pts[i].x, cy + pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
