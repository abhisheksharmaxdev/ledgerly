import { CircleAlert, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "../../api/client";
import { cn } from "../../utils/cn";

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("empty", compact && "empty--compact")}>
      {icon && (
        <div className="empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={cn("empty empty--error", compact && "empty--compact")} role="alert">
      <div className="empty__icon" aria-hidden="true">
        <CircleAlert size={22} />
      </div>
      <p className="empty__title">Couldn't load this</p>
      <p className="empty__body">{errorMessage(error)}</p>
      {onRetry && (
        <div className="empty__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = 8, className }: { height?: number | string; width?: number | string; radius?: number; className?: string }) {
  return <span className={cn("skeleton", className)} style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={12} />
      ))}
    </div>
  );
}
