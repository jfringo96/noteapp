/**
 * Lines and arrows.
 *
 * A line is a card like any other, which is what gets it undo, saving, z-order
 * and dragging for nothing. What it is NOT is a connector: it is not attached to
 * the cards near it and moving one doesn't drag the other along. Free-standing
 * strokes are a different thing from the connector arrows the spec rules out,
 * and they stay a different thing.
 *
 * GEOMETRY. The card keeps the ordinary `x, y, w, h` box, and the line runs
 * along one of its two diagonals — which one is `dir`. That is the whole trick:
 * dragging the card moves the box and the line comes with it, with no special
 * case anywhere in gestures.js.
 *
 *   dir "nw-se":  (x, y) ────→ (x+w, y+h)
 *   dir "ne-sw":  (x+w, y) ──→ (x, y+h)
 *
 * `reversed` says the arrowhead belongs on the first corner instead of the
 * second, so a line drawn right-to-left points the way it was drawn.
 *
 * HIT AREA. The card's box is a rectangle and the line is a thin diagonal
 * across it, so the box is the wrong thing to click. Everything here is
 * `pointer-events: none` except a fat transparent stroke lying under the
 * visible one — you click near the line, not near its bounding box.
 */

import { applyChange, getCard, select } from "../store.js";
import { CANVAS_SIZE, LINE_COLOUR, LINE_WIDTH_DEFAULT, clamp } from "../constants.js";

const NS = "http://www.w3.org/2000/svg";

/** How wide the invisible clickable stroke is, whatever the visible one does. */
const GRAB_WIDTH = 16;

/* ------------------------------------------------------------- geometry --- */

/** The two ends, in draw order — `from` is the tail, `to` wears the head. */
export function endpoints(card) {
  const first =
    card.dir === "ne-sw" ? { x: card.x + card.w, y: card.y } : { x: card.x, y: card.y };
  const second =
    card.dir === "ne-sw" ? { x: card.x, y: card.y + card.h } : { x: card.x + card.w, y: card.y + card.h };

  return card.reversed ? { from: second, to: first } : { from: first, to: second };
}

/** The card fields for a line drawn from one point to another. */
export function fromPoints(ax, ay, bx, by) {
  const x = Math.round(Math.min(ax, bx));
  const y = Math.round(Math.min(ay, by));
  const w = Math.round(Math.abs(bx - ax));
  const h = Math.round(Math.abs(by - ay));

  // Same sign on both deltas means the stroke runs top-left to bottom-right.
  const dir = (bx - ax) * (by - ay) >= 0 ? "nw-se" : "ne-sw";

  // Is B the corner this diagonal calls "second"? If not, the head belongs on
  // the other end, so the arrow points where the drag finished.
  //
  // Both axes have to be checked. Comparing x alone gets every vertical line
  // wrong — dragged upwards, B and "second" share an x and the arrow ends up
  // on the wrong end.
  const second = dir === "ne-sw" ? { x, y: y + h } : { x: x + w, y: y + h };
  const reversed = !(Math.round(bx) === second.x && Math.round(by) === second.y);

  return { x, y, w, h, dir, reversed };
}

/* ---------------------------------------------------------------- build --- */

export function build(card, el, body, scroller) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "line-svg");
  svg.setAttribute("overflow", "visible");

  // The click target. Invisible, wide, and under the visible stroke.
  const grab = document.createElementNS(NS, "line");
  grab.setAttribute("class", "line-grab");
  grab.setAttribute("stroke", "transparent");
  grab.setAttribute("stroke-width", String(GRAB_WIDTH));
  grab.setAttribute("stroke-linecap", "round");

  const stroke = document.createElementNS(NS, "line");
  stroke.setAttribute("class", "line-stroke");
  stroke.setAttribute("stroke-linecap", "round");

  // Drawn as a path rather than an SVG marker, because a marker inherits the
  // stroke width and ends up a different size for every line weight.
  const head = document.createElementNS(NS, "path");
  head.setAttribute("class", "line-head");
  head.setAttribute("fill", "none");
  head.setAttribute("stroke-linecap", "round");
  head.setAttribute("stroke-linejoin", "round");

  svg.append(grab, stroke, head);

  const ends = [handle(card, "from", scroller, el), handle(card, "to", scroller, el)];
  svg.append(...ends);

  body.appendChild(svg);

  el.__lineSvg = svg;
  el.__lineGrab = grab;
  el.__lineStroke = stroke;
  el.__lineHead = head;
  el.__lineHandles = ends;

  // The fat transparent stroke is the only part of a line worth grabbing, so it
  // is what carries the drag rather than the card's box.
  el.__dragSurface = grab;
}

