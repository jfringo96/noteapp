/**
 * Card chrome, and dispatch to the per-type modules.
 *
 * Elements are built once and reused — see canvas.js — so `build` runs rarely
 * and `update` runs on every render. `update` must therefore be safe to call
 * while a field inside the card has focus.
 *
 * Each type module exports `build(card, el, body, scroller)`, optionally
 * `update(card, el)`, and optionally `buildGrip(card, el, rail)`.
 *
 * A card is rendered in one of two contexts: loose on the canvas, where it is
 * absolutely positioned and resizable, or inside a column, where it is a row in
 * a stack and its geometry belongs to the column.
 */

import { ACCENTABLE, ACCENT_DEFAULT, isDarkColour } from "../constants.js";
import { commitEdit, deleteCard, getCard, select, stashEdit, touch } from "../store.js";
import { attachDrag, attachResize } from "../gestures.js";

import * as text from "./text.js";
import * as list from "./list.js";
import * as image from "./image.js";
import * as board from "./board.js";
import * as column from "./column.js";

const TYPES = { text, list, image, board, column };

// Columns render their contents with the same builder that renders the canvas.
// Injected rather than imported, because column.js is imported here — a plain
// import back would be a cycle.
column.setItemRenderer({ build: buildCard, update: updateCard });

export function buildCard(card, scroller, options = {}) {
  const inColumn = !!options.inColumn;

  const el = document.createElement("div");
  el.className = "card card-" + card.type + (inColumn ? " is-in-column" : "");
  el.dataset.id = card.id;
  el.__inColumn = inColumn;

  const type = TYPES[card.type];

  const grip = document.createElement("div");
  grip.className = "card-grip";
  grip.title = "Drag to move";

  const rail = document.createElement("div");
  rail.className = "card-grip-rail";
  grip.appendChild(rail);

  if (ACCENTABLE.includes(card.type)) buildAccent(card, el, rail);
  if (type && type.buildGrip) type.buildGrip(card, el, rail);

  const del = document.createElement("button");
  del.className = "card-delete";
  del.type = "button";
  del.textContent = "×";
  del.title = "Delete card";
  del.setAttribute("aria-label", "Delete card");
  del.addEventListener("click", () => deleteCard(card.id));
  grip.appendChild(del);

  const body = document.createElement("div");
  body.className = "card-body";

  el.__grip = grip;

  if (type) {
    type.build(card, el, body, scroller);
  } else {
    // A type we no longer support — a swatch from an older board, say. Say so
    // rather than rendering a blank card or, worse, throwing and taking the
    // whole board down.
    const note = document.createElement("p");
    note.className = "card-unknown";
    note.textContent = `Unsupported card (${card.type}) — delete it`;
    body.appendChild(note);
  }

  el.append(grip, body);

  // Clicking anywhere on a card selects it. Safe because selection only
  // changes z-index and a class — it never rebuilds the DOM, which would
  // destroy the element the click is landing on.
  el.addEventListener("pointerdown", () => select(card.id));

  // Inside a column a card has no size of its own: it is as wide as the column
  // and as tall as its content. Only canvas cards get a resize handle.
  if (!inColumn) {
    const resize = document.createElement("div");
    resize.className = "card-resize";
    resize.title = "Drag to resize";
    el.appendChild(resize);
    attachResize(resize, el, card.id, scroller);
  }

  // Pictures and boards drag from anywhere on the card. They have no text to
  // select, and on a picture the grip is an overlay you have to find first.
  // Everything with editable text keeps the grip, so dragging never fights
  // selecting a word.
  const surface = WHOLE_CARD_DRAG.includes(card.type) ? el : grip;
  attachDrag(surface, el, card.id, scroller, { lifted: inColumn });

  return el;
}

const WHOLE_CARD_DRAG = ["image", "board"];

export function updateCard(el, card, index, selectedId) {
  // Geometry belongs to the column when the card is in one.
  if (!el.__inColumn) {
    el.style.left = card.x + "px";
    el.style.top = card.y + "px";
    el.style.width = card.w + "px";
    el.style.height = card.h + "px";
    el.style.zIndex = String(index + 1);
  }

  el.classList.toggle("is-selected", card.id === selectedId);

  if (ACCENTABLE.includes(card.type)) {
    paintAccent(el, card.accent);
    if (el.__accentPicker && document.activeElement !== el.__accentPicker) {
      el.__accentPicker.value = card.accent || ACCENT_DEFAULT;
    }
  }

  const type = TYPES[card.type];
  if (type && type.update) type.update(card, el);
}

/* ---------------------------------------------------------------- accent --- */

/**
 * Tinting the top bar, for colour-coding a board by eye.
 *
 * A native colour input, for the same reason the old swatch card used one:
 * the OS picker is better than anything worth building here, and it costs one
 * element.
 */
function buildAccent(card, el, rail) {
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "card-accent";
  picker.value = card.accent || ACCENT_DEFAULT;
  picker.title = "Change this card's colour";
  picker.setAttribute("aria-label", "Card colour");

  picker.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;

    stashEdit();
    target.accent = picker.value;
    paintAccent(el, picker.value);
    touch();
  });

  // Dragging around the colour wheel fires input continuously; change fires
  // once when the dialog is dismissed. That is the end of the editing session.
  picker.addEventListener("change", commitEdit);

  el.__accentPicker = picker;
  rail.appendChild(picker);
}

function paintAccent(el, colour) {
  const grip = el.__grip;
  if (!grip) return;

  grip.style.background = colour || "";
  grip.classList.toggle("is-dark", !!colour && isDarkColour(colour));
}
