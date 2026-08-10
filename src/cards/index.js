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

import { deleteCard } from "../store.js";
import { attachDrag, attachResize } from "../gestures.js";

import * as text from "./text.js";
import * as list from "./list.js";
import * as image from "./image.js";
import * as swatch from "./swatch.js";

const TYPES = { text, list, image, swatch };

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

  // An unknown type must render as an empty card, never throw — otherwise one
  // bad entry in boards.json takes the whole board down.
  if (type) type.build(card, el, body);

  const resize = document.createElement("div");
  resize.className = "card-resize";
  resize.title = "Drag to resize";

  el.append(grip, body, resize);

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

  const type = TYPES[card.type];
  if (type && type.update) type.update(card, el);
}
