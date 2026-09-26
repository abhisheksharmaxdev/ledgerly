import Papa from "papaparse";
import { z } from "zod";
import type { DB } from "../db/connection";
import type { ImportPreview } from "../../../shared/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_VALUES, type PaymentMethod } from "../../../shared/constants";
import { minorToDecimalString, parseAmount } from "../../../shared/money";
import { isValidIsoDate, monthKeyOf, pad2 } from "../../../shared/dates";
import { categoryCreateSchema, fieldErrors, isoDate, minorAmount, settingsSchema } from "../../../shared/schemas";
import { buildCategoryResolver, listCategories } from "../repositories/categories";
import { expensesInRange, insertExpense, type ExpenseData } from "../repositories/expenses";
import { listPlans, upsertPlan } from "../repositories/plans";
import { getSettings, updateSettings } from "../repositories/settings";
import { badRequest } from "../utils/errors";

export const MAX_IMPORT_ROWS = 20_000;

// ---------- CSV export ----------

/** Neutralises spreadsheet formula injection (=, +, -, @ at the start of a cell). */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function exportCsv(db: DB, userId: number, range: { start?: string; end?: string } = {}): string {
  const categories = new Map(listCategories(db, userId).map((c) => [c.id, c.name]));
  const rows = expensesInRange(db, userId, range.start, range.end).map((e) => ({
    Date: e.date,
    Amount: minorToDecimalString(e.amountMinor),
    Category: safeCell(categories.get(e.categoryId) ?? "Unknown"),
    Description: safeCell(e.description ?? ""),
    "Payment Method": e.paymentMethod ? PAYMENT_METHODS.find((p) => p.value === e.paymentMethod)!.label : "",
  }));
  const csv = Papa.unparse(
    { fields: ["Date", "Amount", "Category", "Description", "Payment Method"], data: rows },
    { newline: "\r\n" },
  );
  return `﻿${csv}\r\n`; // BOM so Excel opens ₹/UTF-8 text correctly
}

// ---------- CSV import ----------

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  amount: "amount",
  category: "category",
  description: "description",
  note: "description",
  notes: "description",
  "payment method": "payment",
  payment_method: "payment",
  paymentmethod: "payment",
  payment: "payment",
  method: "payment",
};

