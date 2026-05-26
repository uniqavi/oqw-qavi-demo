// Menu background effects — layered on top of the static menu-bg.png image
// with a transparent canvas overlay. Adds living/breathing motion to the
// otherwise static scene: dust in the projector beam, steam from the coffee
// mug, rain streaks on the window, faint twinkles on the city lights.
//
// Spawn rates are tuned for ambient density (not too noisy). All particle
// counts cap so we never exceed ~120 active particles, which is trivial
// for any modern device.
//
// Coordinate system: percentage-based (0..1) of canvas width/height so the
// effects stay anchored to the image regardless of viewport size. Eyeballed
// from the menu-bg.png composition — adjust the REGIONS constants if the
// art changes.

const REGIONS = {
  // Projector beam — cone from the projector lens to the wall projection.
  // We parameterize as a "point source → rectangle target": each particle
  // picks a random point inside the wall rectangle, then a t ∈ [0,1] along
  // the line from projector to that point. This naturally produces a cone
  // dense near the projector and spread across the wall.
  beam: {
    projector: { x: 0.42, y: 0.88 },  // projector lens position
    wall:      { x: 0.03, y: 0.03, w: 0.43, h: 0.66 },  // wall projection rect
  },
  // Coffee mug — small upward steam wisp
  mug:    { x: 0.80, y: 0.66, w: 0.03, h: 0.04 },
  // Window — rain streaks fall down inside this rectangle
  window: { x: 0.65, y: 0.05, w: 0.25, h: 0.48 },
  // City lights inside the window — random twinkles
  city:   { x: 0.66, y: 0.12, w: 0.23, h: 0.32 },
};

const PARTICLE_LIMITS = {
  dust:    50,
  rain:    14,
  steam:    6,
  twinkle: 12,
};

// Each effect type owns its own particle array; menuEffects.update() does
// one pass per type to spawn + animate + cull.

export class MenuEffects {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = {
      dust:    [],
      rain:    [],
      steam:   [],
      twinkle: [],
    };
    this.lastT = performance.now();
    this.running = false;
    this.handleResize = this.handleResize.bind(this);
    this.tick = this.tick.bind(this);
  }

  start() {
    if (!this.canvas || this.running) return;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Drop particles so next start() begins fresh
    for (const k of Object.keys(this.particles)) this.particles[k] = [];
  }

  handleResize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.round(rect.width  * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = rect.width;
    this.H = rect.height;
  }

  tick(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;

    this.updateDust(dt);
    this.updateRain(dt);
    this.updateSteam(dt);
    this.updateTwinkles(dt);

    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  }

  // ===== DUST in the projector beam =====
  updateDust(dt) {
    const arr = this.particles.dust;
    // Spawn rate: ~12 particles/sec
    if (arr.length < PARTICLE_LIMITS.dust && Math.random() < dt * 12) {
      // Spawn inside the beam cone: pick a random point on the wall
      // rectangle, then a t ∈ [0,1] along the line from projector to
      // that point. Result is a natural cone — narrow near projector,
      // wide at the wall.
      const r = REGIONS.beam;
      const wallX = r.wall.x + Math.random() * r.wall.w;
      const wallY = r.wall.y + Math.random() * r.wall.h;
      // Bias t slightly toward middle/wall (more visible dust there)
      const t = 0.15 + Math.random() * 0.85;
      const px = r.projector.x + (wallX - r.projector.x) * t;
      const py = r.projector.y + (wallY - r.projector.y) * t;
      arr.push({
        x: px * this.W,
        y: py * this.H,
        vx: (Math.random() - 0.5) * 6,
        vy: -8 - Math.random() * 12,  // slow upward drift
        life: 0,
        maxLife: 2.5 + Math.random() * 2.5,
        size: 0.7 + Math.random() * 1.3,
        alpha: 0.18 + Math.random() * 0.22,
      });
    }
    for (const p of arr) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += (Math.random() - 0.5) * 5 * dt;   // subtle Brownian motion
    }
    this.particles.dust = arr.filter(p => p.life < p.maxLife);
  }

  // ===== RAIN streaks on the window =====
  updateRain(dt) {
    const arr = this.particles.rain;
    if (arr.length < PARTICLE_LIMITS.rain && Math.random() < dt * 4) {
      const r = REGIONS.window;
      arr.push({
        x: (r.x + Math.random() * r.w) * this.W,
        y: (r.y + Math.random() * 0.05) * this.H,
        vy: 60 + Math.random() * 40,
        len: 8 + Math.random() * 12,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.4,
        alpha: 0.18 + Math.random() * 0.22,
      });
    }
    for (const p of arr) {
      p.life += dt;
      p.y += p.vy * dt;
    }
    // Cull when off the window region
    const winBottom = (REGIONS.window.y + REGIONS.window.h) * this.H;
    this.particles.rain = arr.filter(p => p.y < winBottom && p.life < p.maxLife);
  }

  // ===== STEAM from the coffee mug =====
  updateSteam(dt) {
    const arr = this.particles.steam;
    if (arr.length < PARTICLE_LIMITS.steam && Math.random() < dt * 2) {
      const r = REGIONS.mug;
      arr.push({
        x: (r.x + Math.random() * r.w) * this.W,
        y: (r.y + r.h) * this.H,
        vx: (Math.random() - 0.5) * 6,
        vy: -12 - Math.random() * 8,
        life: 0,
        maxLife: 3.0 + Math.random() * 1.5,
        size: 4 + Math.random() * 4,
      });
    }
    for (const p of arr) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += dt * 4;
    }
    this.particles.steam = arr.filter(p => p.life < p.maxLife);
  }

  // ===== TWINKLES on city lights through the window =====
  updateTwinkles(dt) {
    const arr = this.particles.twinkle;
    if (arr.length < PARTICLE_LIMITS.twinkle && Math.random() < dt * 3) {
      const r = REGIONS.city;
      // Distinct color: warm (orange) or cool (teal-blue)
      const warm = Math.random() < 0.6;
      arr.push({
        x: (r.x + Math.random() * r.w) * this.W,
        y: (r.y + Math.random() * r.h) * this.H,
        life: 0,
        maxLife: 0.7 + Math.random() * 1.4,
        size: 1.0 + Math.random() * 1.4,
        warm,
      });
    }
    for (const p of arr) p.life += dt;
    this.particles.twinkle = arr.filter(p => p.life < p.maxLife);
  }

  // ===== Render all particle layers =====
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.W, this.H);

    // Dust — small pale specks
    for (const p of this.particles.dust) {
      const fadeIn = Math.min(1, p.life / 0.4);
      const fadeOut = Math.min(1, (p.maxLife - p.life) / 0.6);
      const a = p.alpha * fadeIn * fadeOut;
      ctx.fillStyle = 'rgba(220, 230, 245, ' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rain — short vertical streaks
    for (const p of this.particles.rain) {
      ctx.strokeStyle = 'rgba(200, 215, 230, ' + p.alpha + ')';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + p.len);
      ctx.stroke();
    }

    // Steam — soft expanding circles, warm-tinted
    for (const p of this.particles.steam) {
      const fadeOut = (p.maxLife - p.life) / p.maxLife;
      const a = 0.10 * fadeOut;
      ctx.fillStyle = 'rgba(220, 220, 220, ' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Twinkles — tiny bright pulses on city lights
    for (const p of this.particles.twinkle) {
      const norm = p.life / p.maxLife;
      const pulse = Math.sin(norm * Math.PI);
      const color = p.warm ? '255, 175, 90' : '120, 200, 220';
      ctx.fillStyle = 'rgba(' + color + ', ' + (pulse * 0.75) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.7 + pulse * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
