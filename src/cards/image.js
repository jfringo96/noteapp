/**
 * Image cards. The card holds a reference; the bytes live in images/ on disk.
 */

import { imageUrl } from "../images.js";

export function build(card, el, body) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";

  const img = document.createElement("img");
  img.className = "image-el";
  img.alt = card.alt || "";
  img.draggable = false;

  const missing = document.createElement("span");
  missing.className = "image-missing";
  missing.textContent = "Image file missing";
  missing.hidden = true;

  wrap.append(img, missing);

  el.__img = img;
  el.__imageMissing = missing;

  body.appendChild(wrap);
  load(card, el);
}

export function update(card, el) {
  if (el.__img) el.__img.alt = card.alt || "";

  // Undo can swap which image this card points at, so reload when it changes.
  if (el.__loadedFor !== card.imageId) load(card, el);
}

async function load(card, el) {
  el.__loadedFor = card.imageId;

  if (!card.imageId) {
    el.__img.removeAttribute("src");
    el.__imageMissing.hidden = false;
    return;
  }

  const url = await imageUrl(card);

  // Another load may have started while this one was awaiting. Whoever is
  // current wins; a stale result must not overwrite it.
  if (el.__loadedFor !== card.imageId) return;

  // A missing file renders as a visibly broken card, never a thrown error —
  // one bad reference shouldn't take the board down.
  if (!url) {
    el.__img.removeAttribute("src");
    el.__imageMissing.hidden = false;
    return;
  }

  el.__imageMissing.hidden = true;
  el.__img.src = url;
}
