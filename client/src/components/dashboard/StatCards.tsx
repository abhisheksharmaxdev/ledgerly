import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight, IndianRupee, PiggyBank, ReceiptText, Target, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { monthName } from "../../../../shared/dates";
import type { MonthSummary } from "../../../../shared/types";
import { useMoney } from "../../hooks";
import { cn } from "../../utils/cn";
import { Card } from "../ui/Card";
import { AnimatedMoney } from "../ui/Money";
import { ProgressBar, Ring } from "../ui/Progress";

function Stat({ icon, label, children, foot, className }: { icon: ReactNode; label: string; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <Card tilt as="article" className={cn("stat", className)} aria-label={label}>
      <div className="stat__head">
        <span className="stat__icon" aria-hidden="true">
          {icon}
        </span>
        <h3 className="stat__label">{label}</h3>
      </div>
      <div className="stat__body">{children}</div>
      {foot && <div className="stat__foot">{foot}</div>}
    </Card>
  );
}

export function StatCards({ summary }: { summary: MonthSummary }) {
  const { fmt, currency } = useMoney();
  const prev = monthName(summary.previous.month, true);
  const change = summary.changeMinor;
  const CurrencyIcon = currency === "INR" ? IndianRupee : Wallet;

  return (
    <div className="stats area-stats">
      <Stat
        icon={<CurrencyIcon size={16} />}
        label="Monthly income"
        foot={
          summary.hasPlan ? (
            <span className="muted">
              {summary.creditMinor > 0 && <>+ {fmt(summary.creditMinor)} credit card · </>}
              {fmt(summary.plannedSpendMinor)} planned · {fmt(summary.savingsTargetMinor)} to save ·{" "}
              <span className={cn(summary.unallocatedMinor < 0 && "text-negative")}>
                {summary.unallocatedMinor < 0 ? `${fmt(-summary.unallocatedMinor)} over-allocated` : `${fmt(summary.unallocatedMinor)} unallocated`}
              </span>
            </span>
          ) : (
            <Link to="/plan" className="link-inline">
              Set your income →
            </Link>
          )
        }
      >
        <AnimatedMoney minor={summary.incomeMinor} className="stat__value" />
      </Stat>

      <Stat
        icon={<ReceiptText size={16} />}
        label="Total expenses"
        foot={
          change !== null && change !== 0 ? (
            <span className={cn("delta", change > 0 ? "delta--up" : "delta--down")}>
              {change > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
              {fmt(Math.abs(change))} {change > 0 ? "more" : "less"} than {summary.period === "current" ? `this point in ${prev}` : prev}
            </span>
          ) : (
            <span className="muted">
              {summary.transactionCount} transaction{summary.transactionCount === 1 ? "" : "s"}
              {change === null ? ` · no ${prev} data to compare` : ` · same as ${prev}`}
            </span>
          )
        }
      >
        <AnimatedMoney minor={summary.spentMinor} className="stat__value" />
      </Stat>

      <Stat
        icon={<Target size={16} />}
        label={summary.budgetRemainingMinor < 0 ? "Over budget" : "Budget remaining"}
        foot={
          summary.plannedSpendMinor > 0 ? (
            <span className="muted">
              {summary.budgetUtilization}% of {fmt(summary.plannedSpendMinor)} used
              {summary.overBudgetCount > 0 && <> · <span className="text-negative">{summary.overBudgetCount} over</span></>}
              {summary.warningCount > 0 && <> · <span className="text-warning">{summary.warningCount} near limit</span></>}
            </span>
          ) : (
            <Link to="/plan" className="link-inline">
              Add category budgets →
            </Link>
          )
        }
      >
        <div className="stat__row">
          <AnimatedMoney
            minor={Math.abs(summary.budgetRemainingMinor)}
            className={cn("stat__value", summary.budgetRemainingMinor < 0 && "is-negative")}
          />
          {summary.plannedSpendMinor > 0 && (
            <Ring
              value={summary.budgetUtilization}
              size={48}
              stroke={5}
              tone={(summary.budgetUtilization ?? 0) > 100 ? "negative" : (summary.budgetUtilization ?? 0) >= 80 ? "warning" : "accent"}
              label={`${summary.budgetUtilization}% of budget used`}
            />
          )}
        </div>
      </Stat>

      <Stat
        icon={<PiggyBank size={16} />}
        label="Savings"
        className="stat--savings"
        foot={
          summary.savingsTargetMinor > 0 ? (
            <div className="stat__savings-foot">
              <ProgressBar value={summary.savingsProgress} status="savings" label="Savings target progress" />
              <span className="muted">
                {summary.savingsProgress ?? 0}% of {fmt(summary.savingsTargetMinor)} target
                {summary.savingsRate !== null && ` · ${summary.savingsRate}% rate`}
              </span>
            </div>
          ) : (
            <span className="muted">
              {summary.savingsRate !== null ? `Savings rate ${summary.savingsRate}%` : "Set a savings target in your plan"}
            </span>
          )
        }
      >
        <AnimatedMoney minor={summary.savedMinor} className="stat__value" />
      </Stat>
    </div>
  );
}
