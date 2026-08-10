/**
 * The only bridge between the page and the machine. CommonJS on purpose —
 * preload scripts are not ES modules unless sandboxing is disabled, and it
 * should stay sandboxed.
 *
 * Keep this surface tiny. Anything exposed here is something the renderer can
 * do to the filesystem.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readDoc: () => ipcRenderer.invoke("doc:read"),
  writeDoc: (doc) => ipcRenderer.invoke("doc:write", doc),
  writeImage: (name, bytes) => ipcRenderer.invoke("image:write", name, bytes),
  readImage: (name) => ipcRenderer.invoke("image:read", name),
  sweepImages: (keep) => ipcRenderer.invoke("image:sweep", keep),
  dataDir: () => ipcRenderer.invoke("dataDir:path"),
  revealDataFolder: () => ipcRenderer.invoke("dataDir:reveal"),
});
