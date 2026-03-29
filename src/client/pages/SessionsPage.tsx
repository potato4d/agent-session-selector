import { useEffect, useRef, useState, useCallback } from "react";
import { Copy, Plus, Minus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STORAGE_KEY = "cc-session-selector:visible-projects";
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

function sessionsByProject(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = map.get(s.project) ?? [];
    list.push(s);
    map.set(s.project, list);
  }
  return map;
}

function shortLabel(project: string): string {
  const parts = project.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-5);
  return tail
    .map((part, i) => (i < tail.length - 1 ? part[0] : part))
    .join("/");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function CopyInput({ value }: { value: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  }

  return (
    <div className="flex items-stretch">
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value}
        onClick={() => inputRef.current?.select()}
        className="min-w-0 flex-1 rounded-l-sm rounded-r-none border border-r-0 border-border bg-muted px-3 py-2 font-mono text-xs text-foreground outline-none"
      />
      <button
        onClick={handleCopy}
        className="shrink-0 rounded-l-none rounded-r-sm border border-border bg-muted px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Copy to clipboard"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

function SessionCard({ s }: { s: Session }) {
  const resumeCmd = `claude --resume ${s.sessionId}`;

  return (
    <Card className="rounded-none border-0 ring-0 transition-colors hover:bg-accent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="min-w-0 flex-1 truncate text-sm font-medium">
            {s.firstMessage ?? "(no message)"}
          </CardTitle>
          {s.isActive && (
            <Badge variant="default" className="shrink-0">
              active
            </Badge>
          )}
        </div>
        <CardDescription className="truncate text-xs">
          {s.project}
        </CardDescription>
        {s.lastUserMessage && s.lastUserMessage !== s.firstMessage && (
          <p className="truncate text-xs text-muted-foreground/70">
            ↩ {s.lastUserMessage}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <CopyInput value={resumeCmd} />
        <p className="text-right text-xs text-muted-foreground">
          {formatDate(s.lastActivity)}
          {s.turnCount > 0 && (
            <span className="ml-2 font-mono">{s.turnCount}往復</span>
          )}
          {" · "}
          <span className="font-mono">{s.sessionId.slice(0, 8)}…</span>
        </p>
      </CardContent>
    </Card>
  );
}

/** プロジェクト追加/復元モーダル */
function AddTabsModal({
  hiddenProjects,
  onAdd,
  onClose,
}: {
  hiddenProjects: string[];
  onAdd: (project: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = filter.trim()
    ? hiddenProjects.filter((p) =>
        p.toLowerCase().includes(filter.trim().toLowerCase())
      )
    : hiddenProjects;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[480px] max-w-[90vw] rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">タブを追加</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="プロジェクトを検索…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {hiddenProjects.length === 0
                ? "すべてのタブを表示中"
                : "該当なし"}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p}
                onClick={() => onAdd(p)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent"
              >
                <Plus size={12} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-mono text-xs">
                  {shortLabel(p)}
                </span>
                <span
                  className="ml-auto shrink-0 truncate text-xs text-muted-foreground"
                  title={p}
                >
                  {p.length > 40 ? "…" + p.slice(-37) : p}
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
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleProjects, setVisibleProjects] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const initializedRef = useRef(false);

  // SSE でリアルタイム受信
  useEffect(() => {
    const es = new EventSource("/api/sessions/events");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as
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
      setConnected(false);
      setError("サーバーへの接続が切れました。再接続を試みています…");
    };

    return () => es.close();
  }, []);

  // 手動再読み込み（既存イベントとの互換）
  useEffect(() => {
    const handler = () => {
      // SSE が動いているので特に何もしない（2秒以内に自動更新される）
      toast.info("SSEで自動更新中…");
    };
    window.addEventListener("sessions:refetch", handler);
    return () => window.removeEventListener("sessions:refetch", handler);
  }, []);

  // 全プロジェクト（最終更新順）
  const allProjects = useCallback(() => {
    const grouped = sessionsByProject(sessions);
    return [...grouped.keys()].sort((a, b) => {
      const aLatest = grouped.get(a)![0].lastActivity;
      const bLatest = grouped.get(b)![0].lastActivity;
      return bLatest.localeCompare(aLatest);
    });
  }, [sessions]);

  // セッション読み込み後、初回のみ表示プロジェクトを初期化
  useEffect(() => {
    if (loading || initializedRef.current) return;
    initializedRef.current = true;

    const projects = allProjects();
    const stored = loadStoredVisibleProjects();
    if (stored && stored.size > 0) {
      // 保存済みを使いつつ、存在するプロジェクトのみ残す
      const valid = projects.filter((p) => stored.has(p));
      setVisibleProjects(valid.length > 0 ? valid : projects.slice(0, DEFAULT_TAB_LIMIT));
    } else {
      setVisibleProjects(projects.slice(0, DEFAULT_TAB_LIMIT));
    }
  }, [loading, allProjects]);

  // 新しいプロジェクトが増えたらアクティブセッションのあるものを自動追加
  useEffect(() => {
    if (loading || !initializedRef.current) return;
    const projects = allProjects();
    setVisibleProjects((prev) => {
      const prevSet = new Set(prev);
      // アクティブセッションがあるプロジェクトは自動的に表示
      const grouped = sessionsByProject(sessions);
      const activeProjects = projects.filter(
        (p) => !prevSet.has(p) && grouped.get(p)?.some((s) => s.isActive)
      );
      if (activeProjects.length === 0) return prev;
      const next = [...prev, ...activeProjects];
      saveVisibleProjects(next);
      return next;
    });
  }, [sessions, loading, allProjects]);

  // activeTab の自動設定
  useEffect(() => {
    if (visibleProjects.length > 0 && !activeTab) {
      setActiveTab(visibleProjects[0]);
    }
  }, [visibleProjects, activeTab]);

  function hideProject(project: string) {
    setVisibleProjects((prev) => {
      const next = prev.filter((p) => p !== project);
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

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? sessions.filter(
        (s) =>
          s.firstMessage?.toLowerCase().includes(normalized) ||
          s.lastUserMessage?.toLowerCase().includes(normalized) ||
          s.project.toLowerCase().includes(normalized) ||
          s.sessionId.toLowerCase().includes(normalized)
      )
    : sessions;

  const grouped = sessionsByProject(filtered);
  const projects = allProjects();
  // 表示中タブ（visibleProjects に含まれ、かつセッションが存在するもの）
  const tabProjects = visibleProjects.filter((p) => grouped.has(p));
  // 非表示プロジェクト（全プロジェクトのうち表示していないもの）
  const hiddenProjects = projects.filter((p) => !visibleProjects.includes(p));

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
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="gap-0"
      >
        {/* Tab bar */}
        <div className="flex items-stretch border-b border-border bg-muted/40">
          <div className="scrollbar-hidden flex-1 overflow-x-auto">
            <TabsList className="flex h-auto min-w-max justify-start gap-0 rounded-none bg-transparent p-0">
              {loading
                ? [80, 110].map((w) => (
                    <div
                      key={w}
                      className="flex h-9 shrink-0 items-center border-r border-border px-4"
                    >
                      <div
                        className="animate-pulse rounded bg-muted-foreground/20"
                        style={{ width: w, height: 10 }}
                      />
                    </div>
                  ))
                : tabProjects.map((project) => (
                    <TabsTrigger
                      key={project}
                      value={project}
                      title={project}
                      className={`${tabTriggerClass} group shrink-0 flex-none`}
                    >
                      <span className="font-mono">{shortLabel(project)}</span>
                      <span className="ml-1.5 text-muted-foreground/60">
                        {grouped.get(project)!.length}
                      </span>
                      {/* 「-」で非表示ボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hideProject(project);
                        }}
                        title="タブを非表示"
                        className="ml-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted-foreground/20"
                      >
                        <Minus size={10} />
                      </button>
                    </TabsTrigger>
                  ))}
            </TabsList>
          </div>

          {/* 「+」タブ追加ボタン */}
          {!loading && (
            <button
              onClick={() => setShowAddModal(true)}
              title="タブを追加"
              className="flex h-9 shrink-0 items-center border-l border-border px-3 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Plus size={14} />
              {hiddenProjects.length > 0 && (
                <span className="ml-1 text-xs">{hiddenProjects.length}</span>
              )}
            </button>
          )}

          {/* 接続状態インジケーター */}
          {!loading && (
            <div
              className="flex h-9 items-center px-2"
              title={connected ? "リアルタイム接続中" : "接続待機中"}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
              />
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sessions…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-3 px-4 py-4">
                <div className="h-3 w-2/3 rounded bg-muted-foreground/20" />
                <div className="h-3 w-1/3 rounded bg-muted-foreground/10" />
                <div className="h-8 rounded-sm bg-muted-foreground/10" />
              </div>
            ))}
          </div>
        ) : error && sessions.length === 0 ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : tabProjects.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {projects.length === 0
              ? "No sessions found."
              : "すべてのタブが非表示です。「+」から追加できます。"}
          </p>
        ) : (
          tabProjects.map((project) => (
            <TabsContent key={project} value={project} className="mt-0">
              <div className="divide-y divide-border">
                {(grouped.get(project) ?? []).map((s) => (
                  <SessionCard key={s.sessionId} s={s} />
                ))}
              </div>
            </TabsContent>
          ))
        )}
      </Tabs>

      {/* タブ追加モーダル */}
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
