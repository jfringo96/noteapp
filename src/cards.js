/**
 * Building and updating card elements.
 *
 * Elements are built once and then reused — see canvas.js. So `build` runs
 * rarely and `update` runs on every render, and `update` must be safe to run
 * while a field inside the card has focus.
 */

import { commitEdit, deleteCard, getCard, stashEdit, touch } from "./store.js";
import { attachDrag, attachResize } from "./gestures.js";

export function buildCard(card, scroller) {
  const el = document.createElement("div");
  el.className = "card card-" + card.type;
  el.dataset.id = card.id;

  const grip = document.createElement("div");
  grip.className = "card-grip";
  grip.title = "Drag to move";

  const del = document.createElement("button");
  del.className = "card-delete";
  del.type = "button";
  del.textContent = "×";
  del.title = "Delete card";
  del.setAttribute("aria-label", "Delete card");
  del.addEventListener("click", () => deleteCard(card.id));
  grip.appendChild(del);

  const body = document.createElement("div");
  body.className = "card-body";

  if (card.type === "text") buildText(card, el, body);

  const resize = document.createElement("div");
  resize.className = "card-resize";
  resize.title = "Drag to resize";

  el.append(grip, body, resize);

  attachDrag(grip, el, card.id, scroller);
  attachResize(resize, el, card.id, scroller);

  return el;
}

export function updateCard(el, card, index, selectedId) {
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.style.zIndex = String(index + 1);
  el.classList.toggle("is-selected", card.id === selectedId);

  if (card.type === "text") {
    const textarea = el.__textarea;
    // Never write into a focused field: it would move the caret to the end
    // mid-sentence. The field is already correct — it is what wrote the state.
    if (textarea && document.activeElement !== textarea && textarea.value !== card.text) {
      textarea.value = card.text;
    }
  }
}

/* ------------------------------------------------------------------ text --- */

function buildText(card, el, body) {
  const textarea = document.createElement("textarea");
  textarea.className = "card-text-input";
  textarea.value = card.text;
  textarea.spellcheck = false;
  textarea.placeholder = "…";
  textarea.setAttribute("aria-label", "Card text");

  // RULE 1: typing writes straight into state, with no history push and no
  // re-render. Re-rendering here would destroy focus and the caret.
  textarea.addEventListener("focus", stashEdit);

  textarea.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;

    // Stash before the write as well as on focus, so the snapshot is still
    // pre-change even if the focus event was somehow missed.
    stashEdit();
    target.text = textarea.value;
    grow(target, el, textarea);
    touch();
  });

  // One history entry per editing session, pushed when the session ends.
  textarea.addEventListener("blur", commitEdit);

  el.__textarea = textarea;
  body.appendChild(textarea);
}

/**
 * Cards grow to fit their content but never shrink, so a height set by dragging
 * the resize handle is respected.
 */
function grow(card, el, textarea) {
  const overflow = textarea.scrollHeight - textarea.clientHeight;
  if (overflow <= 0) return;

  card.h += overflow;
  el.style.height = card.h + "px";
}