function normaliseDate(raw: string): string | null {
  const v = raw.trim();
  if (isValidIsoDate(v)) return v;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v); // DD/MM/YYYY (Indian convention)
  if (m) {
    const iso = `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

function normalisePayment(raw: string): PaymentMethod | null | undefined {
  const v = raw.trim().toLowerCase();
  if (!v || v === "unspecified") return null;
  const hit = PAYMENT_METHODS.find((p) => p.label.toLowerCase() === v || p.value === v.replace(/\s+/g, "_"));
  return hit ? hit.value : undefined;
}

function unescapeCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

export function importCsv(db: DB, userId: number, text: string, opts: { dryRun: boolean; skipDuplicates: boolean }): ImportPreview & { duplicates: number } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase(),
  });

  const errors: { row: number; message: string }[] = [];
  const headers = parsed.meta.fields ?? [];
  for (const required of ["date", "amount", "category"]) {
    if (!headers.includes(required)) {
      errors.push({ row: 1, message: `Missing required column "${required}". Expected: Date, Amount, Category, Description, Payment Method.` });
    }
  }
  if (errors.length) return emptyPreview(errors);
  if (parsed.data.length === 0) return emptyPreview([{ row: 1, message: "The file has no data rows." }]);
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return emptyPreview([{ row: 1, message: `Too many rows (${parsed.data.length}). The limit is ${MAX_IMPORT_ROWS}.` }]);
  }
  for (const e of parsed.errors.slice(0, 20)) {
    errors.push({ row: (e.row ?? 0) + 2, message: `CSV format problem: ${e.message}` });
  }

  const resolveCategory = buildCategoryResolver(listCategories(db, userId));
  const rows: ExpenseData[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const problems: string[] = [];
    const date = normaliseDate(r.date ?? "");
    if (!date) problems.push(`invalid date "${r.date ?? ""}" (use YYYY-MM-DD or DD/MM/YYYY)`);
    const amount = parseAmount(r.amount ?? "");
    if (!amount.ok) problems.push(`amount "${r.amount ?? ""}": ${amount.error.toLowerCase()}`);
    const category = resolveCategory(unescapeCell(r.category ?? ""));
    if (!category) problems.push(`unknown category "${r.category ?? ""}"`);
    const payment = normalisePayment(r.payment ?? "");
    if (payment === undefined) problems.push(`unknown payment method "${r.payment}"`);
    const description = unescapeCell((r.description ?? "").trim());
    if (description.length > 200) problems.push("description longer than 200 characters");

    if (problems.length) errors.push({ row: line, message: problems.join("; ") });
    else
      rows.push({
        date: date!,
        amountMinor: (amount as { minor: number }).minor,
        categoryId: category!.id,
        description: description || null,
        paymentMethod: payment ?? null,
      });
  });

  // Rows identical to an existing expense (date, amount, category, description) are likely re-imports.
  const dupStmt = db.prepare(
    "SELECT 1 FROM expenses WHERE user_id = ? AND date = ? AND amount_minor = ? AND category_id = ? AND COALESCE(description,'') = ? LIMIT 1",
  );
  const isDup = (r: ExpenseData) => !!dupStmt.get(userId, r.date, r.amountMinor, r.categoryId, r.description ?? "");
  const duplicates = rows.filter(isDup).length;
  const toInsert = opts.skipDuplicates ? rows.filter((r) => !isDup(r)) : rows;

  const valid = errors.length === 0;
  let imported = 0;
  if (valid && !opts.dryRun) {
    // All-or-nothing: either every row lands or none do.
    db.transaction(() => {
      for (const r of toInsert) insertExpense(db, userId, r);
    })();
    imported = toInsert.length;
  }

  return {
    valid,
    totalRows: parsed.data.length,
    validRows: rows.length,
    totalAmountMinor: rows.reduce((s, r) => s + r.amountMinor, 0),
    errors: errors.slice(0, 100),
    months: [...new Set(rows.map((r) => monthKeyOf(r.date)))].sort(),
    imported,
    duplicates,
  };
}

function emptyPreview(errors: { row: number; message: string }[]): ImportPreview & { duplicates: number } {
  return { valid: false, totalRows: 0, validRows: 0, totalAmountMinor: 0, errors, months: [], imported: 0, duplicates: 0 };
}

// ---------- JSON backup / restore ----------

const BACKUP_APP = "ledgerly";
const BACKUP_VERSION = 1;

export function exportBackup(db: DB, userId: number) {
  const categories = listCategories(db, userId);
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: getSettings(db, userId),
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      color: c.color,
      icon: c.icon,
      kind: c.kind,
      sortOrder: c.sortOrder,
      archived: c.archived,
    })),
    plans: listPlans(db, userId).map((p) => ({
      month: p.month,
      incomeMinor: p.incomeMinor,
      budgets: p.budgets.map((b) => ({ category: slugById.get(b.categoryId)!, amountMinor: b.amountMinor })),
    })),
    expenses: expensesInRange(db, userId).map((e) => ({
      date: e.date,
      amountMinor: e.amountMinor,
      category: slugById.get(e.categoryId)!,
      description: e.description,
      paymentMethod: e.paymentMethod,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    })),
  };
}

const backupSchema = z.object({
  app: z.literal(BACKUP_APP, { error: "This file is not a Ledgerly backup" }),
  version: z.literal(BACKUP_VERSION, { error: "Unsupported backup version" }),
  settings: settingsSchema.optional(),
  categories: z
    .array(
      categoryCreateSchema.extend({
        slug: z.string().min(1).max(60),
        sortOrder: z.number().int(),
        archived: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
  plans: z
    .array(
      z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        incomeMinor: minorAmount,
        budgets: z.array(z.object({ category: z.string(), amountMinor: minorAmount })).max(500),
      }),
    )
    .max(5000),
  expenses: z
    .array(
      z.object({
        date: isoDate,
        amountMinor: minorAmount.refine((v) => v > 0, "Amount must be greater than 0"),
        category: z.string(),
        description: z.string().max(200).nullable(),
        paymentMethod: z.enum(PAYMENT_METHOD_VALUES).nullable(),
        createdAt: z.string().max(40).optional(),
        updatedAt: z.string().max(40).optional(),
      }),
    )
    .max(500_000),
});

/** Replaces the user's plans and expenses with the backup's contents in one transaction. Other users are untouched. */
export function restoreBackup(db: DB, userId: number, payload: unknown): { expenses: number; plans: number; categories: number } {
  const result = backupSchema.safeParse(payload);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    const [path, msg] = Object.entries(fields)[0] ?? ["", "Invalid backup"];
    throw badRequest(`Backup rejected: ${msg}${path && path !== "_" ? ` (at ${path})` : ""}`);
  }
  const backup = result.data;
  const slugs = new Set(backup.categories.map((c) => c.slug));
  const missing = [...backup.expenses.map((e) => e.category), ...backup.plans.flatMap((p) => p.budgets.map((b) => b.category))].find(
    (s) => !slugs.has(s),
  );
  if (missing) throw badRequest(`Backup rejected: references unknown category "${missing}"`);

  db.transaction(() => {
    db.prepare("DELETE FROM expenses WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM plan_budgets WHERE plan_id IN (SELECT id FROM monthly_plans WHERE user_id = ?)").run(userId);
    db.prepare("DELETE FROM monthly_plans WHERE user_id = ?").run(userId);
    const upsertCat = db.prepare(
      `INSERT INTO categories (user_id, slug, name, color, icon, kind, sort_order, archived_at)
       VALUES (@userId, @slug, @name, @color, @icon, @kind, @sortOrder, CASE WHEN @archived = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)
       ON CONFLICT (user_id, slug) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon,
         kind = excluded.kind, sort_order = excluded.sort_order, archived_at = excluded.archived_at`,
    );
    // Park existing names first so renamed categories can't collide on the unique name index.
    const before = db.prepare("SELECT id, slug, name FROM categories WHERE user_id = ?").all(userId) as { id: number; slug: string; name: string }[];
    db.prepare("UPDATE categories SET name = '__restore_' || id WHERE user_id = ?").run(userId);
    for (const c of backup.categories) upsertCat.run({ ...c, userId, archived: c.archived ? 1 : 0 });
    // Categories that aren't in the backup get their old name back (suffixed only if it now clashes).
    const taken = new Set(backup.categories.map((c) => c.name.toLowerCase()));
    const rename = db.prepare("UPDATE categories SET name = ? WHERE id = ? AND user_id = ?");
    for (const c of before.filter((b) => !slugs.has(b.slug))) {
      let name = c.name;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${c.name} (${i})`;
      taken.add(name.toLowerCase());
      rename.run(name, c.id, userId);
    }

    const idBySlug = new Map(listCategories(db, userId).map((c) => [c.slug, c.id]));
    for (const p of backup.plans) {
      upsertPlan(db, userId, p.month, {
        incomeMinor: p.incomeMinor,
        budgets: p.budgets.map((b) => ({ categoryId: idBySlug.get(b.category)!, amountMinor: b.amountMinor })),
      });
    }
    const insert = db.prepare(
      `INSERT INTO expenses (user_id, amount_minor, category_id, date, description, payment_method, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
    );
    for (const e of backup.expenses) {
      insert.run(userId, e.amountMinor, idBySlug.get(e.category)!, e.date, e.description, e.paymentMethod, e.createdAt ?? null, e.updatedAt ?? null);
    }
    if (backup.settings) updateSettings(db, userId, backup.settings);
  })();

  return { expenses: backup.expenses.length, plans: backup.plans.length, categories: backup.categories.length };
}
