import { Plus } from "lucide-react";
import { monthLabel } from "../../../shared/dates";
import { useAnalytics, useInsights, useSummary } from "../api/queries";
import { CategoryDonut, DailySpendingChart } from "../components/charts/lazy";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { HeroBalance } from "../components/dashboard/HeroBalance";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { StatCards } from "../components/dashboard/StatCards";
import { Page, Reveal } from "../components/layout/Page";
import { Card } from "../components/ui/Card";
import { ErrorState, Skeleton } from "../components/ui/Feedback";
import { useToday } from "../hooks";
import { useUi } from "../store/ui";

export default function Dashboard() {
  const month = useUi((s) => s.month);
  const openAdd = useUi((s) => s.openAddExpense);
  const today = useToday();
  const summary = useSummary(month, today);
  const analytics = useAnalytics(month, today);
  const insights = useInsights(month, today);

  const addFirst = (
    <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
      <Plus size={15} /> Add expense
    </button>
  );

  return (
    <Page title="Dashboard" subtitle={`How you're doing in ${monthLabel(month)}`}>
      {summary.error && !summary.data ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : !summary.data ? (
        <DashboardSkeleton />
      ) : (
        <div className="dash-grid" aria-busy={summary.isFetching}>
          <Reveal index={0} className="area-hero">
            <HeroBalance summary={summary.data} />
          </Reveal>
          <Reveal index={1} className="area-stats">
            <StatCards summary={summary.data} />
          </Reveal>
          <Reveal index={2} className="area-budget">
            <BudgetProgress summary={summary.data} />
          </Reveal>
          <Reveal index={3} className="area-recent">
            <RecentTransactions month={month} />
          </Reveal>
          <Reveal index={4} className="area-category">
            <CategoryDonut summary={summary.data} emptyAction={addFirst} />
          </Reveal>
          <Reveal index={5} className="area-daily">
            <DailySpendingChart
              analytics={analytics.data}
              summary={summary.data}
              loading={analytics.isLoading}
              error={analytics.error}
              onRetry={() => analytics.refetch()}
            />
          </Reveal>
          <Reveal index={6} className="area-insights">
            <InsightsPanel data={insights.data} loading={insights.isLoading} error={insights.error} onRetry={() => insights.refetch()} limit={5} />
          </Reveal>
        </div>
      )}
    </Page>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash-grid" aria-busy="true" aria-label="Loading dashboard">
      <div className="area-hero">
        <Card>
          <Skeleton height={16} width={140} />
          <div style={{ height: 18 }} />
          <Skeleton height={48} width="60%" />
          <div style={{ height: 18 }} />
          <Skeleton height={10} />
          <div style={{ height: 40 }} />
        </Card>
      </div>
      <div className="area-stats stats">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton height={14} width={100} />
            <div style={{ height: 14 }} />
            <Skeleton height={28} width="70%" />
          </Card>
        ))}
      </div>
    </div>
  );
}
