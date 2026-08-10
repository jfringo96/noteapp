/**
 * Wiring. Everything here connects the state layer to the DOM; the interesting
 * decisions live in store.js.
 */

import {
  addCard,
  applyChange,
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

import { focusCard, initCanvas, refreshStacking, render, viewportCentre } from "./canvas.js";
import { flush, initPersistence, loadFromDisk, scheduleSave } from "./persist.js";

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

function setStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
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

initCanvas($("scroller"), $("canvas"));
initPersistence(setStatus);

await loadFromDisk();
render();
updateChrome();

/* -------------------------------------------------------------- toolbar --- */

$("addText").addEventListener("click", () => {
  const point = viewportCentre("text");
  addCard("text", point.x, point.y);
  focusCard(getSelectedId());
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
    deleteCard(id);
  }
});

/* ------------------------------------------------------------------ exit --- */

window.addEventListener("beforeunload", () => {
  commitEdit();
  flush();
});
