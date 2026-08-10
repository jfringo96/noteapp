/**
 * Drag and resize.
 *
 * RULE 3: gestures move pixels, then commit once.
 *
 * During the gesture the element is moved with `transform: translate()` and
 * nothing touches state. On pointerup, `applyChange()` is called exactly once.
 * Committing per pointermove would put hundreds of entries in the undo stack
 * for one drag.
 *
 * Cards are always looked up by id, never captured in a closure: undo replaces
 * the whole state object, so a card reference held from build time goes stale.
 */

import { applyChange, getCard, minSize, select } from "./store.js";
import { CANVAS_SIZE, clamp } from "./constants.js";

export function attachDrag(grip, el, cardId, scroller) {
  let active = false;
  let dx = 0;
  let dy = 0;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  grip.addEventListener("pointerdown", (event) => {
    // Buttons living in the grip — delete, and the list's bullet/checkbox
    // toggle — must not start a drag. This handler calls preventDefault, which
    // swallows the click that would otherwise reach them.
    if (event.button !== 0 || event.target.closest("button")) return;
    if (!getCard(cardId)) return;

    select(cardId);

    active = true;
    dx = 0;
    dy = 0;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = scroller.scrollLeft;
    startScrollTop = scroller.scrollTop;

    grip.setPointerCapture(event.pointerId);
    el.classList.add("is-dragging");
    event.preventDefault();
  });

  grip.addEventListener("pointermove", (event) => {
    if (!active) return;

    // Starting from translate(0,0) is what makes there be no jump on grab,
    // wherever in the handle you grabbed. The scroll terms keep the card under
    // the pointer if the canvas scrolls mid-gesture.
    dx = event.clientX - startX + (scroller.scrollLeft - startScrollLeft);
    dy = event.clientY - startY + (scroller.scrollTop - startScrollTop);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  const finish = () => {
    if (!active) return;
    active = false;
    el.classList.remove("is-dragging");
    el.style.transform = "";

    const card = getCard(cardId);
    if (!card || (dx === 0 && dy === 0)) return; // a click, not a drag

    const x = Math.round(clamp(card.x + dx, 0, CANVAS_SIZE - card.w));
    const y = Math.round(clamp(card.y + dy, 0, CANVAS_SIZE - card.h));

    applyChange(() => {
      const target = getCard(cardId);
      target.x = x;
      target.y = y;
    });
  };

  grip.addEventListener("pointerup", finish);
  grip.addEventListener("pointercancel", finish);
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
