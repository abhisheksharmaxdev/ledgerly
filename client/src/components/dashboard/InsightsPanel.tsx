import { CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import type { InsightTone, InsightsResponse } from "../../../../shared/types";
import { cn } from "../../utils/cn";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "../ui/Feedback";

const TONE_ICON: Record<InsightTone, typeof Info> = {
  positive: CircleCheck,
  neutral: Info,
  warning: TriangleAlert,
  negative: CircleAlert,
};

export function InsightsPanel({
  data,
  loading,
  error,
  onRetry,
  limit,
  className,
}: {
  data?: InsightsResponse;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  limit?: number;
  className?: string;
}) {
  const items = data?.insights.slice(0, limit ?? data.insights.length) ?? [];
  return (
    <Card className={cn("insights", className)} aria-labelledby="insights-title">
      <CardHeader id="insights-title" title="Smart insights" subtitle="Calculated from your recorded data" />
      {loading ? (
        <SkeletonRows rows={3} height={52} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : !data || data.status === "insufficient" || items.length === 0 ? (
        <EmptyState compact icon={<Lightbulb size={20} />} title="Insufficient data" body={data?.message ?? "Add a few expenses to see insights."} />
      ) : (
        <ul className="insight-list">
          {items.map((i, idx) => {
            const Icon = TONE_ICON[i.tone];
            return (
              <motion.li
                key={i.id}
                className={cn("insight", `insight--${i.tone}`)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <span className="insight__icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="insight__title">{i.title}</p>
                  {i.detail && <p className="insight__detail">{i.detail}</p>}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
