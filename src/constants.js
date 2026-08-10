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

export const CARD_TYPES = ["text", "list", "image", "swatch"];

export const TYPE_LABEL = {
  text: "Text",
  list: "List",
  image: "Image",
  swatch: "Swatch",
};

export const MIN_SIZE = {
  text: { w: 140, h: 80 },
  list: { w: 160, h: 62 },
  image: { w: 90, h: 70 },
  swatch: { w: 110, h: 120 },
};

export const DEFAULT_SIZE = {
  text: { w: 260, h: 160 },
  list: { w: 240, h: 150 },
  image: { w: 280, h: 200 },
  swatch: { w: 150, h: 176 },
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
