import { Router } from "express";
import { z } from "zod";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { incomeInputSchema, incomeQuerySchema, isoDate, monthKey } from "../../../shared/schemas";
import { monthBounds } from "../../../shared/dates";
import { deleteIncome, getIncome, insertIncome, queryIncome, updateIncome } from "../repositories/income";
import { exportIncomeCsv } from "../services/importExport";
import { notFound } from "../utils/errors";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

const exportQuery = z.object({ month: monthKey.optional(), from: isoDate.optional(), to: isoDate.optional() });

export function incomeRouter(db: DB): Router {
  const r = Router();

  r.get("/", async (req, res) => {
    res.json(await queryIncome(db, userId(req), parseOrThrow(incomeQuerySchema, req.query)));
  });

  r.get("/export.csv", async (req, res) => {
    const q = parseOrThrow(exportQuery, req.query);
    const range = q.month ? monthBounds(q.month) : { start: q.from, end: q.to };
    const name = q.month ? `ledgerly-income-${q.month}.csv` : `ledgerly-income-${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = await exportIncomeCsv(db, userId(req), range);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(csv);
  });

  r.post("/", async (req, res) => {
    res.status(201).json(await insertIncome(db, userId(req), parseOrThrow(incomeInputSchema, req.body)));
  });

  r.put("/:id", async (req, res) => {
    const id = idParam(req);
    if (!(await getIncome(db, userId(req), id))) throw notFound("Entry not found");
    res.json(await updateIncome(db, userId(req), id, parseOrThrow(incomeInputSchema, req.body)));
  });

  r.delete("/:id", async (req, res) => {
    if (!(await deleteIncome(db, userId(req), idParam(req)))) throw notFound("Entry not found");
    res.status(204).end();
  });

  return r;
}
