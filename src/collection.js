/**
 * Collections — the layer above boards.
 *
 * A collection is the whole document: every board in it, Home at the root, and
 * the pictures they use. On disk it is a folder (see `electron/storage.js`).
 * One is open at a time, and it opens by itself on launch — the one you had
 * open last.
 *
 * There is no Save. Work is saved continuously into the open collection, the
 * way it always has been. What the File menu adds is *which* collection that
 * is: Save As copies this one somewhere new and carries on there, Open swaps
 * to a different one entirely.
 */

import { emptyDoc, loadDoc, state } from "./store.js";
import { flush, loadFromDisk } from "./persist.js";
import { initNavigation } from "./navigation.js";
import { resetImageCache, sweepImages } from "./images.js";

let current = { path: "", name: "" };
let onStatus = () => {};
let onReloaded = () => {};

export const collectionName = () => current.name || "Untitled collection";

export async function initCollection({ status, reloaded }) {
  onStatus = status || (() => {});
  onReloaded = reloaded || (() => {});
  current = (await window.api.currentCollection()) || current;
}

/* ----------------------------------------------------------- the actions --- */

export async function newCollection() {
  await settle();
  const made = await window.api.newCollection(emptyDoc());
  if (!(await adopt(made))) return;

  await reload();
  onStatus(`Started ${current.name}`);
}

export async function openCollection() {
  await settle();
  const opened = await window.api.openCollection();
  if (!(await adopt(opened))) return;

  await reload();
  onStatus(`Opened ${current.name}`);
}

/**
 * Save As does not reload anything.
 *
 * The document on screen is already the document being saved — only its
 * destination changed. Reloading it would throw away the undo history and
 * flicker the canvas to redraw the identical thing.
 */
export async function saveCollectionAs() {
  await settle();
  const saved = await window.api.saveCollectionAs(structuredClone(state));
  if (!(await adopt(saved))) return;

  onReloaded();
  onStatus(`Saved as ${current.name} — that's where your work goes from now on`);
}

/** Open a specific collection folder, from the list in the File menu. */
export async function openCollectionPath(dir) {
  await settle();
  const opened = await window.api.openCollectionPath(dir);
  if (!(await adopt(opened))) return;

  await reload();
  onStatus(`Opened ${current.name}`);
}

export const listCollections = () => window.api.listCollections();

/* ------------------------------------------------------------- machinery --- */

/**
 * Write out anything still pending before touching collections at all.
 *
 * Saving is debounced, so up to `SAVE_DELAY` of typing can be in the air. Every
 * action here either changes where writes land or replaces the document
 * outright, and both would strand those keystrokes in the wrong place.
 */
const settle = () => flush();

/**
 * Takes what the main process handed back, or explains why nothing happened.
 * `null` means the dialog was cancelled, which needs no comment at all.
 */
async function adopt(result) {
  if (!result) return false;

  if (result.error === "not-a-collection") {
    onStatus("That folder isn't a collection — it needs a collection.json in it.");
    return false;
  }

  if (result.error === "exists") {
    onStatus("There's already a collection there. Pick a name that isn't in use.");
    return false;
  }

  current = result;
  return true;
}

/**
 * Replace the document on screen with whatever the newly opened collection
 * holds.
 *
 * Order matters: the image cache is keyed by filename and both collections can
 * hold `img_abc.webp`, so it has to be dropped before anything renders or the
 * new boards come up wearing the old collection's photographs.
 */
async function reload() {
  resetImageCache();

  const result = await loadFromDisk();
  if (result === "empty") loadDoc(emptyDoc());

  initNavigation();
  onReloaded();

  // Same rule as startup: sweeping against a document we failed to read would
  // delete every picture in the collection, because it references none of them.
  if (result === "loaded") sweepImages(state).catch(() => {});
}
