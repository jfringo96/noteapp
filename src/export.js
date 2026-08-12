/**
 * Exporting a board's pictures as an ordinary folder of JPEGs.
 *
 * A folder of photos is the most useful thing this app can produce: it drops
 * into OneDrive, opens in any phone's gallery, and is still readable in ten
 * years with no software at all. Nothing clever, deliberately.
 */

import { currentBoard } from "./store.js";
import { imageAsJpeg } from "./images.js";

/**
 * Every picture on a board, in reading order.
 *
 * Top to bottom, then left to right — the order you would look at them. A
 * column contributes its contents in the order they are stacked, at the point
 * where the column itself sits.
 *
 * Nested boards are not followed. "This board" means this one.
 */
export function boardImages(board = currentBoard()) {
  const ordered = [...board.cards].sort((a, b) => a.y - b.y || a.x - b.x);
  const images = [];

  for (const card of ordered) {
    if (card.type === "image" && card.imageId) images.push(card);
    if (card.type === "column") {
      for (const item of card.items) {
        if (item.type === "image" && item.imageId) images.push(item);
      }
    }
  }

  return images;
}

/** `03-blue-hour.jpg` — numbered so the phone shows them in board order. */
function fileNameFor(card, index, total) {
  const width = String(total).length;
  const number = String(index + 1).padStart(Math.max(2, width), "0");

  const slug = String(card.alt || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return slug ? `${number}-${slug}.jpg` : `${number}.jpg`;
}

export async function exportBoardImages(onStatus = () => {}) {
  const board = currentBoard();
  const images = boardImages(board);

  if (!images.length) {
    onStatus("No pictures on this board to export.");
    return;
  }

  // Ask before doing the work, so a cancel costs nothing.
  const parent = await window.api.chooseExportFolder();
  if (!parent) return;

  const files = [];

  for (const [index, card] of images.entries()) {
    onStatus(`Exporting ${index + 1} of ${images.length}…`);

    const bytes = await imageAsJpeg(card);
    if (!bytes) continue; // file missing on disk — skip it rather than fail

    files.push({ name: fileNameFor(card, index, images.length), bytes });
  }

  if (!files.length) {
    onStatus("None of the pictures on this board could be read.");
    return;
  }

  const result = await window.api.writeExport(parent, board.title || "Board", files);
  const missing = images.length - files.length;

  onStatus(
    `Exported ${result.written} picture${result.written === 1 ? "" : "s"}` +
      (missing ? ` (${missing} could not be read)` : "")
  );
}
