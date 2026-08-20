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
import { BOARD_NAME_MAX, DEFAULT_SIZE, HOME_ID, MAP_MAX_DEPTH, uid } from "./constants.js";

/** Creates an empty board and returns its id. Does not navigate. */
export function createBoard(title = "Untitled board") {
  const id = uid("b");

  applyChange(() => {
    state.boards[id] = { id, title, cards: [] };
  });

  return id;
}

/**
 * Deletes a board, everything on it, and every tile pointing at it.
 *
 * Three rules, and each was a deliberate choice:
 *
 * 1. **The cards on it go.** Text, lists, links, places, columns and the image
 *    cards. The image FILES are a separate question — see `sweepImages`.
 * 2. **Tiles pointing at it go too, wherever they are.** A board can be linked
 *    from several places, and leaving those behind as "Missing board" tiles
 *    scattered around the collection is tidying up after yourself with a
 *    shovel. This reverses the earlier no-cascade rule, deliberately.
 * 3. **Nested boards only go if named.** They are separate documents that
 *    happen to be linked from here, so `alsoDelete` is decided by whoever is
 *    doing the deleting. Anything left out survives unlinked and shows up in
 *    the Map, where it can be dragged back onto a board.
 */
export function deleteBoard(id, alsoDelete = []) {
  if (id === HOME_ID) return false; // Home is the root; there is no collection without it
  if (!state.boards[id]) return false;

  const doomed = new Set([id]);
  for (const other of alsoDelete) {
    if (other !== HOME_ID && state.boards[other]) doomed.add(other);
  }

  applyChange(() => {
    for (const boardId of doomed) delete state.boards[boardId];

    const survives = (card) => !(card.type === "board" && doomed.has(card.targetBoardId));

    for (const board of Object.values(state.boards)) {
      board.cards = board.cards.filter(survives);

      // A board card sitting in a column is just as much a link to that board.
      for (const card of board.cards) {
        if (card.type === "column") card.items = card.items.filter(survives);
      }
    }

    // Standing on one of them? Home is the one board that always exists.
    if (doomed.has(state.currentBoardId)) state.currentBoardId = HOME_ID;
  });

  return true;
}

/** Which boards hold a tile pointing at this one. */
function boardsLinkingTo(targetId) {
  return Object.values(state.boards)
    .filter((board) => childBoardIds(board).includes(targetId))
    .map((board) => board.id);
}

/**
 * Every board nested under this one, however deep, each listed once.
 *
 * This is what the delete confirmation offers as a checklist. `depth` is for
 * indenting it, and `elsewhere` marks a board that is ALSO linked from outside
 * the branch being deleted — ticking that one removes it from somewhere you
 * are not currently looking at, which is worth knowing before you do it.
 *
 * Deduped and cycle-safe: boards point at each other freely, and a checklist
 * that listed the same board twice would let you tick it and untick it at the
 * same time.
 */
export function nestedBoards(rootId) {
  const found = [];
  const seen = new Set([rootId]);

  const walk = (id, depth) => {
    const board = state.boards[id];
    if (!board) return;

    for (const childId of childBoardIds(board)) {
      if (seen.has(childId)) continue;
      seen.add(childId);

      const child = state.boards[childId];
      if (!child) continue;

      found.push({ id: childId, title: child.title, depth });
      walk(childId, depth + 1);
    }
  };

  walk(rootId, 0);

  for (const entry of found) {
    entry.elsewhere = boardsLinkingTo(entry.id).some((boardId) => !seen.has(boardId));
  }

  return found;
}

/**
 * Points a new tile on the current board at a board that already exists.
 *
 * This is the way back for a board left unlinked by a deletion: drag it out of
 * the Map and drop it somewhere. Nesting is by reference, so this is only ever
 * adding a card — the board itself is untouched and every other tile pointing
 * at it carries on working.
 */
export function linkBoard(targetBoardId, x, y) {
  if (!state.boards[targetBoardId]) return null;

  const cardId = uid("c");
  const size = DEFAULT_SIZE.board;

  applyChange(() => {
    currentBoard().cards.push({
      id: cardId,
      type: "board",
      x: Math.round(x),
      y: Math.round(y),
      w: size.w,
      h: size.h,
      targetBoardId,
    });
  });

  return cardId;
}

/** Home keeps its name. Everything else is renamable. */
export function renameBoard(id, title) {
  if (id === HOME_ID) return false;

  const board = state.boards[id];
  if (!board) return false;

  board.title = cleanBoardName(title);
  return true;
}

/**
 * A board name is one line of plain text, within the tile's budget.
 *
 * The field enforces both already; this enforces them again for everything the
 * field isn't — a pasted paragraph, an imported document, a file edited by
 * hand. The renderer has nowhere to put a third line, so the rule belongs
 * where the value is set rather than where it is drawn.
 */
