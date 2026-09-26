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

  r.get("/", (req, res) => {
    const query = parseOrThrow(expenseQuerySchema, req.query, "Invalid filters");
    res.json(queryExpenses(db, userId(req), query));
  });

  r.get("/:id", (req, res) => {
    const expense = getExpense(db, userId(req), idParam(req));
    if (!expense) throw notFound("Expense not found");
    res.json(expense);
  });

  r.post("/", (req, res) => {
    const input = parseOrThrow(expenseInputSchema, req.body);
    const category = getCategory(db, userId(req), input.categoryId);
    if (!category) throw badRequest("Choose a valid category", { categoryId: "Category not found" });
    if (category.archived) throw badRequest("This category is archived", { categoryId: "This category is archived" });
    res.status(201).json(insertExpense(db, userId(req), input));
  });

  r.put("/:id", (req, res) => {
    const id = idParam(req);
    const existing = getExpense(db, userId(req), id);
    if (!existing) throw notFound("Expense not found");
    const input = parseOrThrow(expenseInputSchema, req.body);
    const category = getCategory(db, userId(req), input.categoryId);
    if (!category) throw badRequest("Choose a valid category", { categoryId: "Category not found" });
    // Archived categories stay valid for expenses that already use them.
    if (category.archived && category.id !== existing.categoryId) {
      throw badRequest("This category is archived", { categoryId: "This category is archived" });
    }
    res.json(updateExpense(db, userId(req), id, input));
  });

  r.delete("/:id", (req, res) => {
    if (!deleteExpense(db, userId(req), idParam(req))) throw notFound("Expense not found");
    res.status(204).end();
  });

  return r;
}
