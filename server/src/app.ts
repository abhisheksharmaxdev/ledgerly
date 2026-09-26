import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import type { AppConfig } from "./config";
import type { DB } from "./db/connection";
import crypto from "node:crypto";
import { loadSessionUser, requireAdmin, requireUser } from "./auth/session";
import { getOrCreateSecret } from "./repositories/users";
import { createMailer, type Mailer } from "./services/mailer";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { dataRouter } from "./routes/data";
import { expensesRouter } from "./routes/expenses";
import { monthsRouter } from "./routes/months";
import { plansRouter } from "./routes/plans";
import { settingsRouter } from "./routes/settings";
import { errorHandler, requireSafeMutation } from "./utils/http";

export interface AppDeps {
  db: DB;
  config: AppConfig;
  logger?: Pick<Console, "error" | "info" | "warn">;
  serveClient?: boolean;
  /** Defaults to SMTP, or to logging when SMTP isn't configured. */
  mailer?: Mailer;
}

export function createApp({ db, config, logger = console, serveClient = false, mailer }: AppDeps) {
  const mail = mailer ?? createMailer(config, logger);
  // SESSION_SECRET if configured, otherwise a random secret generated once and stored in the DB.
  const sessionSecret = config.sessionSecret || getOrCreateSecret(db, "session_secret", () => crypto.randomBytes(48).toString("base64url"));

  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) {
    const n = Number(config.trustProxy);
    app.set("trust proxy", Number.isNaN(n) ? config.trustProxy : n);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:"],
          "worker-src": ["'self'", "blob:"],
          "connect-src": ["'self'"],
          // Only force HTTPS sub-resources when the app is actually served over HTTPS.
          "upgrade-insecure-requests": config.cookieSecure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  const api = express.Router();
  api.use(express.json({ limit: "10mb" }));
  api.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false }));
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  api.get("/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });

  api.use(requireSafeMutation);
  api.use(loadSessionUser(db, sessionSecret));
  api.use("/auth", authRouter({ db, config, secret: sessionSecret, mailer: mail, logger }));
  api.use("/admin", requireAdmin, adminRouter(db, mail));
  // Everything below requires a signed-in, approved account and only ever sees that account's data.
  api.use(requireUser);
  api.use("/expenses", expensesRouter(db));
  api.use("/plans", plansRouter(db));
  api.use("/categories", categoriesRouter(db));
  api.use("/settings", settingsRouter(db));
  api.use("/data", dataRouter(db));
  api.use("/", monthsRouter(db));
  api.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Unknown API endpoint" } });
  });

  app.use("/api", api);

  if (serveClient) {
    const indexHtml = path.join(config.clientDist, "index.html");
    if (fs.existsSync(indexHtml)) {
      app.use(
        "/assets",
        express.static(path.join(config.clientDist, "assets"), { immutable: true, maxAge: "1y", index: false }),
      );
      app.use(express.static(config.clientDist, { index: false, maxAge: "1h" }));
      // SPA fallback: any other GET renders the app shell.
      app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(indexHtml);
      });
    } else {
      logger.warn(`[web] ${indexHtml} not found. Run "npm run build" to serve the frontend from this server.`);
    }
  }

  app.use(errorHandler(logger));
  return app;
}
