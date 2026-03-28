import app from "./app.js";

const PORT = process.env.PORT ?? 6815;

app.listen(Number(PORT), "127.0.0.1", () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
