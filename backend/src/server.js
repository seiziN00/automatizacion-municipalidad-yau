const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const config = require("./config");
const notifier = require("./services/notifier");

const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120 }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/tramites", require("./routes/tramites"));
app.use("/api", require("./routes/misc"));

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Error interno" });
});

const server = http.createServer(app);
notifier.init(new Server(server, { cors: { origin: config.corsOrigin } }));

if (require.main === module) {
  server.listen(config.port, () => console.log(`Backend escuchando en http://localhost:${config.port}`));
}

module.exports = { app, server };
