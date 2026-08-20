/**
 * The collection's gallery: every picture it holds, whether or not a board is
 * currently using one.
 *
 * Before this, an image existed only as a card. A picture nothing pointed at
 * was rubbish, and the startup sweep deleted it. The gallery makes a picture a
 * thing the collection owns in its own right — you can import one and place it
 * later, use it on three boards, take it off all of them, and it is still
 * there. So the sweep's question changes from "does a card use this file?" to
 * "is this file in the gallery?".
 *
 * The gallery lives in the document rather than being read off the images
 * folder, because a picture needs its mime type and natural size to become a
 * card, and a bare folder listing knows neither.
 */

import { applyChange, state } from "./store.js";
import { extensionFor } from "./constants.js";

/** Newest first: what you just imported is what you are most likely placing. */
export function galleryImages() {
  return [...(state.gallery || [])].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export const galleryEntry = (imageId) =>
  (state.gallery || []).find((entry) => entry.imageId === imageId) || null;

export const fileNameFor = (entry) => entry.imageId + extensionFor(entry.mime);

/**
 * Adds a picture to the gallery. Safe to call twice with the same one.
 *
 * `fields` is what `importImage` returns, so importing and remembering stay one
 * step and nothing can end up on a board without being in the gallery.
 */
export function addToGallery(fields, name = "") {
  if (!fields || !fields.imageId) return null;
  if (galleryEntry(fields.imageId)) return fields.imageId;

  applyChange(() => {
    if (!state.gallery) state.gallery = [];
    state.gallery.push({
      imageId: fields.imageId,
      mime: fields.mime,
      naturalW: fields.naturalW,
      naturalH: fields.naturalH,
      name,
      addedAt: Date.now(),
    });
  });

  return fields.imageId;
}

/**
 * Which boards are using a picture, by name, each named once.
 *
 * This is what the delete confirmation says out loud. Board covers count: a
 * cover is a use of the picture even though no card holds it.
 */
export function boardsUsing(imageId) {
  const names = [];

  for (const board of Object.values(state.boards)) {
    const used =
      (board.cover && board.cover.imageId === imageId) ||
      board.cards.some(
        (card) =>
          (card.type === "image" && card.imageId === imageId) ||
          (card.type === "column" &&
            card.items.some((item) => item.type === "image" && item.imageId === imageId))
      );

    if (used) names.push(board.title || "Untitled");
  }

  return names;
}

/**
 * Removes a picture from the gallery, and from every board using it.
 *
 * Cascades for the same reason deleting a board does: leaving cards behind
 * that point at a picture the collection no longer has means tidying up by
 * hand, in places you have to go and find. The file on disk is left to the
 * startup sweep — deleting it now would mean undo restoring a card whose
 * photograph had already gone.
 */
export function removeFromGallery(imageId) {
  if (!galleryEntry(imageId)) return false;

  applyChange(() => {
    state.gallery = state.gallery.filter((entry) => entry.imageId !== imageId);

    const survives = (card) => !(card.type === "image" && card.imageId === imageId);

    for (const board of Object.values(state.boards)) {
      if (board.cover && board.cover.imageId === imageId) board.cover = null;

      board.cards = board.cards.filter(survives);
      for (const card of board.cards) {
        if (card.type === "column") card.items = card.items.filter(survives);
      }
    }
  });

  return true;
}
