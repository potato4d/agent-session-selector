import { NavLink } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { to: string; label: string }[] = [];

export default function Header() {
  return (
    <header className="border-b bg-background">
      <div className="flex w-full items-center gap-6 px-6 py-3">
        <h1 className="text-sm font-semibold tracking-tight">
          Agent Session Selector
        </h1>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("sessions:refetch"))}
          className="ml-auto flex cursor-pointer items-center justify-center rounded-sm border border-border bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Refresh sessions"
          aria-label="Refresh sessions"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </header>
  );
}
