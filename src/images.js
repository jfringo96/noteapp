/**
 * Getting images onto the canvas and back off disk.
 *
 * The card only ever holds a reference. Keeping binary out of the document is
 * what lets undo stay simple: a whole-state snapshot is just text, coordinates
 * and ids, so fifty of them cost nothing. Inline images would be cloned into
 * every history entry.
 */

import {
  IMAGE_CARD_EDGE,
  IMAGE_MAX_EDGE,
  IMAGE_QUALITY,
  extensionFor,
  imageFileName,
  uid,
} from "./constants.js";

/** filename → object URL. Runtime only; never saved, never in a snapshot. */
const urls = new Map();

/**
 * Downscale, re-encode, write to disk.
 *
 * Returns the fields an image card needs, or null if the file isn't a usable
 * image.
 */
export async function importImage(file) {
  let bitmap;
  try {
    // from-image honours EXIF rotation. Without it, portrait phone photos
    // arrive sideways, because the pixels are landscape and the rotation lives
    // only in the metadata that drawImage ignores.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }

  const scale = Math.min(1, IMAGE_MAX_EDGE / bitmap.width, IMAGE_MAX_EDGE / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);

  let blob = await canvas.convertToBlob({ type: "image/webp", quality: IMAGE_QUALITY });
  let mime = "image/webp";
  let naturalW = width;
  let naturalH = height;

  // If it was already small enough and the re-encode didn't help, keep the
  // original rather than making the file bigger and lossier for nothing.
  if (scale === 1 && file.size <= blob.size && file.type.startsWith("image/")) {
    blob = file;
    mime = file.type;
    naturalW = bitmap.width;
    naturalH = bitmap.height;
  }

  bitmap.close();

  const imageId = uid("img");
  const name = imageId + extensionFor(mime);
  await window.api.writeImage(name, await blob.arrayBuffer());

  // We already hold the bytes, so cache the URL now rather than reading back.
  urls.set(name, URL.createObjectURL(blob));

  return { imageId, mime, naturalW, naturalH, ...cardSize(naturalW, naturalH) };
}

/** Fit a new image card into a sensible box without distorting it. */
function cardSize(naturalW, naturalH) {
  const scale = Math.min(1, IMAGE_CARD_EDGE / naturalW, IMAGE_CARD_EDGE / naturalH);
  return {
    w: Math.max(1, Math.round(naturalW * scale)),
    h: Math.max(1, Math.round(naturalH * scale)),
  };
}

/** An object URL for a card's image, reading it from disk the first time. */
export async function imageUrl(card) {
  const name = imageFileName(card);

  const cached = urls.get(name);
  if (cached) return cached;

  const bytes = await window.api.readImage(name);
  if (!bytes) return null; // file is missing — the card renders as broken

  const url = URL.createObjectURL(new Blob([bytes], { type: card.mime }));
  urls.set(name, url);
  return url;
}

/**
 * Delete image files nothing points at.
 *
 * Startup only. Two cards can share an image, and undo can hold a state
 * referencing an image whose card is deleted right now — so mid-session there
 * is no safe moment to decide something is unreferenced.
 */
export async function sweepImages(state) {
  const keep = new Set();

  const remember = (ref) => {
    if (ref && ref.imageId) keep.add(imageFileName(ref));
  };

  for (const board of Object.values(state.boards)) {
    // A board's cover is an image reference too, and nothing else points at it.
    remember(board.cover);

    for (const card of board.cards) {
      if (card.type === "image") remember(card);

      // Cards inside a column are owned by the column, so they are not in
      // board.cards. Missing them here would delete their files on the next
      // startup — every image you had put in a column.
      if (card.type === "column") {
        for (const item of card.items) if (item.type === "image") remember(item);
      }
    }
  }

  return window.api.sweepImages([...keep]);
}

/** Every image file in a drop or paste, in order. */
export const imageFilesFrom = (list) =>
  [...(list || [])].filter((file) => file && file.type.startsWith("image/"));
