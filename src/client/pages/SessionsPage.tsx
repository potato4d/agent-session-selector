import { useEffect, useState } from "react";
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

function SessionCard({ s }: { s: Session }) {
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
      <CardContent>
        <p className="text-xs text-muted-foreground">
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

  useEffect(() => {
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-6 text-destructive">Error: {error}</p>;

  const grouped = sessionsByProject(sessions);
  const projects = [...grouped.keys()];
  const defaultTab = projects[0];

  return (
    <div className="flex flex-col">
      <Tabs defaultValue={defaultTab} className="gap-0">
        {/* Ghostty-style tab bar */}
        <div className="border-b border-border bg-muted/40">
          <TabsList className="flex h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {projects.map((project) => {
              const count = grouped.get(project)!.length;
              return (
                <TabsTrigger
                  key={project}
                  value={project}
                  title={project}
                  className="relative h-9 rounded-none border-r border-border px-4 text-xs text-muted-foreground
                    transition-none
                    data-[state=active]:bg-background
                    data-[state=active]:text-foreground
                    data-[state=active]:shadow-none
                    data-[state=active]:after:absolute
                    data-[state=active]:after:bottom-0
                    data-[state=active]:after:left-0
                    data-[state=active]:after:right-0
                    data-[state=active]:after:h-px
                    data-[state=active]:after:bg-background"
                >
                  <span className="font-mono">{shortLabel(project)}</span>
                  <span className="ml-2 text-muted-foreground/60">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {projects.map((project) => (
          <TabsContent key={project} value={project} className="mt-0">
            <div className="divide-y divide-border">
              {grouped.get(project)!.map((s) => (
                <SessionCard key={s.sessionId} s={s} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
