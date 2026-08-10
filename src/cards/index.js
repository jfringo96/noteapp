/**
 * Card chrome, and dispatch to the per-type modules.
 *
 * Elements are built once and reused — see canvas.js — so `build` runs rarely
 * and `update` runs on every render. `update` must therefore be safe to call
 * while a field inside the card has focus.
 *
 * Each type module exports `build(card, el, body)`, optionally
 * `update(card, el)`, and optionally `buildGrip(card, el, rail)`.
 */

import { ACCENTABLE, ACCENT_DEFAULT, isDarkColour } from "../constants.js";
import { commitEdit, deleteCard, getCard, select, stashEdit, touch } from "../store.js";
import { attachDrag, attachResize } from "../gestures.js";

import * as text from "./text.js";
import * as list from "./list.js";
import * as image from "./image.js";
import * as board from "./board.js";

const TYPES = { text, list, image, board };

export function buildCard(card, scroller) {
  const el = document.createElement("div");
  el.className = "card card-" + card.type;
  el.dataset.id = card.id;

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
    type.build(card, el, body);
  } else {
    // A type we no longer support — a swatch from an older board, say. Say so
    // rather than rendering a blank card or, worse, throwing and taking the
    // whole board down.
    const note = document.createElement("p");
    note.className = "card-unknown";
    note.textContent = `Unsupported card (${card.type}) — delete it`;
    body.appendChild(note);
  }

  const resize = document.createElement("div");
  resize.className = "card-resize";
  resize.title = "Drag to resize";

  el.append(grip, body, resize);

  // Clicking anywhere on a card selects it. Safe because selection only
  // changes z-index and a class — it never rebuilds the DOM, which would
  // destroy the element the click is landing on.
  el.addEventListener("pointerdown", () => select(card.id));

  attachDrag(grip, el, card.id, scroller);
  attachResize(resize, el, card.id, scroller);

  return el;
}

export function updateCard(el, card, index, selectedId) {
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.style.zIndex = String(index + 1);
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
