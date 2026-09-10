import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 8765,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
