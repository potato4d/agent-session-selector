import { describe, expect, it } from "vitest";
import {
  MAX_FULL_SESSION_BYTES,
  getActiveSessions,
  getSessions,
  readSessionFileInfo,
} from "./claudeSessions.js";

function createFileHandle(content: string, readPositions: number[] = []) {
  const buffer = Buffer.from(content, "utf-8");

  return {
    stat: async () => ({ size: buffer.length }),
    read: async (target: Buffer, offset: number, length: number, position: number) => {
      readPositions.push(position);
      const end = Math.min(position + length, buffer.length);
      const bytesRead = buffer.copy(target, offset, position, end);
      return { bytesRead };
    },
    close: async () => {},
  };
}

function createFileStat({
  birthtime,
  mtime,
}: {
  birthtime: string;
  mtime: string;
}) {
  return {
    isDirectory: () => false,
    birthtime: new Date(birthtime),
    mtime: new Date(mtime),
  };
}

function createDirectoryStat() {
  return {
    isDirectory: () => true,
  };
}

describe("getActiveSessions", () => {
  it("ignores malformed files and non-json entries", async () => {
    const fileSystem = {
      readdir: async (target: string) =>
        target.endsWith("/sessions") ? ["good.json", "broken.json", "notes.txt"] : [],
      readFile: async (target: string) => {
        if (target.endsWith("good.json")) {
          return JSON.stringify({
            pid: 10,
            sessionId: "good-session",
            cwd: "C:\\repos\\alpha",
            startedAt: 1,
            kind: "interactive",
            entrypoint: "claude-desktop",
          });
        }

        throw new Error("invalid json");
      },
      stat: async () => {
        throw new Error("stat should not be called");
      },
      open: async () => {
        throw new Error("open should not be called");
      },
    };

    const sessions = await getActiveSessions({
      claudeDir: "/home/user/.claude",
      fileSystem: fileSystem as any,
    });

    expect([...sessions.keys()]).toEqual(["good-session"]);
    expect(sessions.get("good-session")?.cwd).toBe("C:\\repos\\alpha");
  });
});

describe("readSessionFileInfo", () => {
  it("reads head and tail for large files while skipping meta, tool_result, and /exit", async () => {
    const readPositions: number[] = [];
    const content = [
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: { content: "meta init" },
        cwd: "C:\\repos\\alpha",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      JSON.stringify({
        type: "user",
        message: { content: "first real message" },
        cwd: "C:\\repos\\alpha",
        timestamp: "2026-01-01T00:01:00.000Z",
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }],
        },
        timestamp: "2026-01-01T00:02:00.000Z",
      }),
      "x".repeat(MAX_FULL_SESSION_BYTES),
      JSON.stringify({
        type: "user",
        message: { content: "/exit" },
        timestamp: "2026-01-01T00:03:00.000Z",
      }),
      JSON.stringify({
        type: "user",
        message: { content: "tail question" },
        timestamp: "2026-01-01T00:04:00.000Z",
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:05:00.000Z",
      }),
    ].join("\n");

    const fileSystem = {
      open: async () => createFileHandle(content, readPositions),
      readFile: async () => {
        throw new Error("readFile should not be called");
      },
      readdir: async () => [],
      stat: async () => {
        throw new Error("stat should not be called");
      },
    };

    const info = await readSessionFileInfo("C:\\repos\\alpha\\session.jsonl", {
      fileSystem: fileSystem as any,
    });

    expect(readPositions).toHaveLength(2);
    expect(info.firstMessage).toBe("first real message");
    expect(info.lastUserMessage).toBe("tail question");
    expect(info.lastTimestamp).toBe("2026-01-01T00:05:00.000Z");
    expect(info.cwd).toBe("C:\\repos\\alpha");
    expect(info.messageCount).toBe(2);
  });
});

describe("getSessions", () => {
  it("skips invalid project entries and sorts results by last activity", async () => {
    const alphaJsonl = JSON.stringify({
      type: "user",
      message: { content: "alpha session" },
    });
    const betaJsonl = JSON.stringify({
      type: "user",
      message: { content: "beta session" },
      cwd: "C:\\repos\\beta",
      timestamp: "2026-01-04T00:00:00.000Z",
    });

    const fileSystem = {
      readdir: async (target: string) => {
        if (target.endsWith("/projects")) {
          return ["project-a", "not-a-dir", "broken-project"];
        }

        if (target.endsWith("/sessions")) {
          return ["alpha.json"];
        }

        if (target.endsWith("/project-a")) {
          return ["alpha.jsonl", "beta.jsonl"];
        }

        return [];
      },
      readFile: async (target: string) => {
        if (target.endsWith("alpha.json")) {
          return JSON.stringify({
            pid: 20,
            sessionId: "alpha",
            cwd: "D:\\active-project",
            startedAt: 1,
            kind: "interactive",
            entrypoint: "claude-desktop",
          });
        }

        throw new Error("unexpected readFile");
      },
      stat: async (target: string) => {
        if (target.endsWith("/project-a")) {
          return createDirectoryStat();
        }

        if (target.endsWith("/not-a-dir")) {
          return createFileStat({
            birthtime: "2026-01-01T00:00:00.000Z",
            mtime: "2026-01-01T00:00:00.000Z",
          });
        }

        if (target.endsWith("/broken-project")) {
          throw new Error("cannot stat project");
        }

        if (target.endsWith("alpha.jsonl")) {
          return createFileStat({
            birthtime: "2026-01-01T00:00:00.000Z",
            mtime: "2026-01-05T00:00:00.000Z",
          });
        }

        if (target.endsWith("beta.jsonl")) {
          return createFileStat({
            birthtime: "2026-01-02T00:00:00.000Z",
            mtime: "2026-01-03T00:00:00.000Z",
          });
        }

        throw new Error(`unexpected stat: ${target}`);
      },
      open: async (target: string) => {
        if (target.endsWith("alpha.jsonl")) {
          return createFileHandle(alphaJsonl);
        }

        if (target.endsWith("beta.jsonl")) {
          return createFileHandle(betaJsonl);
        }

        throw new Error(`unexpected open: ${target}`);
      },
    };

    const sessions = await getSessions({
      claudeDir: "/home/user/.claude",
      fileSystem: fileSystem as any,
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.sessionId)).toEqual(["alpha", "beta"]);
    expect(sessions[0]).toMatchObject({
      sessionId: "alpha",
      project: "D:\\active-project",
      isActive: true,
      lastActivity: "2026-01-05T00:00:00.000Z",
      messageCount: 1,
    });
    expect(sessions[1]).toMatchObject({
      sessionId: "beta",
      project: "C:\\repos\\beta",
      isActive: false,
      lastActivity: "2026-01-04T00:00:00.000Z",
      messageCount: 1,
    });
  });
});
