/**
 * Wiring. Everything here connects the state layer to the DOM; the interesting
 * decisions live in store.js.
 */

import {
  addCard,
  canRedo,
  canUndo,
  commitEdit,
  currentBoard,
  deleteCard,
  getSelectedId,
  redo,
  setHooks,
  stashEdit,
  state,
  touch,
  undo,
} from "./store.js";

import {
  addImageFiles,
  focusCard,
  hidePicker,
  initCanvas,
  refreshStacking,
  render,
  viewportCentre,
} from "./canvas.js";

import { flush, initPersistence, loadFromDisk, scheduleSave } from "./persist.js";
import { imageFilesFrom, sweepImages } from "./images.js";

const $ = (id) => document.getElementById(id);

const titleInput = $("title");
const statusEl = $("status");
const emptyEl = $("empty");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");

/* ---------------------------------------------------------------- chrome --- */

function updateChrome() {
  if (document.activeElement !== titleInput) titleInput.value = currentBoard().title;

  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  emptyEl.hidden = currentBoard().cards.length > 0;
}

let statusTimer = null;

function setStatus(message) {
  clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.hidden = !message;
  if (message) statusTimer = setTimeout(() => setStatus(""), 6000);
}

/* ------------------------------------------------------------------ boot --- */

setHooks({
  render: () => {
    render();
    updateChrome();
  },
  stacking: refreshStacking,
  chrome: updateChrome,
  dirty: scheduleSave,
});

initCanvas($("scroller"), $("canvas"), $("picker"), setStatus);
initPersistence(setStatus);

const loadResult = await loadFromDisk();
render();
updateChrome();

// Only ever at startup, and only when the document actually loaded.
//
// At startup because two cards can share an image and undo can hold a state
// referencing an image whose card is deleted right now — so mid-session there
// is no safe moment to call something unreferenced.
//
// Only when loaded because an empty document references no images at all, so
// sweeping against a failed read would delete every image on disk.
if (loadResult === "loaded") sweepImages(state).catch(() => {});

/* --------------------------------------------------------------- toolbar --- */

function addFromToolbar(type) {
  const point = viewportCentre(type);
  addCard(type, point.x, point.y);
  focusCard(getSelectedId());
}

$("addText").addEventListener("click", () => addFromToolbar("text"));
$("addList").addEventListener("click", () => addFromToolbar("list"));

$("addImage").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => {
    const point = viewportCentre("image");
    addImageFiles(imageFilesFrom(input.files), point.x, point.y);
  });
  input.click();
});

undoBtn.addEventListener("click", () => undo());
redoBtn.addEventListener("click", () => redo());
$("folderBtn").addEventListener("click", () => window.api.revealDataFolder());

/* ----------------------------------------------------------- board title --- */

// The title is part of the document, so it follows the same rule as card text:
// write straight into state, no history push until the edit ends.
titleInput.addEventListener("focus", stashEdit);

titleInput.addEventListener("input", () => {
  stashEdit();
  currentBoard().title = titleInput.value;
  touch();
});

titleInput.addEventListener("blur", commitEdit);

/* -------------------------------------------------------------- keyboard --- */

const isEditable = (el) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

window.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;

  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  // Guarded, or Backspace would delete the card you are editing text in.
  if ((event.key === "Delete" || event.key === "Backspace") && !isEditable(document.activeElement)) {
    const id = getSelectedId();
    if (!id) return;
    event.preventDefault();
    hidePicker();
    deleteCard(id);
  }
});

/* ---------------------------------------------------------------- paste --- */

window.addEventListener("paste", (event) => {
  // Never steal a paste aimed at a text field.
  if (isEditable(document.activeElement)) return;

  const files = imageFilesFrom(event.clipboardData && event.clipboardData.files);
  if (!files.length) return;

  event.preventDefault();
  const point = viewportCentre("image");
  addImageFiles(files, point.x, point.y);
});

/* ------------------------------------------------------------------ exit --- */

window.addEventListener("beforeunload", () => {
  commitEdit();
  flush();
});
