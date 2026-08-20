/**
 * Wiring. Everything here connects the state layer to the DOM; the interesting
 * decisions live in store.js and navigation.js.
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

import { moveCard } from "./move.js";
import { hideMap, initMap, refreshMap } from "./map.js";
import { initFileMenu } from "./filemenu.js";
import { initConfirm, isConfirmOpen } from "./confirm.js";
import { collectionName, initCollection } from "./collection.js";
import { canGoBack, crumbs, goBack, initNavigation, navigateTo, normaliseTrail } from "./navigation.js";

import {
  addImageFiles,
  createBoardCard,
  focusNewCard,
  hidePicker,
  initCanvas,
  refreshStacking,
  render,
  viewportCentre,
} from "./canvas.js";

import { resolveDrop, showDropFeedback } from "./drop.js";
import { initInspector, refreshInspector } from "./inspector.js";
import { exportBoardImages } from "./export.js";
import { initLightbox, isOpen as lightboxOpen } from "./lightbox.js";

import { setDropHandlers } from "./gestures.js";
import { flush, initPersistence, loadFromDisk, scheduleSave } from "./persist.js";
import { imageFilesFrom, sweepImages } from "./images.js";
import { cleanBoardName, isHome } from "./boards.js";

const $ = (id) => document.getElementById(id);

const titleInput = $("title");
const statusEl = $("status");
const emptyEl = $("empty");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");
const backBtn = $("backBtn");
const crumbsEl = $("crumbs");
const collectionEl = $("collectionName");

/* ---------------------------------------------------------------- chrome --- */

function updateChrome() {
  normaliseTrail();

  if (document.activeElement !== titleInput) titleInput.value = currentBoard().title;

  // Home is the root of the Map and the first crumb in every trail, so its
  // name is fixed. Read-only rather than hidden: the name still belongs on
  // screen, it just isn't yours to change.
  const home = isHome(state.currentBoardId);
  titleInput.readOnly = home;
  titleInput.classList.toggle("is-fixed", home);
  titleInput.title = home ? "Home is always called Home" : "";

  collectionEl.textContent = collectionName();

  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  backBtn.disabled = !canGoBack();
  emptyEl.hidden = currentBoard().cards.length > 0;

  renderCrumbs();
  refreshMap();
  refreshInspector();
}

function renderCrumbs() {
  const list = crumbs();
  crumbsEl.replaceChildren();

  // A single crumb means you are standing on Home, and the title beside it
  // already says so.
  if (list.length < 2) return;

  list.forEach((crumb, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = "›";
      sep.setAttribute("aria-hidden", "true");
      crumbsEl.appendChild(sep);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "crumb";
    button.textContent = crumb.title || "Untitled";
    button.disabled = index === list.length - 1;
    button.addEventListener("click", () => navigateTo(crumb.id, "link"));
    crumbsEl.appendChild(button);
  });
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
initConfirm($("dialog"));
initMap($("map"), $("mapBtn"), setStatus);
initFileMenu($("fileMenu"), $("fileBtn"));

// `repaint` is the plain render, not the store hook: dragging around the colour
// wheel fires continuously, and there is no need to rebuild the chrome — which
// includes the inspector the pointer is currently inside — on every step.
initInspector({ element: $("inspector"), repaint: render, status: setStatus, add: addAtCentre });
initLightbox($("lightbox"));

setDropHandlers({
  resolve: resolveDrop,
  feedback: showDropFeedback,
  commit: (cardId, destination) => {
    if (!moveCard(cardId, destination)) return false;

    // Moving to another board takes the card off-screen, so say where it went.
    // Moves within this board are visible and need no commentary.
    if (destination.kind === "board") {
      setStatus(`Moved to ${state.boards[destination.boardId].title} — Ctrl+Z to undo`);
    }

    return true;
  },
});

await initCollection({
  status: setStatus,
  reloaded: () => {
    render();
    updateChrome();
  },
});

const loadResult = await loadFromDisk();
initNavigation();
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

/** Adding a card of any type, in the middle of what you can see. */
function addAtCentre(type) {
  const point = viewportCentre(type);

  if (type === "board") {
    createBoardCard(point.x, point.y);
    return;
  }

  if (type === "image") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () =>
      addImageFiles(imageFilesFrom(input.files), point.x, point.y)
    );
    input.click();
    return;
  }

  addCard(type, point.x, point.y);
  focusNewCard(type, getSelectedId());
}

undoBtn.addEventListener("click", () => undo());
redoBtn.addEventListener("click", () => redo());
backBtn.addEventListener("click", () => goBack());
$("folderBtn").addEventListener("click", () => window.api.revealDataFolder());
$("exportBtn").addEventListener("click", () => exportBoardImages(setStatus));

/* ----------------------------------------------------------- board title --- */

// The title is part of the document, so it follows the same rule as card text:
// write straight into state, no history push until the edit ends.
titleInput.addEventListener("focus", stashEdit);

titleInput.addEventListener("input", () => {
  if (isHome(state.currentBoardId)) return;

  // Same rule as the name on the card: one line, within the tile's budget.
  // Renaming from up here must not produce a name the tile can't show.
  const tidy = cleanBoardName(titleInput.value);
  if (tidy !== titleInput.value) titleInput.value = tidy;

  stashEdit();
  currentBoard().title = tidy;
  touch();
});

titleInput.addEventListener("blur", commitEdit);

/* -------------------------------------------------------------- keyboard --- */

const isEditable = (el) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

window.addEventListener("keydown", (event) => {
  // The viewer owns the keyboard while it is up — undoing or deleting
  // something you cannot see would be alarming.
  if (lightboxOpen()) return;

  // Same for the confirmation dialog, and more so: it is asking about a
  // deletion, and Delete or Ctrl+Z arriving behind it would act on the board
  // underneath. The dialog handles its own Escape.
  if (isConfirmOpen()) return;

  const mod = event.ctrlKey || event.metaKey;

  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  if (event.key === "Escape") {
    hideMap();
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
