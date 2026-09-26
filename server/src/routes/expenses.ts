import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { expenseInputSchema, expenseQuerySchema } from "../../../shared/schemas";
import { getCategory } from "../repositories/categories";
import { deleteExpense, getExpense, insertExpense, queryExpenses, updateExpense } from "../repositories/expenses";
import { badRequest, notFound } from "../utils/errors";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

export function expensesRouter(db: DB): Router {
  const r = Router();

  r.get("/", async (req, res) => {
    const query = parseOrThrow(expenseQuerySchema, req.query, "Invalid filters");
    res.json(await queryExpenses(db, userId(req), query));
  });

  r.get("/:id", async (req, res) => {
    const expense = await getExpense(db, userId(req), idParam(req));
    if (!expense) throw notFound("Expense not found");
    res.json(expense);
  });

  r.post("/", async (req, res) => {
    const input = parseOrThrow(expenseInputSchema, req.body);
    const category = await getCategory(db, userId(req), input.categoryId);
    if (!category) throw badRequest("Choose a valid category", { categoryId: "Category not found" });
    if (category.archived) throw badRequest("This category is archived", { categoryId: "This category is archived" });
    res.status(201).json(await insertExpense(db, userId(req), input));
  });

  r.put("/:id", async (req, res) => {
    const id = idParam(req);
    const existing = await getExpense(db, userId(req), id);
    if (!existing) throw notFound("Expense not found");
    const input = parseOrThrow(expenseInputSchema, req.body);
    const category = await getCategory(db, userId(req), input.categoryId);
    if (!category) throw badRequest("Choose a valid category", { categoryId: "Category not found" });
    // Archived categories stay valid for expenses that already use them.
    if (category.archived && category.id !== existing.categoryId) {
      throw badRequest("This category is archived", { categoryId: "This category is archived" });
    }
    res.json(await updateExpense(db, userId(req), id, input));
  });

  r.delete("/:id", async (req, res) => {
    if (!(await deleteExpense(db, userId(req), idParam(req)))) throw notFound("Expense not found");
    res.status(204).end();
  });

  return r;
}
