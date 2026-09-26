import { all, get, run, type DB, type InStatement } from "../db/connection";
import type { Expense, ExpenseList } from "../../../shared/types";
import type { PaymentMethod } from "../../../shared/constants";
import type { ExpenseQuery } from "../../../shared/schemas";
import { monthBounds } from "../../../shared/dates";

export interface ExpenseData {
  amountMinor: number;
  categoryId: number;
  date: string;
  description: string | null;
  paymentMethod: PaymentMethod | null;
}

interface ExpenseRow {
  id: number;
  amount_minor: number;
  category_id: number;
  date: string;
  description: string | null;
  payment_method: PaymentMethod | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  amountMinor: r.amount_minor,
  categoryId: r.category_id,
  date: r.date,
  description: r.description,
  paymentMethod: r.payment_method,
  isDemo: r.is_demo === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Every function takes the owning userId; rows of other users are never read or written.

export async function getExpense(db: DB, userId: number, id: number): Promise<Expense | null> {
  const row = await get<ExpenseRow>(db, "SELECT * FROM expenses WHERE id = ? AND user_id = ?", [id, userId]);
  return row ? toExpense(row) : null;
}

export async function insertExpense(db: DB, userId: number, data: ExpenseData, isDemo = false): Promise<Expense> {
  const row = await get<ExpenseRow>(
    db,
    `INSERT INTO expenses (user_id, amount_minor, category_id, date, description, payment_method, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [userId, data.amountMinor, data.categoryId, data.date, data.description, data.paymentMethod, isDemo ? 1 : 0],
  );
  return toExpense(row!);
}

/**
 * Multi-row INSERT statements for bulk writes (CSV import, demo data). Rows are grouped so a
 * large import is a handful of statements in one atomic batch rather than thousands of round trips.
 */
export function bulkInsertStatements(userId: number, rows: ExpenseData[], opts: { isDemo?: boolean } = {}): InStatement[] {
  const statements: InStatement[] = [];
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    statements.push({
      sql: `INSERT INTO expenses (user_id, amount_minor, category_id, date, description, payment_method, is_demo)
            VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      args: chunk.flatMap((r) => [userId, r.amountMinor, r.categoryId, r.date, r.description, r.paymentMethod, opts.isDemo ? 1 : 0]),
    });
  }
  return statements;
}

/** Editing a demo expense turns it into real data (is_demo = 0). */
export async function updateExpense(db: DB, userId: number, id: number, data: ExpenseData): Promise<Expense | null> {
  const row = await get<ExpenseRow>(
    db,
    `UPDATE expenses
       SET amount_minor = ?, category_id = ?, date = ?, description = ?, payment_method = ?, is_demo = 0,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND user_id = ? RETURNING *`,
    [data.amountMinor, data.categoryId, data.date, data.description, data.paymentMethod, id, userId],
  );
  return row ? toExpense(row) : null;
}

