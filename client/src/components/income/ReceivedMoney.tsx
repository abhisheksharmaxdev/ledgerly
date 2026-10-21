import { CalendarDays, Pencil, Plus, Trash } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RECEIVED_METHODS, paymentMethodLabel, type ReceivedMethod } from "../../../../shared/constants";
import { addDays, formatDay, isValidIsoDate, monthKeyOf, monthLabel, monthName } from "../../../../shared/dates";
import { minorToInput, parseAmount } from "../../../../shared/money";
import type { IncomeEntry } from "../../../../shared/types";
import { ApiError, errorMessage } from "../../api/client";
import { useDeleteIncome, useIncome, useSaveIncome } from "../../api/queries";
import { useMoney, useToday } from "../../hooks";
import { CategoryBadge } from "../../utils/categoryIcon";
import { cn } from "../../utils/cn";
import { ConfirmDialog, Dialog } from "../ui/Dialog";

const RECEIVED_COLOR = "#34d399";

/**
 * Money received during the month. Entries are added to the month's income automatically,
 * so the total never has to be updated by hand.
 */
export function ReceivedMoney({ month, baseIncomeMinor }: { month: string; baseIncomeMinor: number }) {
  const { fmt } = useMoney();
  const income = useIncome(month);
  const [editing, setEditing] = useState<IncomeEntry | "new" | null>(null);
  const [toDelete, setToDelete] = useState<IncomeEntry | null>(null);
  const del = useDeleteIncome();
  const received = income.data?.totalMinor ?? 0;
  const items = income.data?.items ?? [];

  const confirmDelete = () => {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success("Entry deleted", { description: `${fmt(toDelete.amountMinor)} removed from ${monthName(month)} income` });
        setToDelete(null);
        setEditing(null);
      },
      onError: (e) => toast.error("Couldn't delete the entry", { description: errorMessage(e) }),
    });
  };

  return (
    <div className="received">
      <div className="received__head">
        <div>
          <p className="received__title">Money received</p>
          <p className="muted small">Added to this month's income automatically.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing("new")}>
          <Plus size={15} /> Add money received
        </button>
      </div>

      {income.isLoading ? null : items.length === 0 ? (
        <p className="received__empty muted small">Nothing received in {monthName(month)} yet.</p>
      ) : (
        <ul className="tx-list" aria-label={`Money received in ${monthLabel(month)}`}>
          {items.map((e) => (
            <li key={e.id} className="tx">
              <button
                type="button"
                className="tx__main"
                onClick={() => setEditing(e)}
                aria-label={`Edit ${fmt(e.amountMinor)} received on ${formatDay(e.date, "long")}`}
              >
                <CategoryBadge icon="wallet" color={RECEIVED_COLOR} size={34} />
                <span className="tx__text">
                  <span className="tx__title">{e.description || "Money received"}</span>
                  <span className="tx__meta">
                    <span>{formatDay(e.date, "medium")}</span>
                    {e.paymentMethod && <span className="pill">{paymentMethodLabel(e.paymentMethod)}</span>}
                  </span>
                </span>
                <span className="tx__amount is-received">+{fmt(e.amountMinor)}</span>
              </button>
              <span className="tx__actions">
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(e)} aria-label="Edit entry" title="Edit">
                  <Pencil size={15} />
                </button>
                <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => setToDelete(e)} aria-label="Delete entry" title="Delete">
                  <Trash size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="received__sum">
        <span className="muted">
          {fmt(baseIncomeMinor)} monthly income + {fmt(received)} received
        </span>
        <span>
          Total income <strong>{fmt(baseIncomeMinor + received)}</strong>
        </span>
      </p>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add money received" : "Edit money received"}
        description="It's added to the income of the month it was received in."
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("received-amount")?.focus();
        }}
      >
        {editing !== null && (
          <ReceivedForm
            month={month}
            entry={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
            onDelete={(entry) => setToDelete(entry)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this entry?"
        description={toDelete ? `${fmt(toDelete.amountMinor)} received on ${formatDay(toDelete.date, "long")} will be removed from that month's income.` : ""}
        confirmLabel="Delete entry"
        busy={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function ReceivedForm({ month, entry, onDone, onDelete }: { month: string; entry: IncomeEntry | null; onDone: () => void; onDelete: (e: IncomeEntry) => void }) {
  const today = useToday();
  const { fmt, symbol } = useMoney();
  const save = useSaveIncome();
  const amountRef = useRef<HTMLInputElement>(null);
  // Default to today when viewing the current month, otherwise to the first day of the viewed month.
  const defaultDate = monthKeyOf(today) === month ? today : `${month}-01`;

  const [amount, setAmount] = useState(entry ? minorToInput(entry.amountMinor) : "");
  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [method, setMethod] = useState<ReceivedMethod | null>(entry?.paymentMethod ?? null);
  const [description, setDescription] = useState(entry?.description ?? "");
  const [errors, setErrors] = useState<{ amount?: string; date?: string; form?: string }>({});
  const preview = parseAmount(amount);
  const yesterday = addDays(today, -1);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The Monthly Plan page is itself a form; don't let this submit bubble up and save the plan.
    e.stopPropagation();
    const found: typeof errors = {};
    if (!preview.ok) found.amount = preview.error;
    if (!isValidIsoDate(date)) found.date = "Enter a valid date";
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.amount) amountRef.current?.focus();
      return;
    }
    const input = { amountMinor: (preview as { minor: number }).minor, date, description: description.trim() || null, paymentMethod: method };
    save.mutate(
      { id: entry?.id, input },
      {
        onSuccess: (saved) => {
          toast.success(entry ? "Entry updated" : "Money received added", {
            description: `+${fmt(saved.amountMinor)} · ${formatDay(saved.date)} · added to ${monthLabel(monthKeyOf(saved.date))} income`,
          });
          onDone();
        },
        onError: (err) =>
          setErrors(
            err instanceof ApiError && err.fields
              ? { amount: err.fields.amountMinor, date: err.fields.date, form: err.message }
              : { form: errorMessage(err) },
          ),
      },
    );
  };

  return (
    <form className="expense-form" onSubmit={submit} noValidate>
      <div className={cn("field field--amount", errors.amount && "has-error")}>
        <label htmlFor="received-amount" className="field__label">
          Amount received <span className="req">*</span>
        </label>
        <div className="amount-input">
          <span className="amount-input__symbol" aria-hidden="true">
            {symbol}
          </span>
          <input
            id="received-amount"
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!errors.amount}
          />
        </div>
        {errors.amount && (
          <p className="field__error" role="alert">
            {errors.amount}
          </p>
        )}
      </div>

      <div className={cn("field", errors.date && "has-error")}>
        <label htmlFor="received-date" className="field__label">
          Date <span className="req">*</span>
        </label>
        <div className="date-row">
          <div className="input-icon">
            <CalendarDays size={16} aria-hidden="true" />
            <input id="received-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="quick-dates">
            <button type="button" className={cn("chip chip--sm", date === today && "is-active")} onClick={() => setDate(today)} aria-pressed={date === today}>
              Today
            </button>
            <button type="button" className={cn("chip chip--sm", date === yesterday && "is-active")} onClick={() => setDate(yesterday)} aria-pressed={date === yesterday}>
              Yesterday
            </button>
          </div>
        </div>
        {errors.date && <p className="field__error">{errors.date}</p>}
      </div>

      <fieldset className="field">
        <legend className="field__label">
          Received via <span className="optional">optional</span>
        </legend>
        <div className="chip-row">
          {RECEIVED_METHODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={cn("chip", method === p.value && "is-active")}
              aria-pressed={method === p.value}
              onClick={() => setMethod((cur) => (cur === p.value ? null : (p.value as ReceivedMethod)))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="received-desc" className="field__label">
          From / note <span className="optional">optional</span>
        </label>
        <input
          id="received-desc"
          className="input"
          placeholder="e.g. Salary, freelance payment, refund"
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
        />
      </div>

      {errors.form && !errors.amount && !errors.date && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}

      <div className="dialog__actions dialog__actions--split">
        {entry ? (
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => onDelete(entry)}>
            <Trash size={16} /> Delete
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : entry ? "Save changes" : `Add${preview.ok ? ` ${fmt(preview.minor)}` : ""}`}
        </button>
      </div>
    </form>
  );
}
