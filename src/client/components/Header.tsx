import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minimize2, X } from "lucide-react";
import { getDesktopPlatform, isTauriShell } from "@/lib/runtime";

export default function Header() {
  const tauriShell = isTauriShell();
  const platform = getDesktopPlatform();
  const isMacos = platform === "macos";
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

  const windowControls = tauriShell ? (
    <div
      {...noDragRegionProps}
      className="flex items-center overflow-hidden rounded-sm border border-border bg-muted"
    >
      {isMacos ? (
        <>
          <button
            type="button"
            onClick={() => void handleWindowAction("close")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
            title="Close window"
            aria-label="Close window"
          >
            <X size={13} />
          </button>
          <button
            type="button"
            onClick={() => void handleWindowAction("minimize")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center border-x border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Minimize window"
            aria-label="Minimize window"
          >
            <Minimize2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => void handleWindowAction("maximize")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Toggle maximize"
            aria-label="Toggle maximize"
          >
            <Maximize2 size={13} />
          </button>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  ) : null;

  return (
    <header className="border-b bg-background">
      <div className="flex w-full items-stretch select-none">
        {isMacos && windowControls && (
          <div className="flex items-center pl-3 pr-2">{windowControls}</div>
        )}

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
          {!isMacos && windowControls}
        </div>
      </div>
    </header>
  );
}