export async function deleteExpense(db: DB, userId: number, id: number): Promise<boolean> {
  return (await run(db, "DELETE FROM expenses WHERE id = ? AND user_id = ?", [id, userId])) > 0;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function queryExpenses(db: DB, userId: number, q: ExpenseQuery): Promise<ExpenseList> {
  const where: string[] = ["e.user_id = ?"];
  const params: (string | number)[] = [userId];
  if (q.month) {
    const { start, end } = monthBounds(q.month);
    where.push("e.date BETWEEN ? AND ?");
    params.push(start, end);
  }
  if (q.from) (where.push("e.date >= ?"), params.push(q.from));
  if (q.to) (where.push("e.date <= ?"), params.push(q.to));
  if (q.categoryIds?.length) {
    where.push(`e.category_id IN (${q.categoryIds.map(() => "?").join(",")})`);
    params.push(...q.categoryIds);
  }
  if (q.paymentMethod === "none") where.push("e.payment_method IS NULL");
  else if (q.paymentMethod) (where.push("e.payment_method = ?"), params.push(q.paymentMethod));
  if (q.q) {
    const term = `%${escapeLike(q.q)}%`;
    where.push("(e.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    params.push(term, term);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const from = "FROM expenses e JOIN categories c ON c.id = e.category_id";

  const dir = q.order === "asc" ? "ASC" : "DESC";
  const orderBy =
    q.sort === "amount"
      ? `e.amount_minor ${dir}, e.date DESC, e.id DESC`
      : `e.date ${dir}, e.created_at ${dir}, e.id ${dir}`;
  const offset = (q.page - 1) * q.pageSize;

  const [agg, rows] = await Promise.all([
    get<{ total: number; amount: number }>(db, `SELECT COUNT(*) AS total, COALESCE(SUM(e.amount_minor), 0) AS amount ${from} ${whereSql}`, params),
    all<ExpenseRow>(db, `SELECT e.* ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, q.pageSize, offset]),
  ]);

  return {
    items: rows.map(toExpense),
    total: agg!.total,
    page: q.page,
    pageSize: q.pageSize,
    totalAmountMinor: agg!.amount,
  };
}

/** All expenses in a date range, ordered by date (for exports and analytics). */
export async function expensesInRange(db: DB, userId: number, start?: string, end?: string): Promise<Expense[]> {
  const rows = await all<ExpenseRow>(
    db,
    `SELECT * FROM expenses
     WHERE user_id = ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
     ORDER BY date ASC, created_at ASC, id ASC`,
    [userId, start ?? null, start ?? null, end ?? null, end ?? null],
  );
  return rows.map(toExpense);
}

export function totalsByCategory(db: DB, userId: number, start: string, end: string) {
  return all<{ categoryId: number; totalMinor: number; count: number }>(
    db,
    `SELECT category_id AS categoryId, SUM(amount_minor) AS totalMinor, COUNT(*) AS count
     FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY category_id`,
    [userId, start, end],
  );
}

/** Daily totals split by category kind ("expense" vs "savings"). */
export function dailyTotals(db: DB, userId: number, start: string, end: string) {
  return all<{ date: string; kind: string; totalMinor: number; count: number }>(
    db,
    `SELECT e.date AS date, c.kind AS kind, SUM(e.amount_minor) AS totalMinor, COUNT(*) AS count
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.date BETWEEN ? AND ? GROUP BY e.date, c.kind`,
    [userId, start, end],
  );
}

/** Consumption spending (excludes savings) grouped by payment method. */
export function paymentTotals(db: DB, userId: number, start: string, end: string) {
  return all<{ method: string | null; totalMinor: number; count: number }>(
    db,
    `SELECT e.payment_method AS method, SUM(e.amount_minor) AS totalMinor, COUNT(*) AS count
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.date BETWEEN ? AND ? AND c.kind = 'expense'
     GROUP BY e.payment_method`,
    [userId, start, end],
  );
}

/** Per-month totals split by kind for a range of months (inclusive date bounds). */
export function monthlyTotals(db: DB, userId: number, start?: string, end?: string) {
  return all<{ month: string; kind: string; totalMinor: number; count: number }>(
    db,
    `SELECT substr(e.date, 1, 7) AS month, c.kind AS kind, SUM(e.amount_minor) AS totalMinor, COUNT(*) AS count
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND (? IS NULL OR e.date >= ?) AND (? IS NULL OR e.date <= ?)
     GROUP BY month, c.kind ORDER BY month`,
    [userId, start ?? null, start ?? null, end ?? null, end ?? null],
  );
}

export async function largestExpense(db: DB, userId: number, start: string, end: string): Promise<Expense | null> {
  const row = await get<ExpenseRow>(
    db,
    `SELECT e.* FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.date BETWEEN ? AND ? AND c.kind = 'expense'
     ORDER BY e.amount_minor DESC, e.date DESC LIMIT 1`,
    [userId, start, end],
  );
  return row ? toExpense(row) : null;
}

export async function spendingBetween(db: DB, userId: number, start: string, end: string): Promise<number> {
  const row = await get<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(e.amount_minor), 0) AS total
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.date BETWEEN ? AND ? AND c.kind = 'expense'`,
    [userId, start, end],
  );
  return row!.total;
}
