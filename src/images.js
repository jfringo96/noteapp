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
  imageIdFromFile,
  mimeForFile,
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

/**
 * A card's picture as JPEG bytes, for export.
 *
 * Stored images are WebP, which phone photo apps handle badly — an exported
 * folder needs to behave like ordinary photos wherever it lands.
 */
export async function imageAsJpeg(card, quality = 0.9) {
  const bytes = await window.api.readImage(imageFileName(card));
  if (!bytes) return null;

  const bitmap = await createImageBitmap(new Blob([bytes], { type: card.mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");

  // JPEG has no transparency. Without a white ground underneath, anything
  // transparent — a PNG screenshot, say — comes out black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return jpeg.arrayBuffer();
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
 * Drop every cached object URL.
 *
 * Called when the open collection changes. The cache is keyed by filename, and
 * two collections can each hold a picture with the same name — without this,
 * opening a second collection would show the first one's photographs.
 */
export function resetImageCache() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}


/**
 * Takes any picture already sitting in the images folder into the gallery.
 *
 * Run once, on the load that first gives a collection a gallery. Before the
 * gallery existed, a picture taken off every board became rubbish and the sweep
 * deleted it on the next launch — so at the moment of the upgrade there can be
 * perfectly good photographs on disk that no board mentions. Without this they
 * would be swept minutes later, by the very change meant to stop that
 * happening.
 *
 * Only on that one load. On any later launch a file the gallery doesn't list is
 * a picture that was deliberately deleted, and adopting it would bring it back.
 *
 * The dimensions have to be measured, because a filename doesn't carry them.
 */
export async function adoptLooseImages(addEntry) {
  const files = await window.api.listImages();
  let adopted = 0;

  for (const name of files) {
    const mime = mimeForFile(name);
    if (!mime) continue; // not a picture we wrote

    const bytes = await window.api.readImage(name);
    if (!bytes) continue;

    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    } catch {
      continue; // unreadable; leave it alone rather than listing a broken tile
    }

    const added = addEntry(
      {
        imageId: imageIdFromFile(name),
        mime,
        naturalW: bitmap.width,
        naturalH: bitmap.height,
      },
      ""
    );

    bitmap.close();
    if (added) adopted++;
  }

  return adopted;
}

/**
 * Delete image files the gallery doesn't list.
 *
 * The question used to be "does a card use this file?", which meant a picture
 * taken off every board was rubbish. Now the gallery owns pictures in their own
 * right, so the question is whether it still lists this one — removing a
 * picture from the gallery is the only thing that makes a file disposable.
 *
 * Startup only. Undo can hold a state where a picture is still in the gallery,
 * so mid-session there is no safe moment to decide a file is finished with.
 */
export async function sweepImages(state) {
  const keep = new Set();

  for (const entry of state.gallery || []) {
    keep.add(entry.imageId + extensionFor(entry.mime));
  }

  // Belt and braces. `normalise()` guarantees every referenced picture is in
  // the gallery, and if that ever stopped being true this is the difference
  // between a bug and a deleted photograph.
  const remember = (ref) => {
    if (ref && ref.imageId) keep.add(imageFileName(ref));
  };

  for (const board of Object.values(state.boards)) {
    remember(board.cover);

    for (const card of board.cards) {
      if (card.type === "image") remember(card);
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
