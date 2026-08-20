/**
 * Electron main process. Creates the window and owns the filesystem.
 *
 * In development it loads the Vite dev server so edits appear instantly. In a
 * packaged build it loads the built files from dist/.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as storage from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    // Matches --ground in styles.css, so there is no flash before paint. If the
    // ground colour changes, change this with it.
    backgroundColor: "#eef0f2",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Renderer errors otherwise only exist inside DevTools. In development it is
  // worth having them in the same terminal as everything else.
  if (isDev) {
    win.webContents.on("console-message", (...args) => {
      const details = typeof args[0] === "object" && args[0] !== null && "message" in args[0]
        ? args[0]
        : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };

      if (details.level === "error" || details.level === 3) {
        console.error(`[renderer] ${details.message}  (${details.sourceId}:${details.lineNumber})`);
      }
    });
  }

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(async () => {
  await storage.init();

  ipcMain.handle("doc:read", () => storage.readDoc());
  ipcMain.handle("doc:write", (_event, doc) => storage.writeDoc(doc));
  ipcMain.handle("image:write", (_event, name, bytes) => storage.writeImage(name, bytes));
  ipcMain.handle("image:read", (_event, name) => storage.readImage(name));
  ipcMain.handle("image:sweep", (_event, keep) => storage.sweepImages(keep));
  ipcMain.handle("image:list", () => storage.listImages());
  ipcMain.handle("export:choose", async () => {
    const result = await dialog.showOpenDialog({
      title: "Where should the pictures go?",
      buttonLabel: "Export here",
      properties: ["openDirectory", "createDirectory"],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("export:write", async (_event, parent, folderName, files) => {
    const result = await storage.writeExport(parent, folderName, files);
    // Opening the folder is the clearest possible confirmation it worked.
    shell.openPath(result.path);
    return result;
  });

  ipcMain.handle("dataDir:path", () => storage.collectionDir());
  ipcMain.handle("dataDir:reveal", () => shell.openPath(storage.collectionDir()));

  /* ------------------------------------------------------- collections --- */

  ipcMain.handle("collection:current", () => storage.currentCollection());
  ipcMain.handle("collection:list", () => storage.listCollections());

  ipcMain.handle("collection:open", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open a collection",
      buttonLabel: "Open collection",
      defaultPath: storage.collectionsRoot(),
      properties: ["openDirectory"],
    });

    if (result.canceled) return null;

    const opened = await storage.openCollection(result.filePaths[0]);
    // Not a collection, rather than an error: the folder picker will happily
    // let you choose Documents, and saying so beats a stack trace.
    return opened || { error: "not-a-collection" };
  });

  ipcMain.handle("collection:openPath", async (_event, dir) => {
    const opened = await storage.openCollection(dir);
    return opened || { error: "not-a-collection" };
  });

  /**
   * New and Save As both ask for a folder that does not exist yet, so both use
   * the SAVE dialog and treat what comes back as a folder to create. A folder
   * picker can only choose something already there, which would mean making
   * the folder in Explorer first.
   */
  const askForNewFolder = (title, buttonLabel) =>
    dialog.showSaveDialog({
      title,
      buttonLabel,
      defaultPath: path.join(storage.collectionsRoot(), "Untitled collection"),
      properties: ["createDirectory"],
    });

  ipcMain.handle("collection:new", async (_event, doc) => {
    const result = await askForNewFolder("New collection", "Create collection");
    if (result.canceled) return null;

    const made = await storage.createCollection(result.filePath, doc);
    return made || { error: "exists" };
  });

  ipcMain.handle("collection:saveAs", async (_event, doc) => {
    const result = await askForNewFolder("Save collection as", "Save collection");
    if (result.canceled) return null;

    const saved = await storage.saveCollectionAs(result.filePath, doc);
    return saved || { error: "exists" };
  });

  /**
   * Opening a link hands a string from the page to the operating system, so
   * the scheme is checked here rather than trusted. Without this, a `file:` or
   * a Windows shell scheme in a board would be enough to launch something.
   */
  ipcMain.handle("shell:open", (_event, url) => {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      return false;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    shell.openExternal(parsed.href);
    return true;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
