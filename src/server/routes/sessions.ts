import { Router } from "express";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";

const router = Router();

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

/** C--Users-mail-Documents → C:\Users\mail\Documents
 *  Uses filesystem validation so dir names containing "-" are preserved. */
function decodeProjectPath(encoded: string): string {
  const driveMatch = encoded.match(/^([A-Za-z])--(.*)$/);
  let current: string;
  let remaining: string;

  if (driveMatch) {
    current = `${driveMatch[1]}:\\`;
    remaining = driveMatch[2];
  } else {
    current = "/";
    remaining = encoded.startsWith("-") ? encoded.slice(1) : encoded;
  }

  const tokens = remaining.split("-");
  let i = 0;

  while (i < tokens.length) {
    let matched = false;
    // Try longest segment first so "cc-session-selector" wins over "cc"
    for (let len = tokens.length - i; len >= 1; len--) {
      const segment = tokens.slice(i, i + len).join("-");
      const candidate = path.join(current, segment);
      if (existsSync(candidate)) {
        current = candidate;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      current = path.join(current, tokens[i]);
      i++;
    }
  }

  return current;
}

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
  lastTimestamp: string | null;
}

/** ファイルを1回開き、先頭8KB・末尾4KBだけ読んで必要な情報を抽出する */
async function readSessionFileInfo(filePath: string): Promise<SessionFileInfo> {
  const HEAD = 8192;
  const TAIL = 4096;
  let firstMessage: string | null = null;
  let lastTimestamp: string | null = null;

  try {
    const fh = await fs.open(filePath, "r");
    try {
      const { size } = await fh.stat();

      // 先頭から firstMessage を探す
      const headSize = Math.min(HEAD, size);
      const headBuf = Buffer.alloc(headSize);
      await fh.read(headBuf, 0, headSize, 0);
      for (const line of headBuf.toString("utf-8").split("\n")) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === "user" && typeof entry.message?.content === "string") {
            firstMessage = entry.message.content;
            break;
          }
        } catch { /* skip */ }
      }

      // 末尾から lastTimestamp を探す
      const tailSize = Math.min(TAIL, size);
      const tailBuf = Buffer.alloc(tailSize);
      await fh.read(tailBuf, 0, tailSize, size - tailSize);
      const tailLines = tailBuf.toString("utf-8").split("\n");
      for (let i = tailLines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(tailLines[i]);
          if (entry.timestamp) {
            lastTimestamp = entry.timestamp;
            break;
          }
        } catch { /* skip */ }
      }
    } finally {
      await fh.close();
    }
  } catch { /* ignore */ }

  return { firstMessage, lastTimestamp };
}

router.get("/", async (_req, res) => {
  try {
    const [projectDirs, activeSessions] = await Promise.all([
      fs.readdir(PROJECTS_DIR),
      getActiveSessions(),
    ]);

    const sessions = (
      await Promise.all(
        projectDirs.map(async (dir) => {
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

              const { firstMessage, lastTimestamp } = await readSessionFileInfo(filePath);

              const active = activeSessions.get(sessionId);

              return {
                sessionId,
                project: decodeProjectPath(dir),
                firstMessage,
                lastActivity: lastTimestamp ?? fileStat.mtime.toISOString(),
                createdAt: fileStat.birthtime.toISOString(),
                isActive: !!active,
                active: active ?? null,
              };
            })
          );
        })
      )
    ).flat();

    // Sort by lastActivity descending
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
