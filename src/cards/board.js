/**
 * Board cards. A link to another board: a cover thumbnail, its name, and how
 * much is inside.
 *
 * The card stores only `targetBoardId`. Everything displayed — name, count,
 * cover picture — is read from the target board at render time, so renaming or
 * re-covering a board updates every card pointing at it, and nothing can drift
 * out of sync.
 *
 * On the canvas it is a rounded thumbnail with the text underneath, on no
 * background of its own. Inside a column it becomes a row: thumbnail on the
 * left, name and count stacked beside it. Both shapes are the same DOM — only
 * CSS differs.
 */

import { boardFace, cleanBoardName, renameBoard } from "../boards.js";
import { BOARD_NAME_MAX, UNTITLED_BOARD } from "../constants.js";
import { navigateTo } from "../navigation.js";
import { imageUrl } from "../images.js";
import { commitEdit, getCard, stashEdit, touch } from "../store.js";

export function build(card, el, body) {
  const face = document.createElement("div");
  face.className = "board-face";

  const thumb = document.createElement("div");
  thumb.className = "board-thumb";

  const cover = document.createElement("img");
  cover.className = "board-cover";
  cover.alt = "";
  cover.draggable = false;
  cover.hidden = true;

  // Choosing the picture lives in the left inspector, not on the thumbnail —
  // a button floating over the image was both ugly and easy to hit by mistake.
  thumb.appendChild(cover);

  const text = document.createElement("div");
  text.className = "board-text";

  /*
   * A textarea rather than a text input, for one reason: an input cannot wrap.
   * A board tile is narrow, so a name of any length used to run straight out of
   * view after a few words. This wraps onto a second line and stops there —
   * `BOARD_NAME_MAX` is set so a full-length name fits in those two lines.
   */
  const name = document.createElement("textarea");
  name.className = "board-name";
  name.rows = 2;
  name.placeholder = UNTITLED_BOARD;
  name.maxLength = BOARD_NAME_MAX;
  name.spellcheck = false;
  name.setAttribute("aria-label", "Board name");

  const meta = document.createElement("span");
  meta.className = "board-meta";

  name.addEventListener("focus", stashEdit);

  name.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target || !target.targetBoardId) return;

    // A textarea accepts things a name shouldn't hold — a pasted line break,
    // most obviously. Clean it, and put the cleaned text back in the field so
    // what you see is what got stored.
    const tidy = cleanBoardName(name.value);
    if (tidy !== name.value) name.value = tidy;

    stashEdit();
    renameBoard(target.targetBoardId, tidy);
    touch();
  });

  // Enter would add a line the tile has no room for. Committing the name is
  // the more useful thing for it to do.
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      name.blur();
    }
  });

  /*
   * A board left nameless gets called "Untitled board" when you look away.
   * It starts empty so the caret is the only thing on it, and that is only
   * comfortable if walking away can't leave a board with no name at all.
   */
  name.addEventListener("blur", () => {
    const target = getCard(card.id);

    if (target && target.targetBoardId && !name.value.trim()) {
      name.value = UNTITLED_BOARD;
      renameBoard(target.targetBoardId, UNTITLED_BOARD);
      touch();
    }

    commitEdit();
  });

  /*
   * Double-click opens the board. Single click just selects it, which is what
   * reveals the Picture button and makes the name editable.
   *
   * It used to open on a single click, which meant selecting a board to change
   * something about it was impossible — the click that selected it also
   * navigated away.
   */
  face.addEventListener("dblclick", (event) => {
    // Double-clicking the name once selected is word-select, not "open".
    if (event.target === name) return;

    const target = getCard(card.id);
    if (target && target.targetBoardId) navigateTo(target.targetBoardId, "link");
  });

  text.append(name, meta);
  face.append(thumb, text);
  body.appendChild(face);

  el.__boardName = name;
  el.__boardMeta = meta;
  el.__boardCover = cover;
  el.__boardThumb = thumb;
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
    el.__boardCover.hidden = true;
    return;
  }

  el.__boardName.readOnly = false;

  if (document.activeElement !== el.__boardName && el.__boardName.value !== face.title) {
    el.__boardName.value = face.title;
  }

  el.__boardMeta.textContent = face.count === 1 ? "1 card" : `${face.count} cards`;

  // A board wears its colour on the thumbnail — it hasn't got a top bar to
  // tint. Only visible where a cover picture isn't covering it.
  el.__boardThumb.style.background = card.accent || "";

  loadCover(face.cover, el);
}

async function loadCover(cover, el) {
  const id = cover ? cover.imageId : null;
  if (el.__coverFor === id) return;

  el.__coverFor = id;

  if (!id) {
    el.__boardCover.hidden = true;
    el.__boardCover.removeAttribute("src");
    return;
  }

  const url = await imageUrl(cover);

  // Another load may have started while awaiting. Whoever is current wins.
  if (el.__coverFor !== id) return;

  if (!url) {
    el.__boardCover.hidden = true;
    return;
  }

  el.__boardCover.src = url;
  el.__boardCover.hidden = false;
}

/*
 * Whether the name is reachable is driven purely by the `is-selected` class in
 * CSS (`pointer-events: none` until selected), NOT by anything set here.
 *
 * It has to be, because selection never re-renders — it only toggles that class
 * and the z-index. Anything decided in update() would go stale the moment you
 * clicked, which is exactly when it matters.
 */
