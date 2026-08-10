/**
 * Drawing the card layer, plus the two ways a card gets created on the canvas:
 * double-clicking, and dropping image files.
 *
 * `render()` does NOT rebuild the canvas. It diffs the cards against a
 * `Map<id, element>` and reuses elements, because rebuilding wholesale destroys
 * focus, kills the caret, and swallows the element a click is landing on.
 * That reuse is the whole reason this app doesn't need a framework.
 */

import { CANVAS_SIZE, CARD_TYPES, DEFAULT_SIZE, TYPE_LABEL, clamp } from "./constants.js";
import { addCard, currentBoard, getSelectedId, select } from "./store.js";
import { buildCard, updateCard } from "./cards/index.js";
import { imageFilesFrom, importImage } from "./images.js";

const elements = new Map();

let scroller = null;
let canvas = null;
let picker = null;
let onImportError = () => {};

export function initCanvas(scrollerEl, canvasEl, pickerEl, errorCallback) {
  scroller = scrollerEl;
  canvas = canvasEl;
  picker = pickerEl;
  onImportError = errorCallback || (() => {});

  canvas.style.width = CANVAS_SIZE + "px";
  canvas.style.height = CANVAS_SIZE + "px";

  buildPicker();

  canvas.addEventListener("pointerdown", (event) => {
    if (event.target !== canvas) return;
    hidePicker();
    select(null);
  });

  canvas.addEventListener("dblclick", (event) => {
    if (event.target !== canvas) return;
    showPicker(event.clientX, event.clientY);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePicker();
  });

  initDropTarget();

  // Start near the top-left of the canvas rather than the middle of nowhere.
  scroller.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- render --- */

export function render() {
  const board = currentBoard();
  const selectedId = getSelectedId();
  const seen = new Set();

  board.cards.forEach((card, index) => {
    let el = elements.get(card.id);

    if (!el) {
      el = buildCard(card, scroller);
      elements.set(card.id, el);
      canvas.appendChild(el);
    }

    updateCard(el, card, index, selectedId);
    seen.add(card.id);
  });

  for (const [id, el] of elements) {
    if (seen.has(id)) continue;
    el.remove();
    elements.delete(id);
  }
}

/**
 * Selection only changes z-order and a class. It must not go through render(),
 * because selection happens on pointerdown and rebuilding then would destroy
 * the element the click is landing on.
 */
export function refreshStacking() {
  const selectedId = getSelectedId();

  currentBoard().cards.forEach((card, index) => {
    const el = elements.get(card.id);
    if (!el) return;
    el.style.zIndex = String(index + 1);
    el.classList.toggle("is-selected", card.id === selectedId);
  });
}

/* ---------------------------------------------------------------- picker --- */

function buildPicker() {
  for (const type of CARD_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = TYPE_LABEL[type];

    button.addEventListener("click", () => {
      const { x, y } = picker.__point;
      hidePicker();

      if (type === "image") {
        chooseImageFiles(x, y);
        return;
      }

      addCard(type, x, y);
      focusCard(getSelectedId());
    });

    picker.appendChild(button);
  }
}

function showPicker(clientX, clientY) {
  picker.__point = canvasPoint(clientX, clientY);
  picker.hidden = false;

  // Position in viewport coordinates, then nudge back inside the window if it
  // would hang off the right or bottom edge.
  const box = picker.getBoundingClientRect();
  picker.style.left = Math.min(clientX, window.innerWidth - box.width - 8) + "px";
  picker.style.top = Math.min(clientY, window.innerHeight - box.height - 8) + "px";

  picker.querySelector("button").focus();
}

export function hidePicker() {
  if (picker) picker.hidden = true;
}

/* ---------------------------------------------------------------- images --- */

function initDropTarget() {
  // Without preventDefault on dragover, the drop event never fires and the
  // window navigates to the file instead.
  scroller.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    scroller.classList.add("is-drop-target");
  });

  scroller.addEventListener("dragleave", (event) => {
    if (event.target === scroller) scroller.classList.remove("is-drop-target");
  });

  scroller.addEventListener("drop", (event) => {
    event.preventDefault();
    scroller.classList.remove("is-drop-target");

    const point = canvasPoint(event.clientX, event.clientY);
    addImageFiles(imageFilesFrom(event.dataTransfer.files), point.x, point.y);
  });
}

function chooseImageFiles(x, y) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => addImageFiles(imageFilesFrom(input.files), x, y));
  input.click();
}

/**
 * Imports run one after another rather than in parallel — each writes a file
 * and pushes a history entry, and a predictable left-to-right order is worth
 * more here than finishing a few milliseconds sooner.
 */
export async function addImageFiles(files, x, y) {
  let offset = 0;

  for (const file of files) {
    try {
      const fields = await importImage(file);
      if (!fields) {
        onImportError(`Could not read ${file.name}`);
        continue;
      }

      addCard("image", clamp(x + offset, 0, CANVAS_SIZE - fields.w), y, {
        ...fields,
        alt: file.name || "",
      });

      offset += 24;
    } catch (err) {
      onImportError(`Could not import ${file.name}: ${err.message}`);
    }
  }
}

/* ----------------------------------------------------------------- utils --- */

/** Converts a screen point to canvas coordinates. */
export function canvasPoint(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top };
}

/** Where a toolbar-created card should go: the middle of what you can see. */
export function viewportCentre(type) {
  const size = DEFAULT_SIZE[type];
  return {
    x: clamp(scroller.scrollLeft + scroller.clientWidth / 2 - size.w / 2, 0, CANVAS_SIZE - size.w),
    y: clamp(scroller.scrollTop + scroller.clientHeight / 2 - size.h / 2, 0, CANVAS_SIZE - size.h),
  };
}

export function focusCard(id) {
  const el = elements.get(id);
  if (!el) return;

  const field = el.__textarea || (el.__rowEls && el.__rowEls.values().next().value?.__input);
  if (field) field.focus();
}
