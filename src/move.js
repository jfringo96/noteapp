/**
 * Moving a card somewhere else.
 *
 * There are three places a card can end up, and one function handles all of
 * them so the rules live in a single place:
 *
 *   { kind: "canvas", x, y }            loose on the board
 *   { kind: "column", columnId, index } inside a column, at a position
 *   { kind: "board",  boardId }         moved to another board entirely
 *
 * Every move is a splice out and a splice in, because no card is ever owned by
 * two lists at once.
 */

import { applyChange, currentBoard, findCardEntry, state } from "./store.js";

export function moveCard(cardId, destination) {
  const entry = findCardEntry(cardId);
  if (!entry) return false;

  const card = entry.list[entry.index];

  if (destination.kind === "column") return intoColumn(cardId, card, entry, destination);
  if (destination.kind === "canvas") return ontoCanvas(cardId, entry, destination);
  if (destination.kind === "board") return ontoBoard(cardId, destination.boardId);

  return false;
}

function intoColumn(cardId, card, entry, { columnId, index }) {
  // Columns never nest. One level, no recursion.
  if (card.type === "column") return false;

  const column = currentBoard().cards.find((c) => c.id === columnId);
  if (!column || column.type !== "column") return false;

  // Already exactly there — dropping in the same slot is not a change, and
  // pushing an undo entry for it would be noise.
  if (entry.columnId === columnId && (entry.index === index || entry.index === index - 1)) {
    return false;
  }

  applyChange(() => {
    const from = findCardEntry(cardId);
    const [moved] = from.list.splice(from.index, 1);

    const target = currentBoard().cards.find((c) => c.id === columnId);

    // Removing from earlier in the same list shifts everything after it down,
    // so the insertion point moves with it.
    const at = from.columnId === columnId && from.index < index ? index - 1 : index;

    target.items.splice(Math.max(0, Math.min(at, target.items.length)), 0, moved);
  });

  return true;
}

function ontoCanvas(cardId, entry, { x, y }) {
  // Already loose on the board — the drag handler repositions it instead.
  if (!entry.columnId) return false;

  applyChange(() => {
    const from = findCardEntry(cardId);
    const [moved] = from.list.splice(from.index, 1);

    moved.x = Math.round(x);
    moved.y = Math.round(y);
    currentBoard().cards.push(moved);
  });

  return true;
}

/**
 * The card keeps its x/y, so it can land overlapping something already on the
 * destination board. No auto-placement — guessing where you meant it to go
 * would be worse than leaving it where it was.
 */
function ontoBoard(cardId, boardId) {
  if (!state.boards[boardId]) return false;

  applyChange(() => {
    const from = findCardEntry(cardId);
    const [moved] = from.list.splice(from.index, 1);
    state.boards[boardId].cards.push(moved);
  });

  return true;
}
