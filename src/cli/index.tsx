#!/usr/bin/env tsx

import { execSync } from "child_process";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { getSessions, type SessionEntry } from "../server/lib/claudeSessions.js";

type Session = SessionEntry;

function shortLabel(project: string): string {
  const parts = project.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-3);
  return tail.map((part, index) => (index < tail.length - 1 ? part[0] : part)).join("/");
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}

function copyToClipboard(text: string): boolean {
  for (const command of [
    "xclip -selection clipboard",
    "xsel --clipboard --input",
    "wl-copy",
  ]) {
    try {
      execSync(command, {
        input: text,
        stdio: ["pipe", "ignore", "ignore"],
      });
      return true;
    } catch {
      // Try the next command.
    }
  }

  return false;
}

function TabBar({
  projects,
  activeIndex,
  columns,
}: {
  projects: string[];
  activeIndex: number;
  columns: number;
}) {
  const tabWidth = 16;
  const visibleCount = Math.max(1, Math.floor(columns / tabWidth));
  const start = Math.max(
    0,
    Math.min(activeIndex - Math.floor(visibleCount / 2), projects.length - visibleCount),
  );
  const visibleProjects = projects.slice(start, start + visibleCount);

  return (
    <Box borderStyle="single" borderBottom flexDirection="row" flexWrap="nowrap" height={3}>
      {start > 0 && <Text color="gray">{"< "}</Text>}
      {visibleProjects.map((project, index) => {
        const projectIndex = start + index;
        const isActive = projectIndex === activeIndex;

        return (
          <Box key={project} marginRight={1}>
            <Text
              backgroundColor={isActive ? "white" : undefined}
              color={isActive ? "black" : "gray"}
              bold={isActive}
            >
              {` ${truncate(shortLabel(project), tabWidth - 2)} `}
            </Text>
          </Box>
        );
      })}
      {start + visibleCount < projects.length && <Text color="gray">{" >"}</Text>}
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
  const itemHeight = 4;
  const visibleCount = Math.max(1, Math.floor(height / itemHeight));
  const start = Math.max(
    0,
    Math.min(activeIndex - Math.floor(visibleCount / 2), sessions.length - visibleCount),
  );
  const visibleSessions = sessions.slice(start, start + visibleCount);

  if (sessions.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray">No sessions found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleSessions.map((session, index) => {
        const sessionIndex = start + index;
        const isActive = sessionIndex === activeIndex;

        return (
          <Box
            key={session.sessionId}
            flexDirection="column"
            paddingX={1}
            borderStyle={isActive ? "single" : undefined}
            borderColor={isActive ? "cyan" : undefined}
          >
            <Box flexDirection="row">
              <Text color={isActive ? "cyan" : "white"} bold={isActive}>
                {truncate(session.firstMessage ?? "(no message)", 70)}
              </Text>
              {session.isActive && <Text color="green"> active</Text>}
            </Box>
            {session.lastUserMessage && session.lastUserMessage !== session.firstMessage && (
              <Text color="gray">  Latest: {truncate(session.lastUserMessage, 65)}</Text>
            )}
            <Text color="gray" dimColor>
              {` ${formatDate(session.lastActivity)}`}
              {session.messageCount > 0 ? `  ${session.messageCount} messages` : ""}
              {`  ${session.sessionId.slice(0, 12)}...`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function SearchBar({ query, active }: { query: string; active: boolean }) {
  if (!active && !query) {
    return null;
  }

  return (
    <Box borderStyle="single" borderTop height={3} paddingX={1}>
      <Text color="yellow">/ </Text>
      <Text>{query}</Text>
      {active && <Text color="yellow">_</Text>}
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
        <Text color="green">Command copied</Text>
      ) : message ? (
        <Text color="yellow">{message}</Text>
      ) : (
        <Text color="gray" dimColor>
          Tabs: left/right  Sessions: up/down  copy: c or Enter  search: /  quit: q
        </Text>
      )}
      <Text color="gray" dimColor>
        {`${projectCount}proj  ${sessionCount}sess`}
      </Text>
    </Box>
  );
}

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
  const [statusMessage, setStatusMessage] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSessions(await getSessions());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = setTimeout(() => {
      setCopied(false);
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

  const filteredSessions = useMemo(() => {
    if (!query) {
      return sessions;
    }

    const normalizedQuery = query.toLowerCase();
    return sessions.filter(
      (session) =>
        session.firstMessage?.toLowerCase().includes(normalizedQuery) ||
        session.lastUserMessage?.toLowerCase().includes(normalizedQuery) ||
        session.project.toLowerCase().includes(normalizedQuery) ||
        session.sessionId.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sessions]);

  const projectMap = useMemo(() => {
    const grouped = new Map<string, Session[]>();

    for (const session of filteredSessions) {
      const projectSessions = grouped.get(session.project) ?? [];
      projectSessions.push(session);
      grouped.set(session.project, projectSessions);
    }

    return grouped;
  }, [filteredSessions]);

  const projects = useMemo(
    () =>
      [...projectMap.keys()].sort((left, right) => {
        const leftLatest = projectMap.get(left)?.[0]?.lastActivity ?? "";
        const rightLatest = projectMap.get(right)?.[0]?.lastActivity ?? "";
        return rightLatest.localeCompare(leftLatest);
      }),
    [projectMap],
  );

  const safeTabIndex = Math.min(tabIndex, Math.max(0, projects.length - 1));
  const currentProject = projects[safeTabIndex];
  const currentSessions = currentProject ? (projectMap.get(currentProject) ?? []) : [];
  const safeSessionIndex = Math.min(sessionIndex, Math.max(0, currentSessions.length - 1));
  const selectedSession = currentSessions[safeSessionIndex];

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
        setQuery((value) => value.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setQuery((value) => value + input);
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
      void refresh();
      setStatusMessage("Refreshing sessions...");
      setTimeout(() => {
        setStatusMessage(undefined);
      }, 1500);
      return;
    }

    if (key.leftArrow || input === "h") {
      setTabIndex((value) => Math.max(0, value - 1));
      setSessionIndex(0);
      return;
    }

    if (key.rightArrow || input === "l") {
      setTabIndex((value) => Math.min(projects.length - 1, value + 1));
      setSessionIndex(0);
      return;
    }

    if (key.upArrow || input === "k") {
      setSessionIndex((value) => Math.max(0, value - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSessionIndex((value) => Math.min(currentSessions.length - 1, value + 1));
      return;
    }

    if ((input === "c" || key.return) && selectedSession) {
      const command = `claude --resume ${selectedSession.sessionId}`;
      if (copyToClipboard(command)) {
        setCopied(true);
      } else {
        process.stdout.write(`${command}\n`);
        exit();
      }
    }
  });

  const searchBarHeight = searching || query ? 3 : 0;
  const listHeight = rows - 3 - 1 - searchBarHeight - 2;

  if (loading && sessions.length === 0) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center">
        <Text color="gray">Loading sessions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color="red">{`Error: ${error}`}</Text>
        <Text color="gray">Press r to retry or q to quit.</Text>
      </Box>
    );
  }

  if (projects.length === 0) {
    return (
      <Box height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color="gray">No sessions found.</Text>
        <Text color="gray" dimColor>
          Expected Claude session data under ~/.claude/projects
        </Text>
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
        message={statusMessage}
        copied={copied}
        sessionCount={filteredSessions.length}
        projectCount={projects.length}
      />
    </Box>
  );
}

render(<App />);
