import { access } from "fs/promises";
import { spawn } from "child_process";
import { Router } from "express";
import { getSessions } from "../lib/claudeSessions.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const sessions = await getSessions();
    res.json({ sessions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to read sessions" });
  }
});

router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ type: "connected" });

  let lastHash = "";

  const poll = async () => {
    try {
      const sessions = await getSessions();
      const hash = sessions.map((session) => `${session.sessionId}:${session.lastActivity}`).join("|");

      if (hash !== lastHash) {
        lastHash = hash;
        send({ type: "sessions", sessions });
      }
    } catch {
      // Ignore polling errors and keep the stream alive.
    }
  };

  void poll();
  const interval = setInterval(() => {
    void poll();
  }, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// Session IDs are UUIDs or UUID-like identifiers (hex + hyphens only).
const SESSION_ID_RE = /^[0-9a-f-]{36,}$/i;

interface TerminalCandidate {
  bin: string;
  args: (sessionId: string) => string[];
  preCheck?: () => Promise<boolean>;
}

async function appBundleExists(appPath: string): Promise<boolean> {
  try {
    await access(appPath);
    return true;
  } catch {
    return false;
  }
}

// Allowlist of known terminal emulators with their argument style.
// Using spawn (not exec) with explicit arg arrays — no shell interpolation.
// macOS .app bundles are launched via osascript with a preCheck to confirm the bundle exists.
const TERMINAL_CANDIDATES: TerminalCandidate[] = [
  // Cross-platform
  { bin: "ghostty",         args: (id) => ["-e", "claude", "--resume", id] },
  { bin: "alacritty",       args: (id) => ["-e", "claude", "--resume", id] },
  { bin: "kitty",           args: (id) => ["claude", "--resume", id] },
  { bin: "wezterm",         args: (id) => ["start", "--", "claude", "--resume", id] },
  // Linux
  { bin: "gnome-terminal",  args: (id) => ["--", "claude", "--resume", id] },
  { bin: "konsole",         args: (id) => ["-e", "claude", "--resume", id] },
  { bin: "x-terminal-emulator", args: (id) => ["-e", "claude", "--resume", id] },
  { bin: "xterm",           args: (id) => ["-e", "claude", "--resume", id] },
  // macOS — sessionId is UUID-validated (hex + hyphens), safe to include in AppleScript string
  {
    bin: "osascript",
    preCheck: () => appBundleExists("/Applications/iTerm.app"),
    args: (id) => ["-e", `tell application "iTerm" to create window with default profile command "claude --resume ${id}"`],
  },
  {
    bin: "osascript",
    preCheck: () => appBundleExists("/Applications/Utilities/Terminal.app"),
    args: (id) => ["-e", `tell application "Terminal" to do script "claude --resume ${id}"`],
  },
];

function trySpawnTerminal(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { detached: true, stdio: "ignore" });
    proc.on("error", reject);
    proc.on("spawn", () => {
      proc.unref();
      resolve();
    });
  });
}

async function launchInTerminal(sessionId: string): Promise<void> {
  for (const { bin, args, preCheck } of TERMINAL_CANDIDATES) {
    if (preCheck && !(await preCheck())) continue;
    try {
      await trySpawnTerminal(bin, args(sessionId));
      return;
    } catch {
      // Try next terminal
    }
  }

  throw new Error("No terminal emulator found");
}

router.post("/:sessionId/launch", async (req, res) => {
  // Localhost-only: reject requests from any non-loopback address.
  const remoteAddress = req.socket.remoteAddress ?? "";
  const isLoopback =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";

  if (!isLoopback) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { sessionId } = req.params;

  if (!SESSION_ID_RE.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  try {
    const sessions = await getSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await launchInTerminal(sessionId);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to launch session" });
  }
});

export default router;
