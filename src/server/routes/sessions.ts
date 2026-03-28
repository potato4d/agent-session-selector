import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import os from "os";
import readline from "readline";
import { createReadStream } from "fs";

const router = Router();

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

/** C--Users-mail-Documents → C:\Users\mail\Documents */
function decodeProjectPath(encoded: string): string {
  // Leading drive letter: "C--" → "C:\"
  return encoded.replace(/^([A-Za-z])--/, "$1:\\").replaceAll("-", "\\");
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

async function getFirstUserMessage(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });
    let resolved = false;
    rl.on("line", (line) => {
      if (resolved) return;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "user" && typeof entry.message?.content === "string") {
          resolved = true;
          rl.close();
          resolve(entry.message.content);
        }
      } catch {
        // skip
      }
    });
    rl.on("close", () => {
      if (!resolved) resolve(null);
    });
  });
}

async function getLastTimestamp(filePath: string): Promise<string | null> {
  // Read last 4KB to find the last timestamp
  const CHUNK = 4096;
  let lastTimestamp: string | null = null;
  try {
    const stat = await fs.stat(filePath);
    const readSize = Math.min(CHUNK, stat.size);
    const buf = Buffer.alloc(readSize);
    const fh = await fs.open(filePath, "r");
    await fh.read(buf, 0, readSize, stat.size - readSize);
    await fh.close();
    const lines = buf.toString("utf-8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.timestamp) {
          lastTimestamp = entry.timestamp;
          break;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return lastTimestamp;
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

              const [firstMessage, lastTimestamp] = await Promise.all([
                getFirstUserMessage(filePath),
                getLastTimestamp(filePath),
              ]);

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
