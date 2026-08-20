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
  const documents = app.getPath("documents");

  DATA_DIR = path.join(documents, "Noteapp");
  await migrateFromOldName(path.join(documents, "Board App"), DATA_DIR);

  await fs.mkdir(path.join(DATA_DIR, "images"), { recursive: true });
}

/**
 * The app was called "Board App" until the folder and the repo were renamed to
 * Noteapp. Anyone with boards from before that has them in the old folder, so
 * move it across once, quietly.
 *
 * Only ever moves when the new folder does not exist yet — if both are present
 * the new one wins and the old one is left completely alone. Rename on the same
 * volume is atomic, so this either happens or it doesn't; it cannot half-happen
 * and lose notes. Any failure is swallowed: a fresh empty folder is created
 * below instead, and the old one is still sitting there to copy across by hand.
 */
async function migrateFromOldName(oldDir, newDir) {
  try {
    await fs.access(newDir);
    return; // already migrated, or a new install
  } catch {}

  try {
    await fs.access(oldDir);
  } catch {
    return; // nothing to migrate
  }

  await fs.rename(oldDir, newDir).catch(() => {});
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

/* ---------------------------------------------------------------- export --- */

/** Windows forbids these outright; the rest is trimmed to keep names sane. */
const clean = (name) =>
  String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Board";

/**
 * Writes an exported folder of pictures.
 *
 * `parent` comes from the OS folder picker, so it is trusted. Everything else
 * comes from the renderer and is cleaned — a name containing a slash would
 * otherwise write outside the folder the user chose.
 */
export async function writeExport(parent, folderName, files) {
  const dir = await uniqueDir(path.join(parent, clean(folderName)));
  await fs.mkdir(dir, { recursive: true });

  let written = 0;

  for (const file of files) {
    const name = clean(file.name);
    if (!name) continue;
    await fs.writeFile(path.join(dir, name), Buffer.from(file.bytes));
    written++;
  }

  return { path: dir, written };
}

/** Never overwrite an earlier export — "Iceland", then "Iceland 2". */
async function uniqueDir(base) {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base} ${n}`;
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  return `${base} ${Date.now()}`;
}

/* ---------------------------------------------------------------- images --- */

const imagesDir = () => path.join(DATA_DIR, "images");

/**
 * Names come from the renderer, so they are checked rather than trusted. This
 * is the only thing standing between a bug and writing outside the data folder.
 */
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{2,5}$/;

function imagePath(name) {
  if (!SAFE_NAME.test(name)) throw new Error("Unsafe image name: " + name);
  return path.join(imagesDir(), name);
}

export async function writeImage(name, bytes) {
  const target = imagePath(name);
  const tmp = target + ".tmp";
  await fs.writeFile(tmp, Buffer.from(bytes));
  await fs.rename(tmp, target);
  return name;
}

export async function readImage(name) {
  try {
    const buffer = await fs.readFile(imagePath(name));
    // Hand back a plain ArrayBuffer; Buffer does not survive the IPC boundary
    // in a form the renderer can make a Blob from.
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function listImages() {
  try {
    return await fs.readdir(imagesDir());
  } catch {
    return [];
  }
}

/**
 * Deletes image files nothing refers to any more.
 *
 * Only safe to call at startup, with the history stacks empty. During a session
 * two cards can share an image and undo can hold states referencing an image
 * whose card is currently deleted, so "unreferenced" is not a stable idea.
 */
export async function sweepImages(keepNames) {
  const keep = new Set(keepNames);
  const removed = [];

  for (const name of await listImages()) {
    if (keep.has(name)) continue;
    await fs.unlink(path.join(imagesDir(), name)).catch(() => {});
    removed.push(name);
  }

  return removed;
}
