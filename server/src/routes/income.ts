import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import type { IncomeList } from "../../../shared/types";
import { incomeInputSchema, monthKey } from "../../../shared/schemas";
import { deleteIncome, getIncome, insertIncome, listIncome, updateIncome } from "../repositories/income";
import { notFound } from "../utils/errors";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

export function incomeRouter(db: DB): Router {
  const r = Router();

  r.get("/", async (req, res) => {
    const month = parseOrThrow(monthKey, req.query.month, "Month must look like YYYY-MM");
    const items = await listIncome(db, userId(req), month);
    const body: IncomeList = { month, items, totalMinor: items.reduce((s, i) => s + i.amountMinor, 0) };
    res.json(body);
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
