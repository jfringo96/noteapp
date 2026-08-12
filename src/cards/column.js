/**
 * Column cards. A titled stack of other cards.
 *
 * A column OWNS its items — they are full cards living in `card.items`, not
 * references. Nothing else on the board holds them, so moving one in or out is
 * a splice from one list and a splice into another.
 *
 * Columns never contain other columns. One level of nesting, no recursion.
 * That single constraint is what keeps lookup, layout and dragging tractable.
 */

import { applyChange, commitEdit, getCard, getSelectedId, stashEdit, touch } from "../store.js";
import { describeContents } from "../boards.js";

// Set by cards/index.js at load. Avoids a cycle: index.js imports this module
// to render columns, and this module needs index.js to render their contents.
let renderItem = { build: () => null, update: () => {} };

export function setItemRenderer(renderer) {
  renderItem = renderer;
}

export function buildGrip(card, el, rail) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "card-grip-btn";
  toggle.title = "Collapse or expand";
  toggle.setAttribute("aria-label", "Collapse or expand this column");

  toggle.addEventListener("click", () => {
    applyChange(() => {
      const target = getCard(card.id);
      target.collapsed = !target.collapsed;
    });
  });

  el.__columnToggle = toggle;
  rail.appendChild(toggle);
}

export function build(card, el, body, scroller) {
  const head = document.createElement("div");
  head.className = "column-head";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "column-title";
  title.placeholder = "Untitled column";
  title.spellcheck = false;
  title.value = card.title || "";
  title.setAttribute("aria-label", "Column title");

  title.addEventListener("focus", stashEdit);
  title.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;
    stashEdit();
    target.title = title.value;
    touch();
  });
  title.addEventListener("blur", commitEdit);

  const count = document.createElement("span");
  count.className = "column-count";

  head.append(title, count);

  const items = document.createElement("div");
  items.className = "column-items";

  // Where a card would land if dropped right now. Absolutely positioned inside
  // the item list, so it can sit between two cards.
  const line = document.createElement("div");
  line.className = "column-line";
  line.hidden = true;

  items.appendChild(line);
  body.append(head, items);

  el.__columnTitle = title;
  el.__columnCount = count;
  el.__columnItems = items;
  el.__columnLine = line;
  el.__itemEls = new Map();
  el.__scroller = scroller;

  syncItems(card, el);
}

export function update(card, el) {
  el.classList.toggle("is-collapsed", !!card.collapsed);

  if (el.__columnToggle) el.__columnToggle.textContent = card.collapsed ? "+" : "–";

  if (document.activeElement !== el.__columnTitle && el.__columnTitle.value !== (card.title || "")) {
    el.__columnTitle.value = card.title || "";
  }

  el.__columnCount.textContent = describeContents(card.items);

  syncItems(card, el);
}

/**
 * Items are reconciled by card id, exactly like the cards on the canvas and
 * for the same reason: rebuilding would destroy the field the caret is in and
 * swallow whatever a click was landing on.
 */
function syncItems(card, el) {
  const host = el.__columnItems;
  const known = el.__itemEls;
  const selectedId = getSelectedId();
  const seen = new Set();

  card.items.forEach((item, index) => {
    let itemEl = known.get(item.id);

    if (!itemEl) {
      itemEl = renderItem.build(item, el.__scroller, { inColumn: true });
      known.set(item.id, itemEl);
    }

    // Placed BEFORE updating, not after: a text card sizes itself from its
    // scrollHeight, and an element outside the document has no height to read.
    if (host.children[index] !== itemEl) host.insertBefore(itemEl, host.children[index] || null);

    renderItem.update(itemEl, item, index, selectedId);
    seen.add(item.id);
  });

  for (const [id, itemEl] of known) {
    if (seen.has(id)) continue;
    itemEl.remove();
    known.delete(id);
  }

  // The drop line is a sibling of the items, so keep it last in the DOM or it
  // would occupy one of the positions we just placed cards into.
  host.appendChild(el.__columnLine);
}

/* ------------------------------------------------------------------ drop --- */

/**
 * The item elements in the order they are actually laid out.
 *
 * Read from the DOM rather than from `__itemEls`, because that Map keeps
 * insertion order — which stops matching visual order the first time anything
 * is reordered, and reordering is the whole point here.
 *
 * A card mid-lift is excluded: it is `position: fixed` under the pointer, so
 * its rectangle says nothing about where the gap should go.
 */
function laidOutItems(el) {
  return [...el.__columnItems.children].filter(
    (child) => child.classList.contains("card") && !child.classList.contains("is-lifted")
  );
}

/**
 * Which slot a pointer at `clientY` is aiming at: the first card whose middle
 * is below the pointer. Landing past the last card appends.
 */
export function dropIndexAt(el, clientY, excludeCardId) {
  const items = laidOutItems(el);

  for (let i = 0; i < items.length; i++) {
    if (items[i].dataset.id === excludeCardId) continue;

    const box = items[i].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return i;
  }

  return items.length;
}

/** Shows the insertion line at a slot, or hides it when `index` is null. */
export function showDropLine(el, index) {
  const line = el.__columnLine;
  if (!line) return;

  if (index === null) {
    line.hidden = true;
    return;
  }

  const host = el.__columnItems;
  const items = laidOutItems(el);
  const hostBox = host.getBoundingClientRect();

  let offset;
  if (items.length === 0) {
    offset = 0;
  } else if (index >= items.length) {
    offset = items[items.length - 1].getBoundingClientRect().bottom - hostBox.top + host.scrollTop;
  } else {
    offset = items[index].getBoundingClientRect().top - hostBox.top + host.scrollTop;
  }

  line.style.top = offset + "px";
  line.hidden = false;
}
