import { config, validateConfig } from "./config";
import { openDatabase } from "./db/connection";
import { createApp } from "./app";
import { ensureAdmin, getAdmin } from "./repositories/users";

const problems = validateConfig(config);
if (problems.length) {
  for (const p of problems) console.error(`[config] ${p}`);
  process.exit(1);
}

const db = openDatabase(config.databasePath);

// The admin account is never created through public signup: it comes from env or `npm run create-admin`.
if (config.adminEmail && config.adminPasswordHash) {
  const r = ensureAdmin(db, config.adminEmail, config.adminPasswordHash);
  console.info(`[auth] Admin account ${r.action}: ${config.adminEmail}${r.claimed ? ` (${r.claimed} existing records assigned to it)` : ""}`);
}

const app = createApp({ db, config, serveClient: config.isProd });

const server = app.listen(config.port, config.host, () => {
  console.info(`[api] Ledgerly API listening on http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  console.info(`[db]  SQLite database at ${config.databasePath}`);
  if (!getAdmin(db)) {
    console.warn('[auth] No admin account yet. Create one with:  npm run create-admin -- you@example.com');
  }
  if (!config.smtp.host) {
    console.info("[mail] SMTP not configured: signup notifications will be printed here instead of emailed.");
  }
  if (config.isProd && !config.sessionSecret) {
    console.warn("[auth] SESSION_SECRET not set; using a generated secret stored in the database.");
  }
});

function shutdown(signal: string) {
  console.info(`[api] ${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
