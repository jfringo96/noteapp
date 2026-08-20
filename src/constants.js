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

export const CARD_TYPES = ["text", "list", "image", "link", "place", "board", "column"];

/**
 * Lines are a card type, but not one of the above.
 *
 * `CARD_TYPES` is what the rail and the double-click picker offer, and a line
 * is not placed by clicking — it is dragged out point to point. It gets its own
 * Draw button instead, and never appears in a list of things to drop.
 */
export const LINE_TYPE = "line";

/** How a line is drawn: its own colour, weight and dash, not a card tint. */
export const LINE_COLOUR = "#2b3240";
export const LINE_WIDTHS = [1, 2, 3, 5, 8];
export const LINE_WIDTH_DEFAULT = 2;

/** Below this, a drag was a click that wobbled rather than a line. */
export const LINE_MIN_LENGTH = 12;

export const TYPE_LABEL = {
  text: "Text",
  list: "List",
  image: "Image",
  link: "Link",
  place: "Place",
  board: "Board",
  column: "Column",
  line: "Line",
};

export const TYPE_GLYPH = {
  text: "T",
  list: "☰",
  image: "▣",
  link: "↗",
  place: "◎",
  board: "▢",
  column: "▥",
  line: "╱",
};

/**
 * Columns hold cards — including boards — but never another column.
 * One level of nesting, no recursion. This is Milanote's rule and it is what
 * keeps drag, layout and lookup tractable.
 */
export const COLUMNABLE = ["text", "list", "image", "link", "place", "board"];

/**
 * Every collection has a Home board, and it is always this id.
 *
 * Home is the root the Map draws from and the first crumb in every trail, so
 * it cannot be renamed or deleted — a collection with no root would leave the
 * Map with nothing to hang boards off and breadcrumbs starting nowhere.
 */
export const HOME_ID = "b_home";
export const HOME_TITLE = "Home";

/**
 * How long a board's name may be.
 *
 * A board is a fixed tile, so the name has a fixed amount of room: two lines
 * under the thumbnail, about eleven characters each at this width and weight.
 * The number is set to what those two lines genuinely hold, so a name that is
 * accepted is a name you can read — the cap exists to stop text disappearing,
 * and a cap that still allowed a third line would not.
 *
 * Raising it means widening the tile in DEFAULT_SIZE.board to match.
 */
export const BOARD_NAME_MAX = 22;

/** What an unnamed board is called once you stop typing without naming it. */
export const UNTITLED_BOARD = "Untitled board";

/** How deep the Map will draw before it stops following a chain of boards. */
export const MAP_MAX_DEPTH = 12;

/** Breadcrumbs are capped so a cycle of boards can't grow them forever. */
export const TRAIL_MAX = 10;
export const BACK_MAX = 50;

/** Cards whose top bar can be tinted, for colour-coding a board. */
export const ACCENTABLE = ["text", "list", "link", "place", "column"];

/**
 * Cards the inspector offers a colour for. Boards are here too, but they wear
 * it on their thumbnail rather than a top bar — they haven't got one.
 */
export const COLOURABLE = ["text", "list", "link", "place", "column", "board"];

/**
 * Boards are a fixed-size tile, like Milanote. Nothing to drag bigger.
 *
 * A line has no resize handle either — it is resized by dragging either end,
 * which is the same thing said in the shape of the object.
 */
export const NO_RESIZE = ["board", "line"];

/** What the colour picker opens on before a card has been tinted. */
export const ACCENT_DEFAULT = "#e8dfcc";

export const MIN_SIZE = {
  text: { w: 140, h: 80 },
  list: { w: 160, h: 62 },
  image: { w: 90, h: 70 },
  link: { w: 150, h: 66 },
  place: { w: 150, h: 66 },
  board: { w: 78, h: 130 },
  column: { w: 200, h: 140 },
  line: { w: 1, h: 1 },
};

export const DEFAULT_SIZE = {
  text: { w: 260, h: 160 },
  list: { w: 240, h: 150 },
  image: { w: 280, h: 200 },
  link: { w: 240, h: 84 },
  place: { w: 240, h: 84 },
  // A smallish tile: a square thumbnail, then up to two lines of name and the
  // count under it. Boards never resize, so this is the size, always — see
  // `normalise()` in store.js, which holds existing cards to it too.
  board: { w: 98, h: 152 },
  column: { w: 270, h: 340 },
  // Never used to place one — a line's box comes from the drag that drew it —
  // but makeCard reads this for every type.
  line: { w: 160, h: 100 },
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

/** The other way round, for a file on disk we know only by its name. */
const MIME_FOR = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mime, extension]) => [extension, mime])
);

export function mimeForFile(name) {
  const dot = String(name).lastIndexOf(".");
  return dot < 0 ? null : MIME_FOR[String(name).slice(dot).toLowerCase()] || null;
}

/** The id half of an image filename — `img_7fq2xk9.webp` becomes `img_7fq2xk9`. */
export function imageIdFromFile(name) {
  const dot = String(name).lastIndexOf(".");
  return dot < 0 ? String(name) : String(name).slice(0, dot);
}

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
