/**
 * Saving to disk.
 *
 * Debounced, because typing calls touch() on every keystroke and there is no
 * point writing the file that often. Also flushed on window close, so the last
 * few hundred milliseconds of work are never lost.
 */

import { state, emptyDoc, loadDoc } from "./store.js";

const SAVE_DELAY = 600;

let timer = null;
let saving = null;
let onStatus = () => {};

export function initPersistence(statusCallback) {
  onStatus = statusCallback || (() => {});

  // Not `beforeunload`: Electron closes the window without waiting for async
  // work there. pagehide fires early enough to start the write.
  window.addEventListener("pagehide", () => flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export async function loadFromDisk() {
  const doc = await window.api.readDoc();

  if (doc && doc.error === "corrupt") {
    loadDoc(emptyDoc());
    onStatus("boards.json could not be read. It was kept as " + doc.movedTo);
    return;
  }

  loadDoc(doc && doc.boards ? doc : emptyDoc());
}

export function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY);
}

export async function flush() {
  clearTimeout(timer);

  // One write at a time; if another is asked for mid-write, follow it.
  if (saving) {
    await saving;
    return flush();
  }

  const snapshot = structuredClone(state);
  saving = window.api
    .writeDoc(snapshot)
    .then(() => onStatus(""))
    .catch((err) => onStatus("Could not save: " + err.message))
    .finally(() => {
      saving = null;
    });

  return saving;
}
