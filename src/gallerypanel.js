/**
 * The gallery panel: every picture in the collection, to drag onto a board.
 *
 * Opens from Image in the left rail. Clicking Image used to drop a card on the
 * canvas straight from a file dialog, which made a picture something you added
 * to one board rather than something the collection had.
 *
 * Nothing here places a card by clicking. Pictures are dragged out and dropped
 * where you want them, which is the same gesture as dragging a board out of the
 * Map and, more to the point, the only one that lets you choose where it lands.
 */

import { boardsUsing, galleryImages, removeFromGallery } from "./gallery.js";
import { confirmDelete } from "./confirm.js";
import { imageUrl } from "./images.js";

/** How a picture dragged out of the gallery identifies itself to the canvas. */
export const IMAGE_DRAG_TYPE = "application/x-noteapp-image";

let backdrop = null;
let onStatus = () => {};
let onUpload = () => {};

export function initGalleryPanel(element, { status, upload }) {
  backdrop = element;
  onStatus = status || (() => {});
  onUpload = upload || (() => {});

  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) close();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isGalleryOpen()) {
      event.preventDefault();
      close();
    }
  });
}

export const isGalleryOpen = () => backdrop && !backdrop.hidden;

export function openGallery() {
  build();
  backdrop.hidden = false;
}

export function close() {
  if (backdrop) backdrop.hidden = true;
}

/** Rebuild in place — after an upload, or after a picture is deleted. */
export function refreshGallery() {
  if (isGalleryOpen()) build();
}

function build() {
  const panel = document.createElement("div");
  panel.className = "gallery";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Pictures in this collection");

  const head = document.createElement("div");
  head.className = "gallery-head";

  const title = document.createElement("h2");
  title.className = "gallery-title";
  title.textContent = "Pictures";

  const hint = document.createElement("span");
  hint.className = "gallery-hint";
  hint.textContent = "Drag one onto the board";

  const add = document.createElement("button");
  add.type = "button";
  add.className = "gallery-add";
  add.textContent = "Add pictures…";
  add.addEventListener("click", () => onUpload());

  const done = document.createElement("button");
  done.type = "button";
  done.className = "gallery-close";
  done.textContent = "×";
  done.title = "Close";
  done.setAttribute("aria-label", "Close");
  done.addEventListener("click", close);

  head.append(title, hint, add, done);
  panel.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  const images = galleryImages();

  if (!images.length) {
    const empty = document.createElement("p");
    empty.className = "gallery-empty";
    empty.textContent =
      "No pictures yet. Add some here, or drop them straight onto a board — either way they end up in this gallery.";
    grid.appendChild(empty);
  }

  for (const entry of images) grid.appendChild(tile(entry));

  panel.appendChild(grid);

  backdrop.replaceChildren(panel);
}

function tile(entry) {
  const figure = document.createElement("div");
  figure.className = "gallery-tile";

  const img = document.createElement("img");
  img.className = "gallery-image";
  img.alt = entry.name || "";
  img.draggable = false; // the tile carries the drag, not the bitmap
  figure.appendChild(img);

  // Read from disk on demand. The cache in images.js means reopening the
  // gallery is free after the first time.
  imageUrl(entry).then((url) => {
    if (url) img.src = url;
    else figure.classList.add("is-missing");
  });

  /*
   * Drag it out and drop it on the canvas. Only the id travels — the canvas
   * looks the rest up in the gallery, so the picture is never carried around
   * as bytes and dropping the same one twice costs nothing.
   */
  figure.draggable = true;

  figure.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(IMAGE_DRAG_TYPE, entry.imageId);
    event.dataTransfer.effectAllowed = "copy";
    figure.classList.add("is-dragging");

    // Otherwise the panel is sitting over the board being dropped onto.
    close();
  });

  figure.addEventListener("dragend", () => figure.classList.remove("is-dragging"));

  figure.appendChild(deleteButton(entry));
  return figure;
}

function deleteButton(entry) {
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "gallery-delete";
  remove.textContent = "×";
  remove.title = "Delete this picture from the collection";
  remove.setAttribute("aria-label", "Delete this picture");

  remove.addEventListener("click", async (event) => {
    // The tile is draggable and this button sits on it.
    event.stopPropagation();

    const used = boardsUsing(entry.imageId);

    // Nothing is using it, so there is nothing to warn about — asking would be
    // asking for the sake of it.
    if (used.length) {
      const boards = used.length === 1 ? `on ${used[0]}` : `on ${used.length} boards: ${used.join(", ")}`;

      const answer = await confirmDelete({
        title: "Delete this picture?",
        message: `It is ${boards}. Deleting it takes it off ${
          used.length === 1 ? "that board" : "those boards"
        } too. Ctrl+Z puts it back.`,
        confirmLabel: "Delete picture",
      });

      if (answer === null) return;
    }

    removeFromGallery(entry.imageId);
    onStatus(
      used.length
        ? `Deleted the picture, and removed it from ${used.length} board${used.length === 1 ? "" : "s"} — Ctrl+Z to undo`
        : "Deleted the picture — Ctrl+Z to undo"
    );

    refreshGallery();
  });

  return remove;
}
