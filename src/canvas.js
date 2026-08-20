/**
 * Drawing the card layer, plus the two ways a card gets created on the canvas:
 * double-clicking, and dropping image files.
 *
 * `render()` does NOT rebuild the canvas. It diffs the cards against a
 * `Map<id, element>` and reuses elements, because rebuilding wholesale destroys
 * focus, kills the caret, and swallows the element a click is landing on.
 * That reuse is the whole reason this app doesn't need a framework.
 */

import {
  CANVAS_SIZE,
  CARD_TYPES,
  DEFAULT_SIZE,
  IMAGE_CARD_EDGE,
  TYPE_LABEL,
  clamp,
} from "./constants.js";
import { addCard, currentBoard, getSelectedId, select } from "./store.js";
import { addBoardCard, linkBoard } from "./boards.js";
import { BOARD_DRAG_TYPE } from "./map.js";
import { IMAGE_DRAG_TYPE, galleryOffset } from "./gallerypanel.js";
import { addToGallery, galleryEntry } from "./gallery.js";
import { CARD_DRAG_TYPE } from "./inspector.js";
import { buildCard, updateCard } from "./cards/index.js";
import { initDrop } from "./drop.js";
import { imageFilesFrom, importImage } from "./images.js";

const elements = new Map();

/** boardId -> {x, y}. Runtime only — you would not want undo restoring scroll. */
const scrollMemory = new Map();

let scroller = null;
let canvas = null;
let picker = null;
let onImportError = () => {};
let displayedBoardId = null;

export function initCanvas(scrollerEl, canvasEl, pickerEl, errorCallback) {
  scroller = scrollerEl;
  canvas = canvasEl;
  picker = pickerEl;
  onImportError = errorCallback || (() => {});

  canvas.style.width = CANVAS_SIZE + "px";
  canvas.style.height = CANVAS_SIZE + "px";

  buildPicker();

  // The drop logic needs to look elements up and convert screen coordinates,
  // both of which live here. Injected rather than imported, to keep drop.js
  // from depending on the whole canvas.
  initDrop({ elements: (id) => elements.get(id) || null, canvasPoint });

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

  // Switching board is the one time a wholesale rebuild is right: none of the
  // existing elements belong to the board being drawn.
  if (displayedBoardId !== board.id) {
    if (displayedBoardId) {
      scrollMemory.set(displayedBoardId, { x: scroller.scrollLeft, y: scroller.scrollTop });
    }

    for (const el of elements.values()) el.remove();
    elements.clear();
    displayedBoardId = board.id;

    const remembered = scrollMemory.get(board.id) || { x: 0, y: 0 };
    scroller.scrollTo(remembered.x, remembered.y);
  }

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

    // Cards inside a column live in the column's own element map, not this
    // one, so they have to be reached separately or selecting one would show
    // nothing until the next full render.
    if (card.type === "column" && el.__itemEls) {
      for (const [id, itemEl] of el.__itemEls) {
        itemEl.classList.toggle("is-selected", id === selectedId);
      }
    }
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

      if (type === "board") {
        createBoardCard(x, y);
        return;
      }

      addCard(type, x, y);
      focusNewCard(type, getSelectedId());
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
  const carriesBoard = (event) => [...event.dataTransfer.types].includes(BOARD_DRAG_TYPE);

  // Without preventDefault on dragover, the drop event never fires and the
  // window navigates to the file instead.
  scroller.addEventListener("dragover", (event) => {
    event.preventDefault();
    // "link" rather than "copy": dropping a board out of the Map points a new
    // tile at the board that is already there, it does not duplicate it.
    event.dataTransfer.dropEffect = carriesBoard(event) ? "link" : "copy";
    scroller.classList.add("is-drop-target");
  });

  scroller.addEventListener("dragleave", (event) => {
    if (event.target === scroller) scroller.classList.remove("is-drop-target");
  });

  scroller.addEventListener("drop", (event) => {
    event.preventDefault();
    scroller.classList.remove("is-drop-target");

    const point = canvasPoint(event.clientX, event.clientY);

    const boardId = event.dataTransfer.getData(BOARD_DRAG_TYPE);
    if (boardId) {
      dropBoard(boardId, point.x, point.y);
      return;
    }

    const imageId = event.dataTransfer.getData(IMAGE_DRAG_TYPE);
    if (imageId) {
      dropGalleryImage(imageId, point.x, point.y);
      return;
    }

    const cardType = event.dataTransfer.getData(CARD_DRAG_TYPE);
    if (cardType) {
      dropNewCard(cardType, point.x, point.y);
      return;
    }

    const files = imageFilesFrom(event.dataTransfer.files);
    if (files.length) {
      addImageFiles(files, point.x, point.y);
      return;
    }

    /*
     * An image dragged out of a web page arrives as a URL, not as bytes —
     * fetching it would be the app's first outbound request, and it doesn't
     * make any. Copying the picture puts the actual bitmap on the clipboard,
     * which needs no network at all, so say so rather than failing silently.
     */
    if ([...event.dataTransfer.types].some((type) => type === "text/uri-list" || type === "text/html")) {
      onImportError("Noteapp never goes online, so it can't fetch that. Copy the picture and paste it here instead.");
    }
  });
}

