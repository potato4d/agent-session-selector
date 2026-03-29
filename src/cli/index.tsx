#!/usr/bin/env tsx
/**
 * Agent Session Selector - TUI (Terminal UI)
 *
 * 操作:
 *   ← / →  タブ（プロジェクト）切り替え
 *   ↑ / ↓  セッション選択
 *   c / Enter  resume コマンドをクリップボードにコピー（または stdout 出力）
 *   /      検索フィルター
 *   Esc    検索クリア
 *   q / Ctrl-C  終了
 */

import React, { useState, useEffect, useCallback } from "react";
import { render, Text, Box, useInput, useApp, useStdout } from "ink";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execSync } from "child_process";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Session loading (same logic as server)
// ─────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const UNKNOWN_PROJECT = "(unknown project)";
const HEAD = 8192;
const TAIL = 262144;
const MAX_FULL = 4 * 1024 * 1024;

function readEntryCwd(entry: unknown): string | null {
  if (
    typeof entry === "object" &&
    entry !== null &&
    "cwd" in entry &&
    typeof (entry as { cwd?: unknown }).cwd === "string"
  ) {
    return (entry as { cwd: string }).cwd;
  }
  return null;
}

async function getActiveSessions(): Promise<Map<string, ActiveSession>> {
  const map = new Map<string, ActiveSession>();
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(SESSIONS_DIR, f), "utf-8");
            const session = JSON.parse(raw) as ActiveSession;
            map.set(session.sessionId, session);
          } catch {
            // ignore
          }
        })
    );
  } catch {
    // sessions dir may not exist
  }
  return map;
}

async function readSessionFileInfo(filePath: string) {
  let firstMessage: string | null = null;
  let lastUserMessage: string | null = null;
  let lastTimestamp: string | null = null;
  let cwd: string | null = null;
  let turnCount = 0;

  try {
    const fh = await fs.open(filePath, "r");
    try {
      const { size } = await fh.stat();
      let lines: string[];

      if (size <= MAX_FULL) {
        const buf = Buffer.alloc(size);
        await fh.read(buf, 0, size, 0);
        lines = buf.toString("utf-8").split("\n");
      } else {
        const headBuf = Buffer.alloc(HEAD);
        await fh.read(headBuf, 0, HEAD, 0);
        const tailBuf = Buffer.alloc(TAIL);
        await fh.read(tailBuf, 0, TAIL, size - TAIL);
        lines = [
          ...headBuf.toString("utf-8").split("\n"),
          ...tailBuf.toString("utf-8").split("\n"),
        ];
      }

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          cwd ??= readEntryCwd(entry);
          if (
            entry.type === "user" &&
            !entry.isMeta &&
            typeof entry.message?.content === "string"
          ) {
            if (!firstMessage) firstMessage = entry.message.content;
            if (entry.message.content !== "/exit") turnCount++;
          }
        } catch {
          // skip
        }
      }

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          cwd ??= readEntryCwd(entry);
          if (!lastTimestamp && entry.timestamp) lastTimestamp = entry.timestamp;
          if (
            !lastUserMessage &&
            entry.type === "user" &&
            !entry.isMeta &&
            typeof entry.message?.content === "string" &&
            entry.message.content !== "/exit"
          ) {
            lastUserMessage = entry.message.content;
          }
          if (cwd && lastTimestamp && lastUserMessage) break;
        } catch {
          // skip
        }
      }
    } finally {
      await fh.close();
    }
  } catch {
    // ignore
  }

  return { firstMessage, lastUserMessage, lastTimestamp, cwd, turnCount };
}

