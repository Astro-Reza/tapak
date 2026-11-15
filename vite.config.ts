import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { createRelay } from "./src/engine/index.js";

/** Serves the master <-> astronaut relay at /link (dev and preview), so the Marswalk AR phone app can join the link. */
function linkRelay(): Plugin {
  const relay = createRelay();
  return {
    name: "marswalk-link-relay",
    configureServer: (server) => void server.middlewares.use((req, res, next) => relay(req, res) || next()),
    configurePreviewServer: (server) => void server.middlewares.use((req, res, next) => relay(req, res) || next()),
  };
}

export default defineConfig({
  // Relative base so the build also works from a sub-path (e.g. GitHub Pages).
  base: "./",
  plugins: [react(), tailwindcss(), linkRelay()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