export function update(card, el) {
  const { from, to } = endpoints(card);

  // The SVG is positioned at the card's origin, so points are relative to it.
  const a = { x: from.x - card.x, y: from.y - card.y };
  const b = { x: to.x - card.x, y: to.y - card.y };

  for (const line of [el.__lineGrab, el.__lineStroke]) {
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
  }

  const colour = card.stroke || LINE_COLOUR;
  const width = card.thickness || LINE_WIDTH_DEFAULT;

  el.__lineStroke.setAttribute("stroke", colour);
  el.__lineStroke.setAttribute("stroke-width", String(width));

  // A dash pattern in absolute units looks wrong at every other weight, so it
  // is expressed as multiples of the stroke width.
  el.__lineStroke.setAttribute("stroke-dasharray", card.dashed ? `${width * 3} ${width * 2.5}` : "");

  el.__lineHead.setAttribute("stroke", colour);
  el.__lineHead.setAttribute("stroke-width", String(width));
  el.__lineHead.setAttribute("d", card.head === "arrow" ? arrowPath(a, b, width) : "");

  const [fromHandle, toHandle] = el.__lineHandles;
  place(fromHandle, a);
  place(toHandle, b);
}

/** The two strokes of the head, sized from the line's weight. */
function arrowPath(a, b, width) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const length = Math.max(9, width * 3.5);
  const spread = 0.45; // radians either side

  const wing = (offset) => ({
    x: b.x - length * Math.cos(angle - offset),
    y: b.y - length * Math.sin(angle - offset),
  });

  const left = wing(spread);
  const right = wing(-spread);

  return `M${left.x} ${left.y} L${b.x} ${b.y} L${right.x} ${right.y}`;
}

function place(handle, point) {
  handle.setAttribute("cx", String(point.x));
  handle.setAttribute("cy", String(point.y));
}

/* ------------------------------------------------------------- handles --- */

/**
 * A draggable end. Only visible while the line is selected — see the CSS, which
 * is also what stops them taking the pointer the rest of the time.
 *
 * Moves pixels during the drag and commits once on release, the same rule every
 * other gesture follows: a line dragged across the board should be one entry in
 * the undo stack, not two hundred.
 */
function handle(card, which, scroller, el) {
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("class", "line-handle");
  dot.setAttribute("r", "5");
  dot.dataset.end = which;

  dot.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation(); // not a card drag, and not a canvas pan

    select(card.id);

    const live = getCard(card.id);
    if (!live) return;

    const box = scroller.getBoundingClientRect();
    const toCanvas = (e) => ({
      x: clamp(e.clientX - box.left + scroller.scrollLeft, 0, CANVAS_SIZE),
      y: clamp(e.clientY - box.top + scroller.scrollTop, 0, CANVAS_SIZE),
    });

    const ends = endpoints(live);
    const anchor = which === "from" ? ends.to : ends.from;

    let latest = null;

    const move = (moveEvent) => {
      const point = toCanvas(moveEvent);

      // The end being dragged is B when it's the head end, so the arrow keeps
      // pointing at the end you are actually moving.
      latest =
        which === "to"
          ? fromPoints(anchor.x, anchor.y, point.x, point.y)
          : fromPoints(point.x, point.y, anchor.x, anchor.y);

      const target = getCard(card.id);
      if (!target) return;

      // Straight onto the object and redraw this one card — no history and no
      // full render, the same rule every other gesture follows.
      Object.assign(target, latest);
      el.style.left = target.x + "px";
      el.style.top = target.y + "px";
      el.style.width = target.w + "px";
      el.style.height = target.h + "px";
      update(target, el);
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);

      if (!latest) return;

      // One history entry for the whole drag.
      applyChange(() => {
        const target = getCard(card.id);
        if (target) Object.assign(target, latest);
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  });

  return dot;
}
