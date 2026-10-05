import { all, batch, get, type DB, type InStatement } from "../db/connection";
import type { BudgetLine, MonthlyPlan } from "../../../shared/types";
import { parseMonthKey, toMonthKey } from "../../../shared/dates";
import { badRequest } from "../utils/errors";

interface PlanRow {
  id: number;
  year: number;
  month: number;
  income_minor: number;
  credit_limit_minor: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

const toPlan = (row: PlanRow, budgets: BudgetLine[]): MonthlyPlan => ({
  month: toMonthKey(row.year, row.month),
  incomeMinor: row.income_minor,
  creditMinor: row.credit_limit_minor ?? 0,
  budgets,
  isDemo: row.is_demo === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const BUDGETS_SQL = `
  SELECT b.plan_id AS planId, b.category_id AS categoryId, b.amount_minor AS amountMinor
  FROM plan_budgets b JOIN categories c ON c.id = b.category_id`;

async function hydrate(db: DB, row: PlanRow): Promise<MonthlyPlan> {
  const budgets = await all<BudgetLine>(
    db,
    `SELECT b.category_id AS categoryId, b.amount_minor AS amountMinor
     FROM plan_budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.plan_id = ? ORDER BY c.sort_order, c.id`,
    [row.id],
  );
  return toPlan(row, budgets);
}

// Every function is scoped to one owner (userId); other users' plans are never visible.

export async function getPlan(db: DB, userId: number, monthKey: string): Promise<MonthlyPlan | null> {
  const { year, month } = parseMonthKey(monthKey);
  const row = await get<PlanRow>(db, "SELECT * FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?", [userId, year, month]);
  return row ? hydrate(db, row) : null;
}

/** The most recent plan strictly before the given month. */
export async function latestPlanBefore(db: DB, userId: number, monthKey: string): Promise<MonthlyPlan | null> {
  const { year, month } = parseMonthKey(monthKey);
  const row = await get<PlanRow>(
    db,
    "SELECT * FROM monthly_plans WHERE user_id = ? AND (year * 12 + month) < ? ORDER BY year DESC, month DESC LIMIT 1",
    [userId, year * 12 + month],
  );
  return row ? hydrate(db, row) : null;
}

/**
 * Statements that create or replace the plan for exactly one month. Other months are never
 * touched, so editing this month's budget can't rewrite history. The plan id is looked up
 * inside each statement so the whole thing can run as one atomic batch.
 */
export function upsertPlanStatements(
  userId: number,
  monthKey: string,
  input: { incomeMinor: number; creditMinor?: number; budgets: { categoryId: number; amountMinor: number }[] },
  opts: { isDemo?: boolean } = {},
): InStatement[] {
  const { year, month } = parseMonthKey(monthKey);
  const planId = "(SELECT id FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?)";
  const key = [userId, year, month];
  return [
    {
      sql: `INSERT INTO monthly_plans (user_id, year, month, income_minor, credit_limit_minor, is_demo) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, year, month) DO UPDATE SET
              income_minor = excluded.income_minor,
              credit_limit_minor = excluded.credit_limit_minor,
              is_demo = excluded.is_demo,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      args: [...key, input.incomeMinor, input.creditMinor ?? 0, opts.isDemo ? 1 : 0],
    },
    { sql: `DELETE FROM plan_budgets WHERE plan_id = ${planId}`, args: key },
    ...input.budgets.map((b) => ({
      sql: `INSERT INTO plan_budgets (plan_id, category_id, amount_minor) VALUES (${planId}, ?, ?)`,
      args: [...key, b.categoryId, b.amountMinor],
    })),
  ];
}

export async function upsertPlan(
  db: DB,
  userId: number,
  monthKey: string,
  input: { incomeMinor: number; creditMinor?: number; budgets: { categoryId: number; amountMinor: number }[] },
): Promise<MonthlyPlan> {
  // Budgets may only reference the user's own categories.
  const known = new Set((await all<{ id: number }>(db, "SELECT id FROM categories WHERE user_id = ?", [userId])).map((r) => r.id));
  const unknown = input.budgets.find((b) => !known.has(b.categoryId));
  if (unknown) throw badRequest(`Unknown category id ${unknown.categoryId}`);
  await batch(db, upsertPlanStatements(userId, monthKey, input));
  return (await getPlan(db, userId, monthKey))!;
}

export async function deletePlan(db: DB, userId: number, monthKey: string): Promise<boolean> {
  const { year, month } = parseMonthKey(monthKey);
  const plan = await get<{ id: number }>(db, "SELECT id FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?", [userId, year, month]);
  if (!plan) return false;
  await batch(db, [
    { sql: "DELETE FROM plan_budgets WHERE plan_id = ?", args: [plan.id] },
    { sql: "DELETE FROM monthly_plans WHERE id = ?", args: [plan.id] },
  ]);
  return true;
}

/** Deletes plans matching a condition together with their budget rows. */
export function deletePlansStatements(userId: number, extraWhere = ""): InStatement[] {
  return [
    { sql: `DELETE FROM plan_budgets WHERE plan_id IN (SELECT id FROM monthly_plans WHERE user_id = ? ${extraWhere})`, args: [userId] },
    { sql: `DELETE FROM monthly_plans WHERE user_id = ? ${extraWhere}`, args: [userId] },
  ];
}

/** Plan totals per month (income, credit, planned consumption, savings target) for trend/history views. */
export async function planTotals(db: DB, userId: number) {
  const rows = await all<{
    year: number;
    month: number;
    incomeMinor: number;
    creditMinor: number;
    plannedSpendMinor: number;
    savingsTargetMinor: number;
  }>(
    db,
    `SELECT p.year, p.month, p.income_minor AS incomeMinor, p.credit_limit_minor AS creditMinor,
            COALESCE(SUM(CASE WHEN c.kind = 'expense' THEN b.amount_minor END), 0) AS plannedSpendMinor,
            COALESCE(SUM(CASE WHEN c.kind = 'savings' THEN b.amount_minor END), 0) AS savingsTargetMinor
     FROM monthly_plans p
     LEFT JOIN plan_budgets b ON b.plan_id = p.id
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE p.user_id = ?
     GROUP BY p.id ORDER BY p.year, p.month`,
    [userId],
  );
  return rows.map((r) => ({
    month: toMonthKey(r.year, r.month),
    incomeMinor: r.incomeMinor,
    creditMinor: r.creditMinor,
    plannedSpendMinor: r.plannedSpendMinor,
    savingsTargetMinor: r.savingsTargetMinor,
  }));
}

export async function listPlans(db: DB, userId: number): Promise<MonthlyPlan[]> {
  const [rows, budgets] = await Promise.all([
    all<PlanRow>(db, "SELECT * FROM monthly_plans WHERE user_id = ? ORDER BY year, month", [userId]),
    all<BudgetLine & { planId: number }>(db, `${BUDGETS_SQL} WHERE c.user_id = ? ORDER BY c.sort_order, c.id`, [userId]),
  ]);
  return rows.map((r) =>
    toPlan(
      r,
      budgets.filter((b) => b.planId === r.id).map(({ categoryId, amountMinor }) => ({ categoryId, amountMinor })),
    ),
  );
}
