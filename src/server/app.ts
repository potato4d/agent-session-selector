import express from "express";
import sessionsRouter from "./routes/sessions.js";

const app = express();

app.use(express.json());
app.use("/api/sessions", sessionsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
