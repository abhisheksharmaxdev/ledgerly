/**
 * Plain-language observations derived strictly from stored data.
 * Each rule only fires when the data it needs exists; nothing is estimated silently
 * (projections are explicitly labelled as such).
 */
import type { Category, Insight, InsightsResponse, MonthAnalytics, MonthSummary } from "../../../shared/types";
import type { CurrencyCode } from "../../../shared/constants";
import { formatMoney } from "../../../shared/money";
import { formatDay, monthLabel, monthName } from "../../../shared/dates";

export function buildInsights(
  summary: MonthSummary,
  analytics: MonthAnalytics,
  categories: Category[],
  currency: CurrencyCode,
): InsightsResponse {
  const fmt = (minor: number) => formatMoney(minor, currency);
  const insights: Insight[] = [];
  const { month, period } = summary;
  const when = period === "current" ? "this month" : `in ${monthName(month)}`;
  const hasExpenses = summary.transactionCount > 0;

  if (!hasExpenses && !summary.hasPlan) {
    return {
      month,
      status: "insufficient",
      message:
        period === "future"
          ? `${monthLabel(month)} hasn't started yet. Set up a plan to see how your budget is allocated.`
          : `Not enough data for ${monthLabel(month)} yet. Add expenses or set up a monthly plan to unlock insights.`,
      insights: [],
    };
  }

  const expenseCats = summary.categories.filter((c) => c.kind === "expense");

  // 1. Over-budget categories (most severe first).
  const over = expenseCats.filter((c) => c.status === "over").sort((a, b) => a.remainingMinor - b.remainingMinor);
  for (const c of over.slice(0, 2)) {
    insights.push({
      id: `over-${c.categoryId}`,
      tone: "negative",
      title: `${c.name} is over budget by ${fmt(-c.remainingMinor)}.`,
      detail: `Spent ${fmt(c.spentMinor)} of a ${fmt(c.budgetMinor)} budget (${c.percentUsed}%).`,
    });
  }

  // 2. Overall monthly budget position.
  if (summary.hasPlan && summary.plannedSpendMinor > 0) {
    if (summary.budgetRemainingMinor >= 0) {
      const daysLeft = summary.daysInMonth - summary.daysElapsed;
      const perDay = period === "current" && daysLeft > 0 ? Math.floor(summary.budgetRemainingMinor / daysLeft) : null;
      insights.push({
        id: "budget-remaining",
        tone: summary.budgetUtilization !== null && summary.budgetUtilization >= 90 ? "warning" : "positive",
        title: `You have ${fmt(summary.budgetRemainingMinor)} remaining from your monthly budget.`,
        detail:
          perDay !== null
            ? `That's about ${fmt(perDay)} per day for the remaining ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
            : `${summary.budgetUtilization ?? 0}% of the ${fmt(summary.plannedSpendMinor)} budget used.`,
      });
    } else {
      insights.push({
        id: "budget-exceeded",
        tone: "negative",
        title: `You've exceeded your monthly budget by ${fmt(-summary.budgetRemainingMinor)}.`,
        detail: `Spent ${fmt(summary.spentMinor)} against a plan of ${fmt(summary.plannedSpendMinor)}.`,
      });
    }
  }

  // 3. Categories approaching their limit.
  const warning = expenseCats.filter((c) => c.status === "warning").sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0));
  for (const c of warning.slice(0, 2)) {
    insights.push({
      id: `warning-${c.categoryId}`,
      tone: "warning",
      title: `You have used ${c.percentUsed}% of your ${c.name} budget.`,
      detail: `${fmt(c.remainingMinor)} left of ${fmt(c.budgetMinor)}.`,
    });
  }

  // 4. Highest spending category.
  const top = [...expenseCats].sort((a, b) => b.spentMinor - a.spentMinor)[0];
  if (top && top.spentMinor > 0) {
    const usage =
      top.percentUsed !== null && top.status === "ok" ? ` You've used ${top.percentUsed}% of its budget.` : "";
    insights.push({
      id: "top-category",
      tone: "neutral",
      title: `${top.name} is your highest spending category ${when}.`,
      detail: `${fmt(top.spentMinor)} · ${top.sharePercent}% of your spending.${usage}`,
    });
  }

  if (!hasExpenses) {
    insights.push({
      id: "no-expenses",
      tone: "neutral",
      title: period === "future" ? "This month hasn't started yet." : `No expenses recorded ${when} yet.`,
      detail: "Insights on spending will appear once you add expenses.",
    });
  }

  // 5. Month-over-month comparison.
  if (summary.changeMinor !== null && hasExpenses) {
    const prev = monthName(summary.previous.month);
    const diff = Math.abs(summary.changeMinor);
    const pct = summary.changePercent !== null ? ` (${Math.abs(summary.changePercent)}%)` : "";
    if (summary.changeMinor === 0) {
      insights.push({ id: "mom", tone: "neutral", title: `Your spending matches ${prev} exactly.` });
    } else if (period === "current") {
      insights.push({
        id: "mom",
        tone: summary.changeMinor > 0 ? "warning" : "positive",
        title: `You've spent ${fmt(diff)} ${summary.changeMinor > 0 ? "more" : "less"} than by this point in ${prev}${pct}.`,
        detail: `${fmt(summary.spentMinor)} so far vs ${fmt(summary.previous.samePeriodSpentMinor ?? 0)} by day ${summary.daysElapsed} of ${prev}.`,
      });
    } else {
      insights.push({
        id: "mom",
        tone: summary.changeMinor > 0 ? "warning" : "positive",
        title: `Your spending is ${fmt(diff)} ${summary.changeMinor > 0 ? "higher" : "lower"} than ${prev}${pct}.`,
        detail: `${fmt(summary.spentMinor)} in ${monthName(month)} vs ${fmt(summary.previous.spentMinor)} in ${prev}.`,
      });
    }
  }

  // 6. Savings.
  if (summary.incomeMinor > 0 && summary.savedMinor > 0) {
    insights.push({
      id: "savings-rate",
      tone: (summary.savingsRate ?? 0) >= 20 ? "positive" : "neutral",
      title: `Your savings rate is ${summary.savingsRate}%.`,
      detail:
        summary.savingsTargetMinor > 0
          ? `${fmt(summary.savedMinor)} saved of your ${fmt(summary.savingsTargetMinor)} target (${summary.savingsProgress}%).`
          : `${fmt(summary.savedMinor)} saved from ${fmt(summary.incomeMinor)} income.`,
    });
  } else if (summary.savingsTargetMinor > 0 && summary.savedMinor === 0 && period !== "future") {
    insights.push({
      id: "savings-none",
      tone: "warning",
      title: `No savings recorded ${when} yet.`,
      detail: `Your savings target is ${fmt(summary.savingsTargetMinor)}. Log transfers under a savings category to track it.`,
    });
  }

  // 7. Pace projection (current month only, needs a few days of data).
  if (period === "current" && summary.daysElapsed >= 5 && summary.spentMinor > 0 && summary.plannedSpendMinor > 0) {
    const projected = Math.round((summary.spentMinor / summary.daysElapsed) * summary.daysInMonth);
    const gap = projected - summary.plannedSpendMinor;
    insights.push({
      id: "projection",
      tone: gap > 0 ? "warning" : "positive",
      title:
        gap > 0
          ? `At your current pace you'd spend about ${fmt(projected)} this month.`
          : `You're on track: about ${fmt(projected)} projected against a ${fmt(summary.plannedSpendMinor)} plan.`,
      detail:
        gap > 0
          ? `That's roughly ${fmt(gap)} over plan. Projection uses your daily average so far (${fmt(summary.avgDailySpentMinor)}/day).`
          : `Projection uses your daily average so far (${fmt(summary.avgDailySpentMinor)}/day).`,
    });
  }

  // 8. Weekend vs weekday pattern.
  const wp = analytics.weekdayPattern;
  if (summary.transactionCount >= 5 && wp.weekendDays >= 2 && wp.weekdayDays >= 3) {
    const { weekendAvgMinor: we, weekdayAvgMinor: wd } = wp;
    if (we > wd * 1.15 && we > 0) {
      insights.push({
        id: "weekend",
        tone: "neutral",
        title: `You spent more on weekends ${when}.`,
        detail: `Average ${fmt(we)} per weekend day vs ${fmt(wd)} per weekday.`,
      });
    } else if (wd > we * 1.15 && wd > 0) {
      insights.push({
        id: "weekday",
        tone: "neutral",
        title: `You spent more on weekdays ${when}.`,
        detail: `Average ${fmt(wd)} per weekday vs ${fmt(we)} per weekend day.`,
      });
    }
  }

  // 9. Spending in categories without a budget.
  if (summary.hasPlan) {
    const unbudgeted = expenseCats.filter((c) => c.status === "unbudgeted");
    const total = unbudgeted.reduce((s, c) => s + c.spentMinor, 0);
    if (total > 0) {
      insights.push({
        id: "unbudgeted",
        tone: "warning",
        title: `${fmt(total)} was spent in categories without a budget.`,
        detail: unbudgeted.map((c) => c.name).join(", "),
      });
    }
  }

  // 10. Largest single expense.
  const largest = analytics.largestExpense;
  if (largest && summary.transactionCount >= 3) {
    const cat = categories.find((c) => c.id === largest.categoryId);
    insights.push({
      id: "largest",
      tone: "neutral",
      title: `Your largest expense ${when} was ${fmt(largest.amountMinor)}${cat ? ` on ${cat.name}` : ""}.`,
      detail: [largest.description, formatDay(largest.date, "medium")].filter(Boolean).join(" · "),
    });
  }

  return { month, status: "ok", message: null, insights };
}
