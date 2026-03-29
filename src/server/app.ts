import express from "express";
import sessionsRouter from "./routes/sessions.js";

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use("/api/sessions", sessionsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
