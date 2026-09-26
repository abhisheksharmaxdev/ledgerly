import { Pencil, Trash } from "lucide-react";
import { Fragment, useMemo } from "react";
import { paymentMethodLabel } from "../../../../shared/constants";
import { addDays, formatDay, weekdayShort } from "../../../../shared/dates";
import type { Category, Expense } from "../../../../shared/types";
import { useMoney, useToday } from "../../hooks";
import { CategoryBadge } from "../../utils/categoryIcon";
import { cn } from "../../utils/cn";

interface Props {
  items: Expense[];
  categories: Category[];
  groupByDate?: boolean;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  label: string;
}

export function ExpenseList({ items, categories, groupByDate = true, onEdit, onDelete, label }: Props) {
  const today = useToday();
  const { fmt } = useMoney();
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const groups = useMemo(() => {
    if (!groupByDate) return [{ key: "all", items }];
    const out: { key: string; items: Expense[] }[] = [];
    for (const e of items) {
      const last = out[out.length - 1];
      if (last && last.key === e.date) last.items.push(e);
      else out.push({ key: e.date, items: [e] });
    }
    return out;
  }, [items, groupByDate]);

  const dayLabel = (d: string) =>
    d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : `${weekdayShort(d)}, ${formatDay(d, "medium")}`;

  return (
    <ul className="tx-list" aria-label={label}>
      {groups.map((g) => {
        const dayTotal = g.items.reduce((s, e) => s + (byId.get(e.categoryId)?.kind === "savings" ? 0 : e.amountMinor), 0);
        return (
          <Fragment key={g.key}>
            {groupByDate && (
              <li className="tx-day" aria-hidden="true">
                <span>{dayLabel(g.key)}</span>
                {dayTotal > 0 && <span className="tx-day__total">{fmt(dayTotal)}</span>}
              </li>
            )}
            {g.items.map((e) => {
              const c = byId.get(e.categoryId);
              const isSavings = c?.kind === "savings";
              return (
                <li key={e.id} className={cn("tx", isSavings && "tx--savings")}>
                  <button type="button" className="tx__main" onClick={() => onEdit(e)} aria-label={`Edit ${fmt(e.amountMinor)} ${c?.name ?? ""} on ${formatDay(e.date, "long")}`}>
                    <CategoryBadge icon={c?.icon ?? "tag"} color={c?.color ?? "#94a3b8"} size={38} />
                    <span className="tx__text">
                      <span className="tx__title">{e.description || c?.name || "Expense"}</span>
                      <span className="tx__meta">
                        {e.description && <span>{c?.name}</span>}
                        {!groupByDate && <span>{formatDay(e.date, "medium")}</span>}
                        <span className={cn("pill", !e.paymentMethod && "pill--muted")}>{paymentMethodLabel(e.paymentMethod)}</span>
                        {e.isDemo && <span className="pill pill--demo">Demo</span>}
                      </span>
                    </span>
                    <span className={cn("tx__amount", isSavings && "is-savings")}>
                      {isSavings && <span className="tx__saved-tag">Saved</span>}
                      {fmt(e.amountMinor)}
                    </span>
                  </button>
                  <span className="tx__actions">
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => onEdit(e)} aria-label="Edit expense" title="Edit">
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => onDelete(e)} aria-label="Delete expense" title="Delete">
                      <Trash size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </Fragment>
        );
      })}
    </ul>
  );
}
