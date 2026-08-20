/**
 * Deleting a board, asked about properly.
 *
 * There is ONE way to delete a board and this is it, whether you got here from
 * the × in the Map, the × in the inspector, or the Delete key on a selected
 * tile. Deleting a tile *is* deleting the board it points at — a tile is not a
 * copy of a board or a shortcut to one, it is where that board is, and taking
 * one away while the board lived on was the confusing half of the old design.
 *
 * The only route that leaves a board alive but unlinked is choosing to keep it
 * when its parent is deleted. Nothing else strands a board.
 */

import { deleteBoard, isHome, nestedBoards } from "./boards.js";
import { confirmDelete } from "./confirm.js";
import { deleteCard, state } from "./store.js";

/**
 * Returns true if something was deleted.
 *
 * `cardId` is the tile you started from, when there was one. It matters for
 * the two cases where the board itself cannot be deleted but the tile still
 * should be: a tile pointing at Home, and a tile left over from a document
 * edited by hand whose board is already gone.
 */
export async function deleteBoardWithPrompt(boardId, { cardId = null, status = () => {} } = {}) {
  const board = state.boards[boardId];

  // Nothing to delete but the tile — the board it names isn't there.
  if (!board) {
    if (!cardId) return false;

    const answer = await confirmDelete({
      title: "Remove this tile?",
      message: "The board it pointed at is already gone, so there is nothing behind it.",
      confirmLabel: "Remove tile",
    });

    if (answer === null) return false;

    deleteCard(cardId);
    status("Tile removed — Ctrl+Z to undo");
    return true;
  }

  const name = board.title || "Untitled";

  /*
   * Home cannot be deleted, but a tile pointing at it can exist — the Map lets
   * Home be dragged onto a board like any other, which is a reasonable way to
   * make a way back from somewhere deep. So this offers the only thing it can.
   */
  if (isHome(boardId)) {
    if (!cardId) {
      status("Home can't be deleted — it's the board everything else hangs off.");
      return false;
    }

    const answer = await confirmDelete({
      title: "Remove this tile?",
      message: "Home itself can't be deleted — it's the board everything else hangs off.",
      confirmLabel: "Remove tile",
    });

    if (answer === null) return false;

    deleteCard(cardId);
    status("Tile removed — Home is untouched");
    return true;
  }

  const nested = nestedBoards(boardId);

  const answer = await confirmDelete({
    title: `Delete ${name}?`,
    message:
      "Everything on this board goes with it — notes, lists, links and pictures — " +
      "along with every tile pointing at it. Ctrl+Z puts it back.",
    choices: nested,
    choicesLabel: nested.length
      ? "There are boards inside it. Tick any that should be deleted too — the rest stay in the Map, unlinked."
      : "",
    confirmLabel: "Delete board",
  });

  if (answer === null) return false;

  if (!deleteBoard(boardId, answer)) {
    status("That board can't be deleted.");
    return false;
  }

  const kept = nested.length - answer.length;

  status(
    `Deleted ${name}` +
      (kept > 0 ? ` — ${kept} board${kept === 1 ? "" : "s"} left unlinked, find them in the Map` : "") +
      " — Ctrl+Z to undo"
  );

  return true;
}
