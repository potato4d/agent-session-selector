import { Router } from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";

const router = Router();

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

const UNKNOWN_PROJECT = "(unknown project)";

interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
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
            // ignore malformed files
          }
        })
    );
  } catch {
    // sessions dir may not exist
  }
  return map;
}

interface SessionFileInfo {
  firstMessage: string | null;
  lastUserMessage: string | null;
  lastTimestamp: string | null;
  cwd: string | null;
  turnCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEntryCwd(entry: unknown): string | null {
  if (isRecord(entry) && typeof entry.cwd === "string") {
    return entry.cwd;
  }
  return null;
}

/** user メッセージかつ isMeta でなく、content が文字列のエントリを判定 */
function isUserMessage(
  entry: unknown,
): entry is { type: "user"; isMeta?: boolean; message: { content: string } } {
  return (
    isRecord(entry) &&
    entry.type === "user" &&
    entry.isMeta !== true &&
    isRecord(entry.message) &&
    typeof entry.message.content === "string"
  );
}

/** ファイルを1回開き、必要な情報を抽出する（4MB以下は全読み、超過は先頭8KB+末尾256KB） */
async function readSessionFileInfo(filePath: string): Promise<SessionFileInfo> {
  const MAX_FULL = 4 * 1024 * 1024; // 4MB
  const HEAD = 8192;
  const TAIL = 262144;

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

      // Forward pass: firstMessage, cwd, turnCount
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          cwd ??= readEntryCwd(entry);
          if (isUserMessage(entry)) {
            if (!firstMessage) firstMessage = entry.message.content;
            if (entry.message.content !== "/exit") turnCount++;
          }
        } catch {
          // skip malformed JSON lines
        }
      }

      // Backward pass: lastTimestamp, lastUserMessage
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          cwd ??= readEntryCwd(entry);
          if (!lastTimestamp && isRecord(entry) && typeof entry.timestamp === "string") {
            lastTimestamp = entry.timestamp;
          }
          if (
            !lastUserMessage &&
            isUserMessage(entry) &&
            entry.message.content !== "/exit"
          ) {
            lastUserMessage = entry.message.content;
          }
          if (cwd && lastTimestamp && lastUserMessage) break;
        } catch {
          // skip malformed JSON lines
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

export interface SessionEntry {
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

export async function getSessions(): Promise<SessionEntry[]> {
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

router.get("/", async (_req, res) => {
  try {
    const sessions = await getSessions();
    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read sessions" });
  }
});

/** SSE: セッション一覧をリアルタイムで配信 */
router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "connected" });

  let lastHash = "";

  const poll = async () => {
    try {
      const sessions = await getSessions();
      // ハッシュで変化を検知（sessionId + lastActivity の組み合わせ）
      const hash = sessions.map((s) => `${s.sessionId}:${s.lastActivity}`).join("|");
      if (hash !== lastHash) {
        lastHash = hash;
        send({ type: "sessions", sessions });
      }
    } catch {
      // ignore polling errors
    }
  };

  // 初回即時配信
  poll();
  const interval = setInterval(poll, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

export default router;
