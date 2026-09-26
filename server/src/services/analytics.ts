import type { DB } from "../db/connection";
import type { DailyPoint, MonthAnalytics, MonthListItem, PaymentBreakdown, TrendPoint } from "../../../shared/types";
import { PAYMENT_METHODS } from "../../../shared/constants";
import { dayOfWeek, isWeekend, monthBounds, pad2, shiftMonth } from "../../../shared/dates";
import { dailyTotals, largestExpense, monthlyTotals, paymentTotals } from "../repositories/expenses";
import { planTotals } from "../repositories/plans";
import { periodOf } from "./summary";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function buildMonthAnalytics(db: DB, userId: number, month: string, today: string): Promise<MonthAnalytics> {
  const { start, end, days } = monthBounds(month);
  const period = periodOf(month, today);
  const lastCountedDay = period === "past" ? days : period === "current" ? Number(today.slice(8, 10)) : 0;

  const [dailyRows, paymentRows, largest] = await Promise.all([
    dailyTotals(db, userId, start, end),
    paymentTotals(db, userId, start, end),
    largestExpense(db, userId, start, end),
  ]);

  const byDate = new Map<string, { spent: number; saved: number; count: number }>();
  for (const row of dailyRows) {
    const d = byDate.get(row.date) ?? { spent: 0, saved: 0, count: 0 };
    if (row.kind === "savings") d.saved += row.totalMinor;
    else d.spent += row.totalMinor;
    d.count += row.count;
    byDate.set(row.date, d);
  }

  const daily: DailyPoint[] = [];
  let cumulative = 0;
  const weekdayTotals = new Array<number>(7).fill(0);
  let weekdaySum = 0,
    weekendSum = 0,
    weekdayDays = 0,
    weekendDays = 0;

  for (let day = 1; day <= days; day++) {
    const date = `${month}-${pad2(day)}`;
    const d = byDate.get(date) ?? { spent: 0, saved: 0, count: 0 };
    cumulative += d.spent;
    daily.push({ date, spentMinor: d.spent, savedMinor: d.saved, count: d.count, cumulativeMinor: cumulative });
    weekdayTotals[dayOfWeek(date)] += d.spent;
    if (day <= lastCountedDay) {
      if (isWeekend(date)) (weekendSum += d.spent), weekendDays++;
      else (weekdaySum += d.spent), weekdayDays++;
    }
  }

  const payRows = new Map(paymentRows.map((r) => [r.method ?? "none", r]));
  const paymentMethods: PaymentBreakdown[] = [
    ...PAYMENT_METHODS.map((p) => ({ method: p.value, label: p.label })),
    { method: "none" as const, label: "Unspecified" },
  ].map(({ method, label }) => ({
    method,
    label,
    amountMinor: payRows.get(method)?.totalMinor ?? 0,
    count: payRows.get(method)?.count ?? 0,
  }));

  return {
    month,
    daily,
    paymentMethods,
    weekdayPattern: {
      weekdayAvgMinor: weekdayDays ? Math.round(weekdaySum / weekdayDays) : 0,
      weekendAvgMinor: weekendDays ? Math.round(weekendSum / weekendDays) : 0,
      weekdayDays,
      weekendDays,
    },
    byWeekday: WEEKDAY_ORDER.map((dow) => ({ dow, label: WEEKDAY_LABELS[dow], amountMinor: weekdayTotals[dow] })),
    largestExpense: largest,
  };
}

/** Spending/saving/income for `count` months ending at `endMonth` (inclusive). */
export async function buildTrend(db: DB, userId: number, endMonth: string, count: number): Promise<TrendPoint[]> {
  const firstMonth = shiftMonth(endMonth, -(count - 1));
  const [totals, planRows] = await Promise.all([
    monthlyTotals(db, userId, `${firstMonth}-01`, monthBounds(endMonth).end),
    planTotals(db, userId),
  ]);
  const plans = new Map(planRows.map((p) => [p.month, p]));
  const points: TrendPoint[] = [];
  for (let i = 0; i < count; i++) {
    const month = shiftMonth(firstMonth, i);
    const rows = totals.filter((t) => t.month === month);
    const plan = plans.get(month);
    points.push({
      month,
      incomeMinor: plan?.incomeMinor ?? 0,
      spentMinor: rows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.totalMinor, 0),
      savedMinor: rows.filter((r) => r.kind === "savings").reduce((s, r) => s + r.totalMinor, 0),
      plannedSpendMinor: plan?.plannedSpendMinor ?? 0,
      hasPlan: !!plan,
      count: rows.reduce((s, r) => s + r.count, 0),
    });
  }
  return points;
}

/** Every month that has a plan or at least one expense, newest first. */
export async function listMonths(db: DB, userId: number): Promise<MonthListItem[]> {
  const [planRows, totalRows] = await Promise.all([planTotals(db, userId), monthlyTotals(db, userId)]);
  const map = new Map<string, MonthListItem>();
  const get = (month: string) => {
    let item = map.get(month);
    if (!item) {
      item = { month, hasPlan: false, incomeMinor: 0, spentMinor: 0, savedMinor: 0, count: 0 };
      map.set(month, item);
    }
    return item;
  };
  for (const p of planRows) Object.assign(get(p.month), { hasPlan: true, incomeMinor: p.incomeMinor });
  for (const t of totalRows) {
    const item = get(t.month);
    if (t.kind === "savings") item.savedMinor += t.totalMinor;
    else item.spentMinor += t.totalMinor;
    item.count += t.count;
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}
