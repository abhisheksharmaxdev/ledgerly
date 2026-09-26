import fs from "node:fs";
import path from "node:path";

// Load .env from the project root when present (Node >= 20.12 built-in, no dotenv dependency).
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

export const config = {
  nodeEnv,
  isProd,
  // Production: PORT (set by hosting platforms). Development: API_PORT, so a PORT meant for
  // the Vite dev server can't collide with the API.
  port: Number((isProd ? process.env.PORT : process.env.API_PORT) ?? 4000),
  host: process.env.HOST ?? (isProd ? "0.0.0.0" : "127.0.0.1"),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "data/ledgerly.db"),
  /** The single administrator (optional here; `npm run create-admin` works too). */
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  /** scrypt hash produced by `npm run hash-password`, never the plain password. */
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH?.trim() ?? "",
  /** Signs session cookies. If unset, a random secret is generated once and kept in the database. */
  sessionSecret: process.env.SESSION_SECRET ?? "",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  /** Where signup notifications go (defaults to the admin's email). */
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL?.trim() ?? "",
  /** Public URL of the app, used for links in notification emails. */
  appUrl: (process.env.APP_URL ?? "").replace(/\/+$/, ""),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "",
  },
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
  trustProxy: process.env.TRUST_PROXY ?? (isProd ? "1" : ""),
  clientDist: path.resolve(process.cwd(), process.env.CLIENT_DIST ?? "dist/client"),
};

export type AppConfig = typeof config;

export function validateConfig(cfg: AppConfig): string[] {
  const problems: string[] = [];
  if (!!cfg.adminEmail !== !!cfg.adminPasswordHash) {
    problems.push("Set both ADMIN_EMAIL and ADMIN_PASSWORD_HASH, or neither (then use `npm run create-admin`).");
  }
  if (cfg.adminPasswordHash && !cfg.adminPasswordHash.startsWith("scrypt:")) {
    problems.push("ADMIN_PASSWORD_HASH must be generated with `npm run hash-password` (never put the plain password here).");
  }
  if (cfg.sessionSecret && cfg.sessionSecret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters (or leave it empty to auto-generate one).");
  }
  if (cfg.smtp.host && !cfg.smtp.from) {
    problems.push("MAIL_FROM is required when SMTP_HOST is set.");
  }
  return problems;
}
