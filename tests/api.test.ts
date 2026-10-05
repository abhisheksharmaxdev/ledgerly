import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/src/app";
import { openDatabase, type DB } from "../server/src/db/connection";
import { config } from "../server/src/config";
import { hashPassword } from "../server/src/auth/password";
import { ensureAdmin, getUserByEmail } from "../server/src/repositories/users";
import type { MailMessage, Mailer } from "../server/src/services/mailer";
import type { Category, MonthSummary } from "../shared/types";

const H = { "X-Requested-With": "ledgerly" };
const silent = { error() {}, info() {}, warn() {} };
const ADMIN = { email: "admin@example.com", password: "admin-password-1" };
const ADMIN_HASH = hashPassword(ADMIN.password);
const testConfig = { ...config, cookieSecure: false, trustProxy: "", sessionSecret: "t".repeat(40), adminNotifyEmail: "", appUrl: "" };

let db: DB;
let app: Awaited<ReturnType<typeof createApp>>;
let agent: ReturnType<typeof request.agent>;
let cats: Record<string, Category>;
let sentMail: MailMessage[];

/** Signs up, gets approved by the admin, and returns a logged-in agent for that user. */
async function approvedUser(email: string, password = "user-password-1") {
  await request(app).post("/api/auth/signup").set(H).send({ email, password }).expect(202);
  const id = (await getUserByEmail(db, email))!.id;
  const admin = request.agent(app);
  await admin.post("/api/auth/login").set(H).send(ADMIN).expect(200);
  await admin.post(`/api/admin/users/${id}/approve`).set(H).expect(200);
  const a = request.agent(app);
  await a.post("/api/auth/login").set(H).send({ email, password }).expect(200);
  return a;
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  sentMail = [];
  const mailer: Mailer = { configured: true, send: async (m) => void sentMail.push(m) };
  app = await createApp({ db, config: testConfig, logger: silent, mailer });
  await ensureAdmin(db, ADMIN.email, ADMIN_HASH);
  agent = await approvedUser("alice@example.com");
  const res = await agent.get("/api/categories");
  cats = Object.fromEntries((res.body as Category[]).map((c) => [c.slug, c]));
});


const addExpense = (body: Record<string, unknown>) => agent.post("/api/expenses").set(H).send(body);
const summary = async (month: string, today = "2026-09-25") =>
  (await agent.get(`/api/months/${month}/summary?today=${today}`)).body as MonthSummary;

describe("categories", () => {
  it("seeds the 11 default categories with savings as a distinct kind", () => {
    expect(Object.keys(cats)).toHaveLength(11);
    expect(cats.savings.kind).toBe("savings");
    expect(cats.food.kind).toBe("expense");
  });

  it("supports adding custom categories", async () => {
    const res = await agent.post("/api/categories").set(H).send({ name: "Pets", color: "#f87171", icon: "paw" });
    expect(res.status).toBe(201);
    const dup = await agent.post("/api/categories").set(H).send({ name: "pets", color: "#f87171", icon: "paw" });
    expect(dup.status).toBe(409);
  });
});

