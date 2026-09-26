import { Link } from "react-router";
import { CircleAlert, CircleCheck, Target, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type { BudgetStatus, CategoryBreakdown, MonthSummary } from "../../../../shared/types";
import { useMoney } from "../../hooks";
import { CategoryBadge } from "../../utils/categoryIcon";
import { cn } from "../../utils/cn";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/Feedback";
import { ProgressBar } from "../ui/Progress";

const ORDER: Record<BudgetStatus, number> = { over: 0, warning: 1, unbudgeted: 2, ok: 3, none: 4 };

const STATUS_META: Partial<Record<BudgetStatus, { label: string; icon: typeof CircleAlert }>> = {
  over: { label: "Over budget", icon: CircleAlert },
  warning: { label: "Near limit", icon: TriangleAlert },
  unbudgeted: { label: "No budget", icon: CircleAlert },
  ok: { label: "On track", icon: CircleCheck },
};

export function BudgetProgress({ summary, className }: { summary: MonthSummary; className?: string }) {
  const { fmt } = useMoney();

  const { rows, savings, hidden } = useMemo(() => {
    const expense = summary.categories.filter((c) => c.kind === "expense");
    const rows = expense
      .filter((c) => c.status !== "none")
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.percentUsed ?? 0) - (a.percentUsed ?? 0));
    return {
      rows,
      savings: summary.categories.filter((c) => c.kind === "savings" && c.status !== "none"),
      hidden: expense.length - rows.length,
    };
  }, [summary.categories]);

  return (
    <Card className={cn("budget", className)} aria-labelledby="budget-title">
      <CardHeader
        id="budget-title"
        title="Budget progress"
        subtitle={
          summary.plannedSpendMinor > 0
            ? `${fmt(summary.spentMinor)} of ${fmt(summary.plannedSpendMinor)} across categories`
            : "Spending by category this month"
        }
        action={
          <Link to="/plan" className="btn btn--ghost btn--sm">
            Edit plan
          </Link>
        }
      />
      {rows.length === 0 && savings.length === 0 ? (
        <EmptyState
          compact
          icon={<Target size={20} />}
          title="No budgets yet"
          body="Set category budgets for this month to track progress here."
          action={
            <Link to="/plan" className="btn btn--primary btn--sm">
              Set up monthly plan
            </Link>
          }
        />
      ) : (
        <>
          <ul className="budget-list">
            {rows.map((c) => (
              <BudgetRow key={c.categoryId} c={c} />
            ))}
          </ul>
          {savings.length > 0 && (
            <ul className="budget-list budget-list--savings" aria-label="Savings">
              {savings.map((c) => (
                <BudgetRow key={c.categoryId} c={c} />
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <p className="budget__hint">
              {hidden} categor{hidden === 1 ? "y has" : "ies have"} no budget or spending this month.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function BudgetRow({ c }: { c: CategoryBreakdown }) {
  const { fmt } = useMoney();
  const savings = c.kind === "savings";
  const meta = savings ? null : STATUS_META[c.status];
  return (
    <li className={cn("budget-row", `is-${c.status}`, savings && "is-savings")}>
      <CategoryBadge icon={c.icon} color={c.color} size={34} />
      <div className="budget-row__main">
        <div className="budget-row__top">
          <span className="budget-row__name">{c.name}</span>
          <span className="budget-row__amounts">
            <strong>{fmt(c.spentMinor)}</strong>
            {c.budgetMinor > 0 && <span className="muted"> / {fmt(c.budgetMinor)}</span>}
          </span>
        </div>
        <ProgressBar
          value={c.budgetMinor > 0 ? c.percentUsed : c.spentMinor > 0 ? 100 : 0}
          status={savings ? "savings" : c.status}
          color={c.color}
          label={`${c.name}: ${c.budgetMinor > 0 ? `${c.percentUsed}% of budget ${savings ? "saved" : "used"}` : "no budget set"}`}
        />
        <div className="budget-row__bottom">
          {savings ? (
            <span className="muted">
              {c.budgetMinor > 0
                ? c.remainingMinor > 0
                  ? `${fmt(c.remainingMinor)} to reach target`
                  : "Target reached"
                : "No target set"}
            </span>
          ) : c.budgetMinor > 0 ? (
            <span className={cn(c.remainingMinor < 0 ? "text-negative" : "muted")}>
              {c.remainingMinor >= 0 ? `${fmt(c.remainingMinor)} left` : `${fmt(-c.remainingMinor)} over`}
            </span>
          ) : (
            <span className="muted">Not in this month's plan</span>
          )}
          <span className={cn("status-tag", `status-tag--${savings ? "savings" : c.status}`)}>
            {meta && <meta.icon size={12} aria-hidden="true" />}
            {savings ? `${c.percentUsed ?? 0}% saved` : c.percentUsed !== null ? `${c.percentUsed}%` : ""}
            {meta && c.status !== "ok" && <span>{meta.label}</span>}
            {meta && c.status === "ok" && <span className="sr-only">{meta.label}</span>}
          </span>
        </div>
      </div>
    </li>
  );
}
