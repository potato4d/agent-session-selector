import { useEffect, useState } from "react";

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

export default function App() {
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

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "monospace", padding: "1rem" }}>
      <h1>CC Session Selector</h1>
      <p>{sessions.length} session(s)</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {sessions.map((s) => (
          <li
            key={s.sessionId}
            style={{
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: "0.75rem",
              marginBottom: "0.5rem",
              background: s.isActive ? "#f0fff0" : "#fafafa",
            }}
          >
            <div>
              <strong>{s.firstMessage ?? "(no message)"}</strong>
              {s.isActive && (
                <span style={{ marginLeft: 8, color: "green" }}>● active</span>
              )}
            </div>
            <div style={{ color: "#666", fontSize: "0.85em", marginTop: 4 }}>
              {s.project}
            </div>
            <div style={{ color: "#999", fontSize: "0.8em", marginTop: 2 }}>
              {new Date(s.lastActivity).toLocaleString()} · {s.sessionId}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