export const cleanBoardName = (title) =>
  String(title ?? "")
    // Not `trim()`: this runs on every keystroke, and trimming would eat the
    // space you just typed between two words.
    .replace(/[\s]+/g, " ")
    .slice(0, BOARD_NAME_MAX);

export const isHome = (id) => id === HOME_ID;

/**
 * What a board card should show. Returns null when the target is missing, so
 * the card can render as broken rather than throwing — an unresolvable
 * `targetBoardId` must always render.
 *
 * The count includes cards inside columns, because that is what "how much is
 * in there" means to someone looking at the card.
 */
export function boardFace(targetBoardId) {
  const board = state.boards[targetBoardId];
  if (!board) return null;

  const count = board.cards.reduce(
    (total, card) => total + (card.type === "column" ? card.items.length : 1),
    0
  );

  return { title: board.title, count, cover: board.cover || null };
}

/**
 * The cover picture lives on the BOARD, not on the card pointing at it — so
 * every card linking to that board shows it, exactly like the title does.
 * Pass null to clear it.
 */
export function setBoardCover(boardId, fields) {
  applyChange(() => {
    const board = state.boards[boardId];
    if (!board) return;

    board.cover = fields
      ? {
          imageId: fields.imageId,
          mime: fields.mime,
          naturalW: fields.naturalW,
          naturalH: fields.naturalH,
        }
      : null;
  });
}

/**
 * Counts boards and everything else separately, so a column can say
 * "3 boards, 1 card" rather than lumping them together.
 */
export function describeContents(cards) {
  const boards = cards.filter((card) => card.type === "board").length;
  const others = cards.length - boards;

  const parts = [];
  if (boards) parts.push(boards === 1 ? "1 board" : `${boards} boards`);
  if (others) parts.push(others === 1 ? "1 card" : `${others} cards`);

  return parts.join(", ") || "Empty";
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

/* ------------------------------------------------------------------- map --- */

/** Every board a card on this board points at, in the order they're laid out. */
function childBoardIds(board) {
  const ids = [];

  const collect = (card) => {
    if (card.type === "board" && card.targetBoardId) ids.push(card.targetBoardId);
  };

  for (const card of [...board.cards].sort((a, b) => a.y - b.y || a.x - b.x)) {
    collect(card);
    // A board card inside a column is still a link to that board, and columns
    // are where boards most often get put.
    if (card.type === "column") card.items.forEach(collect);
  }

  return ids;
}

/**
 * The Map: a nested list of every board, drawn outward from Home.
 *
 * Boards nest BY REFERENCE, so what this walks is a graph, not a tree — one
 * board can be linked from several places and two can point at each other.
 * Three rules make a tree out of that without lying about it:
 *
 *   1. A board linked from two places appears in both. It really is in both.
 *   2. A branch that loops back to a board already above it in the same line
 *      stops there and says so. That is what makes a cycle terminate.
 *   3. Depth is capped, so a long chain can't run away.
 *
 * Each node carries the `path` the Map walked to reach it, which is what lets
 * clicking a board set breadcrumbs to the route shown rather than dumping you
 * there with no trail.
 */
export function boardTree() {
  const seen = new Set();

  const node = (id, ancestors) => {
    const board = state.boards[id];
    if (!board) return null;

    seen.add(id);

    const path = [...ancestors, id];
    const looped = ancestors.includes(id);
    const deep = path.length > MAP_MAX_DEPTH;

    return {
      id,
      title: board.title,
      count: board.cards.length,
      path,
      looped,
      children:
        looped || deep
          ? []
          : childBoardIds(board)
              .map((childId) => node(childId, path))
              .filter(Boolean),
    };
  };

  const root = node(HOME_ID, []);

  // Boards nothing links to are still real and still hold cards — a board card
  // can be deleted while the board it pointed at stays. Losing them from the
  // Map would make them unreachable, so they get their own section.
  //
  // They are drawn as SUBTREES, not as a flat list. Deleting one board card can
  // strand a whole branch: the board it pointed at, plus everything nested
  // below that. Listing those side by side at the top level would throw away
  // the structure they still have. Only the boards nothing points at are roots
  // down here; the rest hang off them exactly as before.
  const linked = new Set();
  for (const board of Object.values(state.boards)) {
    for (const childId of childBoardIds(board)) linked.add(childId);
  }

  const orphans = [];
  const stranded = () => Object.values(state.boards).filter((board) => !seen.has(board.id));

  let remaining = stranded();

  while (remaining.length) {
    // Prefer a board nothing points at. Failing that — two stranded boards
    // pointing at each other, with nothing pointing at either — any of them
    // will do, or the loop never ends.
    const next = remaining.find((board) => !linked.has(board.id)) || remaining[0];

    const drawn = node(next.id, []);
    if (drawn) orphans.push(drawn);

    const before = remaining.length;
    remaining = stranded();
    if (remaining.length === before) break; // nothing was consumed; refuse to spin
  }

  orphans.sort((a, b) => a.title.localeCompare(b.title));

  return { root, orphans };
}
