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
}

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

/** ファイルを1回開き、先頭8KB・末尾256KBだけ読んで必要な情報を抽出する */
async function readSessionFileInfo(filePath: string): Promise<SessionFileInfo> {
  const HEAD = 8192;
  const TAIL = 262144;
  let firstMessage: string | null = null;
  let lastUserMessage: string | null = null;
  let lastTimestamp: string | null = null;
  let cwd: string | null = null;

  try {
    const fh = await fs.open(filePath, "r");
    try {
      const { size } = await fh.stat();

      // 先頭から firstMessage と cwd を探す
      const headSize = Math.min(HEAD, size);
      const headBuf = Buffer.alloc(headSize);
      await fh.read(headBuf, 0, headSize, 0);
      for (const line of headBuf.toString("utf-8").split("\n")) {
        try {
          const entry = JSON.parse(line);
          cwd ??= readEntryCwd(entry);
          if (
            entry.type === "user" &&
            !entry.isMeta &&
            typeof entry.message?.content === "string"
          ) {
            firstMessage = entry.message.content;
            if (cwd) break;
          }
        } catch {
          // skip
        }
      }

      // 末尾から lastTimestamp / lastUserMessage を探し、cwd も補完する
      const tailStart = Math.max(0, size - TAIL);
      const tailSize = size - tailStart;
      // 先頭読み込みで全体をカバー済みならバッファを再利用
      const tailLines = tailStart < headSize
        ? headBuf.toString("utf-8").split("\n")
        : await (async () => {
            const tailBuf = Buffer.alloc(tailSize);
            await fh.read(tailBuf, 0, tailSize, tailStart);
            return tailBuf.toString("utf-8").split("\n");
          })();
      for (let i = tailLines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(tailLines[i]);
          cwd ??= readEntryCwd(entry);
          if (!lastTimestamp && entry.timestamp) {
            lastTimestamp = entry.timestamp;
          }
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

  return { firstMessage, lastUserMessage, lastTimestamp, cwd };
}

router.get("/", async (_req, res) => {
  try {
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

                const {
                  firstMessage,
                  lastUserMessage,
                  lastTimestamp,
                  cwd,
                } = await readSessionFileInfo(filePath);

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
                };
              })
            );
          } catch {
            return [];
          }
        })
      )
    ).flat();

    sessions.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read sessions" });
  }
});

export default router;
