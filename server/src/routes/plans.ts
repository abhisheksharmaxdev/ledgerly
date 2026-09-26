import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import type { PlanResponse } from "../../../shared/types";
import { planInputSchema } from "../../../shared/schemas";
import { monthBounds, shiftMonth } from "../../../shared/dates";
import { deletePlan, getPlan, latestPlanBefore, upsertPlan } from "../repositories/plans";
import { totalsByCategory } from "../repositories/expenses";
import { notFound } from "../utils/errors";
import { monthParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

export function plansRouter(db: DB): Router {
  const r = Router();

  r.get("/:month", async (req, res) => {
    const month = monthParam(req);
    const uid = userId(req);
    const prev = monthBounds(shiftMonth(month, -1));
    const [plan, previousSpend] = await Promise.all([getPlan(db, uid, month), totalsByCategory(db, uid, prev.start, prev.end)]);
    const body: PlanResponse = {
      month,
      plan,
      suggestion: plan ? null : await latestPlanBefore(db, uid, month),
      previousMonthSpend: previousSpend.map((t) => ({ categoryId: t.categoryId, amountMinor: t.totalMinor })),
    };
    res.json(body);
  });

  r.put("/:month", async (req, res) => {
    const month = monthParam(req);
    const input = parseOrThrow(planInputSchema, req.body);
    res.json(await upsertPlan(db, userId(req), month, input));
  });

  r.delete("/:month", async (req, res) => {
    if (!(await deletePlan(db, userId(req), monthParam(req)))) throw notFound("No plan exists for this month");
    res.status(204).end();
  });

  return r;
}
