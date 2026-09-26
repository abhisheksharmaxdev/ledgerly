import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { AppConfig } from "../config";
import type { DB } from "../db/connection";
import type { SessionInfo } from "../../../shared/types";
import { loginSchema, signupSchema } from "../../../shared/schemas";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSessionToken, SESSION_COOKIE } from "../auth/session";
import { createPendingUser, getAdmin, getUserByEmail, touchLogin } from "../repositories/users";
import { signupNotification, type Mailer } from "../services/mailer";
import { HttpError } from "../utils/errors";
import { parseOrThrow } from "../utils/validate";

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = hashPassword("ledgerly-timing-equaliser");

type Logger = Pick<Console, "info" | "warn" | "error">;

export function authRouter(deps: { db: DB; config: AppConfig; secret: string; mailer: Mailer; logger: Logger }): Router {
  const { db, config: cfg, secret, mailer, logger } = deps;
  const r = Router();
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: cfg.cookieSecure, path: "/" };

  r.get("/session", (req, res) => {
    const body: SessionInfo = { authenticated: !!req.user, user: req.user ?? null };
    res.json(body);
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many sign-in attempts. Please wait 15 minutes and try again.")),
  });

  r.post("/login", loginLimiter, (req, res) => {
    const { email, password } = parseOrThrow(loginSchema, req.body);
    const user = getUserByEmail(db, email);
    const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "invalid_credentials", "Incorrect email or password.");
    // Approval status is only revealed to someone who already knows the password.
    if (user.status === "pending") {
      throw new HttpError(403, "pending_approval", "Your account is waiting for administrator approval. You'll be able to sign in once it's approved.");
    }
    if (user.status === "rejected") {
      throw new HttpError(403, "account_rejected", "This registration was not approved. Please contact the administrator.");
    }
    touchLogin(db, user.id);
    res.cookie(SESSION_COOKIE, createSessionToken(secret, user.id, user.session_version, cfg.sessionTtlDays), {
      ...cookieOpts,
      maxAge: cfg.sessionTtlDays * 86_400_000,
    });
    const body: SessionInfo = { authenticated: true, user: { id: user.id, email: user.email, role: user.role } };
    res.json(body);
  });

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many signup attempts. Please try again later.")),
  });

  r.post("/signup", signupLimiter, (req, res) => {
    const { email, password } = parseOrThrow(signupSchema, req.body);
    // Hash before looking the email up so both paths take the same time.
    const hash = hashPassword(password);
    const existing = getUserByEmail(db, email);
    if (!existing) {
      const user = createPendingUser(db, email, hash);
      const to = cfg.adminNotifyEmail || getAdmin(db)?.email;
      if (to) {
        mailer
          .send(signupNotification({ to, email: user.email, createdAt: user.created_at, appUrl: cfg.appUrl }))
          .catch((err) => logger.error("[mail] could not send signup notification:", err instanceof Error ? err.message : err));
      } else {
        logger.warn(`[auth] New signup from ${user.email}, but no admin account exists yet to notify.`);
      }
    }
    // Same response whether or not the email was already registered (no account enumeration).
    res.status(202).json({
      status: "pending",
      message: "Thanks! Your request has been sent to the administrator. You can sign in once it's approved.",
    });
  });

  r.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOpts);
    const body: SessionInfo = { authenticated: false, user: null };
    res.json(body);
  });

  return r;
}
