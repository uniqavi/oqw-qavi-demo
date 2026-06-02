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
    description: { x: 24,       y: 504,      w: 580, h: 100 },
    cookie:      { x: 0,        y: PH - 40,  w: PW,  h: 40  },
    subscribe:   { x: PW - 180, y: PH - 130, w: 160, h: 50  },
  };
}

export function createDocs() {
  return [
    { x: 200, y: 230, r: 13, taken: false, takeT: 0 },
    { x: 140, y: 880, r: 13, taken: false, takeT: 0 },
    { x: 780, y: 200, r: 13, taken: false, takeT: 0 },
    { x: 320, y: 670, r: 13, taken: false, takeT: 0 },
    { x: 800, y: 950, r: 13, taken: false, takeT: 0 },
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
