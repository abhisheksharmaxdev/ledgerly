import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { monthKeyOf, monthLabel, shiftMonth } from "../../../../shared/dates";
import { useMonths } from "../../api/queries";
import { useToday } from "../../hooks";
import { useUi } from "../../store/ui";

const FUTURE_LIMIT = 12;

/** Prev / next arrows plus a native select (accessible + great on mobile) for jumping to any month. */
export function MonthSwitcher() {
  const { month, setMonth } = useUi();
  const today = useToday();
  const current = monthKeyOf(today);
  const { data: months } = useMonths();
  const maxMonth = shiftMonth(current, FUTURE_LIMIT);

  const options = useMemo(() => {
    const withData = new Set((months ?? []).map((m) => m.month));
    const earliest = [...withData, shiftMonth(current, -12), month].sort()[0];
    const list: { key: string; hasData: boolean }[] = [];
    for (let k = maxMonth; k >= earliest; k = shiftMonth(k, -1)) list.push({ key: k, hasData: withData.has(k) });
    return list;
  }, [months, current, month, maxMonth]);

  return (
    <div className="month-switcher">
      <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft size={18} />
      </button>
      <div className="month-switcher__select">
        <span className="month-switcher__label" aria-hidden="true">
          {monthLabel(month)}
          <ChevronDown size={14} />
        </span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Select month">
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {monthLabel(o.key)}
              {o.key === current ? " (current)" : o.hasData ? " •" : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setMonth(shiftMonth(month, 1))}
        aria-label="Next month"
        disabled={month >= maxMonth}
      >
        <ChevronRight size={18} />
      </button>
      {month !== current && (
        <button type="button" className="btn btn--ghost btn--sm month-switcher__today" onClick={() => setMonth(current)}>
          This month
        </button>
      )}
    </div>
  );
}
