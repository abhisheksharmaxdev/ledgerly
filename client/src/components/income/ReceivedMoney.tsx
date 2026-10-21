import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { monthLabel, monthName } from "../../../../shared/dates";
import type { IncomeEntry } from "../../../../shared/types";
import { useMonthIncome } from "../../api/queries";
import { useMoney } from "../../hooks";
import { useUi } from "../../store/ui";
import { DeleteIncomeConfirm } from "./DeleteIncomeConfirm";
import { IncomeEntryList } from "./IncomeEntryList";

/**
 * Money received during the month. Entries are added to the month's income automatically,
 * so the total never has to be updated by hand.
 */
export function ReceivedMoney({ month, baseIncomeMinor }: { month: string; baseIncomeMinor: number }) {
  const { fmt } = useMoney();
  const income = useMonthIncome(month);
  const openEditIncome = useUi((s) => s.openEditIncome);
  const [toDelete, setToDelete] = useState<IncomeEntry | null>(null);
  const received = income.data?.totalAmountMinor ?? 0;
  const items = income.data?.items ?? [];

  return (
    <div className="received">
      <div className="received__head">
        <div>
          <p className="received__title">Money received</p>
          <p className="muted small">Added to this month's income automatically. Record it with Add money at the top.</p>
        </div>
        <Link to="/income" className="btn btn--ghost btn--sm">
          View statement <ArrowRight size={15} />
        </Link>
      </div>

      {income.isLoading ? null : items.length === 0 ? (
        <p className="received__empty muted small">Nothing received in {monthName(month)} yet.</p>
      ) : (
        <IncomeEntryList label={`Money received in ${monthLabel(month)}`} items={items} groupByDate={false} onEdit={openEditIncome} onDelete={setToDelete} />
      )}

      <p className="received__sum">
        <span className="muted">
          {fmt(baseIncomeMinor)} monthly income + {fmt(received)} received
        </span>
        <span>
          Total income <strong>{fmt(baseIncomeMinor + received)}</strong>
        </span>
      </p>

      <DeleteIncomeConfirm entry={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}
