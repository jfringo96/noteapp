/**
 * Place cards. Somewhere on a map, opened in the browser on double-click.
 *
 * No API key, no signup, no map tiles, no network from the app at all — the
 * card holds text, and opening it builds a Google Maps URL and hands it over.
 *
 * The text can be a place name, a postcode, a "lat,lng" pair, or a Maps URL
 * pasted straight in. A pasted URL is opened as-is; anything else becomes a
 * Maps search.
 */

import { commitEdit, getCard, stashEdit, touch } from "../store.js";
import { mapsUrlFor } from "../url.js";

export async function openPlace(card) {
  const url = mapsUrlFor(card.query);
  if (!url) return false;
  return window.api.openExternal(url);
}

export function build(card, el, body) {
  const face = document.createElement("div");
  face.className = "ref-face is-place";

  const pin = document.createElement("span");
  pin.className = "ref-pin";
  pin.textContent = "◎";
  pin.setAttribute("aria-hidden", "true");

  const text = document.createElement("div");
  text.className = "ref-text";

  const label = document.createElement("input");
  label.type = "text";
  label.className = "ref-title";
  label.placeholder = "Name this place";
  label.spellcheck = false;
  label.value = card.label || "";
  label.setAttribute("aria-label", "Place name");

  const query = document.createElement("input");
  query.type = "text";
  query.className = "ref-sub";
  query.placeholder = "Place, postcode, lat,lng — or a Maps link";
  query.spellcheck = false;
  query.value = card.query || "";
  query.setAttribute("aria-label", "Where");

  bindField(label, card.id, "label");
  bindField(query, card.id, "query");

  // Double-click to open, matching links and boards. A single click stays free
  // for selecting and for putting the caret in either field.
  face.addEventListener("dblclick", (event) => {
    if (event.target === label || event.target === query) return;
    const target = getCard(card.id);
    if (target) openPlace(target);
  });

  text.append(label, query);
  face.append(pin, text);
  body.appendChild(face);

  el.__placeLabel = label;
  el.__placeQuery = query;
}

export function update(card, el) {
  if (document.activeElement !== el.__placeLabel && el.__placeLabel.value !== (card.label || "")) {
    el.__placeLabel.value = card.label || "";
  }

  if (document.activeElement !== el.__placeQuery && el.__placeQuery.value !== (card.query || "")) {
    el.__placeQuery.value = card.query || "";
  }

  el.classList.toggle("is-openable", !!mapsUrlFor(card.query));
}

function bindField(input, cardId, key) {
  input.addEventListener("focus", stashEdit);

  input.addEventListener("input", () => {
    const target = getCard(cardId);
    if (!target) return;
    stashEdit();
    target[key] = input.value;
    touch();
  });

  input.addEventListener("blur", commitEdit);
}
