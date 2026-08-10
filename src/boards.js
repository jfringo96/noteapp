/**
 * Operations on boards themselves.
 *
 * Boards are a flat map keyed by id. A board NEVER contains another board's
 * cards — nesting is by reference, a card holding a `targetBoardId`. That is
 * the load-bearing decision: it lets one board be linked from several places,
 * lets two boards point at each other without exploding, and makes moving a
 * card between boards a splice and a push rather than a re-parenting.
 */

import { applyChange, currentBoard, state } from "./store.js";
import { DEFAULT_SIZE, uid } from "./constants.js";

/** Creates an empty board and returns its id. Does not navigate. */
export function createBoard(title = "Untitled board") {
  const id = uid("b");

  applyChange(() => {
    state.boards[id] = { id, title, cards: [] };
  });

  return id;
}

/**
 * Deleting a board NEVER cascades. Cards pointing at it are left alone and
 * render as visibly broken links — losing a card because something it
 * referenced went away would be worse than showing the breakage.
 */
export function deleteBoard(id) {
  if (!state.boards[id] || Object.keys(state.boards).length <= 1) return false;

  applyChange(() => {
    delete state.boards[id];

    // Standing on the board being deleted? Fall back to any surviving one.
    if (state.currentBoardId === id) {
      state.currentBoardId = Object.keys(state.boards)[0];
    }
  });

  return true;
}

export function renameBoard(id, title) {
  const board = state.boards[id];
  if (board) board.title = title;
}

/**
 * Moves a card to another board. A splice and a push, because no card is ever
 * owned by more than one board's array.
 *
 * The card keeps its x/y, so it can land overlapping something already there.
 * No auto-placement — guessing where you meant it to go would be worse.
 */
export function moveCardToBoard(cardId, targetBoardId) {
  const target = state.boards[targetBoardId];
  if (!target) return false;

  const cards = currentBoard().cards;
  const index = cards.findIndex((c) => c.id === cardId);
  if (index < 0) return false;

  applyChange(() => {
    const from = currentBoard().cards;
    const [card] = from.splice(
      from.findIndex((c) => c.id === cardId),
      1
    );
    state.boards[targetBoardId].cards.push(card);
  });

  return true;
}

/** Every board, for the switcher. Current board first, then alphabetical. */
export function boardSummaries() {
  return Object.values(state.boards)
    .map((board) => ({ id: board.id, title: board.title, count: board.cards.length }))
    .sort((a, b) => {
      if (a.id === state.currentBoardId) return -1;
      if (b.id === state.currentBoardId) return 1;
      return a.title.localeCompare(b.title);
    });
}

/**
 * What a board card should show. Returns null when the target is missing, so
 * the card can render as broken rather than throwing — an unresolvable
 * `targetBoardId` must always render.
 */
export function boardFace(targetBoardId) {
  const board = state.boards[targetBoardId];
  if (!board) return null;
  return { title: board.title, count: board.cards.length };
}

/** Adds a board card and the board it points at, in one history entry. */
export function addBoardCard(x, y, title = "Untitled board") {
  const boardId = uid("b");
  const cardId = uid("c");
  const size = DEFAULT_SIZE.board;

  applyChange(() => {
    state.boards[boardId] = { id: boardId, title, cards: [] };
    currentBoard().cards.push({
      id: cardId,
      type: "board",
      x: Math.round(x),
      y: Math.round(y),
      w: size.w,
      h: size.h,
      targetBoardId: boardId,
    });
  });

  return { boardId, cardId };
}
