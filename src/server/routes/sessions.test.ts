import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";

const MOCK_SESSION_FILE = JSON.stringify({
  pid: 1234,
  sessionId: "aaaa-bbbb",
  cwd: "C:\\Users\\mail\\Documents",
  startedAt: 1700000000000,
  kind: "interactive",
  entrypoint: "claude-desktop",
});

const MOCK_JSONL = [
  JSON.stringify({
    type: "queue-operation",
    operation: "enqueue",
    timestamp: "2026-01-01T10:00:00.000Z",
    sessionId: "aaaa-bbbb",
  }),
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "hello world" },
    uuid: "u1",
    timestamp: "2026-01-01T10:00:01.000Z",
    sessionId: "aaaa-bbbb",
  }),
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: "hi there" },
    uuid: "u2",
    timestamp: "2026-01-01T10:05:00.000Z",
    sessionId: "aaaa-bbbb",
  }),
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "follow-up question" },
    uuid: "u3",
    timestamp: "2026-01-01T10:10:00.000Z",
    sessionId: "aaaa-bbbb",
  }),
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: "answer" },
    uuid: "u4",
    timestamp: "2026-01-01T10:15:00.000Z",
    sessionId: "aaaa-bbbb",
  }),
].join("\n");

vi.mock("fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    open: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function setupMocks() {
  const fs = (await import("fs/promises")).default;

  vi.mocked(fs.readdir).mockImplementation(async (p) => {
    const s = String(p);
    if (s.endsWith("projects")) return ["C--Users-mail-Documents"] as any;
    if (s.endsWith("sessions")) return ["1234.json"] as any;
    if (s.endsWith("C--Users-mail-Documents")) return ["aaaa-bbbb.jsonl"] as any;
    return [] as any;
  });

  vi.mocked(fs.stat).mockImplementation(async (p) => {
    const s = String(p);
    if (s.endsWith("C--Users-mail-Documents")) {
      return { isDirectory: () => true } as any;
    }
    return {
      isDirectory: () => false,
      size: Buffer.byteLength(MOCK_JSONL),
      mtime: new Date("2026-01-01T10:05:00.000Z"),
      birthtime: new Date("2026-01-01T10:00:00.000Z"),
    } as any;
  });

  vi.mocked(fs.readFile).mockResolvedValue(MOCK_SESSION_FILE as any);

  // Mock open for readSessionFileInfo (reads head + tail in one open)
  const buf = Buffer.from(MOCK_JSONL);
  vi.mocked(fs.open).mockResolvedValue({
    stat: async () => ({ size: buf.length }),
    read: async (b: Buffer, offset: number, length: number, position: number) => {
      buf.copy(b, offset, position, position + length);
      return { bytesRead: length };
    },
    close: async () => {},
  } as any);
}

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/sessions", () => {
  it("returns session list", async () => {
    await setupMocks();
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);

    const session = res.body.sessions[0];
    expect(session.sessionId).toBe("aaaa-bbbb");
    expect(session.project).toBe("C:\\Users\\mail\\Documents");
    expect(session.firstMessage).toBe("hello world");
    expect(session.lastUserMessage).toBe("follow-up question");
    expect(session.isActive).toBe(true);
    expect(session.active?.pid).toBe(1234);
  });

  it("sorts sessions by lastActivity descending", async () => {
    await setupMocks();
    const fs = (await import("fs/promises")).default;

    // Add a second project with an older session
    vi.mocked(fs.readdir).mockImplementation(async (p) => {
      const s = String(p);
      if (s.endsWith("projects")) return ["C--Users-mail-Documents", "D--Work"] as any;
      if (s.endsWith("sessions")) return ["1234.json"] as any;
      if (s.endsWith("C--Users-mail-Documents")) return ["aaaa-bbbb.jsonl"] as any;
      if (s.endsWith("D--Work")) return ["cccc-dddd.jsonl"] as any;
      return [] as any;
    });

    vi.mocked(fs.stat).mockImplementation(async (p) => {
      const s = String(p);
      if (s.endsWith("C--Users-mail-Documents") || s.endsWith("D--Work")) {
        return { isDirectory: () => true } as any;
      }
      const mtime = s.includes("cccc-dddd")
        ? new Date("2025-06-01T00:00:00.000Z")
        : new Date("2026-01-01T10:05:00.000Z");
      return {
        isDirectory: () => false,
        size: Buffer.byteLength(MOCK_JSONL),
        mtime,
        birthtime: mtime,
      } as any;
    });

    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    const ids = res.body.sessions.map((s: any) => s.sessionId);
    expect(ids[0]).toBe("aaaa-bbbb"); // newer first
  });

  it("skips /exit as lastUserMessage", async () => {
    await setupMocks();
    const fs = (await import("fs/promises")).default;

    const jsonlWithExit = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hello world" },
        uuid: "u1",
        timestamp: "2026-01-01T10:00:01.000Z",
        sessionId: "aaaa-bbbb",
      }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "/exit" },
        uuid: "u2",
        timestamp: "2026-01-01T10:05:00.000Z",
        sessionId: "aaaa-bbbb",
      }),
    ].join("\n");

    const buf = Buffer.from(jsonlWithExit);
    vi.mocked(fs.open).mockResolvedValue({
      stat: async () => ({ size: buf.length }),
      read: async (b: Buffer, offset: number, length: number, position: number) => {
        buf.copy(b, offset, position, position + length);
        return { bytesRead: length };
      },
      close: async () => {},
    } as any);
    vi.mocked(fs.stat).mockImplementation(async (p) => {
      const s = String(p);
      if (s.endsWith("C--Users-mail-Documents")) return { isDirectory: () => true } as any;
      return {
        isDirectory: () => false,
        size: buf.length,
        mtime: new Date("2026-01-01T10:05:00.000Z"),
        birthtime: new Date("2026-01-01T10:00:00.000Z"),
      } as any;
    });

    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    // lastUserMessage should fall back to the non-/exit message
    expect(res.body.sessions[0].lastUserMessage).toBe("hello world");
  });

  it("marks session as inactive when not in sessions dir", async () => {
    await setupMocks();
    const fs = (await import("fs/promises")).default;

    vi.mocked(fs.readFile).mockRejectedValue(new Error("not found"));
    vi.mocked(fs.readdir).mockImplementation(async (p) => {
      const s = String(p);
      if (s.endsWith("projects")) return ["C--Users-mail-Documents"] as any;
      if (s.endsWith("sessions")) return [] as any; // no active sessions
      if (s.endsWith("C--Users-mail-Documents")) return ["aaaa-bbbb.jsonl"] as any;
      return [] as any;
    });

    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body.sessions[0].isActive).toBe(false);
    expect(res.body.sessions[0].active).toBeNull();
  });
});
