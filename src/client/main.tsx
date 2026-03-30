import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { getDesktopPlatform, isTauriShell } from "@/lib/runtime.js";

if (isTauriShell() && getDesktopPlatform() === "macos") {
  document.documentElement.classList.add("tauri-macos");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
