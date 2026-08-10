export const CANVAS_SIZE = 5000;
export const HISTORY_LIMIT = 50;

export const MIN_SIZE = {
  text: { w: 140, h: 80 },
};

export const DEFAULT_SIZE = {
  text: { w: 260, h: 160 },
};

export const uid = (prefix) => prefix + "_" + Math.random().toString(36).slice(2, 9);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
