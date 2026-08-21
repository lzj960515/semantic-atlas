import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/web/client"),
  build: {
    outDir: resolve(import.meta.dirname, "dist/web-client"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
