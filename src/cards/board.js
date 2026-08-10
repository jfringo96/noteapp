/**
 * Board cards. A link to another board, showing its title and card count.
 *
 * The card stores only `targetBoardId`. Everything displayed is read from the
 * target board at render time, so renaming a board updates every card pointing
 * at it, and nothing can drift out of sync.
 */

import { boardFace, renameBoard } from "../boards.js";
import { navigateTo } from "../navigation.js";
import { commitEdit, getCard, getSelectedId, stashEdit, touch } from "../store.js";

export function build(card, el, body) {
  const face = document.createElement("div");
  face.className = "board-face";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "board-name";
  title.spellcheck = false;
  title.setAttribute("aria-label", "Board name");

  const meta = document.createElement("span");
  meta.className = "board-meta";

  title.addEventListener("focus", stashEdit);

  title.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target || !target.targetBoardId) return;
    stashEdit();
    renameBoard(target.targetBoardId, title.value);
    touch();
  });

  title.addEventListener("blur", commitEdit);

  /*
   * The click rule, copied from Milanote and from the prototype:
   *
   *   unselected — clicking anywhere opens the board, including over the title
   *   selected   — the title becomes a rename field and swallows the click
   *
   * It has to be armed on pointerdown, because the card selects itself before
   * the click event lands. By the time `click` fires, `getSelectedId()` already
   * says this card — so asking then would mean it never opened.
   */
  let armed = false;

  face.addEventListener("pointerdown", () => {
    armed = getSelectedId() !== card.id;
  });

  face.addEventListener("click", () => {
    if (!armed) return;
    armed = false;

    const target = getCard(card.id);
    if (target && target.targetBoardId) navigateTo(target.targetBoardId, "link");
  });

  face.append(title, meta);
  body.appendChild(face);

  el.__boardName = title;
  el.__boardMeta = meta;
}

export function update(card, el) {
  const face = boardFace(card.targetBoardId);

  // An unresolvable target must render, never throw. Deleting a board
  // deliberately leaves cards pointing at it as visibly broken links.
  el.classList.toggle("is-broken", !face);

  if (!face) {
    el.__boardName.value = "Missing board";
    el.__boardName.readOnly = true;
    el.__boardMeta.textContent = "this board was deleted";
    return;
  }

  el.__boardName.readOnly = false;

  if (document.activeElement !== el.__boardName && el.__boardName.value !== face.title) {
    el.__boardName.value = face.title;
  }

  el.__boardMeta.textContent = face.count === 1 ? "1 card" : `${face.count} cards`;
}

/*
 * Whether the name is clickable is driven purely by the `is-selected` class in
 * CSS (`pointer-events: none` until selected), NOT by anything set here.
 *
 * It has to be, because selection never re-renders — it only toggles that
 * class and the z-index. Anything decided in update() would go stale the moment
 * you clicked, which is exactly when it matters.
 */
