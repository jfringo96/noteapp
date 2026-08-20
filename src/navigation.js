/**
 * Where you are, and how you got there.
 *
 * There are three separate notions of this and conflating them causes bugs:
 *
 *   state.currentBoardId  the board on screen — the only one in the document
 *   trail                 breadcrumbs: the route you CLICKED, not a tree path
 *   backStack             the Back button, which survives a jump from the Map
 *
 * The trail is not computed from the data and must not be. A board can be
 * linked from several places and two boards can point at each other, so there
 * is no canonical path to any board. Only the route you walked is real.
 *
 * Neither list is part of the document: you would not want them in the saved
 * file, and you would not want undo to restore them.
 */

import { BACK_MAX, HOME_ID, TRAIL_MAX } from "./constants.js";
import { setCurrentBoard, state } from "./store.js";

let trail = [];
let backStack = [];

export function initNavigation() {
  trail = rooted([state.currentBoardId]);
  backStack = [];
}

/**
 * Every trail starts at Home.
 *
 * Home is the one board guaranteed to exist, so "Home / Summer" tells you
 * where you are even when you arrived somewhere by a route nobody walked —
 * a Map jump, an undo, or the board you happened to be on when the app closed.
 * It is a root, not a claim about the path: the crumbs between are only ever
 * boards actually walked through.
 */
function rooted(list) {
  const live = list.filter((id) => state.boards[id]);
  if (live[0] === HOME_ID) return live;
  return [HOME_ID, ...live.filter((id) => id !== HOME_ID)];
}

/**
 * How you got there, which decides what the breadcrumbs say.
 *
 *   "link"  you clicked a board card — append to the route you walked
 *   "path"  the Map sent you, and handed over the route it drew to get there
 *   "jump"  you arrived with no route at all — Home, then where you landed
 *
 * The Map is the reason "path" exists. It has already worked out that Inspo
 * sits under Macro under Home, so clicking it can show `Home / Macro / Inspo`
 * instead of throwing away a route it was holding all along.
 */
export function navigateTo(id, mode = "link", path = null) {
  const from = state.currentBoardId;
  if (!setCurrentBoard(id)) return false;

  backStack.push(from);
  if (backStack.length > BACK_MAX) backStack.shift();

  if (mode === "path" && path && path.length) {
    trail = rooted(path).slice(-TRAIL_MAX);
    return true;
  }

  if (mode === "jump") {
    trail = rooted([id]);
    return true;
  }

  // Revisiting somewhere already in the trail truncates back to it rather than
  // appending, so walking a cycle doesn't produce A / B / A / B / A.
  const at = trail.indexOf(id);
  if (at >= 0) trail = trail.slice(0, at + 1);
  else {
    trail.push(id);
    // Trimming from the front would drop Home, so the oldest crumb AFTER Home
    // is the one that goes.
    if (trail.length > TRAIL_MAX) trail.splice(1, 1);
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

  trail = rooted(trail);
}

/** The breadcrumb list: `[{ id, title }]`, oldest first. */
export function crumbs() {
  return trail
    .filter((id) => state.boards[id])
    .map((id) => ({ id, title: state.boards[id].title }));
}
