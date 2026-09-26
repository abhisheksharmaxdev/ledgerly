import { Table2, ChartColumn } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState, ErrorState, Skeleton } from "../ui/Feedback";

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Plain-language summary read by screen readers in place of the graphic. */
  summary: string;
  table: ChartTable;
  height: number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { title: string; body?: ReactNode; action?: ReactNode } | null;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Card + header + accessible summary + optional data-table view + empty/error states. */
export function ChartFrame({ title, subtitle, summary, table, height, loading, error, onRetry, empty, actions, className, children }: Props) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const canToggle = !loading && !error && !empty;
  return (
    <Card className={className} aria-labelledby={titleId}>
      <CardHeader
        id={titleId}
        title={title}
        subtitle={subtitle}
        action={
          <div className="chart-actions">
            {actions}
            {canToggle && (
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => setAsTable((v) => !v)}
                aria-pressed={asTable}
                aria-label={asTable ? `Show ${title} as chart` : `Show ${title} as table`}
                title={asTable ? "Show chart" : "Show table"}
              >
                {asTable ? <ChartColumn size={15} /> : <Table2 size={15} />}
              </button>
            )}
          </div>
        }
      />
      {loading ? (
        <Skeleton height={height} radius={14} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : empty ? (
        <div style={{ minHeight: height }} className="chart-empty">
          <EmptyState compact title={empty.title} body={empty.body} action={empty.action} icon={<ChartColumn size={20} />} />
        </div>
      ) : asTable ? (
        <div className="table-wrap" style={{ maxHeight: height + 40 }}>
          <table className="data-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="chart-figure" style={{ height }}>
          <figcaption className="sr-only">{summary}</figcaption>
          {children}
        </figure>
      )}
    </Card>
  );
}

/** Glass tooltip used by every chart. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="chart-tooltip__row">
          {r.color && <span className="chart-tooltip__dot" style={{ background: r.color }} />}
          <span className="chart-tooltip__label">{r.label}</span>
          <span className="chart-tooltip__value">{r.value}</span>
        </p>
      ))}
    </div>
  );
}
