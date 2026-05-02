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

export function createPropaganda() {
  return [{ x: 50, y: 850, w: 220, h: 130, dragging: false, dox: 0, doy: 0 }];
}

export function createTruth() {
  return [{ x: 80, y: 880, w: 160, h: 90 }];
}
