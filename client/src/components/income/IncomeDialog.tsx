import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarDays, Trash } from "lucide-react";
import { RECEIVED_METHODS, type ReceivedMethod } from "../../../../shared/constants";
import { addDays, formatDay, isValidIsoDate, monthKeyOf, monthLabel } from "../../../../shared/dates";
import { minorToInput, parseAmount } from "../../../../shared/money";
import type { IncomeEntry } from "../../../../shared/types";
import { ApiError, errorMessage } from "../../api/client";
import { useSaveIncome } from "../../api/queries";
import { useMoney, useToday } from "../../hooks";
import { useUi } from "../../store/ui";
import { cn } from "../../utils/cn";
import { Dialog } from "../ui/Dialog";
import { DeleteIncomeConfirm } from "./DeleteIncomeConfirm";

export function IncomeDialog() {
  const { incomeDialog, closeIncomeDialog } = useUi();
  const editing = incomeDialog.entry;
  return (
    <Dialog
      open={incomeDialog.open}
      onOpenChange={(o) => !o && closeIncomeDialog()}
      title={editing ? "Edit money received" : "Add money received"}
      description="It's added to the income of the month it was received in."
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById("received-amount")?.focus();
      }}
    >
      {incomeDialog.open && <IncomeForm key={incomeDialog.key} entry={editing} onDone={closeIncomeDialog} />}
    </Dialog>
  );
}

function IncomeForm({ entry, onDone }: { entry: IncomeEntry | null; onDone: () => void }) {
  const today = useToday();
  const { fmt, symbol } = useMoney();
  const { month: viewedMonth, setMonth } = useUi();
  const save = useSaveIncome();
  const amountRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState(entry ? minorToInput(entry.amountMinor) : "");
  const [date, setDate] = useState(entry?.date ?? today);
  const [method, setMethod] = useState<ReceivedMethod | null>(entry?.paymentMethod ?? null);
  const [description, setDescription] = useState(entry?.description ?? "");
  const [errors, setErrors] = useState<{ amount?: string; date?: string; form?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = parseAmount(amount);
  const yesterday = addDays(today, -1);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The dialog can open over the Monthly Plan form; don't let this submit bubble up and save the plan.
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
          const savedMonth = monthKeyOf(saved.date);
          toast.success(entry ? "Entry updated" : "Money received added", {
            description: `+${fmt(saved.amountMinor)} · ${formatDay(saved.date)} · added to ${monthLabel(savedMonth)} income`,
            action: savedMonth !== viewedMonth ? { label: `View ${monthLabel(savedMonth, true)}`, onClick: () => setMonth(savedMonth) } : undefined,
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
            onChange={(e) => {
              setAmount(e.target.value);
              if (errors.amount) setErrors((x) => ({ ...x, amount: undefined }));
            }}
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? "received-amount-error" : undefined}
          />
        </div>
        {errors.amount && (
          <p className="field__error" id="received-amount-error" role="alert">
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
            <input id="received-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required aria-invalid={!!errors.date} />
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
        {errors.date && (
          <p className="field__error" role="alert">
            {errors.date}
          </p>
        )}
      </div>

      {/* Optional; clicking the selected method again clears it. */}
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
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => setConfirmDelete(true)}>
            <Trash size={16} /> Delete
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : entry ? "Save changes" : `Add${preview.ok ? ` ${fmt(preview.minor)}` : " money received"}`}
        </button>
      </div>

      {entry && <DeleteIncomeConfirm entry={confirmDelete ? entry : null} onClose={() => setConfirmDelete(false)} onDeleted={onDone} />}
    </form>
  );
}
