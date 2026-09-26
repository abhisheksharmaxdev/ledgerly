import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isValidIsoDate, isValidMonthKey, localToday } from "../../../shared/dates";
import { badRequest, HttpError } from "./errors";

export function monthParam(req: Request): string {
  const month = String(req.params.month ?? "");
  if (!isValidMonthKey(month)) throw badRequest("Month must look like YYYY-MM");
  return month;
}

export function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Invalid id");
  return id;
}

/** The client's local "today" (?today=YYYY-MM-DD); falls back to the server's date. */
export function todayParam(req: Request): string {
  const t = typeof req.query.today === "string" ? req.query.today : "";
  return isValidIsoDate(t) ? t : localToday();
}

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "ledgerly";

/**
 * CSRF defence: mutating requests must carry a custom header (which a cross-site form can't set
 * without a CORS preflight we never approve) and, when they have a body, it must be JSON.
 */
export function requireSafeMutation(req: Request, _res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
    return next(new HttpError(403, "forbidden", "Missing request header"));
  }
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
  if (hasBody && !req.is("application/json")) {
    return next(new HttpError(415, "unsupported_media_type", "Requests must be JSON"));
  }
  next();
}

export function errorHandler(logger: Pick<Console, "error">) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "validation_error", message: "Invalid request" } });
    }
    const e = err as { type?: string; status?: number };
    if (e?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "bad_json", message: "The request body is not valid JSON" } });
    }
    if (e?.type === "entity.too.large") {
      return res.status(413).json({ error: { code: "too_large", message: "The upload is too large (max 10 MB)" } });
    }
    // Never leak internals (SQL, stack traces) to the client.
    logger.error("[api] unhandled error:", err);
    res.status(500).json({ error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } });
  };
}
