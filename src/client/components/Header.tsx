import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minimize2, X } from "lucide-react";
import { getDesktopPlatform, isTauriShell, usesNativeWindowChrome } from "@/lib/runtime";

export default function Header() {
  const tauriShell = isTauriShell();
  const platform = getDesktopPlatform();
  const isMacos = platform === "macos";
  const useNativeWindowChrome = usesNativeWindowChrome();
  const dragRegionProps = tauriShell
    ? ({ "data-tauri-drag-region": "true" } as const)
    : {};
  const noDragRegionProps = tauriShell
    ? ({ "data-tauri-drag-region": "false" } as const)
    : {};

  async function handleDragRegionMouseDown(event: MouseEvent<HTMLElement>) {
    if (!tauriShell || event.button !== 0) return;
    await getCurrentWindow().startDragging();
  }

  async function handleDragRegionDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!tauriShell || event.button !== 0) return;
    await getCurrentWindow().toggleMaximize();
  }

  async function handleWindowAction(action: "minimize" | "maximize" | "close") {
    if (!tauriShell) return;

    const window = getCurrentWindow();

    if (action === "minimize") {
      await window.minimize();
      return;
    }

    if (action === "maximize") {
      await window.toggleMaximize();
      return;
    }

    await window.close();
  }

  if (isMacos && tauriShell && !useNativeWindowChrome) {
    return (
      <header className="border-b bg-background">
        <div
          className="relative flex h-11 w-full items-center justify-center select-none"
          {...dragRegionProps}
          onMouseDown={(event) => void handleDragRegionMouseDown(event)}
          onDoubleClick={(event) => void handleDragRegionDoubleClick(event)}
        >
          <div {...noDragRegionProps} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleWindowAction("close")}
              className="h-3 w-3 cursor-pointer rounded-full bg-[#FF5F57] transition-opacity hover:opacity-70"
              title="Close"
              aria-label="Close window"
            />
            <button
              type="button"
              onClick={() => void handleWindowAction("minimize")}
              className="h-3 w-3 cursor-pointer rounded-full bg-[#FFBD2E] transition-opacity hover:opacity-70"
              title="Minimize"
              aria-label="Minimize window"
            />
            <button
              type="button"
              onClick={() => void handleWindowAction("maximize")}
              className="h-3 w-3 cursor-pointer rounded-full bg-[#28C840] transition-opacity hover:opacity-70"
              title="Maximize"
              aria-label="Toggle maximize"
            />
          </div>
        </div>
      </header>
    );
  }

  const windowControls = tauriShell && !useNativeWindowChrome ? (
    <div
      {...noDragRegionProps}
      className="flex items-center overflow-hidden rounded-sm border border-border bg-muted"
    >
      <button
        type="button"
        onClick={() => void handleWindowAction("minimize")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Minimize window"
        aria-label="Minimize window"
      >
        <Minimize2 size={13} />
      </button>
      <button
        type="button"
        onClick={() => void handleWindowAction("maximize")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center border-x border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Toggle maximize"
        aria-label="Toggle maximize"
      >
        <Maximize2 size={13} />
      </button>
      <button
        type="button"
        onClick={() => void handleWindowAction("close")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
        title="Close window"
        aria-label="Close window"
      >
        <X size={13} />
      </button>
    </div>
  ) : null;

  return (
    <header className="border-b bg-background">
      <div className="flex w-full items-stretch select-none">
        <div
          className="flex min-w-0 flex-1 items-center gap-6 px-6 py-3"
          {...dragRegionProps}
          onMouseDown={(event) => void handleDragRegionMouseDown(event)}
          onDoubleClick={(event) => void handleDragRegionDoubleClick(event)}
        >
          <h1
            className="truncate text-sm font-semibold tracking-tight"
            {...dragRegionProps}
          >
            Agent Session Selector
          </h1>
        </div>

        <div {...noDragRegionProps} className="flex items-center gap-2 px-3">
          {windowControls}
        </div>
      </div>
    </header>
  );
}
