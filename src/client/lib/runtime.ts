import { isTauri } from "@tauri-apps/api/core";

const FALLBACK_API_BASE_URL = "http://127.0.0.1:6815";

export type DesktopPlatform = "macos" | "windows" | "linux" | "web";

export function isTauriShell(): boolean {
  return isTauri();
}

export function getDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "web";
  }

  const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();

  if (platform.includes("mac")) {
    return "macos";
  }

  if (platform.includes("win")) {
    return "windows";
  }

  if (platform.includes("linux")) {
    return "linux";
  }

  return "web";
}

export function usesNativeWindowChrome(): boolean {
  if (!isTauriShell()) {
    return false;
  }

  const platform = getDesktopPlatform();
  return platform === "windows";
}

export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return isTauriShell() ? FALLBACK_API_BASE_URL : "";
}
