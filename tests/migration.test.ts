import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrations, runMigrations } from "../server/src/db/migrations";
import { ensureAdmin } from "../server/src/repositories/users";
import { listCategories } from "../server/src/repositories/categories";
import { queryExpenses } from "../server/src/repositories/expenses";
import { getPlan } from "../server/src/repositories/plans";
import { getSettings } from "../server/src/repositories/settings";
import { expenseQuerySchema } from "../shared/schemas";

describe("migration to multi-user", () => {
  it("preserves single-user data and assigns it to the admin", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    // Build a v1 database with some real data in it.
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT 'x')");
    migrations[0].up(db);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (1, 'initial schema')").run();
    const food = db.prepare("SELECT id FROM categories WHERE slug = 'food'").get() as { id: number };
    db.prepare("INSERT INTO expenses (amount_minor, category_id, date, description) VALUES (25000, ?, '2026-09-25', 'Lunch')").run(food.id);
    const plan = db.prepare("INSERT INTO monthly_plans (year, month, income_minor) VALUES (2026, 9, 2000000) RETURNING id").get() as { id: number };
    db.prepare("INSERT INTO plan_budgets (plan_id, category_id, amount_minor) VALUES (?, ?, 300000)").run(plan.id, food.id);
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', '\"light\"')").run();

    runMigrations(db);
    expect((db.pragma("foreign_key_check") as unknown[]).length).toBe(0);

    const { claimed } = ensureAdmin(db, "owner@example.com", "scrypt:1:1:1:x:y");
    expect(claimed).toBeGreaterThan(0);
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: number };

    expect(listCategories(db, admin.id)).toHaveLength(11);
    const list = queryExpenses(db, admin.id, expenseQuerySchema.parse({}));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ amountMinor: 25000, description: "Lunch" });
    expect(getPlan(db, admin.id, "2026-09")).toMatchObject({ incomeMinor: 2000000, budgets: [{ categoryId: food.id, amountMinor: 300000 }] });
    expect(getSettings(db, admin.id).theme).toBe("light");
    expect((db.prepare("SELECT COUNT(*) AS n FROM expenses WHERE user_id IS NULL").get() as { n: number }).n).toBe(0);

    // Re-running create-admin with a new email keeps the same account (and its data).
    const second = ensureAdmin(db, "new-owner@example.com", "scrypt:2:2:2:x:y");
    expect(second.action).toBe("updated");
    const admins = db.prepare("SELECT id, email, password_hash FROM users WHERE role = 'admin'").all() as { id: number; email: string; password_hash: string }[];
    expect(admins).toEqual([{ id: admin.id, email: "new-owner@example.com", password_hash: "scrypt:2:2:2:x:y" }]);
    expect(queryExpenses(db, admin.id, expenseQuerySchema.parse({})).items).toHaveLength(1);
  });
});
