/**
 * Unified Polymarket Dashboard Server
 * 
 * Single Express process hosting:
 * - BTC 5-min trader (routes + trading engine)
 * - Weather bot (routes + tick loop)
 * - React dashboard (static build in production)
 */
import 'dotenv/config';
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

// ── Health check (combined) ────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  const engine = globalThis.__tradingEngine;
  const uptime = process.uptime();
  const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: Math.round(uptime),
    memoryMb: memMb,
    services: {
      btc: {
        tradingEnabled: engine?.tradingEnabled ?? false,
        lastTick: globalThis.__uiStatus?.lastUpdate ?? null,
      },
      weather: {
        initialized: true,
      },
    },
  });
});

// ── Boot sequence ──────────────────────────────────────────────────────

async function boot() {
  console.log("=== Polymarket Dashboard ===");
  console.log(`Starting on port ${port}...`);

  // 1. Mount BTC routes + initialize trading engine
  try {
    const btc = await import("./btc/boot.js");
    btc.mountRoutes(app);
    await btc.initialize();
    console.log("[Boot] BTC trader initialized");
  } catch (err) {
    console.error("[Boot] BTC trader failed to initialize:", err.message);
    console.error(err.stack);
  }

  // 2. Mount Weather routes + initialize tick loop
  try {
    const weather = await import("./weather/boot.js");
    weather.mountRoutes(app);
    await weather.initialize();
    console.log("[Boot] Weather bot initialized");
  } catch (err) {
    console.error("[Boot] Weather bot failed to initialize:", err.message);
    console.error(err.stack);
  }

  // 3. Serve React build in production
  const clientDistPath = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  // 4. Start listening
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`\n=== Dashboard running on http://localhost:${port} ===\n`);
  });

  // 5. Graceful shutdown
  async function handleShutdown(signal) {
    console.log(`\n[${signal}] Shutting down...`);
    try {
      const btc = await import("./btc/boot.js");
      btc.shutdown?.();
    } catch {}
    try {
      const weather = await import("./weather/boot.js");
      weather.shutdown?.();
    } catch {}
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

boot().catch((err) => {
  console.error("Fatal boot error:", err);
  process.exit(1);
});
