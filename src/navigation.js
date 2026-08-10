/**
 * Where you are, and how you got there.
 *
 * There are three separate notions of this and conflating them causes bugs:
 *
 *   state.currentBoardId  the board on screen — the only one in the document
 *   trail                 breadcrumbs: the route you CLICKED, not a tree path
 *   backStack             the Back button, which survives a switcher jump
 *
 * The trail is not computed from the data and must not be. A board can be
 * linked from several places and two boards can point at each other, so there
 * is no canonical path to any board. Only the route you walked is real.
 *
 * Neither list is part of the document: you would not want them in the saved
 * file, and you would not want undo to restore them.
 */

import { BACK_MAX, TRAIL_MAX } from "./constants.js";
import { setCurrentBoard, state } from "./store.js";

let trail = [];
let backStack = [];

export function initNavigation() {
  trail = [state.currentBoardId];
  backStack = [];
}

/**
 * `mode` is "link" when you clicked through to a board, and "jump" when you
 * arrived from the switcher — a jump has no route, so it resets the trail to
 * a single crumb rather than pretending you walked there.
 */
export function navigateTo(id, mode = "link") {
  const from = state.currentBoardId;
  if (!setCurrentBoard(id)) return false;

  backStack.push(from);
  if (backStack.length > BACK_MAX) backStack.shift();

  if (mode === "jump") {
    trail = [id];
    return true;
  }

  // Revisiting somewhere already in the trail truncates back to it rather than
  // appending, so walking a cycle doesn't produce A / B / A / B / A.
  const at = trail.indexOf(id);
  if (at >= 0) trail = trail.slice(0, at + 1);
  else {
    trail.push(id);
    if (trail.length > TRAIL_MAX) trail.shift();
  }

  return true;
}

export function goBack() {
  const id = backStack.pop();
  if (id === undefined) return false;
  return setCurrentBoard(id);
}

export const canGoBack = () => backStack.length > 0;

/**
 * Repairs both lists against reality.
 *
 * Called before every chrome update, because the board you are on can change
 * without anyone navigating — undo can land you on the board that changed, and
 * a board can be deleted out from under the trail.
 */
export function normaliseTrail() {
  const exists = (id) => !!state.boards[id];

  trail = trail.filter(exists);
  backStack = backStack.filter(exists);

  const current = state.currentBoardId;
  const at = trail.indexOf(current);

  if (at >= 0) trail = trail.slice(0, at + 1);
  else trail = [current];
}

/** The breadcrumb list: `[{ id, title }]`, oldest first. */
export function crumbs() {
  return trail
    .filter((id) => state.boards[id])
    .map((id) => ({ id, title: state.boards[id].title }));
}
