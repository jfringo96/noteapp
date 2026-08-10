export const CANVAS_SIZE = 5000;
export const HISTORY_LIMIT = 50;

/**
 * Images are downscaled hard on import. This is a planning tool, not a photo
 * library, and there's no zoom to expose the loss — a 4MB phone photo lands
 * around 200KB, which also keeps gallery exports small enough to AirDrop.
 */
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_QUALITY = 0.8;

/** How large a newly imported image card is on the canvas, longest edge. */
export const IMAGE_CARD_EDGE = 300;

export const CARD_TYPES = ["text", "list", "image", "board"];

export const TYPE_LABEL = {
  text: "Text",
  list: "List",
  image: "Image",
  board: "Board",
};

/** Breadcrumbs are capped so a cycle of boards can't grow them forever. */
export const TRAIL_MAX = 10;
export const BACK_MAX = 50;

/** Cards whose top bar can be tinted, for colour-coding a board. */
export const ACCENTABLE = ["text", "list"];

/** What the colour picker opens on before a card has been tinted. */
export const ACCENT_DEFAULT = "#e8dfcc";

export const MIN_SIZE = {
  text: { w: 140, h: 80 },
  list: { w: 160, h: 62 },
  image: { w: 90, h: 70 },
  board: { w: 150, h: 74 },
};

export const DEFAULT_SIZE = {
  text: { w: 260, h: 160 },
  list: { w: 240, h: 150 },
  image: { w: 280, h: 200 },
  board: { w: 210, h: 92 },
};

export const uid = (prefix) => prefix + "_" + Math.random().toString(36).slice(2, 9);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const EXTENSIONS = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export const extensionFor = (mime) => EXTENSIONS[mime] || ".bin";

/** The file an image card refers to. Derived, never stored. */
export const imageFileName = (card) => card.imageId + extensionFor(card.mime);

/**
 * Is this colour dark enough that icons on top of it need to be light?
 * Rec. 709 luma, which tracks perceived brightness closely enough here.
 */
export function isDarkColour(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!match) return false;

  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}
