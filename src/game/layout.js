import { PW, PH } from '../config.js';

// Static slot geometry — never mutated
export const recSlots = (() => {
  const arr = [];
  for (let i = 0; i < 8; i++) arr.push({ x: 620, y: 70 + i * 96, w: 320, h: 86, idx: i });
  return arr;
})();

export const commentSlots = (() => {
  const arr = [];
  for (let i = 0; i < 4; i++) arr.push({ x: 24, y: 620 + i * 100, w: 580, h: 88, idx: i });
  return arr;
})();

// Page chrome layout. cookie.y / cookie.h animate during the crushing-cookie attack,
// so this is a factory rather than a frozen const.
export function createLayout() {
  return {
    nav:         { x: 0,        y: 0,        w: PW,  h: 50  },
    logo:        { x: 16,       y: 12,       w: 140, h: 26  },
    search:      { x: 280,      y: 14,       w: 380, h: 24  },
    account:     { x: 880,      y: 14,       w: 60,  h: 24  },
    video:       { x: 24,       y: 70,       w: 580, h: 340 },
    title:       { x: 24,       y: 422,      w: 580, h: 30  },
    likeBtn:     { x: 24,       y: 462,      w: 80,  h: 30  },
    dislikeBtn:  { x: 110,      y: 462,      w: 60,  h: 30  },
    shareBtn:    { x: 178,      y: 462,      w: 80,  h: 30  },
    bellBtn:     { x: 374,      y: 462,      w: 34,  h: 30  },
    description: { x: 24,       y: 504,      w: 580, h: 100 },
    cookie:      { x: 0,        y: PH - 40,  w: PW,  h: 40  },
    subscribe:   { x: 266,      y: 462,      w: 100, h: 30  },
  };
}

// Phase-A docs — 5 fixed positions on the static YouTube page. Constrained
// to y ≤ ~370 because the visible viewport at fit-zoom is ~960×450 and the
// player y-clamp tops out around 378. The scroll is locked during Phase A.
export function createDocs() {
  return [
    { x: 110, y: 60,  r: 13, taken: false, takeT: 0 }, // top-left by the logo
    { x: 640, y: 80,  r: 13, taken: false, takeT: 0 }, // top of rec sidebar
    { x: 920, y: 250, r: 13, taken: false, takeT: 0 }, // far right edge
    { x: 200, y: 370, r: 13, taken: false, takeT: 0 }, // bottom-left under video
    { x: 480, y: 380, r: 13, taken: false, takeT: 0 }, // centre-bottom row
  ];
}

export function createCookieJar() {
  return { x: 460, y: 1050, r: 24, taken: false, takeT: 0 };
}

// The suspicious comment — sits INLINE in the comment column (slot 2),
// sized exactly like a real comment. It looks normal but greyer ("fishy").
// Dragging it off its home spot reveals the hidden passage (the hole) behind.
export function createPropaganda() {
  const slot = commentSlots[2]; // { x:24, y:820, w:580, h:88 }
  return [{
    x: slot.x, y: slot.y, w: slot.w, h: slot.h,
    homeX: slot.x, homeY: slot.y,
    dragging: false, dox: 0, doy: 0, revealed: false,
  }];
}

// The hidden passage (hole), occupying the same slot — revealed when the
// suspicious comment is dragged away. This is the level's escape route.
export function createTruth() {
  const slot = commentSlots[2];
  return [{ x: slot.x, y: slot.y, w: slot.w, h: slot.h }];
}

// Hidden-truth fragments for the X-ray scan mechanic (see docs/LEVEL1.md §2).
// Each fragment has an anchor rect (for the window-overlap test + the glow),
// a text origin (tx/ty, top-baseline), the visible "lie" and the hidden
// "truth". `style: 'text'` draws the lie as page text; `style: 'redaction'`
// draws it as a censored bar (no visible text until scanned). Coordinates
// match the page chrome drawn in GameScene.render().
export function createScanFragments() {
  return [
    {
      id: 'title', style: 'text',
      x: 24, y: 420, w: 440, h: 26, tx: 24, ty: 422,
      font: 'bold 16px sans-serif', color: '#1a1a1f',
      visible: "What They Don't Want You To See (full doc)",
      hidden:  'PROJECT WHITEWASH — [CLASSIFIED]',
      progress: 0, scanned: false,
    },
    {
      id: 'uploader', style: 'text',
      x: 34, y: 512, w: 380, h: 16, tx: 34, ty: 514,
      font: '11px sans-serif', color: '#1a1a1f',
      visible: 'UnknownUploader  •  847K views  •  posted ████████',
      hidden:  'authorized by MAX  •  [BOT TRAFFIC]  •  metrics FALSIFIED',
      progress: 0, scanned: false,
    },
    {
      id: 'memo', style: 'redaction',
      x: 34, y: 582, w: 430, h: 14, tx: 36, ty: 583,
      font: '11px sans-serif', color: '#1a1a1f',
      visible: '',
      hidden:  'the public stays bored. bored stays quiet.',
      progress: 0, scanned: false,
    },
  ];
}

// Phase-A gaze mechanic. Each gazeProp is a draggable "ad" window. Each
// gazeTruth is a hidden tracker rect. While a tracker is NOT covered by any
// prop, the gaze meter rises; once the meter fills, a hunter cursor spawns.
// Props start covering trackers — the player has to drag them aside to grab
// the docs underneath, then re-cover before gaze maxes out.
export function createGazeProps() {
  // Three small "ad" windows positioned to initially cover the three truths.
  // Roughly the same size as the truths so a small nudge exposes them. Y
  // values constrained to the Phase-A viewport (~960×450 at fit zoom).
  return [
    { x: 60,  y: 220, w: 130, h: 60, homeX: 60,  homeY: 220, dragging: false, dox: 0, doy: 0, label: 'AD' },
    { x: 770, y: 130, w: 130, h: 60, homeX: 770, homeY: 130, dragging: false, dox: 0, doy: 0, label: 'PROMOTED' },
    { x: 300, y: 300, w: 130, h: 60, homeX: 300, homeY: 300, dragging: false, dox: 0, doy: 0, label: 'SPONSORED' },
  ];
}

export function createGazeTruths() {
  // Same footprint as the props (so a prop on its home spot fully covers it).
  return [
    { x: 60,  y: 220, w: 130, h: 60 },
    { x: 770, y: 130, w: 130, h: 60 },
    { x: 300, y: 300, w: 130, h: 60 },
  ];
}

export function createLooseCookies() {
  return [
    { x: 100, y: 160, r: 6, taken: false, takeT: 0 },
    { x: 130, y: 180, r: 6, taken: false, takeT: 0 },
    { x: 160, y: 200, r: 6, taken: false, takeT: 0 },
    
    { x: 520, y: 300, r: 6, taken: false, takeT: 0 },
    { x: 540, y: 330, r: 6, taken: false, takeT: 0 },
    { x: 560, y: 360, r: 6, taken: false, takeT: 0 },

    { x: 200, y: 550, r: 6, taken: false, takeT: 0 },
    { x: 230, y: 580, r: 6, taken: false, takeT: 0 },
    { x: 260, y: 610, r: 6, taken: false, takeT: 0 },

    { x: 800, y: 100, r: 6, taken: false, takeT: 0 },
    { x: 830, y: 120, r: 6, taken: false, takeT: 0 },
    { x: 860, y: 140, r: 6, taken: false, takeT: 0 }
  ];
}
