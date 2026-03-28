import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/client"),
    },
  },
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist/client",
  },
  server: {
    port: 6814,
    proxy: {
      "/api": "http://127.0.0.1:6815",
    },
  },
});
