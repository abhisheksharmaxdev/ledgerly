import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { DB } from "../db/connection";
import { getUserById } from "../repositories/users";
import { HttpError, unauthorized } from "../utils/errors";

export const SESSION_COOKIE = "ledgerly_session";

interface SessionPayload {
  uid: number;
  /** users.session_version at login; bumping it revokes every existing session */
  sv: number;
  /** expiry, ms since epoch */
  exp: number;
}

/** Stateless signed session token: base64url(payload).base64url(HMAC-SHA256). */
export function createSessionToken(secret: string, uid: number, sv: number, ttlDays: number): string {
  const payload: SessionPayload & { n: string } = { uid, sv, exp: Date.now() + ttlDays * 86_400_000, n: crypto.randomUUID() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<SessionPayload>;
    if (typeof p.uid !== "number" || typeof p.sv !== "number" || typeof p.exp !== "number") return null;
    return p.exp > Date.now() ? (p as SessionPayload) : null;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/**
 * Resolves the session cookie to an account on every request. Only ACTIVE accounts whose
 * session_version still matches are accepted, so rejection/deletion takes effect immediately.
 */
export function loadSessionUser(db: DB, secret: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const payload = verifySessionToken(readCookie(req, SESSION_COOKIE), secret);
      if (payload) {
        const user = await getUserById(db, payload.uid);
        if (user && user.status === "active" && user.session_version === payload.sv) {
          req.user = { id: user.id, email: user.email, role: user.role };
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (req.user) return next();
  next(unauthorized());
}

/** Server-side admin guard. The UI hides admin pages too, but this is the real protection. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(new HttpError(403, "forbidden", "You don't have access to this area."));
  next();
}

/** The authenticated user's id; every data query is scoped by it. */
export function userId(req: Request): number {
  if (!req.user) throw unauthorized();
  return req.user.id;
}
