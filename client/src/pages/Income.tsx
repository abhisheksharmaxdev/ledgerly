import { ChevronLeft, ChevronRight, Download, HandCoins, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { RECEIVED_METHODS } from "../../../shared/constants";
import { isValidIsoDate, isValidMonthKey, monthLabel } from "../../../shared/dates";
import type { IncomeEntry } from "../../../shared/types";
import { downloadFile, errorMessage } from "../api/client";
import { useIncome, useMonths, useSummary } from "../api/queries";
import { DeleteIncomeConfirm } from "../components/income/DeleteIncomeConfirm";
import { IncomeEntryList } from "../components/income/IncomeEntryList";
import { Page } from "../components/layout/Page";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { useDebounced, useMoney, useToday } from "../hooks";
import { useUi } from "../store/ui";

const PAGE_SIZE = 25;
const SORTS = {
  "date-desc": { sort: "date", order: "desc", label: "Newest first" },
  "date-asc": { sort: "date", order: "asc", label: "Oldest first" },
  "amount-desc": { sort: "amount", order: "desc", label: "Highest amount" },
  "amount-asc": { sort: "amount", order: "asc", label: "Lowest amount" },
} as const;
type SortKey = keyof typeof SORTS;

/** Statement of every money-received entry, with the same search, filters and paging as Expenses. */
export default function Income() {
  const [params, setParams] = useSearchParams();
  const { month: globalMonth, setMonth, openAddIncome, openEditIncome } = useUi();
  const { data: months = [] } = useMonths();
  const today = useToday();
  const { fmt } = useMoney();
  const [toDelete, setToDelete] = useState<IncomeEntry | null>(null);

  // A month in the URL becomes the app-wide month, then the page follows it.
  useEffect(() => {
    const m = params.get("month");
    if (m && m !== "all" && isValidMonthKey(m)) {
      setMonth(m);
      const next = new URLSearchParams(params);
      next.delete("month");
      setParams(next, { replace: true });
    }
  }, [params, setMonth, setParams]);

  const allMonths = params.get("month") === "all";
  const monthFilter = allMonths ? "" : globalMonth;
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebounced(search.trim(), 300);
  const payment = params.get("payment") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sortKey = (params.get("sort") as SortKey) in SORTS ? (params.get("sort") as SortKey) : "date-desc";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== q) update({ q: q || null });
  }, [q]);

  const apiParams = useMemo(() => {
    const p = new URLSearchParams();
    if (monthFilter) p.set("month", monthFilter);
    if (q) p.set("q", q);
    if (payment) p.set("paymentMethod", payment);
    if (from && isValidIsoDate(from)) p.set("from", from);
    if (to && isValidIsoDate(to)) p.set("to", to);
    p.set("sort", SORTS[sortKey].sort);
    p.set("order", SORTS[sortKey].order);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [monthFilter, q, payment, from, to, sortKey, page]);

  const list = useIncome(apiParams);
  // The month's planned income, so the statement can show the full income figure too.
  const summary = useSummary(globalMonth, today);
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(q || payment || from || to || allMonths);
  const monthSummary = !filtersActive && summary.data?.month === globalMonth ? summary.data : null;

  // If deletions shrink the result set, step back to the last page that still has rows.
  useEffect(() => {
    if (list.data && page > pages) update({ page: pages > 1 ? String(pages) : null }, false);
  }, [list.data, page, pages]);

  const monthOptions = useMemo(() => {
    const keys = new Set(months.map((m) => m.month));
    keys.add(globalMonth);
    return [...keys].sort().reverse();
  }, [months, globalMonth]);

  const exportCsv = async () => {
    const p = new URLSearchParams();
    if (monthFilter) p.set("month", monthFilter);
    else {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    try {
      await downloadFile(`/income/export.csv?${p}`, "ledgerly-income.csv");
      toast.success("CSV exported");
    } catch (e) {
      toast.error("Export failed", { description: errorMessage(e) });
    }
  };

  return (
    <Page
      title="Income"
      subtitle="Every payment you've received, with search and filters"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </button>
          <button type="button" className="btn btn--primary" onClick={openAddIncome}>
            <Plus size={16} /> Add money
          </button>
        </>
      }
    >
      <Card className="filters" aria-label="Filters">
        <div className="filters__grid filters__grid--5">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search income</span>
            <input type="search" className="input" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>

          <label className="select-field">
            <span className="field__label">Month</span>
            <select
              className="input"
              value={allMonths ? "all" : globalMonth}
              onChange={(e) => {
                if (e.target.value === "all") update({ month: "all" });
                else {
                  setMonth(e.target.value);
                  update({ month: null });
                }
              }}
            >
              <option value="all">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <label className="select-field">
            <span className="field__label">Received via</span>
            <select className="input" value={payment} onChange={(e) => update({ payment: e.target.value || null })}>
              <option value="">All methods</option>
              {RECEIVED_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="none">Unspecified</option>
            </select>
          </label>

          <label className="select-field">
            <span className="field__label">From</span>
            <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} />
          </label>
          <label className="select-field">
            <span className="field__label">To</span>
            <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} />
          </label>

          <label className="select-field">
            <span className="field__label">Sort</span>
            <select className="input" value={sortKey} onChange={(e) => update({ sort: e.target.value === "date-desc" ? null : e.target.value })}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filters__summary" aria-live="polite">
          <span>
            {list.data ? (
              <>
                <strong>{total}</strong> entr{total === 1 ? "y" : "ies"} · <strong className="text-positive">+{fmt(list.data.totalAmountMinor)}</strong> received
                {monthFilter ? ` in ${monthLabel(monthFilter)}` : " across all months"}
                {monthSummary && monthSummary.baseIncomeMinor > 0 && (
                  <>
                    {" "}
                    · total income <strong>{fmt(monthSummary.incomeMinor)}</strong> with your {fmt(monthSummary.baseIncomeMinor)} monthly income
                  </>
                )}
              </>
            ) : (
              "Loading…"
            )}
          </span>
          {filtersActive && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setSearch("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              <X size={14} /> Clear filters
            </button>
          )}
        </div>
      </Card>

      <Card className="history">
        {list.isLoading ? (
          <SkeletonRows rows={8} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : total === 0 ? (
          filtersActive ? (
            <EmptyState icon={<Search size={22} />} title="No matching entries" body="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={<HandCoins size={22} />}
              title="No money received yet."
              body={`Nothing recorded for ${monthLabel(globalMonth)}.`}
              action={
                <button type="button" className="btn btn--primary" onClick={openAddIncome}>
                  <Plus size={16} /> Add money received
                </button>
              }
            />
          )
        ) : (
          <>
            <IncomeEntryList
              label="Money received"
              items={list.data!.items}
              groupByDate={SORTS[sortKey].sort === "date"}
              onEdit={openEditIncome}
              onDelete={setToDelete}
            />
            {pages > 1 && (
              <nav className="pager" aria-label="Pagination">
                <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="pager__info">
                  Page {page} of {pages}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) }, false)}>
                  Next <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </>
        )}
      </Card>
      <DeleteIncomeConfirm entry={toDelete} onClose={() => setToDelete(null)} />
    </Page>
  );
}
