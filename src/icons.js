/**
 * The few icons a character can't do honestly.
 *
 * Everything in the rail is a text glyph, which keeps the whole toolbar in one
 * typeface and one weight for free. Three things have no glyph worth using: a
 * link (the emoji is coloured and shouts), and the two drawing tools, which are
 * literally pictures of what they draw.
 *
 * Built with `createElementNS` rather than an innerHTML string, so nothing here
 * can ever become a place markup gets injected.
 */

const NS = "http://www.w3.org/2000/svg";

function svg(paths, { size = 18, fill = false } = {}) {
  const root = document.createElementNS(NS, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("width", String(size));
  root.setAttribute("height", String(size));
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");

  root.setAttribute("fill", fill ? "currentColor" : "none");
  root.setAttribute("stroke", fill ? "none" : "currentColor");
  root.setAttribute("stroke-width", "1.8");
  root.setAttribute("stroke-linecap", "round");
  root.setAttribute("stroke-linejoin", "round");

  for (const d of paths) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    root.appendChild(path);
  }

  return root;
}

/** A paperclip — the attachment mark everything else uses for "a link". */
export const linkIcon = () =>
  svg([
    "M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 0 1-3-3l7.5-7.5",
  ]);

/** A plain diagonal stroke. */
export const lineIcon = () => svg(["M4 20 20 4"]);

/** The same stroke, with a head on it. */
export const arrowIcon = () => svg(["M4 20 20 4", "M20 10V4h-6"]);

/** Two strokes, for the Draw tool that opens them both. */
export const drawIcon = () => svg(["M4 16 14 6", "M9 20l11-11", "M20 13V9h-4"]);
