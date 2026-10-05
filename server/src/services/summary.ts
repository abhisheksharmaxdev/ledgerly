import type { DB } from "../db/connection";
import type { BudgetStatus, CategoryBreakdown, MonthSummary } from "../../../shared/types";
import { BUDGET_WARNING_RATIO } from "../../../shared/constants";
import { percent } from "../../../shared/money";
import { daysInMonth, monthBounds, monthKeyOf, pad2, parseMonthKey, shiftMonth } from "../../../shared/dates";
import { listCategories } from "../repositories/categories";
import { getPlan } from "../repositories/plans";
import { monthlyTotals, paymentTotals, spendingBetween, totalsByCategory } from "../repositories/expenses";

export function periodOf(month: string, today: string): MonthSummary["period"] {
  const current = monthKeyOf(today);
  return month < current ? "past" : month > current ? "future" : "current";
}

export function budgetStatus(budgetMinor: number, spentMinor: number): BudgetStatus {
  if (budgetMinor === 0) return spentMinor === 0 ? "none" : "unbudgeted";
  if (spentMinor > budgetMinor) return "over";
  if (spentMinor >= budgetMinor * BUDGET_WARNING_RATIO) return "warning";
  return "ok";
}

/** Every number on the dashboard is derived here, from database rows only. */
export async function buildMonthSummary(db: DB, userId: number, month: string, today: string): Promise<MonthSummary> {
  const { start, end, days } = monthBounds(month);
  const period = periodOf(month, today);
  const daysElapsed = period === "past" ? days : period === "current" ? Number(today.slice(8, 10)) : 0;

  const prevMonth = shiftMonth(month, -1);
  const prevBounds = monthBounds(prevMonth);
  const { year: prevYear, month: prevM } = parseMonthKey(prevMonth);
  const samePeriodEnd = `${prevMonth}-${pad2(Math.min(daysElapsed, daysInMonth(prevYear, prevM)))}`;

  // Independent queries run in parallel (each one is a network round trip on a hosted database).
  const [categories, plan, totalRows, paymentRows, prevRows, samePeriodSpent, todaySpent] = await Promise.all([
    listCategories(db, userId),
    getPlan(db, userId, month),
    totalsByCategory(db, userId, start, end),
    paymentTotals(db, userId, start, end),
    monthlyTotals(db, userId, prevBounds.start, prevBounds.end),
    period === "current" ? spendingBetween(db, userId, prevBounds.start, samePeriodEnd) : null,
    period === "current" ? spendingBetween(db, userId, today, today) : null,
  ]);
  const budgetById = new Map((plan?.budgets ?? []).map((b) => [b.categoryId, b.amountMinor]));
  const totals = new Map(totalRows.map((t) => [t.categoryId, t]));

  let spentMinor = 0;
  let savedMinor = 0;
  let plannedSpendMinor = 0;
  let savingsTargetMinor = 0;
  let transactionCount = 0;

  for (const c of categories) {
    const spent = totals.get(c.id)?.totalMinor ?? 0;
    const budget = budgetById.get(c.id) ?? 0;
    transactionCount += totals.get(c.id)?.count ?? 0;
    if (c.kind === "savings") {
      savedMinor += spent;
      savingsTargetMinor += budget;
    } else {
      spentMinor += spent;
      plannedSpendMinor += budget;
    }
  }

  const breakdown: CategoryBreakdown[] = categories
    .filter((c) => !c.archived || budgetById.get(c.id) || totals.get(c.id))
    .map((c) => {
      const spent = totals.get(c.id)?.totalMinor ?? 0;
      const budget = budgetById.get(c.id) ?? 0;
      const status: BudgetStatus =
        c.kind === "savings" ? (budget === 0 && spent === 0 ? "none" : "ok") : budgetStatus(budget, spent);
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        kind: c.kind,
        archived: c.archived,
        budgetMinor: budget,
        spentMinor: spent,
        remainingMinor: budget - spent,
        percentUsed: budget > 0 ? percent(spent, budget) : null,
        status,
        count: totals.get(c.id)?.count ?? 0,
        sharePercent: c.kind === "expense" ? percent(spent, spentMinor) : null,
      };
    });

  const incomeMinor = plan?.incomeMinor ?? 0;

  // Credit-card spending comes out of the card instead of income, but only once the month has a
  // credit amount; without one, everything is paid from income as before.
  const creditMinor = plan?.creditMinor ?? 0;
  const creditSpentMinor = paymentRows.find((r) => r.method === "credit_card")?.totalMinor ?? 0;
  const spentFromIncomeMinor = creditMinor > 0 ? spentMinor - creditSpentMinor : spentMinor;

  // Previous month comparison.
  const prevSpent = prevRows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.totalMinor, 0);
  const prevSaved = prevRows.filter((r) => r.kind === "savings").reduce((s, r) => s + r.totalMinor, 0);
  const prevCount = prevRows.reduce((s, r) => s + r.count, 0);
  const samePeriodSpentMinor = samePeriodSpent;

  let changeMinor: number | null = null;
  let changePercent: number | null = null;
  if (prevCount > 0 && period !== "future") {
    const base = period === "current" ? samePeriodSpentMinor! : prevSpent;
    changeMinor = spentMinor - base;
    changePercent = percent(changeMinor, base);
  }

  const todaySpentMinor = todaySpent;

  const expenseBreakdown = breakdown.filter((b) => b.kind === "expense");

  return {
    month,
    hasPlan: plan !== null,
    planIsDemo: plan?.isDemo ?? false,
    period,
    daysInMonth: days,
    daysElapsed,
    incomeMinor,
    spentMinor,
    savedMinor,
    plannedSpendMinor,
    savingsTargetMinor,
    unallocatedMinor: incomeMinor + creditMinor - plannedSpendMinor - savingsTargetMinor,
    creditMinor,
    creditSpentMinor,
    creditRemainingMinor: creditMinor - creditSpentMinor,
    spentFromIncomeMinor,
    remainingMinor: incomeMinor - spentFromIncomeMinor - savedMinor,
    budgetRemainingMinor: plannedSpendMinor - spentMinor,
    budgetUtilization: percent(spentMinor, plannedSpendMinor),
    savingsRate: percent(savedMinor, incomeMinor),
    savingsProgress: percent(savedMinor, savingsTargetMinor),
    transactionCount,
    todaySpentMinor,
    avgDailySpentMinor: daysElapsed > 0 ? Math.round(spentMinor / daysElapsed) : 0,
    previous: {
      month: prevMonth,
      spentMinor: prevSpent,
      savedMinor: prevSaved,
      hasData: prevCount > 0,
      samePeriodSpentMinor,
    },
    changeMinor,
    changePercent,
    categories: breakdown,
    overBudgetCount: expenseBreakdown.filter((b) => b.status === "over").length,
    warningCount: expenseBreakdown.filter((b) => b.status === "warning").length,
  };
}
