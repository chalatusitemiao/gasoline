import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const workspace = resolve(fileURLToPath(new URL("../", import.meta.url)));

export default defineConfig({
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": workspace },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "localhost",
    port: 1420,
    strictPort: true,
    fs: { allow: [workspace] },
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
