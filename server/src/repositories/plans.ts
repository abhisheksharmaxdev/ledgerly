import type { DB } from "../db/connection";
import type { MonthlyPlan } from "../../../shared/types";
import { parseMonthKey, toMonthKey } from "../../../shared/dates";
import { badRequest } from "../utils/errors";

interface PlanRow {
  id: number;
  year: number;
  month: number;
  income_minor: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

function hydrate(db: DB, row: PlanRow): MonthlyPlan {
  const budgets = db
    .prepare(
      `SELECT b.category_id AS categoryId, b.amount_minor AS amountMinor
       FROM plan_budgets b JOIN categories c ON c.id = b.category_id
       WHERE b.plan_id = ? ORDER BY c.sort_order, c.id`,
    )
    .all(row.id) as { categoryId: number; amountMinor: number }[];
  return {
    month: toMonthKey(row.year, row.month),
    incomeMinor: row.income_minor,
    budgets,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Every function is scoped to one owner (userId); other users' plans are never visible.

export function getPlan(db: DB, userId: number, monthKey: string): MonthlyPlan | null {
  const { year, month } = parseMonthKey(monthKey);
  const row = db
    .prepare("SELECT * FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?")
    .get(userId, year, month) as PlanRow | undefined;
  return row ? hydrate(db, row) : null;
}

/** The most recent plan strictly before the given month. */
export function latestPlanBefore(db: DB, userId: number, monthKey: string): MonthlyPlan | null {
  const { year, month } = parseMonthKey(monthKey);
  const row = db
    .prepare("SELECT * FROM monthly_plans WHERE user_id = ? AND (year * 12 + month) < ? ORDER BY year DESC, month DESC LIMIT 1")
    .get(userId, year * 12 + month) as PlanRow | undefined;
  return row ? hydrate(db, row) : null;
}

/**
 * Creates or replaces the plan for exactly one month. Other months are never touched,
 * so editing this month's budget can't rewrite history.
 */
export function upsertPlan(
  db: DB,
  userId: number,
  monthKey: string,
  input: { incomeMinor: number; budgets: { categoryId: number; amountMinor: number }[] },
  opts: { isDemo?: boolean } = {},
): MonthlyPlan {
  const { year, month } = parseMonthKey(monthKey);
  // Budgets may only reference the user's own categories.
  const known = new Set((db.prepare("SELECT id FROM categories WHERE user_id = ?").all(userId) as { id: number }[]).map((r) => r.id));
  const unknown = input.budgets.find((b) => !known.has(b.categoryId));
  if (unknown) throw badRequest(`Unknown category id ${unknown.categoryId}`);

  return db.transaction(() => {
    const { id } = db
      .prepare(
        `INSERT INTO monthly_plans (user_id, year, month, income_minor, is_demo) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, year, month) DO UPDATE SET
           income_minor = excluded.income_minor,
           is_demo = excluded.is_demo,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         RETURNING id`,
      )
      .get(userId, year, month, input.incomeMinor, opts.isDemo ? 1 : 0) as { id: number };
    db.prepare("DELETE FROM plan_budgets WHERE plan_id = ?").run(id);
    const insert = db.prepare("INSERT INTO plan_budgets (plan_id, category_id, amount_minor) VALUES (?, ?, ?)");
    for (const b of input.budgets) insert.run(id, b.categoryId, b.amountMinor);
    return getPlan(db, userId, monthKey)!;
  })();
}

export function deletePlan(db: DB, userId: number, monthKey: string): boolean {
  const { year, month } = parseMonthKey(monthKey);
  return db.prepare("DELETE FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?").run(userId, year, month).changes > 0;
}

/** Plan totals per month (income, planned consumption, savings target) for trend/history views. */
export function planTotals(db: DB, userId: number): { month: string; incomeMinor: number; plannedSpendMinor: number; savingsTargetMinor: number }[] {
  const rows = db
    .prepare(
      `SELECT p.year, p.month, p.income_minor AS incomeMinor,
              COALESCE(SUM(CASE WHEN c.kind = 'expense' THEN b.amount_minor END), 0) AS plannedSpendMinor,
              COALESCE(SUM(CASE WHEN c.kind = 'savings' THEN b.amount_minor END), 0) AS savingsTargetMinor
       FROM monthly_plans p
       LEFT JOIN plan_budgets b ON b.plan_id = p.id
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE p.user_id = ?
       GROUP BY p.id ORDER BY p.year, p.month`,
    )
    .all(userId) as { year: number; month: number; incomeMinor: number; plannedSpendMinor: number; savingsTargetMinor: number }[];
  return rows.map((r) => ({
    month: toMonthKey(r.year, r.month),
    incomeMinor: r.incomeMinor,
    plannedSpendMinor: r.plannedSpendMinor,
    savingsTargetMinor: r.savingsTargetMinor,
  }));
}

export function listPlans(db: DB, userId: number): MonthlyPlan[] {
  const rows = db.prepare("SELECT * FROM monthly_plans WHERE user_id = ? ORDER BY year, month").all(userId) as PlanRow[];
  return rows.map((r) => hydrate(db, r));
}
