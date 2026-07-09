// Shared "WINDOW CRASHED" death screen — drawn on canvas, identical across all levels.
// Matches Level 1.1 (HomeScene) exactly:
//   • Dark red-tinted fullscreen backdrop
//   • "WINDOW CRASHED" title in red
//   • Subtitle: "The page's security caught up with you."
//   • Hint line: "press  R  to retry   ·   ESC for menu"

/**
 * Draw the unified crash/death overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} vw  Viewport width  (un-transformed, screen pixels)
 * @param {number} vh  Viewport height (un-transformed, screen pixels)
 */
export function drawCrashScreen(ctx, vw, vh) {
  ctx.save();
  // Reset any camera/world transform so we draw in raw screen space.
  // Keep the devicePixelRatio scale — vw/vh are CSS pixels, and the canvas
  // backing store is dpr× larger (identity here left the overlay covering
  // only the top-left quarter on retina displays).
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Dark backdrop
  ctx.fillStyle = 'rgba(20,2,6,0.82)';
  ctx.fillRect(0, 0, vw, vh);

  const cx = vw / 2;
  const cy = vh / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title
  ctx.fillStyle = '#E63946';
  ctx.font = "bold 40px 'Saira Condensed', sans-serif";
  ctx.fillText('WINDOW CRASHED', cx, cy - 40);

  // Subtitle
  ctx.fillStyle = '#f0f0f0';
  ctx.font = "20px 'Saira Condensed', sans-serif";
  ctx.fillText("The page's security caught up with you.", cx, cy + 4);

  // Hint
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText('press  R  to retry   ·   ESC for menu', cx, cy + 44);

  ctx.textAlign = 'left';
  ctx.restore();
}

