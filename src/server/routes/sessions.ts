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

export default router;
