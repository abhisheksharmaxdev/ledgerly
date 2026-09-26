/**
 * All Recharts visualisations. Lazily loaded (see ./lazy.tsx) so the dashboard numbers paint first.
 * Colour rules: categories keep their own identity colour; single-series charts use one accent;
 * status colours (over budget) are paired with text labels in tooltips and tables.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDay, monthName, weekdayShort } from "../../../../shared/dates";
import type { CategoryBreakdown, MonthAnalytics, MonthSummary, TrendPoint } from "../../../../shared/types";
import { useMoney, useReducedMotion } from "../../hooks";
import { Segmented } from "../ui/Segmented";
import { ChartFrame, TooltipBox } from "./ChartFrame";
import { useChartTheme } from "./theme";

interface TipProps<P> {
  active?: boolean;
  payload?: readonly { payload?: P }[];
}

const MAX_SLICES = 5;

// ---------- 1. Expense by category (donut) ----------

export function CategoryDonut({ summary, loading, error, onRetry, emptyAction }: ChartCommon & { summary?: MonthSummary; emptyAction?: ReactNode }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();

  const { slices, total } = useMemo(() => {
    const cats = (summary?.categories ?? []).filter((c) => c.kind === "expense" && c.spentMinor > 0).sort((a, b) => b.spentMinor - a.spentMinor);
    const total = cats.reduce((s, c) => s + c.spentMinor, 0);
    const head = cats.slice(0, MAX_SLICES).map((c) => ({ name: c.name, value: c.spentMinor, color: c.color, count: c.count }));
    const rest = cats.slice(MAX_SLICES);
    if (rest.length) {
      head.push({
        name: `Other (${rest.length})`,
        value: rest.reduce((s, c) => s + c.spentMinor, 0),
        color: t.other,
        count: rest.reduce((s, c) => s + c.count, 0),
      });
    }
    return { slices: head, total };
  }, [summary, t.other]);

  const pct = (v: number) => (total ? `${Math.round((v / total) * 1000) / 10}%` : "0%");

  return (
    <ChartFrame
      title="Spending by category"
      subtitle={summary ? `Where your money went in ${monthName(summary.month)}` : undefined}
      summary={`Spending by category: ${slices.map((s) => `${s.name} ${fmt(s.value)} (${pct(s.value)})`).join(", ")}.`}
      table={{ columns: ["Category", "Spent", "Share", "Transactions"], rows: slices.map((s) => [s.name, fmt(s.value), pct(s.value), s.count]) }}
      height={250}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={slices.length === 0 ? { title: "No spending yet", body: "Category breakdown appears after your first expense.", action: emptyAction } : null}
    >
      <div className="donut">
        <div className="donut__chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="68%"
                outerRadius="96%"
                paddingAngle={slices.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke="none"
                isAnimationActive={!reduced}
                animationDuration={700}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }: TipProps<(typeof slices)[number]>) => {
                  const p = payload?.[0]?.payload;
                  return active && p ? (
                    <TooltipBox
                      title={p.name}
                      rows={[
                        { label: "Spent", value: fmt(p.value), color: p.color },
                        { label: "Share", value: pct(p.value) },
                        { label: "Transactions", value: String(p.count) },
                      ]}
                    />
                  ) : null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut__center" aria-hidden="true">
            <span className="donut__label">Spent</span>
            <span className="donut__value">{fmt(total)}</span>
          </div>
        </div>
        <ul className="legend-list">
          {slices.map((s) => (
            <li key={s.name}>
              <span className="legend-list__dot" style={{ background: s.color }} />
              <span className="legend-list__name">{s.name}</span>
              <span className="legend-list__value">{fmt(s.value)}</span>
              <span className="legend-list__pct">{pct(s.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

interface ChartCommon {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

// ---------- 2. Daily spending (area) ----------

export function DailySpendingChart({
  analytics,
  summary,
  loading,
  error,
  onRetry,
  height = 260,
}: ChartCommon & { analytics?: MonthAnalytics; summary?: MonthSummary; height?: number }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");

  const planned = summary?.plannedSpendMinor ?? 0;
  const lastDay = summary?.period === "current" ? summary.daysElapsed : summary?.period === "future" ? 0 : Infinity;
  const data = useMemo(
    () =>
      (analytics?.daily ?? []).map((d, i) => {
        const day = i + 1;
        const visible = day <= lastDay;
        return {
          date: d.date,
          day,
          spent: visible ? d.spentMinor : null,
          cumulative: visible ? d.cumulativeMinor : null,
          pace: planned > 0 ? Math.round((planned * day) / (analytics?.daily.length ?? 30)) : null,
          count: d.count,
        };
      }),
    [analytics, lastDay, planned],
  );
  const total = data.reduce((s, d) => s + (d.spent ?? 0), 0);
  const peak = data.reduce((m, d) => ((d.spent ?? 0) > (m?.spent ?? 0) ? d : m), data[0]);
  const key = mode === "daily" ? "spent" : "cumulative";

  return (
    <ChartFrame
      title="Daily spending"
      subtitle={mode === "daily" ? "Amount spent each day" : planned > 0 ? "Running total vs. planned budget pace" : "Running total this month"}
      summary={`Daily spending for ${analytics ? monthName(analytics.month) : "the month"}: total ${fmt(total)}${peak?.spent ? `, highest on ${formatDay(peak.date)} at ${fmt(peak.spent)}` : ""}.`}
      table={{
        columns: ["Date", "Spent", "Running total", "Transactions"],
        rows: data.filter((d) => d.spent !== null).map((d) => [formatDay(d.date), fmt(d.spent ?? 0), fmt(d.cumulative ?? 0), d.count]),
      }}
      height={height}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={total === 0 ? { title: summary?.period === "future" ? "This month hasn't started" : "No spending recorded", body: "Daily totals will chart here as you add expenses." } : null}
      actions={
        <Segmented
          size="sm"
          label="Chart mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "daily", label: "Daily" },
            { value: "cumulative", label: "Cumulative" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.accent} stopOpacity={0.34} />
              <stop offset="100%" stopColor={t.accent} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: t.grid }} tick={{ fill: t.axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v: number) => fmt(v, { compact: true })} width={56} />
          <Tooltip
            cursor={{ stroke: t.axis, strokeWidth: 1 }}
            content={({ active, payload }: TipProps<(typeof data)[number]>) => {
              const p = payload?.[0]?.payload;
              if (!active || !p || p.spent === null) return null;
              const rows = [
                { label: "Spent", value: fmt(p.spent), color: t.accent },
                { label: "Running total", value: fmt(p.cumulative ?? 0) },
              ];
              if (mode === "cumulative" && p.pace !== null) rows.push({ label: "Budget pace", value: fmt(p.pace) });
              rows.push({ label: "Transactions", value: String(p.count) });
              return <TooltipBox title={`${weekdayShort(p.date)}, ${formatDay(p.date)}`} rows={rows} />;
            }}
          />
          <Area
            type="monotone"
            dataKey={key}
            stroke={t.accent}
            strokeWidth={2}
            fill="url(#dailyFill)"
            connectNulls={false}
            isAnimationActive={!reduced}
            activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }}
          />
          {mode === "cumulative" && planned > 0 && (
            <Area type="linear" dataKey="pace" stroke={t.axis} strokeDasharray="4 4" strokeWidth={1.5} fill="none" isAnimationActive={false} activeDot={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------- 3. Monthly trend ----------

export function TrendChart({
  points,
  loading,
  error,
  onRetry,
  actions,
}: ChartCommon & { points?: TrendPoint[]; actions?: ReactNode }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();
  const data = (points ?? []).map((p) => ({ ...p, label: monthName(p.month, true), income: p.hasPlan ? p.incomeMinor : null }));
  const withData = data.filter((d) => d.count > 0);
  const first = withData[0];
  const last = withData[withData.length - 1];
  const direction =
    first && last && first !== last
      ? last.spentMinor > first.spentMinor
        ? `up from ${fmt(first.spentMinor)} in ${first.label} to ${fmt(last.spentMinor)} in ${last.label}`
        : `down from ${fmt(first.spentMinor)} in ${first.label} to ${fmt(last.spentMinor)} in ${last.label}`
      : "";

  return (
    <ChartFrame
      title="Monthly trend"
      subtitle="Spending, savings and income across months"
      summary={`Monthly spending trend${direction ? `: ${direction}` : ""}.`}
      table={{
        columns: ["Month", "Spent", "Saved", "Income"],
        rows: data.map((d) => [d.label, fmt(d.spentMinor), fmt(d.savedMinor), d.hasPlan ? fmt(d.incomeMinor) : "—"]),
      }}
      height={280}
      loading={loading}
      error={error}
      onRetry={onRetry}
      actions={actions}
      empty={withData.length < 2 ? { title: "Not enough history yet", body: "The trend appears once you have expenses in at least two months." } : null}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: t.grid }} tick={{ fill: t.axis, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v: number) => fmt(v, { compact: true })} width={56} />
          <Tooltip
            cursor={{ fill: t.accentSoft, opacity: 0.35 }}
            content={({ active, payload }: TipProps<(typeof data)[number]>) => {
              const p = payload?.[0]?.payload;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={monthName(p.month) + " " + p.month.slice(0, 4)}
                  rows={[
                    { label: "Spent", value: fmt(p.spentMinor), color: t.accent },
                    { label: "Saved", value: fmt(p.savedMinor), color: t.saved },
                    { label: "Income", value: p.hasPlan ? fmt(p.incomeMinor) : "No plan", color: t.income },
                  ]}
                />
              );
            }}
          />
          <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: t.text }} />
          <Bar name="Spent" dataKey="spentMinor" fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={!reduced} />
          <Bar name="Saved" dataKey="savedMinor" fill={t.saved} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={!reduced} />
          <Line name="Income" dataKey="income" type="monotone" stroke={t.income} strokeWidth={2} dot={{ r: 3, fill: t.income, strokeWidth: 0 }} connectNulls isAnimationActive={!reduced} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------- 4. Budget vs actual ----------

export function BudgetVsActualChart({ summary, loading, error, onRetry }: ChartCommon & { summary?: MonthSummary }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();
  const rows: CategoryBreakdown[] = (summary?.categories ?? []).filter((c) => c.kind === "expense" && (c.budgetMinor > 0 || c.spentMinor > 0));
  const data = rows.map((c) => ({ ...c, short: c.name.split(" /")[0].split(" +")[0] }));
  const height = Math.max(220, data.length * 38 + 50);

  return (
    <ChartFrame
      title="Budget vs actual"
      subtitle={
        <span className="inline-legend">
          <span>
            <i style={{ background: t.budget }} /> Budget
          </span>
          <span>
            <i style={{ background: t.accent }} /> Spent
          </span>
          <span>
            <i style={{ background: t.negative }} /> Over budget / unbudgeted
          </span>
        </span>
      }
      summary={`Budget versus actual: ${data.map((d) => `${d.name} spent ${fmt(d.spentMinor)} of ${fmt(d.budgetMinor)}`).join("; ")}.`}
      table={{
        columns: ["Category", "Budget", "Spent", "Remaining", "Status"],
        rows: data.map((d) => [d.name, fmt(d.budgetMinor), fmt(d.spentMinor), fmt(d.remainingMinor), statusText(d)]),
      }}
      height={height}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={data.length === 0 ? { title: "No budgets or spending", body: "Set up a monthly plan to compare budgets with actual spending." } : null}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v: number) => fmt(v, { compact: true })} />
          <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} tick={{ fill: t.text, fontSize: 12 }} width={96} />
          <Tooltip
            cursor={{ fill: t.accentSoft, opacity: 0.35 }}
            content={({ active, payload }: TipProps<(typeof data)[number]>) => {
              const p = payload?.[0]?.payload;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={p.name}
                  rows={[
                    { label: "Budget", value: fmt(p.budgetMinor), color: t.budget },
                    { label: "Spent", value: fmt(p.spentMinor), color: p.status === "over" ? t.negative : t.accent },
                    { label: p.remainingMinor >= 0 ? "Remaining" : "Over by", value: fmt(Math.abs(p.remainingMinor)) },
                    { label: "Status", value: statusText(p) },
                  ]}
                />
              );
            }}
          />
          <Bar name="Budget" dataKey="budgetMinor" fill={t.budget} radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={!reduced} />
          <Bar name="Spent" dataKey="spentMinor" radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={!reduced}>
            {data.map((d) => (
              <Cell key={d.categoryId} fill={d.status === "over" || d.status === "unbudgeted" ? t.negative : t.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function statusText(c: CategoryBreakdown): string {
  switch (c.status) {
    case "over":
      return "Over budget";
    case "warning":
      return "Approaching limit";
    case "unbudgeted":
      return "No budget set";
    case "none":
      return "—";
    default:
      return "On track";
  }
}

// ---------- 5. Payment methods ----------

export function PaymentMethodChart({ analytics, loading, error, onRetry }: ChartCommon & { analytics?: MonthAnalytics }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();
  const data = (analytics?.paymentMethods ?? []).filter((p) => p.amountMinor > 0);
  const total = data.reduce((s, p) => s + p.amountMinor, 0);
  const pct = (v: number) => (total ? `${Math.round((v / total) * 1000) / 10}%` : "0%");

  return (
    <ChartFrame
      title="Payment methods"
      subtitle="How you paid (excludes savings transfers)"
      summary={`Payment methods: ${data.map((d) => `${d.label} ${fmt(d.amountMinor)} (${pct(d.amountMinor)})`).join(", ")}.`}
      table={{ columns: ["Method", "Amount", "Share", "Transactions"], rows: data.map((d) => [d.label, fmt(d.amountMinor), pct(d.amountMinor), d.count]) }}
      height={Math.max(180, data.length * 40 + 20)}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={data.length === 0 ? { title: "No payments recorded", body: "Add expenses to see how you pay." } : null}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 0 }} barCategoryGap="30%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.text, fontSize: 12 }} width={96} />
          <Tooltip
            cursor={{ fill: t.accentSoft, opacity: 0.35 }}
            content={({ active, payload }: TipProps<(typeof data)[number]>) => {
              const p = payload?.[0]?.payload;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "Amount", value: fmt(p.amountMinor), color: t.accent },
                    { label: "Share", value: pct(p.amountMinor) },
                    { label: "Transactions", value: String(p.count) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="amountMinor"
            fill={t.accent}
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
            isAnimationActive={!reduced}
            label={{ position: "right", fill: t.text, fontSize: 12, formatter: (v: unknown) => fmt(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------- 6. Spending by weekday ----------

export function WeekdayChart({ analytics, loading, error, onRetry }: ChartCommon & { analytics?: MonthAnalytics }) {
  const t = useChartTheme();
  const { fmt } = useMoney();
  const reduced = useReducedMotion();
  const data = analytics?.byWeekday ?? [];
  const total = data.reduce((s, d) => s + d.amountMinor, 0);
  const wp = analytics?.weekdayPattern;
  return (
    <ChartFrame
      title="By day of week"
      subtitle={
        wp && (wp.weekdayDays || wp.weekendDays)
          ? `Avg ${fmt(wp.weekdayAvgMinor)} per weekday · ${fmt(wp.weekendAvgMinor)} per weekend day`
          : "Total spent on each weekday"
      }
      summary={`Spending by day of week: ${data.map((d) => `${d.label} ${fmt(d.amountMinor)}`).join(", ")}.`}
      table={{ columns: ["Day", "Spent"], rows: data.map((d) => [d.label, fmt(d.amountMinor)]) }}
      height={200}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={total === 0 ? { title: "No spending yet" } : null}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: t.grid }} tick={{ fill: t.axis, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v: number) => fmt(v, { compact: true })} width={52} />
          <Tooltip
            cursor={{ fill: t.accentSoft, opacity: 0.35 }}
            content={({ active, payload }: TipProps<(typeof data)[number]>) => {
              const p = payload?.[0]?.payload;
              return active && p ? <TooltipBox title={p.label} rows={[{ label: "Spent", value: fmt(p.amountMinor), color: t.accent }]} /> : null;
            }}
          />
          <Bar dataKey="amountMinor" fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={!reduced}>
            {data.map((d) => (
              <Cell key={d.dow} fill={d.dow === 0 || d.dow === 6 ? t.income : t.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

