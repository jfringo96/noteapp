/**
 * The gallery: every picture in the collection, in a drawer beside the rail.
 *
 * It slides out from the left rail rather than covering the screen, and that is
 * load-bearing rather than decorative. A picture is dragged out of here onto a
 * board, and **hiding the drag source cancels the drag** — a panel that had to
 * get out of the way before you could drop anything could never be dragged from
 * at all. Sitting beside the board instead means it can simply stay put.
 *
 * It also means the drawer can stay open while you place several pictures,
 * which is what you are usually doing.
 *
 * Two ways to place one: click it and it lands in the middle of the view, or
 * drag it and it lands where you drop it.
 */

import { boardsUsing, galleryImages, removeFromGallery } from "./gallery.js";
import { confirmDelete } from "./confirm.js";
import { imageUrl } from "./images.js";

/** How a picture dragged out of the gallery identifies itself to the canvas. */
export const IMAGE_DRAG_TYPE = "application/x-noteapp-image";

let drawer = null;
let onStatus = () => {};
let onUpload = () => {};
let onPlace = () => false;

export function initGalleryPanel(element, { status, upload, place }) {
  drawer = element;
  onStatus = status || (() => {});
  onUpload = upload || (() => {});
  onPlace = place || (() => false);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isGalleryOpen()) {
      event.preventDefault();
      closeGallery();
    }
  });
}

export const isGalleryOpen = () => !!drawer && drawer.classList.contains("is-open");

/**
 * How much of the board the drawer is covering, in pixels.
 *
 * The canvas needs this to work out where the middle of what you can SEE is.
 * Without it, clicking a picture puts it in the middle of the scroller, and
 * the left of the scroller is behind this drawer.
 */
export const galleryOffset = () => (isGalleryOpen() ? drawer.getBoundingClientRect().width : 0);

/** The rail's Image button toggles, so pressing it again puts it away. */
export function toggleGallery() {
  if (isGalleryOpen()) closeGallery();
  else openGallery();
}

export function openGallery() {
  build();
  drawer.classList.add("is-open");
  drawer.removeAttribute("aria-hidden");
}

export function closeGallery() {
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

let shownSignature = "";

/**
 * Keeps the drawer honest while it is open.
 *
 * Called on every state change, so it has to be cheap and it has to not
 * flicker: rebuilding the grid on each keystroke would rebuild every <img>,
 * and rebuilding it mid-drag would cancel the drag the same way hiding the
 * panel used to. So it only rebuilds when the set of pictures has actually
 * changed — which is exactly when a picture is dropped, pasted, added or
 * deleted, and never when you are typing on a card.
 */
export function refreshGallery(force = false) {
  if (!isGalleryOpen()) return;

  const signature = galleryImages()
    .map((entry) => entry.imageId)
    .join(",");

  if (!force && signature === shownSignature) return;

  build();
}

function build() {
  const head = document.createElement("div");
  head.className = "gallery-head";

  const title = document.createElement("h2");
  title.className = "gallery-title";
  title.textContent = "Pictures";

  const done = document.createElement("button");
  done.type = "button";
  done.className = "gallery-close";
  done.textContent = "×";
  done.title = "Close";
  done.setAttribute("aria-label", "Close the gallery");
  done.addEventListener("click", closeGallery);

  head.append(title, done);

  const hint = document.createElement("p");
  hint.className = "gallery-hint";
  hint.textContent = "Click to place one, or drag it where you want it.";

  const add = document.createElement("button");
  add.type = "button";
  add.className = "gallery-add";
  add.textContent = "Add pictures…";
  add.addEventListener("click", () => onUpload());

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

  drawer.replaceChildren(head, hint, add, grid);
  shownSignature = images.map((entry) => entry.imageId).join(",");
}

function tile(entry) {
  const figure = document.createElement("div");
  figure.className = "gallery-tile";
  figure.tabIndex = 0;
  figure.setAttribute("role", "button");
  figure.title = entry.name || "Click to place, or drag onto the board";

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

  const place = () => {
    if (onPlace(entry.imageId)) onStatus("Added to this board");
    else onStatus("That picture could not be placed.");
  };

  figure.addEventListener("click", place);

  figure.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      place();
    }
  });

  /*
   * Drag it out and drop it where you want it. Only the id travels — the canvas
   * looks the rest up in the gallery, so the picture is never carried around as
   * bytes and dropping the same one twice costs nothing.
   *
   * Nothing is hidden here. Hiding the element being dragged cancels the drag,
   * which is what stopped this working when the gallery covered the screen.
   */
  figure.draggable = true;

  figure.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(IMAGE_DRAG_TYPE, entry.imageId);
    event.dataTransfer.effectAllowed = "copy";

    // Drag the picture itself rather than the tile with its delete button on.
    if (img.naturalWidth) event.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);

    figure.classList.add("is-dragging");
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
    // The tile itself places the picture on click, and this button sits on it.
    event.stopPropagation();

    const used = boardsUsing(entry.imageId);

    // Nothing is using it, so there is nothing to warn about — asking would be
    // asking for the sake of it.
    if (used.length) {
      const boards =
        used.length === 1 ? `on ${used[0]}` : `on ${used.length} boards: ${used.join(", ")}`;

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
        ? `Deleted the picture, and removed it from ${used.length} board${
            used.length === 1 ? "" : "s"
          } — Ctrl+Z to undo`
        : "Deleted the picture — Ctrl+Z to undo"
    );

    refreshGallery();
  });

  return remove;
}
