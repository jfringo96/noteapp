/**
 * The state layer. Read this file first — everything else hangs off it.
 *
 * THE WHOLE DOCUMENT IS ONE PLAIN OBJECT called `state`. Nothing else is
 * authoritative. Every change to it goes through `applyChange()`, and that is
 * the only reason undo/redo is simple: undo is "put back the object we had
 * before".
 *
 * Three rules matter, and each exists because the obvious version was wrong.
 * They are explained at the functions that implement them:
 *
 *   1. Typing never touches history and never re-renders  → stashEdit/commitEdit
 *   2. applyChange seals any in-flight typing first        → applyChange
 *   3. Gestures move pixels, then commit once              → see gestures.js
 */

import { HISTORY_LIMIT, DEFAULT_SIZE, MIN_SIZE, uid } from "./constants.js";

export function emptyDoc() {
  return {
    version: 1,
    currentBoardId: "b_home",
    boards: {
      b_home: { id: "b_home", title: "Untitled board", cards: [] },
    },
  };
}

export let state = emptyDoc();

export const currentBoard = () => state.boards[state.currentBoardId];

export const getCard = (id) => currentBoard().cards.find((c) => c.id === id) || null;

/* ------------------------------------------------------------------------ */
/* Not part of the document.                                                 */
/*                                                                           */
/* The test for whether something belongs in `state`: would you want it in    */
/* the saved file, and would you want undo to restore it? Selection fails     */
/* both, so it lives out here and is never saved.                            */
/* ------------------------------------------------------------------------ */

const undoStack = [];
const redoStack = [];
let editSnapshot = null;
let selectedId = null;

/**
 * Set once at startup by main.js. Using hooks rather than importing the canvas
 * keeps this file from depending on anything that draws.
 */
const hooks = { render: () => {}, stacking: () => {}, dirty: () => {}, chrome: () => {} };

export function setHooks(next) {
  Object.assign(hooks, next);
}

/* ---------------------------------------------------------------- change --- */

/**
 * The single mutation funnel.
 *
 * `commitEdit()` on line one is not optional. Without it: focus a card, type,
 * then drag a different card. The drag's snapshot would capture the typed text,
 * and the pending typing snapshot would land on the stack *after* it — so undo
 * would replay your typing forwards. Sealing first gives two correctly ordered
 * entries.
 */
export function applyChange(mutator) {
  commitEdit();

  const before = structuredClone(state);
  mutator();

  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;

  hooks.render();
  hooks.dirty();
}

/**
 * Content changed but the shape didn't — typing, or a card growing to fit.
 * Saves, but does not render and does not touch history.
 */
export function touch() {
  hooks.dirty();
}

/* ------------------------------------------------------------------ edit --- */

/**
 * Typing writes straight into the state object and does NOT re-render: the DOM
 * is already correct, and re-rendering mid-keystroke destroys focus and the
 * caret position.
 *
 * So history is handled around the edit instead. Stash a snapshot when the
 * field is focused (and again defensively before each write, in case focus was
 * missed), then push it on blur if anything actually changed. One history entry
 * per editing session, not one per keystroke.
 */
export function stashEdit() {
  if (!editSnapshot) editSnapshot = structuredClone(state);
}

/** Seals the in-flight edit. Deliberately does not render. */
export function commitEdit() {
  if (!editSnapshot) return;

  const before = editSnapshot;
  editSnapshot = null;

  if (JSON.stringify(before) === JSON.stringify(state)) return;

  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  hooks.chrome();
}

/* --------------------------------------------------------------- history --- */

export const canUndo = () => undoStack.length > 0 || editSnapshot !== null;
export const canRedo = () => redoStack.length > 0;

export function undo() {
  commitEdit();
  if (!undoStack.length) return;

  const target = undoStack[undoStack.length - 1];
  const inverse = structuredClone(state);

  // Redo's entry is built here, from live state, which names wherever you are
  // standing *now*. Stamping it with the board the undone change belongs to is
  // what stops redo re-applying a change on a board you are not looking at.
  inverse.currentBoardId = target.currentBoardId;

  redoStack.push(inverse);
  state = undoStack.pop();
  afterHistoryJump();
}

export function redo() {
  commitEdit();
  if (!redoStack.length) return;

  const target = redoStack[redoStack.length - 1];
  const inverse = structuredClone(state);
  inverse.currentBoardId = target.currentBoardId;

  undoStack.push(inverse);
  state = redoStack.pop();
  afterHistoryJump();
}

function afterHistoryJump() {
  if (selectedId && !getCard(selectedId)) selectedId = null;
  hooks.render();
  hooks.dirty();
}

/* ------------------------------------------------------------- selection --- */

export const getSelectedId = () => selectedId;

/**
 * Selection is a view operation, not a history entry — but it does bring the
 * card to the front by moving it to the end of the array, so a z-order change
 * rides along inside the next real change's snapshot. That is deliberate.
 *
 * It must never rebuild the DOM: rebuilding on pointerdown destroys the element
 * the click is landing on and swallows focus for textareas.
 */
export function select(id) {
  if (selectedId === id) return;
  selectedId = id;

  if (id) {
    const cards = currentBoard().cards;
    const i = cards.findIndex((c) => c.id === id);
    if (i >= 0 && i !== cards.length - 1) cards.push(cards.splice(i, 1)[0]);
  }

  hooks.stacking();
  hooks.chrome();
}

/* ----------------------------------------------------------------- cards --- */

export function makeCard(type, x, y, extra) {
  const size = DEFAULT_SIZE[type];
  const card = { id: uid("c"), type, x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };

  if (type === "text") card.text = "";

  if (type === "list") {
    card.items = [{ id: uid("i"), text: "", checked: false }];
    card.checkable = false;
  }

  if (type === "image") {
    Object.assign(card, { imageId: null, mime: "image/webp", naturalW: 0, naturalH: 0, alt: "" });
  }

  if (type === "swatch") {
    card.colour = "#c8a45e";
    card.label = "";
  }

  // Applied last, so an imported image can bring its own size and dimensions.
  if (extra) Object.assign(card, extra);

  return card;
}

export function addCard(type, x, y, extra) {
  const card = makeCard(type, x, y, extra);
  applyChange(() => currentBoard().cards.push(card));
  select(card.id);
  return card;
}

export function deleteCard(id) {
  if (!getCard(id)) return;
  applyChange(() => {
    const cards = currentBoard().cards;
    cards.splice(cards.findIndex((c) => c.id === id), 1);
  });
  if (selectedId === id) {
    selectedId = null;
    hooks.chrome();
  }
}

export const minSize = (type) => MIN_SIZE[type] || { w: 80, h: 60 };

/* -------------------------------------------------------------- document --- */

/** Replaces the whole document — startup, or import. Clears history with it. */
export function loadDoc(doc) {
  state = doc;
  undoStack.length = 0;
  redoStack.length = 0;
  editSnapshot = null;
  selectedId = null;
}
