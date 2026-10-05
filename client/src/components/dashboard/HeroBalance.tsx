import { Link } from "react-router";
import { ArrowRight, CalendarDays, CreditCard } from "lucide-react";
import { monthName } from "../../../../shared/dates";
import { percent } from "../../../../shared/money";
import type { MonthSummary } from "../../../../shared/types";
import { useMoney } from "../../hooks";
import { cn } from "../../utils/cn";
import { Card } from "../ui/Card";
import { AnimatedMoney } from "../ui/Money";
import { ProgressBar } from "../ui/Progress";

/** The first thing on screen: how much money is left this month, and why. */
export function HeroBalance({ summary }: { summary: MonthSummary }) {
  const { fmt } = useMoney();
  const { incomeMinor: income, spentMinor: totalSpent, savedMinor: saved, remainingMinor: remaining } = summary;
  // What came out of income; credit-card spending is shown against the card instead.
  const spent = summary.spentFromIncomeMinor;
  const hasCredit = summary.creditMinor > 0;
  const creditUsed = percent(summary.creditSpentMinor, summary.creditMinor);
  const name = monthName(summary.month);
  const noPlan = !summary.hasPlan || income === 0;

  const scale = Math.max(income, spent + saved, 1);
  const seg = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const progress = summary.daysInMonth ? Math.round((summary.daysElapsed / summary.daysInMonth) * 100) : 0;

  return (
    <Card tilt variant="hero" className="hero area-hero" aria-labelledby="hero-title">
      <div className="hero__stack" aria-hidden="true" />
      <div className="hero__top depth-1">
        <h2 id="hero-title" className="eyebrow">
          {noPlan ? `Spent in ${name}` : `Money left · ${name}`}
        </h2>
        <span className="period-chip">
          <CalendarDays size={13} aria-hidden="true" />
          {summary.period === "current"
            ? `Day ${summary.daysElapsed} of ${summary.daysInMonth}`
            : summary.period === "past"
              ? "Closed month"
              : "Upcoming"}
        </span>
      </div>

      <div className="depth-3">
        {noPlan ? (
          <AnimatedMoney minor={totalSpent} className="hero__value" />
        ) : (
          <AnimatedMoney minor={remaining} className={cn("hero__value", remaining < 0 && "is-negative")} />
        )}
      </div>

      <p className="hero__sub depth-2">
        {noPlan ? (
          <>
            Add your {name} income to see what's left.{" "}
            <Link to="/plan" className="link-inline">
              Set up plan <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </>
        ) : remaining < 0 ? (
          <>You've used {fmt(-remaining)} more than your {fmt(income)} income.</>
        ) : (
          <>
            of {fmt(income)} income, after {fmt(spent)} spent{saved > 0 ? ` and ${fmt(saved)} saved` : ""}
            {hasCredit ? " (credit card spending not included)" : ""}.
          </>
        )}
      </p>

      {!noPlan && (
        <div className="alloc depth-2">
          <div className="alloc__bar" role="img" aria-label={`Of ${fmt(income)} income: ${fmt(spent)} spent, ${fmt(saved)} saved, ${fmt(Math.max(0, remaining))} left.`}>
            <span className="alloc__seg alloc__seg--spent" style={{ width: seg(spent) }} />
            <span className="alloc__seg alloc__seg--saved" style={{ width: seg(saved) }} />
          </div>
          <ul className="alloc__legend">
            <li>
              <span className="dot dot--spent" /> Spent <strong>{fmt(spent)}</strong>
            </li>
            <li>
              <span className="dot dot--saved" /> Saved <strong>{fmt(saved)}</strong>
            </li>
            <li>
              <span className="dot dot--left" /> Left <strong>{fmt(Math.max(0, remaining))}</strong>
            </li>
          </ul>
        </div>
      )}

      {!noPlan && hasCredit && (
        <div className="hero__credit depth-2">
          <div className="hero__credit-top">
            <span className="hero__credit-label">
              <CreditCard size={14} aria-hidden="true" /> Credit card
            </span>
            <span>
              <strong className={cn(summary.creditRemainingMinor < 0 && "text-negative")}>
                {summary.creditRemainingMinor < 0 ? `${fmt(-summary.creditRemainingMinor)} over` : `${fmt(summary.creditRemainingMinor)} left`}
              </strong>{" "}
              <span className="muted">
                · {fmt(summary.creditSpentMinor)} of {fmt(summary.creditMinor)} used
              </span>
            </span>
          </div>
          <ProgressBar
            value={creditUsed}
            status={summary.creditRemainingMinor < 0 ? "over" : (creditUsed ?? 0) >= 80 ? "warning" : "ok"}
            label="Credit card used"
          />
        </div>
      )}

      <dl className="hero__facts depth-1">
        {summary.todaySpentMinor !== null && (
          <div>
            <dt>Spent today</dt>
            <dd>{fmt(summary.todaySpentMinor)}</dd>
          </div>
        )}
        <div>
          <dt>Daily average</dt>
          <dd>{summary.daysElapsed ? fmt(summary.avgDailySpentMinor) : "—"}</dd>
        </div>
        <div>
          <dt>Month elapsed</dt>
          <dd>
            <span className="mini-progress" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </span>
            {progress}%
          </dd>
        </div>
      </dl>
    </Card>
  );
}
