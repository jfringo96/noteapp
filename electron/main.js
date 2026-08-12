/**
 * Electron main process. Creates the window and owns the filesystem.
 *
 * In development it loads the Vite dev server so edits appear instantly. In a
 * packaged build it loads the built files from dist/.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
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
    // Matches the canvas ground, so there is no white flash before paint.
    backgroundColor: "#1b1e24",
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
  ipcMain.handle("dataDir:path", () => storage.dataDir());
  ipcMain.handle("dataDir:reveal", () => shell.openPath(storage.dataDir()));

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
