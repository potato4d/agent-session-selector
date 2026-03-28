import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <p className="text-sm text-muted-foreground">
        {sessions.length} session{sessions.length !== 1 ? "s" : ""}
      </p>

      <div className="space-y-2">
        {sessions.map((s) => (
          <Card
            key={s.sessionId}
            className="cursor-pointer transition-colors hover:bg-accent"
          >
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
        ))}
      </div>
    </div>
  );
}
