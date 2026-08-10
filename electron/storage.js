/**
 * Everything that touches disk.
 *
 * The data folder is deliberately ordinary: a JSON file you can read and an
 * images folder you can open. Put it in OneDrive and backup is solved.
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";

let DATA_DIR = null;

export function dataDir() {
  return DATA_DIR;
}

export async function init() {
  DATA_DIR = path.join(app.getPath("documents"), "Board App");
  await fs.mkdir(path.join(DATA_DIR, "images"), { recursive: true });
}

const docPath = () => path.join(DATA_DIR, "boards.json");

/** Returns the parsed document, or null if there isn't one yet. */
export async function readDoc() {
  try {
    return JSON.parse(await fs.readFile(docPath(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;

    // A corrupt file is worth keeping rather than silently overwriting on the
    // next save. Move it aside and start fresh, so nothing is destroyed.
    if (err instanceof SyntaxError) {
      const aside = docPath() + ".corrupt-" + Date.now();
      await fs.rename(docPath(), aside).catch(() => {});
      return { error: "corrupt", movedTo: aside };
    }
    throw err;
  }
}

/**
 * Write to a temp file and rename over the original. Rename is atomic on the
 * same volume, so a crash mid-write can never leave a half-written file where
 * the notes used to be — the worst case is the previous version surviving.
 */
export async function writeDoc(doc) {
  const target = docPath();
  const tmp = target + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
  await fs.rename(tmp, target);
  return { savedAt: Date.now() };
}
