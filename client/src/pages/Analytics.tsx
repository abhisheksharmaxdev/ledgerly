import { useState } from "react";
import { formatDay, monthLabel } from "../../../shared/dates";
import { percent } from "../../../shared/money";
import { useAnalytics, useCategories, useInsights, useMonths, useSummary, useTrend } from "../api/queries";
import {
  BudgetVsActualChart,
  CategoryDonut,
  DailySpendingChart,
  PaymentMethodChart,
  TrendChart,
  WeekdayChart,
} from "../components/charts/lazy";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { Page, Reveal } from "../components/layout/Page";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { Segmented } from "../components/ui/Segmented";
import { useMoney, useToday } from "../hooks";
import { useUi } from "../store/ui";
import { cn } from "../utils/cn";

export default function Analytics() {
  const { month, setMonth } = useUi();
  const today = useToday();
  const { fmt } = useMoney();
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const summary = useSummary(month, today);
  const analytics = useAnalytics(month, today);
  const insights = useInsights(month, today);
  const trend = useTrend(month, Number(range), today);
  const months = useMonths();
  const { data: categories = [] } = useCategories();

  const s = summary.data;
  const largest = analytics.data?.largestExpense;
  const largestCat = categories.find((c) => c.id === largest?.categoryId);

  return (
    <Page title="Analytics" subtitle={`Detailed breakdown for ${monthLabel(month)}`}>
      {summary.error && !s ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : (
        <div className="analytics-grid">
          <Reveal index={0} className="span-full">
            <div className="kpi-row">
              <Kpi label="Total spent" value={s ? fmt(s.spentMinor) : "—"} />
              <Kpi label="Avg per day" value={s && s.daysElapsed ? fmt(s.avgDailySpentMinor) : "—"} />
              <Kpi label="Transactions" value={s ? String(s.transactionCount) : "—"} />
              <Kpi
                label="Budget used"
                value={s?.budgetUtilization != null ? `${s.budgetUtilization}%` : "—"}
                tone={s?.budgetUtilization != null ? (s.budgetUtilization > 100 ? "negative" : s.budgetUtilization >= 80 ? "warning" : undefined) : undefined}
              />
              <Kpi label="Savings rate" value={s?.savingsRate != null ? `${s.savingsRate}%` : "—"} />
              <Kpi
                label="Largest expense"
                value={largest ? fmt(largest.amountMinor) : "—"}
                hint={largest ? `${largestCat?.name ?? ""} · ${formatDay(largest.date)}` : undefined}
              />
            </div>
          </Reveal>

          <Reveal index={1} className="span-7">
            <InsightsPanel data={insights.data} loading={insights.isLoading} error={insights.error} onRetry={() => insights.refetch()} />
          </Reveal>
          <Reveal index={2} className="span-5">
            <CategoryDonut summary={s} loading={summary.isLoading} />
          </Reveal>

          <Reveal index={3} className="span-full">
            <DailySpendingChart analytics={analytics.data} summary={s} loading={analytics.isLoading} error={analytics.error} onRetry={() => analytics.refetch()} height={300} />
          </Reveal>

          <Reveal index={4} className="span-7">
            <BudgetVsActualChart summary={s} loading={summary.isLoading} />
          </Reveal>
          <Reveal index={5} className="span-5 stack">
            <PaymentMethodChart analytics={analytics.data} loading={analytics.isLoading} error={analytics.error} onRetry={() => analytics.refetch()} />
            <WeekdayChart analytics={analytics.data} loading={analytics.isLoading} />
          </Reveal>

          <Reveal index={6} className="span-full">
            <TrendChart
              points={trend.data}
              loading={trend.isLoading}
              error={trend.error}
              onRetry={() => trend.refetch()}
              actions={
                <Segmented
                  size="sm"
                  label="Trend range"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: "3", label: "3M" },
                    { value: "6", label: "6M" },
                    { value: "12", label: "12M" },
                  ]}
                />
              }
            />
          </Reveal>

          <Reveal index={7} className="span-full">
            <Card aria-labelledby="history-title">
              <CardHeader id="history-title" title="Monthly history" subtitle="Every month with a plan or expenses. Select one to view it." />
              {months.isLoading ? (
                <SkeletonRows rows={3} />
              ) : months.error ? (
                <ErrorState error={months.error} onRetry={() => months.refetch()} compact />
              ) : !months.data?.length ? (
                <EmptyState compact title="No history yet" body="Months appear here once they have a plan or expenses." />
              ) : (
                <div className="table-wrap">
                  <table className="data-table data-table--interactive">
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Income</th>
                        <th scope="col">Spent</th>
                        <th scope="col">Saved</th>
                        <th scope="col">Left</th>
                        <th scope="col">Savings rate</th>
                        <th scope="col">Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.data.map((m) => {
                        // Same rule as the dashboard: with a credit amount, card spending isn't taken from income.
                        const fromIncome = m.creditMinor > 0 ? m.spentMinor - m.creditSpentMinor : m.spentMinor;
                        const left = m.incomeMinor - fromIncome - m.savedMinor;
                        return (
                          <tr key={m.month} className={cn(m.month === month && "is-current")}>
                            <th scope="row">
                              <button type="button" className="link-btn" onClick={() => setMonth(m.month)} aria-current={m.month === month ? "true" : undefined}>
                                {monthLabel(m.month)}
                              </button>
                            </th>
                            <td>{m.hasPlan ? fmt(m.incomeMinor) : <span className="muted">No plan</span>}</td>
                            <td>{fmt(m.spentMinor)}</td>
                            <td>{fmt(m.savedMinor)}</td>
                            <td className={cn(m.hasPlan && left < 0 && "text-negative")}>{m.hasPlan ? fmt(left) : "—"}</td>
                            <td>{m.hasPlan && m.incomeMinor ? `${percent(m.savedMinor, m.incomeMinor)}%` : "—"}</td>
                            <td>{m.count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </Reveal>
        </div>
      )}
    </Page>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "negative" }) {
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <span className={cn("kpi__value", tone && `text-${tone}`)}>{value}</span>
      {hint && <span className="kpi__hint">{hint}</span>}
    </div>
  );
}
