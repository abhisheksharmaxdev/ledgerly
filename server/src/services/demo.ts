/**
 * Optional demo data for trying the app out.
 * Every demo row is flagged is_demo = 1, so it can be removed without touching real data,
 * and demo plans are never written over a month that already has a real plan.
 */
import type { DB } from "../db/connection";
import type { PaymentMethod } from "../../../shared/constants";
import { monthBounds, monthKeyOf, pad2, shiftMonth } from "../../../shared/dates";
import { listCategories } from "../repositories/categories";
import { getPlan, upsertPlan } from "../repositories/plans";
import { insertExpense } from "../repositories/expenses";

/** Deterministic PRNG so the demo looks the same on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = (rupees: number) => Math.round(rupees * 100);

const DEMO_PLAN: Record<string, number> = {
  rent: 8000,
  food: 4500,
  travel: 1500,
  mobile: 700,
  education: 1500,
  shopping: 1500,
  entertainment: 1000,
  health: 600,
  subscriptions: 500,
  other: 800,
  savings: 4000,
};
const DEMO_INCOME = 25000;

interface Template {
  slug: string;
  descriptions: string[];
  min: number;
  max: number;
  methods: PaymentMethod[];
  perMonth: [number, number];
}

const RANDOM_TEMPLATES: Template[] = [
  { slug: "food", descriptions: ["Canteen lunch", "Groceries", "Tea & snacks", "Dinner out", "Breakfast", "Fruit", "Food delivery"], min: 40, max: 420, methods: ["upi", "upi", "cash"], perMonth: [18, 24] },
  { slug: "travel", descriptions: ["Auto rickshaw", "Metro card top-up", "Bus pass", "Cab ride", "Bike fuel"], min: 30, max: 260, methods: ["cash", "upi"], perMonth: [7, 11] },
  { slug: "education", descriptions: ["Printouts", "Reference book", "Stationery", "Lab manual"], min: 40, max: 650, methods: ["cash", "upi"], perMonth: [1, 3] },
  { slug: "shopping", descriptions: ["T-shirt", "Toiletries", "Shoes", "Backpack", "Earphones"], min: 180, max: 900, methods: ["upi", "debit_card", "credit_card"], perMonth: [1, 3] },
  { slug: "entertainment", descriptions: ["Movie ticket", "Bowling with friends", "Concert ticket", "Game top-up"], min: 150, max: 450, methods: ["upi", "credit_card"], perMonth: [2, 3] },
  { slug: "health", descriptions: ["Pharmacy", "Clinic visit", "Vitamins"], min: 80, max: 380, methods: ["cash", "upi"], perMonth: [0, 2] },
  { slug: "other", descriptions: ["Laundry", "Gift for a friend", "Haircut", "Donation"], min: 50, max: 300, methods: ["cash", "upi", "other"], perMonth: [2, 4] },
];

export function loadDemoData(db: DB, userId: number, today: string, monthsBack = 4): { expenses: number; plans: number; skippedPlans: number } {
  const categories = listCategories(db, userId);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const rand = mulberry32(20260925);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const currentMonth = monthKeyOf(today);

  let expenses = 0;
  let plans = 0;
  let skippedPlans = 0;

  db.transaction(() => {
    for (let back = monthsBack - 1; back >= 0; back--) {
      const month = shiftMonth(currentMonth, -back);
      const { days } = monthBounds(month);
      const lastDay = back === 0 ? Number(today.slice(8, 10)) : days;
      const intensity = [0.86, 0.97, 1.04, 1.1][monthsBack - 1 - back] ?? 1;

      if (getPlan(db, userId, month)) skippedPlans++;
      else {
        upsertPlan(
          db,
          userId,
          month,
          {
            incomeMinor: R(DEMO_INCOME),
            budgets: Object.entries(DEMO_PLAN)
              .filter(([slug]) => bySlug.has(slug))
              .map(([slug, rupees]) => ({ categoryId: bySlug.get(slug)!.id, amountMinor: R(rupees) })),
          },
          { isDemo: true },
        );
        plans++;
      }

      const add = (slug: string, day: number, rupees: number, description: string, method: PaymentMethod | null) => {
        const cat = bySlug.get(slug);
        if (!cat || day > lastDay) return;
        insertExpense(
          db,
          userId,
          { amountMinor: R(rupees), categoryId: cat.id, date: `${month}-${pad2(day)}`, description, paymentMethod: method },
          true,
        );
        expenses++;
      };

      // Fixed monthly items.
      add("rent", 1, 8000, "Hostel rent", "bank_transfer");
      add("mobile", 3, 299, "Prepaid recharge", "upi");
      add("mobile", 6, 399, "Broadband bill", "upi");
      add("subscriptions", 8, 119, "Music streaming", "credit_card");
      add("subscriptions", 14, 199, "Video streaming", "credit_card");
      add("savings", 5, 2000, "Mutual fund SIP", "bank_transfer");
      add("savings", 20, back === 0 ? 1500 : Math.round(between(1200, 2200) / 100) * 100, "Recurring deposit", "bank_transfer");
      add("travel", 15, Math.round(between(350, 520)), "Train ticket home", "upi");

      for (const t of RANDOM_TEMPLATES) {
        const n = Math.round(between(t.perMonth[0], t.perMonth[1]) * (t.slug === "food" ? intensity : 1));
        for (let i = 0; i < n; i++) {
          const day = 1 + Math.floor(rand() * days);
          const date = `${month}-${pad2(day)}`;
          const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
          const weekendBoost = dow === 0 || dow === 6 ? 1.35 : 1;
          const amount = Math.round(between(t.min, t.max) * weekendBoost * intensity);
          add(t.slug, day, amount, pick(t.descriptions), pick(t.methods));
        }
      }
      // Push one category over budget in the latest month so that state is visible.
      if (back === 0) add("shopping", Math.min(lastDay, 12), 1290, "Winter jacket", "credit_card");
    }
  })();

  return { expenses, plans, skippedPlans };
}

export function removeDemoData(db: DB, userId: number): { expenses: number; plans: number } {
  return db.transaction(() => {
    const expenses = db.prepare("DELETE FROM expenses WHERE is_demo = 1 AND user_id = ?").run(userId).changes;
    const plans = db.prepare("DELETE FROM monthly_plans WHERE is_demo = 1 AND user_id = ?").run(userId).changes;
    return { expenses, plans };
  })();
}

export function demoCounts(db: DB, userId: number): { expenses: number; plans: number } {
  const e = db.prepare("SELECT COUNT(*) AS n FROM expenses WHERE is_demo = 1 AND user_id = ?").get(userId) as { n: number };
  const p = db.prepare("SELECT COUNT(*) AS n FROM monthly_plans WHERE is_demo = 1 AND user_id = ?").get(userId) as { n: number };
  return { expenses: e.n, plans: p.n };
}