describe("expenses CRUD + validation", () => {
  it("creates, reads, updates and deletes", async () => {
    const created = await addExpense({ amountMinor: 25000, categoryId: cats.food.id, date: "2026-09-25", description: "Lunch", paymentMethod: "upi" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amountMinor: 25000, description: "Lunch", paymentMethod: "upi" });

    const id = created.body.id;
    const updated = await agent.put(`/api/expenses/${id}`).set(H).send({ amountMinor: 30050, categoryId: cats.travel.id, date: "2026-09-24", description: "", paymentMethod: null });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ amountMinor: 30050, categoryId: cats.travel.id, description: null, paymentMethod: null });

    expect((await agent.delete(`/api/expenses/${id}`).set(H)).status).toBe(204);
    expect((await agent.get(`/api/expenses/${id}`)).status).toBe(404);
  });

  it("rejects zero, negative and malformed amounts, bad dates and categories", async () => {
    for (const amountMinor of [0, -100, 12.5, "100"]) {
      const res = await addExpense({ amountMinor, categoryId: cats.food.id, date: "2026-09-25" });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.amountMinor).toBeTruthy();
    }
    expect((await addExpense({ amountMinor: 100, categoryId: cats.food.id, date: "2026-02-30" })).status).toBe(400);
    expect((await addExpense({ amountMinor: 100, categoryId: 9999, date: "2026-09-25" })).status).toBe(400);
    expect((await addExpense({ amountMinor: 100, categoryId: cats.food.id, date: "2026-09-25", paymentMethod: "bitcoin" })).status).toBe(400);
  });

  it("requires the CSRF header on mutations", async () => {
    const res = await agent.post("/api/expenses").send({ amountMinor: 100, categoryId: cats.food.id, date: "2026-09-25" });
    expect(res.status).toBe(403);
  });

  it("filters, searches, sorts and paginates", async () => {
    await addExpense({ amountMinor: 25000, categoryId: cats.food.id, date: "2026-09-25", description: "Lunch 100%", paymentMethod: "upi" });
    await addExpense({ amountMinor: 12000, categoryId: cats.travel.id, date: "2026-09-24", description: "Auto", paymentMethod: "cash" });
    await addExpense({ amountMinor: 50000, categoryId: cats.food.id, date: "2026-08-10", description: "Groceries", paymentMethod: "upi" });

    const sept = await agent.get("/api/expenses?month=2026-09");
    expect(sept.body.total).toBe(2);
    expect(sept.body.totalAmountMinor).toBe(37000);

    const byAmount = await agent.get("/api/expenses?sort=amount&order=desc");
    expect(byAmount.body.items.map((e: { amountMinor: number }) => e.amountMinor)).toEqual([50000, 25000, 12000]);

    expect((await agent.get("/api/expenses?q=auto")).body.total).toBe(1);
    expect((await agent.get("/api/expenses?q=100%25")).body.total).toBe(1); // "%" is literal
    expect((await agent.get("/api/expenses?q=food")).body.total).toBe(2); // category name match
    expect((await agent.get("/api/expenses?paymentMethod=cash")).body.total).toBe(1);
    expect((await agent.get(`/api/expenses?categoryIds=${cats.food.id}`)).body.total).toBe(2);
    expect((await agent.get("/api/expenses?from=2026-09-01&to=2026-09-24")).body.total).toBe(1);

    const page2 = await agent.get("/api/expenses?pageSize=2&page=2");
    expect(page2.body.items).toHaveLength(1);
  });
});

