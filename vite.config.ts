import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 6814);
const SERVER_PORT = Number(process.env.PORT ?? 6815);

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
    port: CLIENT_PORT,
    proxy: {
      "/api": `http://127.0.0.1:${SERVER_PORT}`,
    },
  },
});
