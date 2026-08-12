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

import { ACCENT_DEFAULT, COLOURABLE } from "./constants.js";
import { applyChange, commitEdit, getCard, getSelectedId, stashEdit, touch } from "./store.js";
import { setBoardCover } from "./boards.js";
import { importImage } from "./images.js";

let panel = null;
let repaint = () => {};
let onStatus = () => {};

export function initInspector({ element, repaint: repaintFn, status }) {
  panel = element;
  repaint = repaintFn || (() => {});
  onStatus = status || (() => {});
}

export function refreshInspector() {
  if (!panel) return;

  const id = getSelectedId();
  const card = id ? getCard(id) : null;

  // Rebuilt wholesale on purpose: it is a handful of buttons, it holds no
  // caret, and nothing in it is mid-gesture when the selection changes.
  panel.replaceChildren();
  panel.classList.toggle("is-empty", !card);
  if (!card) return;

  if (COLOURABLE.includes(card.type)) panel.appendChild(colourTool(card));
  if (card.type === "list") panel.appendChild(listStyleTool(card));

  if (card.type === "board") {
    panel.appendChild(pictureTool(card));
    if (card.targetBoardId) panel.appendChild(clearPictureTool(card));
  }

  if (card.type === "column") panel.appendChild(collapseTool(card));
}

/* ----------------------------------------------------------------- tools --- */

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

function collapseTool(card) {
  return tool(card.collapsed ? "Expand" : "Collapse", card.collapsed ? "+" : "–", () => {
    applyChange(() => {
      const target = getCard(card.id);
      target.collapsed = !target.collapsed;
    });
  });
}
