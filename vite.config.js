import { defineConfig } from "vite";

export default defineConfig({
  // Relative, because a packaged build is loaded from file:// rather than a
  // web server. Absolute paths would 404.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Electron ships a current Chromium, so there is nothing to down-level.
    // Also what allows top-level await in main.js.
    target: "esnext",
  },
});
