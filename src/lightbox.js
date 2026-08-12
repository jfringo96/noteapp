/**
 * Full-screen picture viewer.
 *
 * Double-click any picture and it fills the window, dimming the board behind
 * it. Arrows — on screen or on the keyboard — walk every picture on the board
 * in the same reading order the export uses, so what you see here is what you
 * would get in a folder.
 */

import { boardImages } from "./export.js";
import { imageUrl } from "./images.js";

let root = null;
let picture = null;
let caption = null;
let counter = null;

let images = [];
let index = 0;
let token = 0;

export function initLightbox(element) {
  root = element;

  picture = root.querySelector(".lightbox-image");
  caption = root.querySelector(".lightbox-caption");
  counter = root.querySelector(".lightbox-counter");

  root.querySelector(".lightbox-prev").addEventListener("click", () => step(-1));
  root.querySelector(".lightbox-next").addEventListener("click", () => step(1));
  root.querySelector(".lightbox-close").addEventListener("click", close);

  // Clicking the dimmed area closes; clicking the picture itself must not.
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root || event.target.classList.contains("lightbox-stage")) close();
  });

  window.addEventListener("keydown", (event) => {
    if (!isOpen()) return;

    if (event.key === "Escape") return close();
    if (event.key === "ArrowLeft") return step(-1);
    if (event.key === "ArrowRight") return step(1);

    // Everything else — Delete, Ctrl+Z — belongs to the board behind, which
    // you cannot see. Swallow it rather than acting on something invisible.
    event.preventDefault();
    event.stopPropagation();
  });
}

export const isOpen = () => !!root && !root.hidden;

/** Opens on a given card, with every picture on the board to walk through. */
export function openLightbox(cardId) {
  images = boardImages();
  index = images.findIndex((card) => card.id === cardId);
  if (index < 0) return;

  root.hidden = false;
  show();
}

export function close() {
  if (!root) return;
  root.hidden = true;
  picture.removeAttribute("src");
  token++; // abandon any load still in flight
}

function step(by) {
  if (images.length < 2) return;
  // Wraps, so you can keep going round rather than hitting a dead end.
  index = (index + by + images.length) % images.length;
  show();
}

async function show() {
  const card = images[index];
  if (!card) return close();

  const mine = ++token;

  caption.textContent = card.alt || "";
  counter.textContent = `${index + 1} / ${images.length}`;
  root.classList.toggle("is-alone", images.length < 2);

  const url = await imageUrl(card);

  // A newer picture was asked for while this one was loading.
  if (mine !== token) return;

  if (!url) {
    picture.removeAttribute("src");
    caption.textContent = "This picture is missing from disk";
    return;
  }

  picture.src = url;
  picture.alt = card.alt || "";
}
