/**
 * List cards. Rows of single-line inputs, bullets or checkboxes.
 *
 * Rows are reconciled by item id for the same reason cards are: rebuilding
 * them would destroy the input the caret is currently in, and Enter/Backspace
 * both need the caret to land somewhere specific afterwards.
 */

import { applyChange, commitEdit, getCard, stashEdit, touch } from "../store.js";
import { uid } from "../constants.js";

export function buildGrip(card, el, rail) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "card-grip-btn";
  toggle.title = "Switch between bullets and checkboxes";
  toggle.setAttribute("aria-label", "Switch between bullets and checkboxes");

  toggle.addEventListener("click", () => {
    applyChange(() => {
      const target = getCard(card.id);
      target.checkable = !target.checkable;
    });
  });

  el.__listToggle = toggle;
  rail.appendChild(toggle);
}

export function build(card, el, body) {
  const rows = document.createElement("div");
  rows.className = "list-rows";

  el.__rows = rows;
  el.__rowEls = new Map();

  body.appendChild(rows);
  syncRows(card, el);
}

export function update(card, el) {
  if (el.__listToggle) el.__listToggle.textContent = card.checkable ? "☑" : "•";
  syncRows(card, el);
}

function syncRows(card, el) {
  const rows = el.__rows;
  const known = el.__rowEls;
  const seen = new Set();

  (card.items || []).forEach((item, index) => {
    let row = known.get(item.id);

    if (!row) {
      row = buildRow(card, el, item);
      known.set(item.id, row);
    }

    updateRow(row, card, item);
    if (rows.children[index] !== row) rows.insertBefore(row, rows.children[index] || null);
    seen.add(item.id);
  });

  for (const [id, row] of known) {
    if (seen.has(id)) continue;
    row.remove();
    known.delete(id);
  }
}

function buildRow(card, el, item) {
  const row = document.createElement("div");
  row.className = "list-row";
  row.dataset.item = item.id;

  // Both markers always exist and CSS shows one, so toggling bullets and
  // checkboxes never rebuilds the row or disturbs the caret.
  const bullet = document.createElement("span");
  bullet.className = "list-bullet";
  bullet.setAttribute("aria-hidden", "true");

  const box = document.createElement("input");
  box.type = "checkbox";
  box.className = "list-check";
  box.setAttribute("aria-label", "Done");
  box.addEventListener("change", () => {
    applyChange(() => {
      const target = findItem(card.id, item.id);
      if (target) target.checked = box.checked;
    });
  });

  const input = document.createElement("input");
  input.type = "text";
  input.className = "list-input";
  input.value = item.text;
  input.spellcheck = false;
  input.setAttribute("aria-label", "List item");

  input.addEventListener("focus", stashEdit);

  input.addEventListener("input", () => {
    const target = findItem(card.id, item.id);
    if (!target) return;
    stashEdit();
    target.text = input.value;
    touch();
  });

  input.addEventListener("blur", commitEdit);
  input.addEventListener("keydown", (event) => onRowKey(event, card.id, item.id, el));

  row.__input = input;
  row.__box = box;
  row.append(bullet, box, input);

  return row;
}

function updateRow(row, card, item) {
  row.classList.toggle("is-checkable", !!card.checkable);
  row.classList.toggle("is-checked", !!card.checkable && !!item.checked);
  row.__box.checked = !!item.checked;

  if (document.activeElement !== row.__input && row.__input.value !== item.text) {
    row.__input.value = item.text;
  }
}

/**
 * Enter adds a row below and focuses it. Backspace on an empty row deletes it
 * and puts the caret at the end of the row above.
 *
 * Both are structural, so both go through applyChange() — which seals the
 * in-flight typing first, giving one history entry for what you typed and a
 * separate one for the row you added.
 */
function onRowKey(event, cardId, itemId, el) {
  const card = getCard(cardId);
  if (!card) return;

  const index = card.items.findIndex((i) => i.id === itemId);
  if (index < 0) return;

  if (event.key === "Enter") {
    event.preventDefault();
    const newId = uid("i");

    applyChange(() => {
      const target = getCard(cardId);
      target.items.splice(index + 1, 0, { id: newId, text: "", checked: false });
    });

    focusItem(el, newId, "start");
    return;
  }

  const input = event.target;
  const emptyRow = input.value === "" && input.selectionStart === 0;

  if (event.key === "Backspace" && emptyRow && card.items.length > 1) {
    event.preventDefault();
    const previousId = index > 0 ? card.items[index - 1].id : card.items[1].id;

    applyChange(() => {
      const target = getCard(cardId);
      target.items.splice(index, 1);
    });

    focusItem(el, previousId, "end");
  }
}

function focusItem(el, itemId, where) {
  const row = el.__rowEls.get(itemId);
  if (!row) return;

  const input = row.__input;
  input.focus();

  const position = where === "end" ? input.value.length : 0;
  input.setSelectionRange(position, position);
}

function findItem(cardId, itemId) {
  const card = getCard(cardId);
  return card && card.items ? card.items.find((i) => i.id === itemId) : null;
}
