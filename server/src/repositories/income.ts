import { all, get, run, type DB } from "../db/connection";
import type { IncomeEntry, IncomeList } from "../../../shared/types";
import type { ReceivedMethod } from "../../../shared/constants";
import type { IncomeQuery } from "../../../shared/schemas";
import { monthBounds } from "../../../shared/dates";
import { escapeLike } from "./expenses";

export interface IncomeData {
  amountMinor: number;
  date: string;
  description: string | null;
  paymentMethod: ReceivedMethod | null;
}

interface IncomeRow {
  id: number;
  amount_minor: number;
  date: string;
  description: string | null;
  payment_method: ReceivedMethod | null;
  created_at: string;
  updated_at: string;
}

const toIncome = (r: IncomeRow): IncomeEntry => ({
  id: r.id,
  amountMinor: r.amount_minor,
  date: r.date,
  description: r.description,
  paymentMethod: r.payment_method,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Every function takes the owning userId; other users' entries are never read or written.

/** The income statement: filtered, sorted and paginated, with the count and sum of every match. */
export async function queryIncome(db: DB, userId: number, q: IncomeQuery): Promise<IncomeList> {
  const where: string[] = ["user_id = ?"];
  const params: (string | number)[] = [userId];
  if (q.month) {
    const { start, end } = monthBounds(q.month);
    where.push("date BETWEEN ? AND ?");
    params.push(start, end);
  }
  if (q.from) (where.push("date >= ?"), params.push(q.from));
  if (q.to) (where.push("date <= ?"), params.push(q.to));
  if (q.paymentMethod === "none") where.push("payment_method IS NULL");
  else if (q.paymentMethod) (where.push("payment_method = ?"), params.push(q.paymentMethod));
  if (q.q) (where.push("description LIKE ? ESCAPE '\\'"), params.push(`%${escapeLike(q.q)}%`));
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const dir = q.order === "asc" ? "ASC" : "DESC";
  const orderBy = q.sort === "amount" ? `amount_minor ${dir}, date DESC, id DESC` : `date ${dir}, id ${dir}`;
  const offset = (q.page - 1) * q.pageSize;

  const [agg, rows] = await Promise.all([
    get<{ total: number; amount: number }>(db, `SELECT COUNT(*) AS total, COALESCE(SUM(amount_minor), 0) AS amount FROM income_entries ${whereSql}`, params),
    all<IncomeRow>(db, `SELECT * FROM income_entries ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, q.pageSize, offset]),
  ]);

  return { items: rows.map(toIncome), total: agg!.total, page: q.page, pageSize: q.pageSize, totalAmountMinor: agg!.amount };
}

/** All entries, optionally within inclusive date bounds, oldest first (for exports and backups). */
export async function allIncome(db: DB, userId: number, start?: string, end?: string): Promise<IncomeEntry[]> {
  const rows = await all<IncomeRow>(
    db,
    "SELECT * FROM income_entries WHERE user_id = ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date, id",
    [userId, start ?? null, start ?? null, end ?? null, end ?? null],
  );
  return rows.map(toIncome);
}

export async function getIncome(db: DB, userId: number, id: number): Promise<IncomeEntry | null> {
  const row = await get<IncomeRow>(db, "SELECT * FROM income_entries WHERE id = ? AND user_id = ?", [id, userId]);
  return row ? toIncome(row) : null;
}

export async function insertIncome(db: DB, userId: number, data: IncomeData): Promise<IncomeEntry> {
  const row = await get<IncomeRow>(
    db,
    `INSERT INTO income_entries (user_id, amount_minor, date, description, payment_method)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [userId, data.amountMinor, data.date, data.description, data.paymentMethod],
  );
  return toIncome(row!);
}

export async function updateIncome(db: DB, userId: number, id: number, data: IncomeData): Promise<IncomeEntry | null> {
  const row = await get<IncomeRow>(
    db,
    `UPDATE income_entries
       SET amount_minor = ?, date = ?, description = ?, payment_method = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND user_id = ? RETURNING *`,
    [data.amountMinor, data.date, data.description, data.paymentMethod, id, userId],
  );
  return row ? toIncome(row) : null;
}

export async function deleteIncome(db: DB, userId: number, id: number): Promise<boolean> {
  return (await run(db, "DELETE FROM income_entries WHERE id = ? AND user_id = ?", [id, userId])) > 0;
}

export async function receivedBetween(db: DB, userId: number, start: string, end: string): Promise<number> {
  const row = await get<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM income_entries WHERE user_id = ? AND date BETWEEN ? AND ?",
    [userId, start, end],
  );
  return row!.total;
}

/** Money received per month (optionally within inclusive date bounds). */
export function monthlyReceivedTotals(db: DB, userId: number, start?: string, end?: string) {
  return all<{ month: string; totalMinor: number }>(
    db,
    `SELECT substr(date, 1, 7) AS month, SUM(amount_minor) AS totalMinor
     FROM income_entries
     WHERE user_id = ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
     GROUP BY month`,
    [userId, start ?? null, start ?? null, end ?? null, end ?? null],
  );
}
