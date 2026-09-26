import { Router } from "express";
import { z } from "zod";
import { userId } from "../auth/session";
import { batch, get, type DB } from "../db/connection";
import type { DataStatus } from "../../../shared/types";
import { isoDate, monthKey } from "../../../shared/schemas";
import { monthBounds } from "../../../shared/dates";
import { deletePlansStatements } from "../repositories/plans";
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

function countOwnData(db: DB, uid: number) {
  return get<{ e: number; p: number }>(
    db,
    "SELECT (SELECT COUNT(*) FROM expenses WHERE user_id = ?) AS e, (SELECT COUNT(*) FROM monthly_plans WHERE user_id = ?) AS p",
    [uid, uid],
  );
}

export function dataRouter(db: DB): Router {
  const r = Router();

  r.get("/status", async (req, res) => {
    const uid = userId(req);
    const [counts, demo] = await Promise.all([countOwnData(db, uid), demoCounts(db, uid)]);
    const body: DataStatus = {
      expenseCount: counts!.e,
      planCount: counts!.p,
      demoExpenseCount: demo.expenses,
      demoPlanCount: demo.plans,
    };
    res.json(body);
  });

  r.get("/export.csv", async (req, res) => {
    const q = parseOrThrow(exportQuery, req.query);
    const range = q.month ? monthBounds(q.month) : { start: q.from, end: q.to };
    const name = q.month ? `ledgerly-expenses-${q.month}.csv` : `ledgerly-expenses-${stamp()}.csv`;
    const csv = await exportCsv(db, userId(req), range);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(csv);
  });

  r.get("/export.json", async (req, res) => {
    const backup = await exportBackup(db, userId(req));
    res.setHeader("Content-Disposition", `attachment; filename="ledgerly-backup-${stamp()}.json"`);
    res.json(backup);
  });

  r.post("/import/csv", async (req, res) => {
    const body = parseOrThrow(importBody, req.body);
    const result = await importCsv(db, userId(req), body.csv, { dryRun: body.dryRun, skipDuplicates: body.skipDuplicates });
    res.status(result.valid ? 200 : 422).json(result);
  });

  r.post("/restore", async (req, res) => {
    const body = parseOrThrow(z.object({ confirm: z.literal("REPLACE"), backup: z.unknown() }), req.body, "Confirmation required");
    res.json(await restoreBackup(db, userId(req), body.backup));
  });

  r.post("/demo", async (req, res) => {
    const existing = await demoCounts(db, userId(req));
    if (existing.expenses + existing.plans > 0) throw conflict("Demo data is already loaded. Remove it first to reload.");
    res.status(201).json(await loadDemoData(db, userId(req), todayParam(req)));
  });

  r.delete("/demo", async (req, res) => {
    res.json(await removeDemoData(db, userId(req)));
  });

  r.post("/clear", async (req, res) => {
    const body = req.body as { confirm?: string } | undefined;
    if (body?.confirm !== "DELETE") throw badRequest('Type "DELETE" to confirm');
    const uid = userId(req);
    const counts = await countOwnData(db, uid);
    await batch(db, [{ sql: "DELETE FROM expenses WHERE user_id = ?", args: [uid] }, ...deletePlansStatements(uid)]);
    res.json({ expenses: counts!.e, plans: counts!.p });
  });

  return r;
}
