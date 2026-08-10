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
  ipcMain.handle("dataDir:path", () => storage.dataDir());
  ipcMain.handle("dataDir:reveal", () => shell.openPath(storage.dataDir()));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
