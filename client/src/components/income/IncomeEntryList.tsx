import { Pencil, Trash } from "lucide-react";
import { Fragment, useMemo } from "react";
import { paymentMethodLabel } from "../../../../shared/constants";
import { addDays, formatDay, weekdayShort } from "../../../../shared/dates";
import type { IncomeEntry } from "../../../../shared/types";
import { useMoney, useToday } from "../../hooks";
import { CategoryBadge } from "../../utils/categoryIcon";
import { cn } from "../../utils/cn";

export const RECEIVED_COLOR = "#34d399";

interface Props {
  items: IncomeEntry[];
  groupByDate?: boolean;
  onEdit: (e: IncomeEntry) => void;
  onDelete: (e: IncomeEntry) => void;
  label: string;
}

/** Money-received entries, laid out like the expense list. */
export function IncomeEntryList({ items, groupByDate = true, onEdit, onDelete, label }: Props) {
  const today = useToday();
  const { fmt } = useMoney();

  const groups = useMemo(() => {
    if (!groupByDate) return [{ key: "all", items }];
    const out: { key: string; items: IncomeEntry[] }[] = [];
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
      {groups.map((g) => (
        <Fragment key={g.key}>
          {groupByDate && (
            <li className="tx-day" aria-hidden="true">
              <span>{dayLabel(g.key)}</span>
              <span className="tx-day__total">+{fmt(g.items.reduce((s, e) => s + e.amountMinor, 0))}</span>
            </li>
          )}
          {g.items.map((e) => (
            <li key={e.id} className="tx">
              <button type="button" className="tx__main" onClick={() => onEdit(e)} aria-label={`Edit ${fmt(e.amountMinor)} received on ${formatDay(e.date, "long")}`}>
                <CategoryBadge icon="wallet" color={RECEIVED_COLOR} size={38} />
                <span className="tx__text">
                  <span className="tx__title">{e.description || "Money received"}</span>
                  <span className="tx__meta">
                    {!groupByDate && <span>{formatDay(e.date, "medium")}</span>}
                    <span className={cn("pill", !e.paymentMethod && "pill--muted")}>{paymentMethodLabel(e.paymentMethod)}</span>
                  </span>
                </span>
                <span className="tx__amount is-received">+{fmt(e.amountMinor)}</span>
              </button>
              <span className="tx__actions">
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => onEdit(e)} aria-label="Edit entry" title="Edit">
                  <Pencil size={15} />
                </button>
                <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => onDelete(e)} aria-label="Delete entry" title="Delete">
                  <Trash size={15} />
                </button>
              </span>
            </li>
          ))}
        </Fragment>
      ))}
    </ul>
  );
}
