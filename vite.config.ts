import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist/client",
  },
  server: {
    port: 6814,
    proxy: {
      "/api": "http://localhost:6815",
    },
  },
});
