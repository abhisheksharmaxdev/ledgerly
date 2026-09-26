import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { migrations, runMigrations } from "../server/src/db/migrations";
import { ensureAdmin } from "../server/src/repositories/users";
import { listCategories } from "../server/src/repositories/categories";
import { queryExpenses } from "../server/src/repositories/expenses";
import { getPlan } from "../server/src/repositories/plans";
import { getSettings } from "../server/src/repositories/settings";
import { expenseQuerySchema } from "../shared/schemas";

describe("migration to multi-user", () => {
  it("preserves single-user data and assigns it to the admin", async () => {
    const db = createClient({ url: ":memory:" });
    // Build a v1 database with some real data in it.
    await db.execute("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT 'x')");
    await db.batch([...migrations[0].statements(), "INSERT INTO schema_migrations (version, name) VALUES (1, 'initial schema')"], "write");
    const food = Number((await db.execute("SELECT id FROM categories WHERE slug = 'food'")).rows[0].id);
    await db.execute({ sql: "INSERT INTO expenses (amount_minor, category_id, date, description) VALUES (25000, ?, '2026-09-25', 'Lunch')", args: [food] });
    const plan = Number((await db.execute("INSERT INTO monthly_plans (year, month, income_minor) VALUES (2026, 9, 2000000) RETURNING id")).rows[0].id);
    await db.execute({ sql: "INSERT INTO plan_budgets (plan_id, category_id, amount_minor) VALUES (?, ?, 300000)", args: [plan, food] });
    await db.execute(`INSERT INTO settings (key, value) VALUES ('theme', '"light"')`);

    await runMigrations(db);
    expect((await db.execute("PRAGMA foreign_key_check")).rows.length).toBe(0);

    const { claimed } = await ensureAdmin(db, "owner@example.com", "scrypt:1:1:1:x:y");
    expect(claimed).toBeGreaterThan(0);
    const admin = { id: Number((await db.execute("SELECT id FROM users WHERE role = 'admin'")).rows[0].id) };

    expect(await listCategories(db, admin.id)).toHaveLength(11);
    const list = await queryExpenses(db, admin.id, expenseQuerySchema.parse({}));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ amountMinor: 25000, description: "Lunch" });
    expect(await getPlan(db, admin.id, "2026-09")).toMatchObject({ incomeMinor: 2000000, budgets: [{ categoryId: food, amountMinor: 300000 }] });
    expect((await getSettings(db, admin.id)).theme).toBe("light");
    expect((await db.execute("SELECT COUNT(*) AS n FROM expenses WHERE user_id IS NULL")).rows[0].n).toBe(0);

    // Re-running create-admin with a new email keeps the same account (and its data).
    const second = await ensureAdmin(db, "new-owner@example.com", "scrypt:2:2:2:x:y");
    expect(second.action).toBe("updated");
    const admins = (await db.execute("SELECT id, email, password_hash FROM users WHERE role = 'admin'")).rows.map((r) => ({ ...r }));
    expect(admins).toEqual([{ id: admin.id, email: "new-owner@example.com", password_hash: "scrypt:2:2:2:x:y" }]);
    expect((await queryExpenses(db, admin.id, expenseQuerySchema.parse({}))).items).toHaveLength(1);
  });
});