describe("monthly plans and summary math", () => {
  const plan = (income: number, budgets: Record<string, number>) => ({
    incomeMinor: income * 100,
    budgets: Object.entries(budgets).map(([slug, v]) => ({ categoryId: cats[slug].id, amountMinor: v * 100 })),
  });

  it("keeps each month's plan independent", async () => {
    await agent.put("/api/plans/2026-08").set(H).send(plan(18000, { food: 2500 }));
    await agent.put("/api/plans/2026-09").set(H).send(plan(20000, { food: 3000 }));
    await agent.put("/api/plans/2026-09").set(H).send(plan(21000, { food: 3200 }));
    const aug = await agent.get("/api/plans/2026-08");
    expect(aug.body.plan.incomeMinor).toBe(1800000);
    const oct = await agent.get("/api/plans/2026-10");
    expect(oct.body.plan).toBeNull();
    expect(oct.body.suggestion.month).toBe("2026-09");
  });

  it("allows plans that exceed income and rejects negative budgets", async () => {
    expect((await agent.put("/api/plans/2026-09").set(H).send(plan(1000, { food: 5000 }))).status).toBe(200);
    const bad = await agent.put("/api/plans/2026-09").set(H).send(plan(-1, { food: 10 }));
    expect(bad.status).toBe(400);
  });

  it("computes totals, remaining, savings and budget status correctly", async () => {
    await agent.put("/api/plans/2026-09").set(H).send(
      plan(20000, { rent: 6000, food: 3000, shopping: 1000, savings: 5000 }),
    );
    await addExpense({ amountMinor: 600000, categoryId: cats.rent.id, date: "2026-09-01" });
    await addExpense({ amountMinor: 215000, categoryId: cats.food.id, date: "2026-09-10" });
    await addExpense({ amountMinor: 120050, categoryId: cats.shopping.id, date: "2026-09-12" });
    await addExpense({ amountMinor: 20000, categoryId: cats.health.id, date: "2026-09-25" });
    await addExpense({ amountMinor: 400000, categoryId: cats.savings.id, date: "2026-09-05" });

    const s = await summary("2026-09");
    expect(s.incomeMinor).toBe(2000000);
    expect(s.spentMinor).toBe(600000 + 215000 + 120050 + 20000); // savings excluded
    expect(s.savedMinor).toBe(400000);
    expect(s.plannedSpendMinor).toBe(1000000);
    expect(s.savingsTargetMinor).toBe(500000);
    expect(s.unallocatedMinor).toBe(2000000 - 1000000 - 500000);
    expect(s.remainingMinor).toBe(2000000 - s.spentMinor - 400000);
    expect(s.budgetRemainingMinor).toBe(1000000 - s.spentMinor);
    expect(s.savingsRate).toBe(20);
    expect(s.todaySpentMinor).toBe(20000);

    const food = s.categories.find((c) => c.categoryId === cats.food.id)!;
    expect(food).toMatchObject({ budgetMinor: 300000, spentMinor: 215000, remainingMinor: 85000, percentUsed: 71.7, status: "ok" });
    expect(s.categories.find((c) => c.categoryId === cats.shopping.id)!.status).toBe("over");
    expect(s.categories.find((c) => c.categoryId === cats.rent.id)!.status).toBe("warning");
    expect(s.categories.find((c) => c.categoryId === cats.health.id)!.status).toBe("unbudgeted");
    expect(s.overBudgetCount).toBe(1);
  });

  it("deducts credit-card spending from the credit amount instead of income", async () => {
    await addExpense({ amountMinor: 300000, categoryId: cats.food.id, date: "2026-09-05", paymentMethod: "upi" });
    await addExpense({ amountMinor: 120000, categoryId: cats.shopping.id, date: "2026-09-06", paymentMethod: "credit_card" });
    await addExpense({ amountMinor: 50000, categoryId: cats.savings.id, date: "2026-09-07", paymentMethod: "bank_transfer" });

    // Without a credit amount, everything comes out of income (unchanged behaviour).
    await agent.put("/api/plans/2026-09").set(H).send(plan(20000, { food: 5000 }));
    let s = await summary("2026-09");
    expect(s).toMatchObject({ creditMinor: 0, creditSpentMinor: 120000, spentFromIncomeMinor: 420000, remainingMinor: 2000000 - 420000 - 50000 });

    // With a credit amount, card spending is taken from the card.
    await agent.put("/api/plans/2026-09").set(H).send({ ...plan(20000, { food: 5000 }), creditMinor: 1000000 });
    expect((await agent.get("/api/plans/2026-09")).body.plan.creditMinor).toBe(1000000);
    s = await summary("2026-09");
    expect(s).toMatchObject({
      spentMinor: 420000, // total spending and budgets still include every payment method
      creditMinor: 1000000,
      creditSpentMinor: 120000,
      creditRemainingMinor: 880000,
      spentFromIncomeMinor: 300000,
      remainingMinor: 2000000 - 300000 - 50000,
      unallocatedMinor: 2000000 + 1000000 - 500000,
    });

    // Going over the card amount shows as a negative balance and an insight.
    await addExpense({ amountMinor: 900000, categoryId: cats.shopping.id, date: "2026-09-08", paymentMethod: "credit_card" });
    s = await summary("2026-09");
    expect(s.creditRemainingMinor).toBe(-20000);
    const insights = (await agent.get("/api/months/2026-09/insights?today=2026-09-25")).body.insights as { id: string }[];
    expect(insights.some((i) => i.id === "credit-over")).toBe(true);

    // The history list uses the same numbers, and the credit amount survives a backup round trip.
    const months = (await agent.get("/api/months")).body as { month: string; creditMinor: number; creditSpentMinor: number }[];
    expect(months.find((m) => m.month === "2026-09")).toMatchObject({ creditMinor: 1000000, creditSpentMinor: 1020000 });
    const backup = (await agent.get("/api/data/export.json")).body;
    await agent.post("/api/data/restore").set(H).send({ confirm: "REPLACE", backup }).expect(200);
    expect((await agent.get("/api/plans/2026-09")).body.plan.creditMinor).toBe(1000000);
  });

  it("returns sensible empty-month results", async () => {
    const s = await summary("2026-05");
    expect(s).toMatchObject({ hasPlan: false, spentMinor: 0, transactionCount: 0, budgetUtilization: null, savingsRate: null, changeMinor: null });
    const insights = (await agent.get("/api/months/2026-05/insights?today=2026-09-25")).body;
    expect(insights.status).toBe("insufficient");
    const analytics = (await agent.get("/api/months/2026-05/analytics?today=2026-09-25")).body;
    expect(analytics.daily).toHaveLength(31);
  });

  it("compares with the previous month", async () => {
    await addExpense({ amountMinor: 100000, categoryId: cats.food.id, date: "2026-07-03" });
    await addExpense({ amountMinor: 225000, categoryId: cats.food.id, date: "2026-08-03" });
    const s = await summary("2026-08");
    expect(s.changeMinor).toBe(125000);
    const insights = (await agent.get("/api/months/2026-08/insights?today=2026-09-25")).body;
    expect(insights.insights.some((i: { title: string }) => i.title.includes("₹1,250 higher"))).toBe(true);
  });
});

