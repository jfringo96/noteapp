/**
 * Drawing the card layer.
 *
 * `render()` does NOT rebuild the canvas. It diffs the cards against a
 * `Map<id, element>` and reuses elements, because rebuilding wholesale destroys
 * focus, kills the caret, and swallows the element a click is landing on.
 * That reuse is the whole reason this app doesn't need a framework.
 */

import { CANVAS_SIZE, DEFAULT_SIZE, clamp } from "./constants.js";
import { addCard, currentBoard, getSelectedId, select } from "./store.js";
import { buildCard, updateCard } from "./cards.js";

const elements = new Map();

let scroller = null;
let canvas = null;

export function initCanvas(scrollerEl, canvasEl) {
  scroller = scrollerEl;
  canvas = canvasEl;

  canvas.style.width = CANVAS_SIZE + "px";
  canvas.style.height = CANVAS_SIZE + "px";

  // Clicking bare canvas deselects. Cards stop this from reaching here.
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target === canvas) select(null);
  });

  canvas.addEventListener("dblclick", (event) => {
    if (event.target !== canvas) return;
    const point = canvasPoint(event.clientX, event.clientY);
    addCard("text", point.x, point.y);
    focusCard(getSelectedId());
  });

  // Start near the top-left of the canvas rather than the middle of nowhere.
  scroller.scrollTo(0, 0);
}

export function render() {
  const board = currentBoard();
  const selectedId = getSelectedId();
  const seen = new Set();

  board.cards.forEach((card, index) => {
    let el = elements.get(card.id);

    if (!el) {
      el = buildCard(card, scroller);
      elements.set(card.id, el);
      canvas.appendChild(el);
    }

    updateCard(el, card, index, selectedId);
    seen.add(card.id);
  });

  for (const [id, el] of elements) {
    if (seen.has(id)) continue;
    el.remove();
    elements.delete(id);
  }
}

/**
 * Selection only changes z-order and a class. It must not go through render(),
 * because selection happens on pointerdown and rebuilding then would destroy
 * the element the click is landing on.
 */
export function refreshStacking() {
  const selectedId = getSelectedId();

  currentBoard().cards.forEach((card, index) => {
    const el = elements.get(card.id);
    if (!el) return;
    el.style.zIndex = String(index + 1);
    el.classList.toggle("is-selected", card.id === selectedId);
  });
}

/** Converts a screen point to canvas coordinates. */
export function canvasPoint(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top };
}

/** Where a toolbar-created card should go: the middle of what you can see. */
export function viewportCentre(type) {
  const size = DEFAULT_SIZE[type];
  return {
    x: clamp(scroller.scrollLeft + scroller.clientWidth / 2 - size.w / 2, 0, CANVAS_SIZE - size.w),
    y: clamp(scroller.scrollTop + scroller.clientHeight / 2 - size.h / 2, 0, CANVAS_SIZE - size.h),
  };
}

export function focusCard(id) {
  const el = elements.get(id);
  if (el && el.__textarea) el.__textarea.focus();
}
