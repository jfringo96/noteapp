/**
 * The Map — every board in the collection, nested, from Home down.
 *
 * It replaces the flat alphabetical list this used to have. A flat list tells
 * you what exists; the Map tells you where things are, which is the question
 * you actually have when you're three boards deep and want the fourth.
 *
 * The nesting it draws is worked out in `boards.js` — see `boardTree()` for
 * why boards linked from two places, and boards that point at each other, both
 * behave sensibly here.
 */

import { boardTree, deleteBoard, isHome } from "./boards.js";
import { navigateTo } from "./navigation.js";
import { state } from "./store.js";
import { createPanel } from "./panel.js";

let panel = null;
let onStatus = () => {};

export function initMap(panelEl, buttonEl, statusCallback) {
  onStatus = statusCallback || (() => {});
  panel = createPanel(panelEl, buttonEl, build);
  return panel;
}

export const refreshMap = () => panel && panel.refresh();
export const hideMap = () => panel && panel.hide();

function build(el) {
  el.replaceChildren();

  const { root, orphans } = boardTree();
  if (root) el.appendChild(branch(root, 0));

  if (!orphans.length) return;

  const heading = document.createElement("div");
  heading.className = "menu-heading";
  heading.textContent = "Not linked from anywhere";
  heading.title = "These boards still exist, but no card points at them.";
  el.append(separator(), heading);

  for (const board of orphans) el.appendChild(branch(board, 0));
}

/** One board, and everything under it. */
function branch(node, depth) {
  const wrapper = document.createElement("div");
  wrapper.className = "map-branch";

  const row = document.createElement("div");
  row.className = "map-row";
  row.classList.toggle("is-current", node.id === state.currentBoardId);
  row.style.setProperty("--depth", depth);

  const open = document.createElement("button");
  open.type = "button";
  open.className = "map-open";

  const title = document.createElement("span");
  title.className = "map-title";
  title.textContent = node.title || "Untitled";
  open.appendChild(title);

  if (node.looped) {
    // Saying nothing here would make it look like an empty board rather than
    // one already open further up the same line.
    const note = document.createElement("span");
    note.className = "map-note";
    note.textContent = "already above";
    open.appendChild(note);
  } else {
    const count = document.createElement("span");
    count.className = "map-count";
    count.textContent = node.count === 1 ? "1 card" : `${node.count} cards`;
    open.appendChild(count);
  }

  // The Map knows the route it drew to get here, so going there can show that
  // route in the breadcrumbs instead of throwing it away.
  open.addEventListener("click", () => {
    navigateTo(node.id, "path", node.path);
    panel.hide();
  });

  row.appendChild(open);

  // Home has no delete: it is the root every trail and every branch hangs off.
  if (!isHome(node.id)) row.appendChild(deleteButton(node));

  wrapper.appendChild(row);

  for (const child of node.children) wrapper.appendChild(branch(child, depth + 1));

  return wrapper;
}

function deleteButton(node) {
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "map-delete";
  remove.textContent = "×";
  remove.title = "Delete this board";
  remove.setAttribute("aria-label", `Delete ${node.title || "Untitled"}`);

  remove.addEventListener("click", () => {
    // Deleting never cascades: cards pointing here become visibly broken links
    // rather than disappearing along with the board.
    if (!deleteBoard(node.id)) {
      onStatus("That board can't be deleted.");
      return;
    }

    onStatus(`Deleted ${node.title || "Untitled"} — Ctrl+Z to undo`);
    panel.refresh();
  });

  return remove;
}

function separator() {
  const line = document.createElement("div");
  line.className = "menu-sep";
  line.setAttribute("aria-hidden", "true");
  return line;
}
