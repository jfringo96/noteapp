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
 * Deleting a board NEVER cascades. Cards pointing at it are left alone and
 * render as visibly broken links — losing a card because something it
 * referenced went away would be worse than showing the breakage.
 */
export function deleteBoard(id) {
  if (id === HOME_ID) return false; // Home is the root; there is no collection without it
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