async function loadSessions(): Promise<Session[]> {
  const [projectDirs, activeSessions] = await Promise.all([
    fs.readdir(PROJECTS_DIR).catch(() => [] as string[]),
    getActiveSessions(),
  ]);

  const sessions = (
    await Promise.all(
      projectDirs.map(async (dir) => {
        try {
          const projectPath = path.join(PROJECTS_DIR, dir);
          const stat = await fs.stat(projectPath);
          if (!stat.isDirectory()) return [];

          const files = await fs.readdir(projectPath);
          const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

          return Promise.all(
            jsonlFiles.map(async (file) => {
              const sessionId = file.replace(".jsonl", "");
              const filePath = path.join(projectPath, file);
              const fileStat = await fs.stat(filePath);
              const { firstMessage, lastUserMessage, lastTimestamp, cwd, turnCount } =
                await readSessionFileInfo(filePath);
              const active = activeSessions.get(sessionId);
              return {
                sessionId,
                project: active?.cwd ?? cwd ?? UNKNOWN_PROJECT,
                firstMessage,
                lastUserMessage,
                lastActivity: lastTimestamp ?? fileStat.mtime.toISOString(),
                createdAt: fileStat.birthtime.toISOString(),
                isActive: !!active,
                active: active ?? null,
                turnCount,
              };
            })
          );
        } catch {
          return [];
        }
      })
    )
  ).flat();

  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  return sessions;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function shortLabel(project: string): string {
  const parts = project.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-3);
  return tail.map((part, i) => (i < tail.length - 1 ? part[0] : part)).join("/");
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
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
  return `${Math.floor(hours / 24)}d ago`;
}

function copyToClipboard(text: string): boolean {
  try {
    // Linux: xclip / xsel / wl-copy
    for (const cmd of ["xclip -selection clipboard", "xsel --clipboard --input", "wl-copy"]) {
      try {
        execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
        return true;
      } catch {
        // try next
      }
    }
  } catch {
    // ignore
  }
  return false;
}

// ─────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────

function TabBar({
  projects,
  activeIndex,
  columns,
}: {
  projects: string[];
  activeIndex: number;
  columns: number;
}) {
  // 表示できるタブ数を計算して、アクティブなタブが見えるようにスクロール
  const tabWidth = 16;
  const maxVisible = Math.max(1, Math.floor(columns / tabWidth));
  const start = Math.max(0, Math.min(activeIndex - Math.floor(maxVisible / 2), projects.length - maxVisible));
  const visible = projects.slice(start, start + maxVisible);

  return (
    <Box borderStyle="single" borderBottom flexDirection="row" flexWrap="nowrap" height={3}>
      {start > 0 && <Text color="gray">‹ </Text>}
      {visible.map((p, i) => {
        const idx = start + i;
        const isActive = idx === activeIndex;
        return (
          <Box key={p} marginRight={1}>
            <Text
              backgroundColor={isActive ? "white" : undefined}
              color={isActive ? "black" : "gray"}
              bold={isActive}
            >
              {` ${truncate(shortLabel(p), tabWidth - 2)} `}
            </Text>
          </Box>
        );
      })}
      {start + maxVisible < projects.length && <Text color="gray"> ›</Text>}
    </Box>
  );
}