describe("import / export", () => {
  it("exports CSV and re-imports it atomically", async () => {
    await addExpense({ amountMinor: 25050, categoryId: cats.food.id, date: "2026-09-25", description: "=cmd", paymentMethod: "upi" });
    const csv = (await agent.get("/api/data/export.csv")).text;
    expect(csv).toContain("Date,Amount,Category,Description,Payment Method");
    expect(csv).toContain("2026-09-25,250.50,Food,'=cmd,UPI");

    const preview = await agent.post("/api/data/import/csv").set(H).send({ csv, dryRun: true });
    expect(preview.body).toMatchObject({ valid: true, validRows: 1, duplicates: 1, imported: 0 });
    const withDupes = await agent.post("/api/data/import/csv").set(H).send({ csv, dryRun: false, skipDuplicates: false });
    expect(withDupes.body.imported).toBe(1);
    const list = await agent.get("/api/expenses");
    expect(list.body.items[0].description).toBe("=cmd");
  });

  it("rejects the whole file when any row is invalid", async () => {
    const csv = "Date,Amount,Category\n2026-09-01,100,Food\n2026-09-02,-5,Food\n31/09/2026,10,Nope\n";
    const res = await agent.post("/api/data/import/csv").set(H).send({ csv, dryRun: false });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(2);
    expect((await agent.get("/api/expenses")).body.total).toBe(0);
  });

  it("round-trips a JSON backup", async () => {
    await agent.put("/api/plans/2026-09").set(H).send({ incomeMinor: 100, budgets: [{ categoryId: cats.food.id, amountMinor: 50 }] });
    await addExpense({ amountMinor: 999, categoryId: cats.food.id, date: "2026-09-02" });
    const backup = (await agent.get("/api/data/export.json")).body;
    await agent.post("/api/data/clear").set(H).send({ confirm: "DELETE" });
    expect((await agent.get("/api/expenses")).body.total).toBe(0);
    const restored = await agent.post("/api/data/restore").set(H).send({ confirm: "REPLACE", backup });
    expect(restored.status).toBe(200);
    expect((await agent.get("/api/expenses")).body.total).toBe(1);
    expect((await agent.get("/api/plans/2026-09")).body.plan.incomeMinor).toBe(100);
  });
});

describe("demo data", () => {
  it("is flagged and removable without touching real data", async () => {
    await addExpense({ amountMinor: 100, categoryId: cats.food.id, date: "2026-09-02" });
    const loaded = await agent.post("/api/data/demo?today=2026-09-25").set(H);
    expect(loaded.body.expenses).toBeGreaterThan(50);
    expect((await agent.post("/api/data/demo?today=2026-09-25").set(H)).status).toBe(409);
    await agent.delete("/api/data/demo").set(H);
    const status = (await agent.get("/api/data/status")).body;
    expect(status).toMatchObject({ expenseCount: 1, demoExpenseCount: 0, planCount: 0 });
  });
});

describe("errors", () => {
  it("returns JSON errors without internals", async () => {
    const res = await agent.post("/api/expenses").set(H).set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.message).not.toMatch(/SyntaxError|at /);
    expect((await agent.get("/api/nope")).status).toBe(404);
  });
});

