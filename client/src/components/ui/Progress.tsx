import type { CSSProperties } from "react";
import type { BudgetStatus } from "../../../../shared/types";
import { cn } from "../../utils/cn";

/**
 * Budget bar. Fill is capped at 100% visually; overspend is shown as a hatched overflow cap
 * plus the textual status next to it (colour is never the only signal).
 */
export function ProgressBar({
  value,
  status = "ok",
  color,
  label,
}: {
  value: number | null;
  status?: BudgetStatus | "savings";
  color?: string;
  label: string;
}) {
  const pct = value === null ? 0 : Math.max(0, value);
  const width = Math.min(100, pct);
  return (
    <div
      className={cn("progress", `progress--${status}`)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(pct, 100))}
      aria-valuetext={value === null ? "No budget set" : `${pct}% used`}
      style={{ "--bar": color } as CSSProperties}
    >
      <span className="progress__fill" style={{ width: `${width}%` }} />
    </div>
  );
}

/** Small circular gauge for utilisation figures. */
export function Ring({ value, size = 56, stroke = 6, tone = "accent", label }: { value: number | null; size?: number; stroke?: number; tone?: "accent" | "positive" | "warning" | "negative"; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <svg className={cn("ring", `ring--${tone}`)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle
        className="ring__value"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring__text">
        {value === null ? "–" : `${Math.round(value)}%`}
      </text>
    </svg>
  );
}
