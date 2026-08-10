/**
 * The board switcher — a list of every board, so you can jump anywhere without
 * walking the tree.
 */

import { state } from "./store.js";
import { boardSummaries, deleteBoard } from "./boards.js";
import { navigateTo } from "./navigation.js";

let panel = null;
let button = null;
let onStatus = () => {};

export function initSwitcher(panelEl, buttonEl, statusCallback) {
  panel = panelEl;
  button = buttonEl;
  onStatus = statusCallback || (() => {});

  button.addEventListener("click", () => {
    if (panel.hidden) show();
    else hide();
  });

  window.addEventListener("pointerdown", (event) => {
    if (panel.hidden) return;

    // The button has to be excluded, or clicking it while open would close the
    // panel here and its own click handler would immediately reopen it.
    if (event.target.closest("#" + button.id)) return;

    if (!panel.contains(event.target)) hide();
  });
}

export const isOpen = () => panel && !panel.hidden;

export function hide() {
  if (panel) panel.hidden = true;
}

export function refresh() {
  if (!panel || panel.hidden) return;
  build();
}

function show() {
  build();
  panel.hidden = false;

  const box = button.getBoundingClientRect();
  panel.style.left = box.left + "px";
  panel.style.top = box.bottom + 4 + "px";
}

function build() {
  panel.replaceChildren();

  for (const board of boardSummaries()) {
    const row = document.createElement("div");
    row.className = "switcher-row";
    row.classList.toggle("is-current", board.id === state.currentBoardId);

    const open = document.createElement("button");
    open.type = "button";
    open.className = "switcher-open";
    open.append(board.title || "Untitled");

    const count = document.createElement("span");
    count.className = "switcher-count";
    count.textContent = board.count === 1 ? "1 card" : `${board.count} cards`;
    open.appendChild(count);

    // A switcher jump has no route, so it resets the breadcrumbs to a single
    // crumb rather than pretending you walked there.
    open.addEventListener("click", () => {
      navigateTo(board.id, "jump");
      hide();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "switcher-delete";
    remove.textContent = "×";
    remove.title = "Delete this board";
    remove.setAttribute("aria-label", `Delete ${board.title || "Untitled"}`);

    remove.addEventListener("click", () => {
      // Deleting never cascades: cards pointing here become visibly broken
      // links rather than disappearing along with the board.
      if (!deleteBoard(board.id)) {
        onStatus("That's the last board — there has to be one.");
        return;
      }
      onStatus(`Deleted ${board.title || "Untitled"} — Ctrl+Z to undo`);
      build();
    });

    row.append(open, remove);
    panel.appendChild(row);
  }
}
