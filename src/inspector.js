/**
 * The left rail: controls for whatever is selected.
 *
 * Everything here used to live on the cards themselves — a colour chip in the
 * grip, a bullets/checkbox toggle beside it, a Picture button over a board's
 * thumbnail. That made the cards fiddly and the controls hard to find, and it
 * put a row of tiny targets on top of the content.
 *
 * The rail is always present so the canvas never shifts under you. It is simply
 * empty when nothing is selected.
 */

import { ACCENT_DEFAULT, CARD_TYPES, COLOURABLE, TYPE_GLYPH, TYPE_LABEL } from "./constants.js";
import {
  applyChange,
  commitEdit,
  deleteCard,
  getCard,
  getSelectedId,
  stashEdit,
  touch,
} from "./store.js";
import { setBoardCover } from "./boards.js";
import { deleteBoardWithPrompt } from "./deleteboard.js";
import { importImage } from "./images.js";
import { openLink } from "./cards/link.js";
import { openPlace } from "./cards/place.js";

let panel = null;
let repaint = () => {};
let onStatus = () => {};
let onAdd = () => {};

export function initInspector({ element, repaint: repaintFn, status, add }) {
  panel = element;
  repaint = repaintFn || (() => {});
  onStatus = status || (() => {});
  onAdd = add || (() => {});
}

export function refreshInspector() {
  if (!panel) return;

  const id = getSelectedId();
  const card = id ? getCard(id) : null;

  // Rebuilt wholesale on purpose: it is a handful of buttons, it holds no
  // caret, and nothing in it is mid-gesture when the selection changes.
  panel.replaceChildren();
  panel.classList.toggle("is-empty", !card);

  // With nothing selected the rail is where you pick what to add, like
  // Milanote's. It is the same rail either way, so the canvas never shifts.
  if (!card) {
    for (const type of CARD_TYPES) {
      panel.appendChild(addTool(type));
    }
    return;
  }

  if (COLOURABLE.includes(card.type)) panel.appendChild(colourTool(card));
  if (card.type === "list") panel.appendChild(listStyleTool(card));
  if (card.type === "link") panel.appendChild(openLinkTool(card));
  if (card.type === "place") panel.appendChild(openPlaceTool(card));

  if (card.type === "board") {
    panel.appendChild(pictureTool(card));
    if (card.targetBoardId) panel.appendChild(clearPictureTool(card));
  }

  if (card.type === "column") panel.appendChild(collapseTool(card));

  // Boards have no × on the card itself — removing the tile lives here.
  if (card.type === "board") panel.appendChild(deleteTool(card));
}

/* ----------------------------------------------------------------- tools --- */

/** How a card type dragged out of the rail identifies itself to the canvas. */
export const CARD_DRAG_TYPE = "application/x-noteapp-cardtype";

/**
 * A card type in the rail. Click drops it in the middle of the view; drag it
 * out to choose where it lands.
 *
 * Image is the exception and is not draggable: it opens the gallery, and what
 * you drag onto the board is a picture from in there rather than the idea of a
 * picture.
 */
function addTool(type) {
  const button = tool(TYPE_LABEL[type], TYPE_GLYPH[type], () => onAdd(type));

  if (type === "image") {
    button.title = "Pictures in this collection";
    return button;
  }

  button.draggable = true;
  button.classList.add("is-draggable");
  button.title = `${TYPE_LABEL[type]} — click to add, or drag onto the board`;

  button.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(CARD_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = "copy";
    button.classList.add("is-dragging");
  });

  button.addEventListener("dragend", () => button.classList.remove("is-dragging"));

  return button;
}

function tool(label, glyph, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool";
  button.title = label;

  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.textContent = glyph;

  const text = document.createElement("span");
  text.className = "tool-label";
  text.textContent = label;

  button.append(icon, text);
  button.addEventListener("click", onClick);
  return button;
}

/**
 * A native colour input dressed as a tool. The OS picker is better than
 * anything worth building here, and it costs one element.
 */
function colourTool(card) {
  const wrap = document.createElement("label");
  wrap.className = "tool";
  wrap.title = "Colour";

  const icon = document.createElement("span");
  icon.className = "tool-icon tool-swatch";
  icon.style.background = card.accent || ACCENT_DEFAULT;

  const input = document.createElement("input");
  input.type = "color";
  input.className = "tool-colour";
  input.value = card.accent || ACCENT_DEFAULT;
  input.setAttribute("aria-label", "Colour");

  input.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;

    stashEdit();
    target.accent = input.value;
    icon.style.background = input.value;
    repaint();
    touch();
  });

  // Dragging around the colour wheel fires input continuously; change fires
  // once when the dialog is dismissed. That is the end of the editing session.
  input.addEventListener("change", commitEdit);

  const text = document.createElement("span");
  text.className = "tool-label";
  text.textContent = "Colour";

  wrap.append(icon, input, text);
  return wrap;
}

function listStyleTool(card) {
  const checkable = !!card.checkable;

  return tool(checkable ? "Bullets" : "Tick boxes", checkable ? "•" : "☑", () => {
    applyChange(() => {
      const target = getCard(card.id);
      target.checkable = !target.checkable;
    });
  });
}

function pictureTool(card) {
  return tool("Picture", "▣", async () => {
    const target = getCard(card.id);
    if (!target || !target.targetBoardId) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      // Same pipeline as an image card: rotated, downscaled, written to disk.
      const fields = await importImage(file);
      if (fields) setBoardCover(target.targetBoardId, fields);
      else onStatus(`Could not read ${file.name}`);
    });

    input.click();
  });
}

function clearPictureTool(card) {
  return tool("No picture", "⌀", () => {
    const target = getCard(card.id);
    if (target && target.targetBoardId) setBoardCover(target.targetBoardId, null);
  });
}

function openLinkTool(card) {
  return tool("Open", "↗", async () => {
    const target = getCard(card.id);
    if (!target) return;
    if (!(await openLink(target))) onStatus("That doesn't look like a web address.");
  });
}

function openPlaceTool(card) {
  return tool("Map", "◎", async () => {
    const target = getCard(card.id);
    if (!target) return;
    if (!(await openPlace(target))) onStatus("Type a place, a postcode, or paste a Maps link.");
  });
}

/**
 * Deleting a board tile deletes the board.
 *
 * A tile is not a shortcut to a board or a copy of one — it is where that board
 * is. So there is no separate "just unlink this" action: the only way a board
 * ends up alive but unlinked is being kept when its parent was deleted.
 *
 * The prompt, the checklist of boards inside it and the rules all live in
 * `deleteboard.js`, shared with the Map's × and the Delete key, so the three
 * routes cannot drift apart.
 */
function deleteTool(card) {
  const button = tool("Delete", "×", () =>
    deleteBoardWithPrompt(card.targetBoardId, { cardId: card.id, status: onStatus })
  );

  button.classList.add("tool-danger");
  return button;
}

function collapseTool(card) {
  return tool(card.collapsed ? "Expand" : "Collapse", card.collapsed ? "+" : "–", () => {
    applyChange(() => {
      const target = getCard(card.id);
      target.collapsed = !target.collapsed;
    });
  });
}
