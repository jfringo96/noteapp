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

import { boardFace, renameBoard } from "../boards.js";
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

  const name = document.createElement("input");
  name.type = "text";
  name.className = "board-name";
  name.spellcheck = false;
  name.setAttribute("aria-label", "Board name");

  const meta = document.createElement("span");
  meta.className = "board-meta";

  name.addEventListener("focus", stashEdit);

  name.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target || !target.targetBoardId) return;
    stashEdit();
    renameBoard(target.targetBoardId, name.value);
    touch();
  });

  name.addEventListener("blur", commitEdit);

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
