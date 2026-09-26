import { Router } from "express";
import { userId } from "../auth/session";
import { z } from "zod";
import type { DB } from "../db/connection";
import type { DataStatus } from "../../../shared/types";
import { isoDate, monthKey } from "../../../shared/schemas";
import { monthBounds } from "../../../shared/dates";
import { demoCounts, loadDemoData, removeDemoData } from "../services/demo";
import { exportBackup, exportCsv, importCsv, restoreBackup } from "../services/importExport";
import { badRequest, conflict } from "../utils/errors";
import { todayParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

const exportQuery = z.object({ month: monthKey.optional(), from: isoDate.optional(), to: isoDate.optional() });
const importBody = z.object({
  csv: z.string().min(1, "The file is empty").max(8_000_000, "File is too large"),
  dryRun: z.boolean().default(true),
  skipDuplicates: z.boolean().default(true),
});

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dataRouter(db: DB): Router {
  const r = Router();

  r.get("/status", (req, res) => {
    const counts = db
      .prepare("SELECT (SELECT COUNT(*) FROM expenses WHERE user_id = ?) AS e, (SELECT COUNT(*) FROM monthly_plans WHERE user_id = ?) AS p")
      .get(userId(req), userId(req)) as { e: number; p: number };
    const demo = demoCounts(db, userId(req));
    const body: DataStatus = {
      expenseCount: counts.e,
      planCount: counts.p,
      demoExpenseCount: demo.expenses,
      demoPlanCount: demo.plans,
    };
    res.json(body);
  });

  r.get("/export.csv", (req, res) => {
    const q = parseOrThrow(exportQuery, req.query);
    const range = q.month ? monthBounds(q.month) : { start: q.from, end: q.to };
    const name = q.month ? `ledgerly-expenses-${q.month}.csv` : `ledgerly-expenses-${stamp()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(exportCsv(db, userId(req), range));
  });

  r.get("/export.json", (req, res) => {
    res.setHeader("Content-Disposition", `attachment; filename="ledgerly-backup-${stamp()}.json"`);
    res.json(exportBackup(db, userId(req)));
  });

  r.post("/import/csv", (req, res) => {
    const body = parseOrThrow(importBody, req.body);
    const result = importCsv(db, userId(req), body.csv, { dryRun: body.dryRun, skipDuplicates: body.skipDuplicates });
    res.status(result.valid ? 200 : 422).json(result);
  });

  r.post("/restore", (req, res) => {
    const body = parseOrThrow(z.object({ confirm: z.literal("REPLACE"), backup: z.unknown() }), req.body, "Confirmation required");
    res.json(restoreBackup(db, userId(req), body.backup));
  });

  r.post("/demo", (req, res) => {
    const existing = demoCounts(db, userId(req));
    if (existing.expenses + existing.plans > 0) throw conflict("Demo data is already loaded. Remove it first to reload.");
    res.status(201).json(loadDemoData(db, userId(req), todayParam(req)));
  });

  r.delete("/demo", (req, res) => {
    res.json(removeDemoData(db, userId(req)));
  });

  r.post("/clear", (req, res) => {
    const body = req.body as { confirm?: string } | undefined;
    if (body?.confirm !== "DELETE") throw badRequest('Type "DELETE" to confirm');
    const result = db.transaction(() => ({
      expenses: db.prepare("DELETE FROM expenses WHERE user_id = ?").run(userId(req)).changes,
      plans: db.prepare("DELETE FROM monthly_plans WHERE user_id = ?").run(userId(req)).changes,
    }))();
    res.json(result);
  });

  return r;
}
