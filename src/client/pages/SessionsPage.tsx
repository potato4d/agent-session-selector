import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl } from "@/lib/runtime";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
}

interface Session {
  sessionId: string;
  project: string;
  firstMessage: string | null;
  lastUserMessage: string | null;
  lastActivity: string;
  createdAt: string;
  isActive: boolean;
  active: ActiveSession | null;
  turnCount: number;
}

type SortKey = "turns" | "lastMessage";
type SortDir = "asc" | "desc";

const STORAGE_KEY = "cc-session-selector:visible-projects";
const LAST_ACTIVE_TAB_KEY = "cc-session-selector:last-active-tab";
const DELETED_SESSIONS_KEY = "cc-session-selector:deleted-sessions";
const DEFAULT_TAB_LIMIT = 10;

function loadStoredVisibleProjects(): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function saveVisibleProjects(projects: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function loadLastActiveTab(): string | null {
  try {
    return localStorage.getItem(LAST_ACTIVE_TAB_KEY);
  } catch {
    return null;
  }
}

function saveLastActiveTab(project: string) {
  localStorage.setItem(LAST_ACTIVE_TAB_KEY, project);
}

function loadDeletedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_SESSIONS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDeletedSessions(ids: Set<string>) {
  localStorage.setItem(DELETED_SESSIONS_KEY, JSON.stringify([...ids]));
}

function sessionsByProject(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = map.get(session.project) ?? [];
    list.push(session);
    map.set(session.project, list);
  }
  return map;
}

function shortLabel(project: string): string {
  const parts = project.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-5);
  return tail
    .map((part, index) => (index < tail.length - 1 ? part[0] : part))
    .join("/");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function CopyCommandButton({ value }: { value: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(value).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy resume command to clipboard"
      className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Copy size={12} />
      Command
    </button>
  );
}