function SessionList({
  sessions,
  activeIndex,
  height,
}: {
  sessions: Session[];
  activeIndex: number;
  height: number;
}) {
  const ITEM_HEIGHT = 4;
  const maxVisible = Math.max(1, Math.floor(height / ITEM_HEIGHT));
  const start = Math.max(0, Math.min(activeIndex - Math.floor(maxVisible / 2), sessions.length - maxVisible));
  const visible = sessions.slice(start, start + maxVisible);

  if (sessions.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray">セッションなし</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visible.map((s, i) => {
        const idx = start + i;
        const isActive = idx === activeIndex;
        return (
          <Box
            key={s.sessionId}
            flexDirection="column"
            paddingX={1}
            paddingY={0}
            borderStyle={isActive ? "single" : undefined}
            borderColor={isActive ? "cyan" : undefined}
            marginBottom={isActive ? 0 : 0}
          >
            <Box flexDirection="row">
              <Text color={isActive ? "cyan" : "white"} bold={isActive}>
                {truncate(s.firstMessage ?? "(no message)", 70)}
              </Text>
              {s.isActive && <Text color="green"> ● active</Text>}
            </Box>
            {s.lastUserMessage && s.lastUserMessage !== s.firstMessage && (
              <Text color="gray">  ↩ {truncate(s.lastUserMessage, 65)}</Text>
            )}
            <Text color="gray" dimColor>
              {" "}
              {formatDate(s.lastActivity)}
              {s.turnCount > 0 ? `  ${s.turnCount}往復` : ""}
              {"  "}
              <Text color="gray">{s.sessionId.slice(0, 12)}…</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function SearchBar({ query, active }: { query: string; active: boolean }) {
  if (!active && !query) return null;
  return (
    <Box borderStyle="single" borderTop height={3} paddingX={1}>
      <Text color="yellow">/ </Text>
      <Text>{query}</Text>
      {active && <Text color="yellow">█</Text>}
    </Box>
  );
}

function StatusBar({
  message,
  copied,
  sessionCount,
  projectCount,
}: {
  message?: string;
  copied: boolean;
  sessionCount: number;
  projectCount: number;
}) {
  return (
    <Box height={1} justifyContent="space-between" paddingX={1}>
      {copied ? (
        <Text color="green">✓ コピー済み</Text>
      ) : message ? (
        <Text color="yellow">{message}</Text>
      ) : (
        <Text color="gray" dimColor>
          ←→タブ  ↑↓選択  c/Enter コピー  /検索  q終了
        </Text>
      )}
      <Text color="gray" dimColor>
        {projectCount}proj  {sessionCount}sess
      </Text>
    </Box>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | undefined>(undefined);

  // Load sessions
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadSessions();
      setSessions(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Auto-refresh indicator
  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  // Derived data
  const filtered = query
    ? sessions.filter(
        (s) =>
          s.firstMessage?.toLowerCase().includes(query.toLowerCase()) ||
          s.lastUserMessage?.toLowerCase().includes(query.toLowerCase()) ||
          s.project.toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  const projectMap = new Map<string, Session[]>();
  for (const s of filtered) {
    const list = projectMap.get(s.project) ?? [];
    list.push(s);
    projectMap.set(s.project, list);
  }

  const projects = [...projectMap.keys()].sort((a, b) => {
    const aLatest = projectMap.get(a)![0].lastActivity;
    const bLatest = projectMap.get(b)![0].lastActivity;
    return bLatest.localeCompare(aLatest);
  });

  const safeTabIndex = Math.min(tabIndex, Math.max(0, projects.length - 1));
  const currentProject = projects[safeTabIndex];
  const currentSessions = currentProject ? (projectMap.get(currentProject) ?? []) : [];
  const safeSessionIndex = Math.min(sessionIndex, Math.max(0, currentSessions.length - 1));
  const selectedSession = currentSessions[safeSessionIndex];

  // Keyboard handling
  useInput((input, key) => {
    if (searching) {
      if (key.escape || (key.ctrl && input === "c")) {
        setSearching(false);
        setQuery("");
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setQuery((q) => q + input);
      }
      return;
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (input === "/") {
      setSearching(true);
      return;
    }

    if (key.escape) {
      setQuery("");
      return;
    }

    if (input === "r") {
      refresh();
      setStatusMsg("更新中…");
      setTimeout(() => setStatusMsg(undefined), 1500);
      return;
    }

    if (key.leftArrow || input === "h") {
      setTabIndex((i) => Math.max(0, i - 1));
      setSessionIndex(0);
      return;
    }

    if (key.rightArrow || input === "l") {
      setTabIndex((i) => Math.min(projects.length - 1, i + 1));
      setSessionIndex(0);
      return;
    }

    if (key.upArrow || input === "k") {
      setSessionIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSessionIndex((i) => Math.min(currentSessions.length - 1, i + 1));
      return;
    }

    if ((input === "c" || key.return) && selectedSession) {
      const cmd = `claude --resume ${selectedSession.sessionId}`;
      const ok = copyToClipboard(cmd);
      if (ok) {
        setCopied(true);
      } else {
        // fallback: print to stdout after exit
        process.stdout.write(cmd + "\n");
        exit();
      }
      return;
    }
  });

  // Layout
  const tabBarHeight = 3;
  const statusBarHeight = 1;
  const searchBarHeight = searching || query ? 3 : 0;
  const listHeight = rows - tabBarHeight - statusBarHeight - searchBarHeight - 2;

  if (loading && sessions.length === 0) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center">
        <Text color="gray">セッションを読み込み中…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color="red">エラー: {error}</Text>
        <Text color="gray">r で再試行  q で終了</Text>
      </Box>
    );
  }

  if (projects.length === 0) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color="gray">セッションが見つかりません</Text>
        <Text color="gray" dimColor>~/.claude/projects を確認してください</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <TabBar projects={projects} activeIndex={safeTabIndex} columns={columns} />
      <SessionList
        sessions={currentSessions}
        activeIndex={safeSessionIndex}
        height={listHeight}
      />
      <SearchBar query={query} active={searching} />
      <StatusBar
        message={statusMsg}
        copied={copied}
        sessionCount={filtered.length}
        projectCount={projects.length}
      />
    </Box>
  );
}

render(<App />);
