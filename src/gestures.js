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

import { applyChange, getCard, getSelectedIds, isSelected, minSize, select } from "./store.js";
import { CANVAS_SIZE, DRAG_THRESHOLD, clamp } from "./constants.js";

/**
 * Registered from main.js rather than imported, because the hit-test lives in
 * canvas.js and canvas.js already imports the cards that import this file.
 * Injecting it keeps the import graph a tree.
 */
let resolveDrop = () => null;
let showFeedback = () => {};
let commitDrop = () => false;
let elementFor = () => null;

export function setDropHandlers({ resolve, feedback, commit, elements }) {
  resolveDrop = resolve;
  showFeedback = feedback;
  commitDrop = commit;
  // Dragging a group has to move the other cards' elements, and the element
  // map lives in canvas.js.
  elementFor = elements || (() => null);
}

/**
 * How far the pointer must travel before it counts as a drag rather than a
 * click.
 *
 * This is what lets a whole card be draggable without swallowing its clicks.
 * Nothing is captured or prevented until the threshold is crossed, so a plain
 * click still produces click and dblclick as normal.
 */


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
  let companions = [];

  surface.addEventListener("pointerdown", (event) => {
    // Controls must never start a drag: the grip's buttons and colour picker,
    // a board's name field, and the resize handle, which has its own gesture.
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, label, .card-resize")) return;
    if (!getCard(cardId)) return;

    // Grabbing a card that is already part of a group keeps the group. Anything
    // else selects just this one — including a plain click on a card outside
    // the selection, which is how you get out of a group.
    if (!isSelected(cardId)) select(cardId);

    // Everything else that travels with it. Empty for an ordinary single drag,
    // which is the only reason all the group handling below costs nothing.
    companions = getSelectedIds().filter((id) => id !== cardId && elementFor(id));

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

      // The rest of the group rides along on the same offset.
      for (const id of companions) {
        const other = elementFor(id);
        if (other) other.style.transform = `translate(${dx}px, ${dy}px)`;
      }
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

    let destination = resolveDrop(pointerX, pointerY, cardId, { lifted });

    // Dropping a GROUP only understands "onto a board". A column drop asks
    // where in the stack each one goes, and there is no honest answer for
    // several at once — so a group over a column is a reposition, not a file.
    if (companions.length && destination && destination.kind !== "board") destination = null;

    showFeedback(null);

    el.classList.remove("is-dragging");
    el.style.transform = "";

    for (const id of companions) {
      const other = elementFor(id);
      if (other) other.style.transform = "";
    }

    if (lifted) {
      el.classList.remove("is-lifted");
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
    }

    const card = getCard(cardId);
    if (!card) return;

    if (destination && commitDrop(cardId, destination)) {
      // The group follows it. Each is moved separately because a destination
      // describes one card's landing, and every card has to survive the trip
      // even if one of them has gone in the meantime.
      for (const id of companions) commitDrop(id, destination);
      return;
    }

    // Nothing to drop onto. A canvas card is repositioned where you left it; a
    // card lifted out of a column snaps back, because it has no x/y to land on.
    if (lifted || (dx === 0 && dy === 0)) return;

    // One history entry for the whole group, so undo puts them all back at
    // once rather than one card per press.
    applyChange(() => {
      for (const id of [cardId, ...companions]) {
        const target = getCard(id);
        if (!target) continue;

        target.x = Math.round(clamp(target.x + dx, 0, CANVAS_SIZE - target.w));
        target.y = Math.round(clamp(target.y + dy, 0, CANVAS_SIZE - target.h));
      }
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
