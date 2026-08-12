/**
 * Drag and resize.
 *
 * RULE 3: gestures move pixels, then commit once.
 *
 * During the gesture the element is moved visually and nothing touches state.
 * On pointerup, `applyChange()` is called exactly once. Committing per
 * pointermove would put hundreds of entries in the undo stack for one drag.
 *
 * Cards are always looked up by id, never captured in a closure: undo replaces
 * the whole state object, so a card reference held from build time goes stale.
 *
 * Two visual modes:
 *
 *   canvas cards  moved with `transform: translate()`, starting from (0,0),
 *                 which is what makes there be no jump on grab
 *   column items  lifted to `position: fixed` and flown under the pointer,
 *                 because a transform would be clipped by the column
 */

import { applyChange, getCard, minSize, select } from "./store.js";
import { CANVAS_SIZE, clamp } from "./constants.js";

/**
 * Registered from main.js rather than imported, because the hit-test lives in
 * canvas.js and canvas.js already imports the cards that import this file.
 * Injecting it keeps the import graph a tree.
 */
let resolveDrop = () => null;
let showFeedback = () => {};
let commitDrop = () => false;

export function setDropHandlers({ resolve, feedback, commit }) {
  resolveDrop = resolve;
  showFeedback = feedback;
  commitDrop = commit;
}

/**
 * How far the pointer must travel before it counts as a drag rather than a
 * click.
 *
 * This is what lets a whole card be draggable without swallowing its clicks.
 * Nothing is captured or prevented until the threshold is crossed, so a plain
 * click still produces click and dblclick as normal.
 */
const DRAG_THRESHOLD = 4;

export function attachDrag(surface, el, cardId, scroller, { lifted = false } = {}) {
  let pending = false;
  let active = false;
  let pointerId = null;
  let dx = 0;
  let dy = 0;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pointerX = 0;
  let pointerY = 0;
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  surface.addEventListener("pointerdown", (event) => {
    // Controls must never start a drag: the grip's buttons and colour picker,
    // a board's name field, and the resize handle, which has its own gesture.
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, label, .card-resize")) return;
    if (!getCard(cardId)) return;

    select(cardId);

    pending = true;
    active = false;
    pointerId = event.pointerId;
    dx = 0;
    dy = 0;
    startX = event.clientX;
    startY = event.clientY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    startScrollLeft = scroller.scrollLeft;
    startScrollTop = scroller.scrollTop;
  });

  function begin(event) {
    pending = false;
    active = true;

    if (lifted) {
      // Freeze the size before going fixed, or the card would collapse to
      // whatever `position: fixed` gives an auto-width element.
      const box = el.getBoundingClientRect();
      grabOffsetX = startX - box.left;
      grabOffsetY = startY - box.top;
      el.style.width = box.width + "px";
      el.style.height = box.height + "px";
      el.style.left = box.left + "px";
      el.style.top = box.top + "px";
      el.classList.add("is-lifted");
    }

    surface.setPointerCapture(event.pointerId);
    el.classList.add("is-dragging");
  }

  surface.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    if (!pending && !active) return;

    pointerX = event.clientX;
    pointerY = event.clientY;

    if (pending) {
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved < DRAG_THRESHOLD) return;
      begin(event);
    }

    // Only now, once this is definitely a drag, so text selection stops but
    // clicks were never interfered with.
    event.preventDefault();

    if (lifted) {
      el.style.left = event.clientX - grabOffsetX + "px";
      el.style.top = event.clientY - grabOffsetY + "px";
    } else {
      // The scroll terms keep the card under the pointer if the canvas scrolls
      // mid-gesture.
      dx = event.clientX - startX + (scroller.scrollLeft - startScrollLeft);
      dy = event.clientY - startY + (scroller.scrollTop - startScrollTop);
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Hit-test the POINTER, not the card. The aim should match the finger, not
    // wherever the card's corner happens to have drifted.
    showFeedback(resolveDrop(pointerX, pointerY, cardId, { lifted }));
  });

  const finish = () => {
    // Never crossed the threshold, so it was a click. Leave it alone — the
    // click and dblclick handlers are about to run.
    if (pending) {
      pending = false;
      pointerId = null;
      return;
    }

    if (!active) return;
    active = false;
    pointerId = null;

    const destination = resolveDrop(pointerX, pointerY, cardId, { lifted });
    showFeedback(null);

    el.classList.remove("is-dragging");
    el.style.transform = "";

    if (lifted) {
      el.classList.remove("is-lifted");
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
    }

    const card = getCard(cardId);
    if (!card) return;

    if (destination && commitDrop(cardId, destination)) return;

    // Nothing to drop onto. A canvas card is repositioned where you left it; a
    // card lifted out of a column snaps back, because it has no x/y to land on.
    if (lifted || (dx === 0 && dy === 0)) return;

    const x = Math.round(clamp(card.x + dx, 0, CANVAS_SIZE - card.w));
    const y = Math.round(clamp(card.y + dy, 0, CANVAS_SIZE - card.h));

    applyChange(() => {
      const target = getCard(cardId);
      target.x = x;
      target.y = y;
    });
  };

  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);
}

export function attachResize(handle, el, cardId, scroller) {
  let active = false;
  let w = 0;
  let h = 0;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const card = getCard(cardId);
    if (!card) return;

    select(cardId);

    active = true;
    w = card.w;
    h = card.h;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = scroller.scrollLeft;
    startScrollTop = scroller.scrollTop;

    handle.setPointerCapture(event.pointerId);
    el.classList.add("is-resizing");
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!active) return;

    const card = getCard(cardId);
    if (!card) return;

    const min = minSize(card.type);
    const dx = event.clientX - startX + (scroller.scrollLeft - startScrollLeft);
    const dy = event.clientY - startY + (scroller.scrollTop - startScrollTop);

    w = Math.round(clamp(card.w + dx, min.w, CANVAS_SIZE - card.x));
    h = Math.round(clamp(card.h + dy, min.h, CANVAS_SIZE - card.y));

    // Images keep their proportions: width leads, height follows. Letting them
    // stretch would misrepresent the photograph, which is the whole point of
    // having it on the board.
    if (card.type === "image" && card.naturalW && card.naturalH) {
      h = Math.round(clamp((w * card.naturalH) / card.naturalW, min.h, CANVAS_SIZE - card.y));
      w = Math.round(clamp((h * card.naturalW) / card.naturalH, min.w, CANVAS_SIZE - card.x));
    }

    el.style.width = w + "px";
    el.style.height = h + "px";
  });

  const finish = () => {
    if (!active) return;
    active = false;
    el.classList.remove("is-resizing");

    const card = getCard(cardId);
    if (!card || (card.w === w && card.h === h)) return;

    applyChange(() => {
      const target = getCard(cardId);
      target.w = w;
      target.h = h;
    });
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}