/**
 * A board dragged out of the Map and dropped here.
 *
 * Centred on the pointer, like every other drop, and clamped so a tile aimed
 * at the edge of the canvas doesn't end up half outside it.
 */
export function placeGalleryImage(imageId) {
  const entry = galleryEntry(imageId);
  if (!entry) return false;

  // The middle of what you can see, which is not the middle of the scroller
  // while the gallery drawer is covering its left-hand side.
  const covered = galleryOffset();
  const centre = {
    x: scroller.scrollLeft + covered + (scroller.clientWidth - covered) / 2,
    y: scroller.scrollTop + scroller.clientHeight / 2,
  };

  return dropGalleryImage(imageId, centre.x, centre.y);
}

function dropGalleryImage(imageId, x, y) {
  const entry = galleryEntry(imageId);
  if (!entry) {
    onImportError("That picture is no longer in the gallery.");
    return false;
  }

  const size = cardSizeFor(entry);

  addCard(
    "image",
    clamp(x - size.w / 2, 0, CANVAS_SIZE - size.w),
    clamp(y - size.h / 2, 0, CANVAS_SIZE - size.h),
    {
      imageId: entry.imageId,
      mime: entry.mime,
      naturalW: entry.naturalW,
      naturalH: entry.naturalH,
      alt: entry.name || "",
      ...size,
    }
  );

  return true;
}

/** Fits a gallery picture into a sensible card without distorting it. */
function cardSizeFor(entry) {
  const scale = Math.min(1, IMAGE_CARD_EDGE / entry.naturalW, IMAGE_CARD_EDGE / entry.naturalH);
  return {
    w: Math.max(1, Math.round(entry.naturalW * scale)),
    h: Math.max(1, Math.round(entry.naturalH * scale)),
  };
}

/**
 * A card type dragged out of the left rail.
 *
 * Clicking a rail button still drops the card in the middle of the view, which
 * is right when you don't care where it goes. Dragging is for when you do.
 */
function dropNewCard(type, x, y) {
  const size = DEFAULT_SIZE[type];
  if (!size) return;

  const left = clamp(x - size.w / 2, 0, CANVAS_SIZE - size.w);
  const top = clamp(y - size.h / 2, 0, CANVAS_SIZE - size.h);

  if (type === "board") {
    createBoardCard(left, top);
    return;
  }

  addCard(type, left, top);
  focusNewCard(type, getSelectedId());
}

function dropBoard(boardId, x, y) {
  const size = DEFAULT_SIZE.board;

  const cardId = linkBoard(
    boardId,
    clamp(x - size.w / 2, 0, CANVAS_SIZE - size.w),
    clamp(y - size.h / 2, 0, CANVAS_SIZE - size.h)
  );

  if (!cardId) {
    onImportError("That board is no longer there.");
    return;
  }

  select(cardId);
  onImportError("Added to this board — the board itself is unchanged.");
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
/**
 * `x, y` is where the pointer was, and the picture lands CENTRED on it.
 *
 * It used to become the card's top-left corner, which put every dropped photo
 * down and to the right of where it was aimed — by half a card, which is a lot
 * for a 280px image. Everything else dropped on the canvas centres on the
 * pointer, and this is the one that didn't.
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

      // Into the gallery first: a picture belongs to the collection, and the
      // card on this board is one use of it. Dropping onto a board and adding
      // in the gallery are the same import either way round.
      addToGallery(fields, file.name || "");

      addCard(
        "image",
        clamp(x - fields.w / 2 + offset, 0, CANVAS_SIZE - fields.w),
        clamp(y - fields.h / 2 + offset, 0, CANVAS_SIZE - fields.h),
        { ...fields, alt: file.name || "" }
      );

      // Several at once fan out from the drop rather than stacking exactly.
      offset += 24;
    } catch (err) {
      onImportError(`Could not import ${file.name}: ${err.message}`);
    }
  }
}

/* ---------------------------------------------------------------- boards --- */

/**
 * Creates the board and its card, then focuses the name for typing — it does
 * NOT navigate into the new board.
 *
 * This departs from SPEC.md, which said creating a board navigates to it. That
 * came from the prototype and is disorienting: you make a board, and the board
 * you were working on vanishes. Milanote leaves you where you are with the name
 * selected, which is what this does.
 */
export function createBoardCard(x, y) {
  // Nameless on purpose. A new board used to arrive called "Untitled board"
  // with the words selected, so the first thing you saw was a block of
  // highlight to type over. Empty with a caret in it says the same thing more
  // quietly — and `board.js` names it "Untitled board" if you click away
  // without typing, so nothing is ever left without a name.
  const { cardId } = addBoardCard(x, y, "");
  select(cardId);

  const el = elements.get(cardId);
  if (!el || !el.__boardName) return;

  // select() above added `is-selected`, which is what lets the name take the
  // pointer and the caret at all.
  el.__boardName.focus();
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

/**
 * Puts the caret wherever a card of this type most wants it. A link is useless
 * without an address, a place without a location, a column without a name.
 */
export function focusNewCard(type, id) {
  const el = elements.get(id);
  if (!el) return;

  const field =
    (type === "column" && el.__columnTitle) ||
    (type === "link" && el.__linkUrl) ||
    (type === "place" && el.__placeQuery) ||
    null;

  if (field) field.focus();
  else focusCard(id);
}
