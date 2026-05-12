import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createPoller } from "./poller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const clientDistDir = path.join(projectRoot, "dist", "client");

const config = loadConfig();
const database = createDatabase(config.databasePath);
const poller = createPoller(config, database);
const app = express();

app.use(express.json());

app.get("/api/current", (_request, response) => {
  response.json({
    reading: database.getLatestReading()
  });
});

app.get("/api/history", (request, response) => {
  const rawHours = Number(request.query.hours ?? 24);
  const hours = Number.isFinite(rawHours)
    ? Math.min(Math.max(Math.floor(rawHours), 1), 24 * 30)
    : 24;

  response.json({
    hours,
    readings: database.getHistory(hours)
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    poller: poller.status,
    latestReading: database.getLatestReading()
  });
});

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDistDir, "index.html"));
  });
} else {
  app.get("/", (_request, response) => {
    response
      .type("text/plain")
      .send("Frontend build not found. Run `pnpm build` before starting the production server.");
  });
}

const server = app.listen(config.port, config.host, async () => {
  console.log(`Listening on http://${config.host}:${config.port}`);
  await poller.start();
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  poller.stop();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
