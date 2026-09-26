import { ChevronLeft, ChevronRight, Download, Plus, ReceiptText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { PAYMENT_METHODS } from "../../../shared/constants";
import { isValidIsoDate, isValidMonthKey, monthLabel } from "../../../shared/dates";
import type { Expense } from "../../../shared/types";
import { downloadFile, errorMessage } from "../api/client";
import { useCategories, useExpenses, useMonths } from "../api/queries";
import { DeleteExpenseConfirm } from "../components/expenses/DeleteExpenseConfirm";
import { ExpenseList } from "../components/expenses/ExpenseList";
import { Page } from "../components/layout/Page";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { useDebounced, useMoney } from "../hooks";
import { useUi } from "../store/ui";

const PAGE_SIZE = 25;
const SORTS = {
  "date-desc": { sort: "date", order: "desc", label: "Newest first" },
  "date-asc": { sort: "date", order: "asc", label: "Oldest first" },
  "amount-desc": { sort: "amount", order: "desc", label: "Highest amount" },
  "amount-asc": { sort: "amount", order: "asc", label: "Lowest amount" },
} as const;
type SortKey = keyof typeof SORTS;

export default function Expenses() {
  const [params, setParams] = useSearchParams();
  const { month: globalMonth, setMonth, openAddExpense, openEditExpense } = useUi();
  const { data: categories = [] } = useCategories();
  const { data: months = [] } = useMonths();
  const { fmt } = useMoney();
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  // A month in the URL (e.g. from "View all") becomes the app-wide month, then the page follows it.
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
  const category = params.get("category") ?? "";
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
    if (category) p.set("categoryIds", category);
    if (payment) p.set("paymentMethod", payment);
    if (from && isValidIsoDate(from)) p.set("from", from);
    if (to && isValidIsoDate(to)) p.set("to", to);
    p.set("sort", SORTS[sortKey].sort);
    p.set("order", SORTS[sortKey].order);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [monthFilter, q, category, payment, from, to, sortKey, page]);

  const list = useExpenses(apiParams);
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(q || category || payment || from || to || allMonths);

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
      await downloadFile(`/data/export.csv?${p}`, "ledgerly-expenses.csv");
      toast.success("CSV exported");
    } catch (e) {
      toast.error("Export failed", { description: errorMessage(e) });
    }
  };

  return (
    <Page
      title="Expenses"
      subtitle="Search, filter and manage every transaction"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </button>
          <button type="button" className="btn btn--primary hide-mobile" onClick={openAddExpense}>
            <Plus size={16} /> Add expense
          </button>
        </>
      }
    >
      <Card className="filters" aria-label="Filters">
        <div className="filters__grid">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search expenses</span>
            <input
              type="search"
              className="input"
              placeholder="Search description or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            <span className="field__label">Category</span>
            <select className="input" value={category} onChange={(e) => update({ category: e.target.value || null })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="select-field">
            <span className="field__label">Payment</span>
            <select className="input" value={payment} onChange={(e) => update({ payment: e.target.value || null })}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((p) => (
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
                <strong>{total}</strong> expense{total === 1 ? "" : "s"} · <strong>{fmt(list.data.totalAmountMinor)}</strong>
                {monthFilter ? ` in ${monthLabel(monthFilter)}` : " across all months"}
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
            <EmptyState icon={<Search size={22} />} title="No matching expenses" body="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={<ReceiptText size={22} />}
              title="No expenses recorded yet."
              body={`Nothing logged for ${monthLabel(globalMonth)}.`}
              action={
                <button type="button" className="btn btn--primary" onClick={openAddExpense}>
                  <Plus size={16} /> Add your first expense
                </button>
              }
            />
          )
        ) : (
          <>
            <ExpenseList
              label="Expenses"
              items={list.data!.items}
              categories={categories}
              groupByDate={SORTS[sortKey].sort === "date"}
              onEdit={openEditExpense}
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
      <DeleteExpenseConfirm expense={toDelete} onClose={() => setToDelete(null)} />
    </Page>
  );
}
