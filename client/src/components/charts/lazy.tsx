import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Feedback";

type ChartsModule = typeof import("./Charts");

/** Wraps a named export of the charts chunk in React.lazy with a skeleton card fallback. */
function lazyChart<K extends keyof ChartsModule>(name: K, height: number) {
  const Lazy = lazy(async () => ({ default: (await import("./Charts"))[name] as ComponentType<ComponentProps<ChartsModule[K]>> }));
  return function LazyChart(props: ComponentProps<ChartsModule[K]>) {
    return (
      <Suspense
        fallback={
          <Card className={(props as { className?: string }).className}>
            <Skeleton height={20} width={160} />
            <div style={{ height: 12 }} />
            <Skeleton height={height} radius={14} />
          </Card>
        }
      >
        <Lazy {...(props as ComponentProps<ChartsModule[K]> & object)} />
      </Suspense>
    );
  };
}

export const CategoryDonut = lazyChart("CategoryDonut", 250);
export const DailySpendingChart = lazyChart("DailySpendingChart", 260);
export const TrendChart = lazyChart("TrendChart", 280);
export const BudgetVsActualChart = lazyChart("BudgetVsActualChart", 300);
export const PaymentMethodChart = lazyChart("PaymentMethodChart", 200);
export const WeekdayChart = lazyChart("WeekdayChart", 200);