describe("signup → approval → login", () => {
  it("keeps new accounts pending until the admin approves them", async () => {
    const signup = await request(app).post("/api/auth/signup").set(H).send({ email: "Bob@Example.com ", password: "bob-password-1" });
    expect(signup.status).toBe(202);
    const bob = (await getUserByEmail(db, "bob@example.com"))!;
    expect(bob.status).toBe("pending");
    expect(bob.password_hash).toMatch(/^scrypt:/);
    expect(bob.password_hash).not.toContain("bob-password-1");

    // Admin is notified with the email address.
    expect(sentMail.at(-1)).toMatchObject({ to: ADMIN.email });
    expect(sentMail.at(-1)!.text).toContain("bob@example.com");

    const pending = await request(app).post("/api/auth/login").set(H).send({ email: "bob@example.com", password: "bob-password-1" });
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe("pending_approval");
    expect(pending.headers["set-cookie"]).toBeUndefined();

    const admin = request.agent(app);
    await admin.post("/api/auth/login").set(H).send(ADMIN).expect(200);
    const list = await admin.get("/api/admin/users?status=pending");
    expect(list.body.map((u: { email: string }) => u.email)).toEqual(["bob@example.com"]);
    await admin.post(`/api/admin/users/${bob.id}/approve`).set(H).expect(200);

    const b = request.agent(app);
    await b.post("/api/auth/login").set(H).send({ email: "bob@example.com", password: "bob-password-1" }).expect(200);
    const session = await b.get("/api/auth/session");
    expect(session.body).toMatchObject({ authenticated: true, user: { email: "bob@example.com", role: "user" } });
    expect((await b.get("/api/categories")).body).toHaveLength(11);
  });

  it("rejects wrong passwords, and rejection blocks login and ends existing sessions", async () => {
    expect((await request(app).post("/api/auth/login").set(H).send({ email: "alice@example.com", password: "nope-nope-nope" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").set(H).send({ email: "ghost@example.com", password: "nope-nope-nope" })).status).toBe(401);

    const alice = (await getUserByEmail(db, "alice@example.com"))!;
    const admin = request.agent(app);
    await admin.post("/api/auth/login").set(H).send(ADMIN).expect(200);
    await admin.post(`/api/admin/users/${alice.id}/reject`).set(H).expect(200);

    expect((await agent.get("/api/expenses")).status).toBe(401); // existing session revoked
    const again = await request(app).post("/api/auth/login").set(H).send({ email: "alice@example.com", password: "user-password-1" });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("account_rejected");
  });

  it("does not reveal whether an email is registered and cannot create admins", async () => {
    const dup = await request(app).post("/api/auth/signup").set(H).send({ email: "alice@example.com", password: "another-password" });
    expect(dup.status).toBe(202);
    const adminDup = await request(app).post("/api/auth/signup").set(H).send({ email: ADMIN.email, password: "another-password", role: "admin" });
    expect(adminDup.status).toBe(202);
    expect((await getUserByEmail(db, ADMIN.email))!.password_hash).toBe(ADMIN_HASH);
    expect((await getUserByEmail(db, "alice@example.com"))!.role).toBe("user");
  });

  it("validates signup input and logs out", async () => {
    expect((await request(app).post("/api/auth/signup").set(H).send({ email: "not-an-email", password: "long-enough-pw" })).status).toBe(400);
    expect((await request(app).post("/api/auth/signup").set(H).send({ email: "c@example.com", password: "short" })).status).toBe(400);
    await agent.post("/api/auth/logout").set(H).expect(200);
    expect((await agent.get("/api/expenses")).status).toBe(401);
  });
});

describe("protected APIs", () => {
  it("require a session", async () => {
    for (const path of ["/api/expenses", "/api/categories", "/api/months/2026-09/summary", "/api/data/export.csv", "/api/settings"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post("/api/expenses").set(H).send({})).status).toBe(401);
  });

  it("admin APIs are forbidden for normal users", async () => {
    expect((await agent.get("/api/admin/users")).status).toBe(403);
    expect((await agent.post("/api/admin/users/1/approve").set(H)).status).toBe(403);
    expect((await request(app).get("/api/admin/overview")).status).toBe(401);
  });

  it("the admin account can't be rejected or deleted through the admin API", async () => {
    const admin = request.agent(app);
    await admin.post("/api/auth/login").set(H).send(ADMIN).expect(200);
    const adminId = (await getUserByEmail(db, ADMIN.email))!.id;
    expect((await admin.post(`/api/admin/users/${adminId}/reject`).set(H)).status).toBe(404);
    expect((await admin.delete(`/api/admin/users/${adminId}`).set(H)).status).toBe(404);
  });
});

describe("data isolation", () => {
  it("users only ever see and modify their own data", async () => {
    const bob = await approvedUser("bob@example.com");
    const bobCats = Object.fromEntries(((await bob.get("/api/categories")).body as Category[]).map((c) => [c.slug, c]));

    const a = await addExpense({ amountMinor: 50000, categoryId: cats.food.id, date: "2026-09-10", description: "Alice lunch" });
    await agent.put("/api/plans/2026-09").set(H).send({ incomeMinor: 2000000, budgets: [{ categoryId: cats.food.id, amountMinor: 300000 }] });
    await agent.put("/api/settings").set(H).send({ theme: "light" });

    // Bob sees nothing of Alice's.
    expect((await bob.get("/api/expenses")).body.total).toBe(0);
    expect((await bob.get("/api/months/2026-09/summary?today=2026-09-25")).body).toMatchObject({ spentMinor: 0, incomeMinor: 0, hasPlan: false });
    expect((await bob.get("/api/plans/2026-09")).body.plan).toBeNull();
    expect((await bob.get("/api/months")).body).toEqual([]);
    expect((await bob.get("/api/settings")).body.theme).toBe("dark");
    expect((await bob.get("/api/data/export.csv")).text).not.toContain("Alice lunch");
    expect((await bob.get("/api/data/export.json")).body.expenses).toHaveLength(0);

    // Guessing Alice's ids does not work.
    const id = a.body.id;
    expect((await bob.get(`/api/expenses/${id}`)).status).toBe(404);
    expect((await bob.put(`/api/expenses/${id}`).set(H).send({ amountMinor: 1, categoryId: bobCats.food.id, date: "2026-09-10" })).status).toBe(404);
    expect((await bob.delete(`/api/expenses/${id}`).set(H)).status).toBe(404);
    expect((await bob.patch(`/api/categories/${cats.food.id}`).set(H).send({ name: "Hacked" })).status).toBe(404);
    // Nor can Bob attach his records to Alice's categories.
    expect((await bob.post("/api/expenses").set(H).send({ amountMinor: 100, categoryId: cats.food.id, date: "2026-09-10" })).status).toBe(400);
    expect((await bob.put("/api/plans/2026-09").set(H).send({ incomeMinor: 1, budgets: [{ categoryId: cats.food.id, amountMinor: 1 }] })).status).toBe(400);

    // Bob's destructive actions stay inside his account.
    await bob.post("/api/data/clear").set(H).send({ confirm: "DELETE" }).expect(200);
    await bob.post("/api/data/demo?today=2026-09-25").set(H).expect(201);
    await bob.delete("/api/data/demo").set(H).expect(200);
    expect((await agent.get(`/api/expenses/${id}`)).status).toBe(200);
    expect((await agent.get("/api/plans/2026-09")).body.plan.incomeMinor).toBe(2000000);
    expect((await agent.get("/api/settings")).body.theme).toBe("light");
  });

  it("deleting a user removes only that user's data", async () => {
    const bob = await approvedUser("bob@example.com");
    const bobFood = ((await bob.get("/api/categories")).body as Category[]).find((c) => c.slug === "food")!;
    await bob.post("/api/expenses").set(H).send({ amountMinor: 700, categoryId: bobFood.id, date: "2026-09-01" }).expect(201);
    await addExpense({ amountMinor: 900, categoryId: cats.food.id, date: "2026-09-01" });

    const admin = request.agent(app);
    await admin.post("/api/auth/login").set(H).send(ADMIN).expect(200);
    await admin.delete(`/api/admin/users/${(await getUserByEmail(db, "bob@example.com"))!.id}`).set(H).expect(204);

    expect(await getUserByEmail(db, "bob@example.com")).toBeNull();
    expect((await db.execute("SELECT COUNT(*) AS n FROM expenses")).rows[0].n).toBe(1);
    expect((await bob.get("/api/expenses")).status).toBe(401);
    expect((await agent.get("/api/expenses")).body.total).toBe(1);
  });
});
