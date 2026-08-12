import { commitEdit, getCard, stashEdit, touch } from "../store.js";

export function build(card, el, body) {
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

export function update(card, el) {
  const textarea = el.__textarea;
  if (!textarea) return;

  // Never write into a focused field: it would move the caret to the end
  // mid-sentence. The field is already correct — it is what wrote the state.
  if (document.activeElement !== textarea && textarea.value !== card.text) {
    textarea.value = card.text;
  }

  if (el.__inColumn) fitToContent(textarea);
}

/**
 * On the canvas, cards grow to fit their content but never shrink, so a height
 * set by dragging the resize handle is respected.
 *
 * Inside a column there is no such height to respect — the column owns the
 * layout — so the field simply tracks its content in both directions.
 */
function grow(card, el, textarea) {
  if (el.__inColumn) {
    fitToContent(textarea);
    return;
  }

  const overflow = textarea.scrollHeight - textarea.clientHeight;
  if (overflow <= 0) return;

  card.h += overflow;
  el.style.height = card.h + "px";
}

function fitToContent(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}