function SessionCard({ s, onDelete }: { s: Session; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const resumeCmd = `claude --resume ${s.sessionId}`;

  function handleDeleteClick() {
    if (confirming) {
      onDelete();
    } else {
      setConfirming(true);
    }
  }

  return (
    <Card className="rounded-none border-0 ring-0 transition-colors hover:bg-accent/60">
      <CardHeader className="pb-2">
        <div className="flex max-w-full items-center justify-between gap-2">
          <CardTitle className="min-w-0 flex-1 truncate text-sm font-medium">
            {s.firstMessage ?? "(no message)"}
          </CardTitle>
          {s.isActive && (
            <Badge variant="default" className="shrink-0">
              active
            </Badge>
          )}
        </div>
        {s.lastUserMessage && s.lastUserMessage !== s.firstMessage && (
          <p className="truncate text-xs text-muted-foreground/70">
            Latest: {s.lastUserMessage}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-right text-xs text-muted-foreground">
          {formatDate(s.lastActivity)}
          {s.turnCount > 0 && (
            <span className="ml-2 font-mono">{s.turnCount} turns</span>
          )}
        </p>
        <div className="flex justify-end gap-1.5">
          <CopyCommandButton value={resumeCmd} />
          <button
            type="button"
            onClick={handleDeleteClick}
            onBlur={() => setConfirming(false)}
            aria-label={confirming ? "Confirm delete session" : "Delete session"}
            title={confirming ? "Click again to confirm delete" : "Delete session"}
            className={`flex cursor-pointer items-center rounded-sm border px-2.5 py-1.5 text-xs transition-colors ${
              confirming
                ? "border-red-500 bg-red-500/10 text-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                : "border-border bg-muted text-muted-foreground hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
            }`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddTabsModal({
  hiddenProjects,
  onAdd,
  onClose,
}: {
  hiddenProjects: string[];
  onAdd: (project: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const filterInputId = useId();
  const hiddenProjectsId = useId();
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? hiddenProjects.filter((project) =>
        project.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : hiddenProjects;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[480px] max-w-[90vw] rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span id={titleId} className="text-sm font-medium">
            Add tabs
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add tabs dialog"
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <label htmlFor={filterInputId} className="sr-only">
            Filter hidden projects
          </label>
          <input
            id={filterInputId}
            autoFocus
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter projects..."
            aria-controls={hiddenProjectsId}
            className="w-full cursor-text bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <p id={descriptionId} className="sr-only">
          Select a hidden project to show it as a tab.
        </p>
        <div
          id={hiddenProjectsId}
          className="scrollbar-hidden max-h-64 overflow-y-auto"
          aria-label="Hidden projects"
          aria-live="polite"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {hiddenProjects.length === 0
                ? "All projects are already visible."
                : "No projects match the current filter."}
            </p>
          ) : (
            filtered.map((project) => (
              <button
                key={project}
                type="button"
                onClick={() => onAdd(project)}
                aria-label={`Show tab for ${project}`}
                className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent"
              >
                <Plus size={12} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-mono text-xs">
                  {shortLabel(project)}
                </span>
                <span
                  className="ml-auto shrink-0 truncate text-xs text-muted-foreground"
                  title={project}
                >
                  {project.length > 40 ? "..." + project.slice(-37) : project}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastMessage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleProjects, setVisibleProjects] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [deletedSessions, setDeletedSessions] = useState<Set<string>>(
    () => loadDeletedSessions(),
  );
  const initializedRef = useRef(false);
  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    const es = new EventSource(`${apiBaseUrl}/api/sessions/events`);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as
          | { type: "connected" }
          | { type: "sessions"; sessions: Session[] };

        if (msg.type === "sessions") {
          setSessions(msg.sessions);
          setLoading(false);
          setError(null);
        }
      } catch {
        // ignore parse error
      }
    };

    es.onerror = () => {
      setError("Server connection was lost. Retrying automatically.");
    };

    return () => es.close();
  }, [apiBaseUrl]);

  const allProjects = useMemo(() => {
    const grouped = sessionsByProject(sessions);
    return [...grouped.keys()].sort((a, b) => {
      const aLatest = grouped.get(a)?.[0]?.lastActivity ?? "";
      const bLatest = grouped.get(b)?.[0]?.lastActivity ?? "";
      return bLatest.localeCompare(aLatest);
    });
  }, [sessions]);

  useEffect(() => {
    if (loading || initializedRef.current) return;
    initializedRef.current = true;

    const stored = loadStoredVisibleProjects();

    if (stored && stored.size > 0) {
      const valid = allProjects.filter((project) => stored.has(project));
      setVisibleProjects(
        valid.length > 0 ? valid : allProjects.slice(0, DEFAULT_TAB_LIMIT),
      );
      return;
    }

    setVisibleProjects(allProjects.slice(0, DEFAULT_TAB_LIMIT));
  }, [loading, allProjects]);

  useEffect(() => {
    if (loading || !initializedRef.current) return;

    setVisibleProjects((prev) => {
      const prevSet = new Set(prev);
      const grouped = sessionsByProject(sessions);
      const activeProjects = allProjects.filter(
        (project) =>
          !prevSet.has(project) &&
          grouped.get(project)?.some((session) => session.isActive),
      );

      if (activeProjects.length === 0) return prev;

      const next = [...prev, ...activeProjects];
      saveVisibleProjects(next);
      return next;
    });
  }, [sessions, loading, allProjects]);

  useEffect(() => {
    if (visibleProjects.length > 0 && !activeTab) {
      const lastTab = loadLastActiveTab();
      if (lastTab && visibleProjects.includes(lastTab)) {
        setActiveTab(lastTab);
      } else {
        setActiveTab(visibleProjects[0]);
      }
    }
  }, [visibleProjects, activeTab]);

  useEffect(() => {
    if (activeTab) {
      saveLastActiveTab(activeTab);
    }
  }, [activeTab]);

  function hideProject(project: string) {
    setVisibleProjects((prev) => {
      const next = prev.filter((entry) => entry !== project);
      saveVisibleProjects(next);

      if (activeTab === project) {
        setActiveTab(next[0]);
      }

      return next;
    });
  }

  function addProject(project: string) {
    setVisibleProjects((prev) => {
      if (prev.includes(project)) return prev;

      const next = [...prev, project];
      saveVisibleProjects(next);
      return next;
    });

    setActiveTab(project);
    setShowAddModal(false);
  }

  function deleteSession(sessionId: string) {
    setDeletedSessions((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      saveDeletedSessions(next);
      return next;
    });
  }

  const normalized = query.trim().toLowerCase();
  const grouped = sessionsByProject(sessions);
  const tabProjects = visibleProjects.filter((project) => grouped.has(project));
  const hiddenProjects = allProjects.filter(
    (project) => !visibleProjects.includes(project),
  );

  function sortSessions(sessions: Session[]): Session[] {
    return [...sessions].sort((a, b) => {
      const cmp =
        sortKey === "turns"
          ? a.turnCount - b.turnCount
          : a.lastActivity.localeCompare(b.lastActivity);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function getSessionsForProject(project: string): Session[] {
    const all = (grouped.get(project) ?? []).filter(
      (session) => !deletedSessions.has(session.sessionId),
    );
    const filtered =
      normalized && project === activeTab
        ? all.filter(
            (session) =>
              session.firstMessage?.toLowerCase().includes(normalized) ||
              session.lastUserMessage?.toLowerCase().includes(normalized) ||
              session.project.toLowerCase().includes(normalized) ||
              session.sessionId.toLowerCase().includes(normalized),
          )
        : all;
    return sortSessions(filtered);
  }

  const tabTriggerClass = `relative h-9 rounded-none border-r border-border px-3 text-xs text-muted-foreground
    transition-none
    data-active:bg-background
    data-active:text-foreground
    data-active:shadow-none
    data-active:after:absolute
    data-active:after:bottom-0
    data-active:after:left-0
    data-active:after:right-0
    data-active:after:h-px
    data-active:after:bg-background`;

  return (
    <div className="flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
        <div className="sticky top-0 z-20 flex items-stretch border-b border-border bg-muted">
          <div className="scrollbar-hidden flex-1 overflow-x-auto">
            <TabsList
              aria-label="Visible projects"
              className="flex h-auto min-w-max justify-start gap-0 rounded-none bg-transparent p-0"
            >
              {loading
                ? [80, 110].map((width) => (
                    <div
                      key={width}
                      className="flex h-9 shrink-0 items-center border-r border-border px-4"
                    >
                      <div
                        className="animate-pulse rounded bg-muted-foreground/20"
                        style={{ width, height: 10 }}
                      />
                    </div>
                  ))
                : tabProjects.map((project) => (
                    <div
                      key={project}
                      role="presentation"
                      className="group/tab relative shrink-0"
                    >
                      <TabsTrigger
                        value={project}
                        title={project}
                        aria-label={`${project} (${grouped.get(project)?.length ?? 0} sessions)`}
                        className={`${tabTriggerClass} h-9 shrink-0 flex-none pr-8`}
                      >
                        <span className="font-mono">{shortLabel(project)}</span>
                        <span className="ml-1.5 text-muted-foreground/60">
                          {grouped.get(project)?.length ?? 0}
                        </span>
                      </TabsTrigger>
                      <button
                        type="button"
                        onClick={() => hideProject(project)}
                        title={`Hide ${project}`}
                        aria-label={`Hide tab for ${project}`}
                        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover/tab:opacity-60 group-focus-within/tab:opacity-60 hover:!opacity-100 hover:bg-muted-foreground/20"
                      >
                        <Minus size={10} />
                      </button>
                    </div>
                  ))}
            </TabsList>
          </div>

          {!loading && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              title="Add visible tab"
              aria-label="Add visible tab"
              className="flex h-9 shrink-0 cursor-pointer items-center border-l border-border px-3 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="sticky top-[37px] z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-2">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter sessions..."
            disabled={loading}
            aria-label="Filter sessions"
            className="flex-1 cursor-text bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear session filter"
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
            <button
              type="button"
              onClick={() =>
                setSortKey((k) => (k === "turns" ? "lastMessage" : "turns"))
              }
              aria-label={`Sort by ${sortKey === "turns" ? "last message" : "turns"}`}
              title={`Sort key: ${sortKey === "turns" ? "turns" : "last message"} (click to toggle)`}
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowUpDown size={11} />
              {sortKey === "turns" ? "turns" : "lastMsg"}
            </button>
            <button
              type="button"
              onClick={() =>
                setSortDir((d) => (d === "asc" ? "desc" : "asc"))
              }
              aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"} (click to toggle)`}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              className="flex cursor-pointer items-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {sortDir === "asc" ? (
                <ArrowUp size={12} />
              ) : (
                <ArrowDown size={12} />
              )}
            </button>
          </div>
        </div>

        {loading ? (
          <div
            className="divide-y divide-border"
            role="status"
            aria-live="polite"
            aria-label="Loading sessions"
          >
            {[1, 2, 3].map((index) => (
              <div key={index} className="animate-pulse space-y-3 px-4 py-4">
                <div className="h-3 w-2/3 rounded bg-muted-foreground/20" />
                <div className="h-3 w-1/3 rounded bg-muted-foreground/10" />
                <div className="h-8 rounded-sm bg-muted-foreground/10" />
              </div>
            ))}
          </div>
        ) : error && sessions.length === 0 ? (
          <p className="p-6 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : tabProjects.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground" role="status">
            {allProjects.length === 0
              ? "No sessions found."
              : "All projects are hidden. Use the plus button to show a tab."}
          </p>
        ) : (
          tabProjects.map((project) => (
            <TabsContent key={project} value={project} className="mt-0">
              <div className="divide-y divide-border">
                {getSessionsForProject(project).map((session) => (
                  <SessionCard
                    key={session.sessionId}
                    s={session}
                    onDelete={() => deleteSession(session.sessionId)}
                  />
                ))}
              </div>
            </TabsContent>
          ))
        )}
      </Tabs>

      {showAddModal && (
        <AddTabsModal
          hiddenProjects={hiddenProjects}
          onAdd={addProject}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
