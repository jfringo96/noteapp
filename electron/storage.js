/**
 * Everything that touches disk.
 *
 * A COLLECTION IS A FOLDER. It holds `collection.json` — every board in that
 * collection, human-readable — and an `images/` folder of ordinary image files.
 * Copy that one folder and the whole collection travels with its pictures.
 *
 *   Documents\Noteapp\
 *     My Boards\
 *       collection.json
 *       images\
 *         img_7fq2xk9.webp
 *
 * The collection's NAME is its folder name. Nothing stores it separately, so
 * renaming a collection is renaming the folder, in Explorer, with no app
 * involved. That is the whole reason the name isn't a field in the file.
 *
 * Only one collection is open at a time. `COLLECTION_DIR` is the current one
 * and every path below is built from it, so switching collections is a single
 * assignment.
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";

const FILE = "collection.json";
const DEFAULT_NAME = "My Boards";

let ROOT = null; // Documents\Noteapp — where collections live by default
let COLLECTION_DIR = null; // the one that's open

export const collectionDir = () => COLLECTION_DIR;
export const collectionsRoot = () => ROOT;

/** What the top bar shows, and where Open starts from. */
export function currentCollection() {
  return { path: COLLECTION_DIR, name: path.basename(COLLECTION_DIR) };
}

/* -------------------------------------------------------------- startup --- */

export async function init() {
  const documents = app.getPath("documents");

  ROOT = path.join(documents, "Noteapp");
  await migrateFromOldName(path.join(documents, "Board App"), ROOT);
  await fs.mkdir(ROOT, { recursive: true });
  await migrateLooseBoards();

  COLLECTION_DIR = await chooseStartupCollection();
  await fs.mkdir(path.join(COLLECTION_DIR, "images"), { recursive: true });

  // Record it even though nothing was chosen by hand. Otherwise the very first
  // launch remembers nothing, and the launch after it falls back to "whichever
  // collection was saved most recently" — which is a different collection the
  // moment there is more than one.
  await writeRecent(COLLECTION_DIR);
}

/**
 * Which collection to open on launch: the one you had open last.
 *
 * Falls back rather than failing, in order — the remembered one, any collection
 * sitting in the root folder, then a fresh default. There is no terminal to
 * recover in, so every branch here has to end with a working app.
 */
async function chooseStartupCollection() {
  const remembered = await readRecent();
  if (remembered && (await isCollection(remembered))) return remembered;

  const found = await listCollections();
  if (found.length) return found[0].path;

  const fresh = path.join(ROOT, DEFAULT_NAME);
  await fs.mkdir(path.join(fresh, "images"), { recursive: true });
  return fresh;
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
  if (await exists(newDir)) return; // already migrated, or a new install
  if (!(await exists(oldDir))) return; // nothing to migrate

  await fs.rename(oldDir, newDir).catch(() => {});
}

/**
 * Before collections existed there was one document, loose in the root folder
 * as `boards.json` with `images/` beside it. Fold that into a real collection.
 *
 * Moves the entries individually rather than renaming the folder, because the
 * folder it sits in is now the root that holds every collection — it cannot be
 * moved inside itself.
 */
async function migrateLooseBoards() {
  const loose = path.join(ROOT, "boards.json");
  if (!(await exists(loose))) return;

  const target = path.join(ROOT, DEFAULT_NAME);
  if (await exists(target)) return; // somewhere to land already exists; leave well alone

  await fs.mkdir(target, { recursive: true });
  await fs.rename(loose, path.join(target, FILE));
  await fs.rename(path.join(ROOT, "images"), path.join(target, "images")).catch(() => {});
  await fs.mkdir(path.join(target, "images"), { recursive: true });
}

/* ----------------------------------------------------------- collections --- */

const docPath = (dir = COLLECTION_DIR) => path.join(dir, FILE);

/** A folder is a collection if it has a collection.json in it. Nothing more. */
const isCollection = (dir) => exists(docPath(dir));

/** Every collection sitting in the root folder, most recently saved first. */
export async function listCollections() {
  let entries;
  try {
    entries = await fs.readdir(ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(ROOT, entry.name);
    if (!(await isCollection(dir))) continue;

    const when = await fs
      .stat(docPath(dir))
      .then((info) => info.mtimeMs)
      .catch(() => 0);

    found.push({ path: dir, name: entry.name, modified: when });
  }

  return found.sort((a, b) => b.modified - a.modified);
}

/** Switches the open collection. Returns null if that folder isn't one. */
export async function openCollection(dir) {
  if (!(await isCollection(dir))) return null;

  COLLECTION_DIR = dir;
  await fs.mkdir(path.join(COLLECTION_DIR, "images"), { recursive: true });
  await writeRecent(COLLECTION_DIR);

  return currentCollection();
}

/**
 * Creates an empty collection and switches to it.
 *
 * Refuses a folder that already holds a collection: "New" landing on top of
 * existing boards would be the most destructive thing this app could do.
 */
export async function createCollection(dir, doc) {
  if (await isCollection(dir)) return null;

  await fs.mkdir(path.join(dir, "images"), { recursive: true });
  COLLECTION_DIR = dir;
  await writeDoc(doc);
  await writeRecent(COLLECTION_DIR);

  return currentCollection();
}

/**
 * Save As: copy this collection to a new folder and carry on working there.
 *
 * The pictures are copied too, or the new collection would be a set of boards
 * pointing at files living somewhere else — the exact thing a folder-shaped
 * collection exists to avoid. Every file is copied rather than only the
 * referenced ones, because undo can still bring back a card whose picture
 * would otherwise have been left behind.
 */
export async function saveCollectionAs(dir, doc) {
  if (await isCollection(dir)) return null;

  const from = path.join(COLLECTION_DIR, "images");
  const to = path.join(dir, "images");
  await fs.mkdir(to, { recursive: true });

  for (const name of await listImages()) {
    await fs.copyFile(path.join(from, name), path.join(to, name)).catch(() => {});
  }

  COLLECTION_DIR = dir;
  await writeDoc(doc);
  await writeRecent(COLLECTION_DIR);

  return currentCollection();
}

/* --------------------------------------------------- the collection file --- */

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

/* ---------------------------------------------------- which one was open --- */

/**
 * Remembering the open collection is a preference, not data, so it lives in
 * Electron's userData rather than in the boards folder. Losing this file costs
 * you nothing except which collection opens first.
 */
const recentPath = () => path.join(app.getPath("userData"), "recent.json");

async function readRecent() {
  try {
    const parsed = JSON.parse(await fs.readFile(recentPath(), "utf8"));
    return typeof parsed.collection === "string" ? parsed.collection : null;
  } catch {
    return null;
  }
}

async function writeRecent(dir) {
  const body = JSON.stringify({ collection: dir }, null, 2);
  await fs.writeFile(recentPath(), body, "utf8").catch(() => {});
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
    if (!(await exists(candidate))) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/* ---------------------------------------------------------------- images --- */

const imagesDir = () => path.join(COLLECTION_DIR, "images");

/**
 * Names come from the renderer, so they are checked rather than trusted. This
 * is the only thing standing between a bug and writing outside the collection.
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
 * Scoped to the open collection, which is the quiet payoff of a collection
 * being a folder: with one shared pool of pictures, "unreferenced" would have
 * to mean "unreferenced by every collection that exists", and a collection the
 * app had never been shown would lose all of its images.
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

/* ----------------------------------------------------------------- utils --- */

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
