import fs from "fs/promises";
import os from "os";
import path from "path";

const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), ".claude");

export const UNKNOWN_PROJECT = "(unknown project)";
export const MAX_FULL_SESSION_BYTES = 4 * 1024 * 1024;
export const SESSION_HEAD_BYTES = 8192;
export const SESSION_TAIL_BYTES = 262144;

type SessionFileSystem = Pick<typeof fs, "open" | "readFile" | "readdir" | "stat">;

export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
}

export interface SessionFileInfo {
  firstMessage: string | null;
  lastUserMessage: string | null;
  lastTimestamp: string | null;
  cwd: string | null;
  messageCount: number;
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
  messageCount: number;
}

export interface SessionLoaderOptions {
  fileSystem?: SessionFileSystem;
  claudeDir?: string;
}

function getClaudePaths(claudeDir: string) {
  return {
    projectsDir: path.join(claudeDir, "projects"),
    sessionsDir: path.join(claudeDir, "sessions"),
  };
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

async function readRange(
  fileHandle: Awaited<ReturnType<SessionFileSystem["open"]>>,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fileHandle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

function toJsonLines(buffer: Buffer): string[] {
  return buffer.toString("utf-8").split("\n");
}

export async function getActiveSessions(
  options: SessionLoaderOptions = {},
): Promise<Map<string, ActiveSession>> {
  const fileSystem = options.fileSystem ?? fs;
  const claudeDir = options.claudeDir ?? DEFAULT_CLAUDE_DIR;
  const { sessionsDir } = getClaudePaths(claudeDir);
  const sessions = new Map<string, ActiveSession>();

  try {
    const files = await fileSystem.readdir(sessionsDir);

    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await fileSystem.readFile(path.join(sessionsDir, file), "utf-8");
            const session = JSON.parse(raw) as ActiveSession;
            sessions.set(session.sessionId, session);
          } catch {
            // Ignore malformed active-session files.
          }
        }),
    );
  } catch {
    // Ignore missing sessions directories.
  }

  return sessions;
}

export async function readSessionFileInfo(
  filePath: string,
  options: SessionLoaderOptions = {},
): Promise<SessionFileInfo> {
  const fileSystem = options.fileSystem ?? fs;

  let firstMessage: string | null = null;
  let lastUserMessage: string | null = null;
  let lastTimestamp: string | null = null;
  let cwd: string | null = null;
  let messageCount = 0;

  try {
    const fileHandle = await fileSystem.open(filePath, "r");

    try {
      const { size } = await fileHandle.stat();
      const lines =
        size <= MAX_FULL_SESSION_BYTES
          ? toJsonLines(await readRange(fileHandle, 0, size))
          : [
              ...toJsonLines(await readRange(fileHandle, 0, SESSION_HEAD_BYTES)),
              ...toJsonLines(
                await readRange(fileHandle, size - SESSION_TAIL_BYTES, SESSION_TAIL_BYTES),
              ),
            ];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          cwd ??= readEntryCwd(entry);

          if (isUserMessage(entry)) {
            if (!firstMessage) {
              firstMessage = entry.message.content;
            }

            if (entry.message.content !== "/exit") {
              messageCount++;
            }
          }
        } catch {
          // Ignore malformed JSONL entries.
        }
      }

      for (let index = lines.length - 1; index >= 0; index--) {
        try {
          const entry = JSON.parse(lines[index]);
          cwd ??= readEntryCwd(entry);

          if (!lastTimestamp && isRecord(entry) && typeof entry.timestamp === "string") {
            lastTimestamp = entry.timestamp;
          }

          if (!lastUserMessage && isUserMessage(entry) && entry.message.content !== "/exit") {
            lastUserMessage = entry.message.content;
          }

          if (cwd && lastTimestamp && lastUserMessage) {
            break;
          }
        } catch {
          // Ignore malformed JSONL entries.
        }
      }
    } finally {
      await fileHandle.close();
    }
  } catch {
    // Ignore unreadable session files.
  }

  return { firstMessage, lastUserMessage, lastTimestamp, cwd, messageCount };
}

export async function getSessions(
  options: SessionLoaderOptions = {},
): Promise<SessionEntry[]> {
  const fileSystem = options.fileSystem ?? fs;
  const claudeDir = options.claudeDir ?? DEFAULT_CLAUDE_DIR;
  const { projectsDir } = getClaudePaths(claudeDir);

  const [projectDirs, activeSessions] = await Promise.all([
    fileSystem.readdir(projectsDir).catch(() => [] as string[]),
    getActiveSessions({ claudeDir, fileSystem }),
  ]);

  const sessions = (
    await Promise.all(
      projectDirs.map(async (projectDir) => {
        try {
          const projectPath = path.join(projectsDir, projectDir);
          const stat = await fileSystem.stat(projectPath);

          if (!stat.isDirectory()) {
            return [];
          }

          const files = await fileSystem.readdir(projectPath);
          const sessionFiles = files.filter((file) => file.endsWith(".jsonl"));

          return Promise.all(
            sessionFiles.map(async (file) => {
              const sessionId = file.replace(".jsonl", "");
              const filePath = path.join(projectPath, file);
              const fileStat = await fileSystem.stat(filePath);
              const info = await readSessionFileInfo(filePath, { fileSystem });
              const active = activeSessions.get(sessionId);

              return {
                sessionId,
                project: active?.cwd ?? info.cwd ?? UNKNOWN_PROJECT,
                firstMessage: info.firstMessage,
                lastUserMessage: info.lastUserMessage,
                lastActivity: info.lastTimestamp ?? fileStat.mtime.toISOString(),
                createdAt: fileStat.birthtime.toISOString(),
                isActive: active !== undefined,
                active: active ?? null,
                messageCount: info.messageCount,
              };
            }),
          );
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  sessions.sort((left, right) => right.lastActivity.localeCompare(left.lastActivity));
  return sessions;
}
