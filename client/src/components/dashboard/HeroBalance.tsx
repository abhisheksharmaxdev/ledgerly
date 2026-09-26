import { Link } from "react-router";
import { ArrowRight, CalendarDays } from "lucide-react";
import { monthName } from "../../../../shared/dates";
import type { MonthSummary } from "../../../../shared/types";
import { useMoney } from "../../hooks";
import { cn } from "../../utils/cn";
import { Card } from "../ui/Card";
import { AnimatedMoney } from "../ui/Money";

/** The first thing on screen: how much money is left this month, and why. */
export function HeroBalance({ summary }: { summary: MonthSummary }) {
  const { fmt } = useMoney();
  const { incomeMinor: income, spentMinor: spent, savedMinor: saved, remainingMinor: remaining } = summary;
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
          <AnimatedMoney minor={spent} className="hero__value" />
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
            of {fmt(income)} income, after {fmt(spent)} spent{saved > 0 ? ` and ${fmt(saved)} saved` : ""}.
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
