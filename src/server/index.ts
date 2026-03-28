import app from "./app.js";

const PORT = process.env.PORT ?? 6815;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
