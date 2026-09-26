import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { isValidMonthKey, monthKeyOf } from "../../../shared/dates";
import { listCategories } from "../repositories/categories";
import { getSettings } from "../repositories/settings";
import { buildMonthAnalytics, buildTrend, listMonths } from "../services/analytics";
import { buildInsights } from "../services/insights";
import { buildMonthSummary } from "../services/summary";
import { badRequest } from "../utils/errors";
import { monthParam, todayParam } from "../utils/http";

export function monthsRouter(db: DB): Router {
  const r = Router();

  r.get("/months", async (req, res) => {
    res.json(await listMonths(db, userId(req)));
  });

  r.get("/months/:month/summary", async (req, res) => {
    res.json(await buildMonthSummary(db, userId(req), monthParam(req), todayParam(req)));
  });

  r.get("/months/:month/analytics", async (req, res) => {
    res.json(await buildMonthAnalytics(db, userId(req), monthParam(req), todayParam(req)));
  });

  r.get("/months/:month/insights", async (req, res) => {
    const month = monthParam(req);
    const today = todayParam(req);
    const uid = userId(req);
    const [summary, analytics, categories, settings] = await Promise.all([
      buildMonthSummary(db, uid, month, today),
      buildMonthAnalytics(db, uid, month, today),
      listCategories(db, uid),
      getSettings(db, uid),
    ]);
    res.json(buildInsights(summary, analytics, categories, settings.currency));
  });

  r.get("/analytics/trend", async (req, res) => {
    const end = typeof req.query.end === "string" ? req.query.end : monthKeyOf(todayParam(req));
    if (!isValidMonthKey(end)) throw badRequest("end must look like YYYY-MM");
    const count = Number(req.query.months ?? 6);
    if (!Number.isInteger(count) || count < 2 || count > 24) throw badRequest("months must be between 2 and 24");
    res.json(await buildTrend(db, userId(req), end, count));
  });

  return r;
}
