/**
 * Deciding where a dragged card would land, and showing it.
 *
 * The rules are all about intent: hit-test the POINTER rather than the card, so
 * the aim matches the finger, and check front-to-back so the topmost thing
 * under it wins.
 */

import { currentBoard, getCard, state } from "./store.js";
import { COLUMNABLE } from "./constants.js";
import { dropIndexAt, showDropLine } from "./cards/column.js";

let elementFor = () => null;
let toCanvasPoint = () => ({ x: 0, y: 0 });

export function initDrop({ elements, canvasPoint }) {
  elementFor = elements;
  toCanvasPoint = canvasPoint;
}

const contains = (box, x, y) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * Returns one of:
 *
 *   { kind: "board",  boardId, el }          move to another board
 *   { kind: "column", columnId, index, el }  into a column, at a slot
 *   { kind: "canvas", x, y }                 loose on the board
 *   null                                     nothing would change
 *
 * A board card beats a column when both are under the pointer, because
 * dropping onto a board is the more specific intent — and a board card can
 * itself be sitting inside a column.
 */
export function resolveDrop(clientX, clientY, cardId, { lifted } = {}) {
  const cards = currentBoard().cards;

  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (card.id === cardId) continue;

    const el = elementFor(card.id);
    if (!el || !contains(el.getBoundingClientRect(), clientX, clientY)) continue;

    // A board card is never its own drop target, and nor is one pointing back
    // at the board you are already on — moving a card to where it already is
    // would be a no-op that looked like it worked.
    if (card.type === "board") {
      if (!card.targetBoardId || card.targetBoardId === state.currentBoardId) continue;
      if (!state.boards[card.targetBoardId]) continue;
      return { kind: "board", boardId: card.targetBoardId, el };
    }

    if (card.type === "column" && !card.collapsed) {
      // A column holds cards, not everything. Columns never nest, and a line
      // is geometry on the board — inside a stack it has no coordinates to be
      // drawn from. Checked here as well as in move.js so the drop line never
      // appears over a column that would refuse the card anyway.
      const dragged = getCard(cardId);
      if (dragged && !COLUMNABLE.includes(dragged.type)) continue;

      return { kind: "column", columnId: card.id, index: dropIndexAt(el, clientY, cardId), el };
    }
  }

  // Over bare canvas. Only meaningful for something lifted out of a column — a
  // card already loose on the board is just repositioned by the drag itself.
  if (!lifted) return null;

  const point = toCanvasPoint(clientX, clientY);
  return { kind: "canvas", x: point.x, y: point.y };
}

let highlighted = null;

/** Highlights whatever the drop would land on. Pass null to clear. */
export function showDropFeedback(destination) {
  const next = destination ? destination.el || null : null;

  if (highlighted && highlighted !== next) {
    highlighted.classList.remove("is-drop-target");
    if (highlighted.__columnLine) showDropLine(highlighted, null);
  }

  highlighted = next;
  if (!highlighted) return;

  highlighted.classList.add("is-drop-target");
  if (destination.kind === "column") showDropLine(highlighted, destination.index);
}
