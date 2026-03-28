import { useEffect, useRef, useState } from "react";
import { Copy, Search } from "lucide-react";
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
  lastActivity: string;
  createdAt: string;
  isActive: boolean;
  active: ActiveSession | null;
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

function CopyInput({ value }: { value: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      toast.success("Copied to clipboard");
    });
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
    <Card className="cursor-pointer rounded-none border-0 ring-0 transition-colors hover:bg-accent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">
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
      </CardHeader>
      <CardContent className="space-y-2">
        <CopyInput value={resumeCmd} />
        <p className="text-right text-xs text-muted-foreground">
          {new Date(s.lastActivity).toLocaleString()} ·{" "}
          <span className="font-mono">{s.sessionId}</span>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function fetchSessions() {
    setLoading(true);
    setError(null);
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSessions();
    window.addEventListener("sessions:refetch", fetchSessions);
    return () => window.removeEventListener("sessions:refetch", fetchSessions);
  }, []);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? sessions.filter((s) =>
        s.firstMessage?.toLowerCase().includes(normalized) ||
        s.sessionId.toLowerCase().includes(normalized)
      )
    : sessions;

  const grouped = sessionsByProject(filtered);
  const projects = [...grouped.keys()];
  const defaultTab = projects[0];

  const tabTriggerClass = `relative h-9 rounded-none border-r border-border px-4 text-xs text-muted-foreground
    transition-none
    data-[state=active]:bg-background
    data-[state=active]:text-foreground
    data-[state=active]:shadow-none
    data-[state=active]:after:absolute
    data-[state=active]:after:bottom-0
    data-[state=active]:after:left-0
    data-[state=active]:after:right-0
    data-[state=active]:after:h-px
    data-[state=active]:after:bg-background`;

  return (
    <div className="flex flex-col">
      <Tabs defaultValue={defaultTab} className="gap-0">
        {/* Tab bar */}
        <div className="border-b border-border bg-muted/40">
          <TabsList className="flex h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {loading
              ? [80, 110].map((w) => (
                  <div key={w} className="flex h-9 items-center border-r border-border px-4">
                    <div className="animate-pulse rounded bg-muted-foreground/20" style={{ width: w, height: 10 }} />
                  </div>
                ))
              : projects.map((project) => (
                  <TabsTrigger key={project} value={project} title={project} className={tabTriggerClass}>
                    <span className="font-mono">{shortLabel(project)}</span>
                    <span className="ml-2 text-muted-foreground/60">{grouped.get(project)!.length}</span>
                  </TabsTrigger>
                ))}
          </TabsList>
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
            <button onClick={() => setQuery("")} className="text-xs text-muted-foreground hover:text-foreground">
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
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error}</p>
        ) : projects.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No sessions found.</p>
        ) : (
          projects.map((project) => (
            <TabsContent key={project} value={project} className="mt-0">
              <div className="divide-y divide-border">
                {grouped.get(project)!.map((s) => (
                  <SessionCard key={s.sessionId} s={s} />
                ))}
              </div>
            </TabsContent>
          ))
        )}
      </Tabs>
    </div>
  );
}
