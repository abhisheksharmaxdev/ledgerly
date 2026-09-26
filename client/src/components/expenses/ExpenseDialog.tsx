import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarDays, Trash } from "lucide-react";
import { PAYMENT_METHODS, type PaymentMethod } from "../../../../shared/constants";
import { addDays, formatDay, isValidIsoDate, monthKeyOf, monthLabel } from "../../../../shared/dates";
import { minorToInput, parseAmount } from "../../../../shared/money";
import type { Category, Expense } from "../../../../shared/types";
import { ApiError, errorMessage } from "../../api/client";
import { useCategories, useExpenses, useSaveExpense } from "../../api/queries";
import { useMoney, useToday } from "../../hooks";
import { useUi } from "../../store/ui";
import { cn } from "../../utils/cn";
import { iconFor } from "../../utils/categoryIcon";
import { Dialog } from "../ui/Dialog";
import { DeleteExpenseConfirm } from "./DeleteExpenseConfirm";

const LAST_PAYMENT_KEY = "ledgerly.lastPayment";

function rememberedPayment(): PaymentMethod | null {
  try {
    const v = localStorage.getItem(LAST_PAYMENT_KEY);
    return PAYMENT_METHODS.some((p) => p.value === v) ? (v as PaymentMethod) : null;
  } catch {
    return null;
  }
}

export function ExpenseDialog() {
  const { expenseDialog, closeExpenseDialog } = useUi();
  const editing = expenseDialog.expense;
  return (
    <Dialog
      open={expenseDialog.open}
      onOpenChange={(o) => !o && closeExpenseDialog()}
      title={editing ? "Edit expense" : "Add expense"}
      description={editing ? "Update the details and save." : "Amount, category, save. Date defaults to today."}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById("expense-amount")?.focus();
      }}
    >
      {expenseDialog.open && <ExpenseForm key={expenseDialog.key} expense={editing} onDone={closeExpenseDialog} />}
    </Dialog>
  );
}

interface Errors {
  amount?: string;
  categoryId?: string;
  date?: string;
  description?: string;
  form?: string;
}

function ExpenseForm({ expense, onDone }: { expense: Expense | null; onDone: () => void }) {
  const today = useToday();
  const { fmt, symbol } = useMoney();
  const { month: viewedMonth, setMonth } = useUi();
  const { data: categories = [] } = useCategories();
  const save = useSaveExpense();
  const amountRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState(expense ? minorToInput(expense.amountMinor) : "");
  const [categoryId, setCategoryId] = useState<number | null>(expense?.categoryId ?? null);
  const [date, setDate] = useState(expense?.date ?? today);
  const [payment, setPayment] = useState<PaymentMethod | null>(expense ? expense.paymentMethod : rememberedPayment());
  const [description, setDescription] = useState(expense?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectable = useMemo(
    () => categories.filter((c) => !c.archived || c.id === expense?.categoryId),
    [categories, expense?.categoryId],
  );
  const selected = categories.find((c) => c.id === categoryId);

  // Quick-fill suggestions: recent descriptions used in the chosen category.
  const recent = useExpenses("pageSize=150&sort=date&order=desc");
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of recent.data?.items ?? []) {
      if (e.description && (!categoryId || e.categoryId === categoryId)) seen.add(e.description);
      if (seen.size >= 8) break;
    }
    return [...seen];
  }, [recent.data, categoryId]);

  const preview = parseAmount(amount);

  function validate(): Errors {
    const next: Errors = {};
    if (!preview.ok) next.amount = preview.error;
    if (!categoryId) next.categoryId = "Choose a category";
    if (!isValidIsoDate(date)) next.date = "Enter a valid date";
    if (description.length > 200) next.description = "Keep it under 200 characters";
    return next;
  }

  function submit(e: FormEvent, addAnother = false) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.amount) amountRef.current?.focus();
      return;
    }
    const amountMinor = (preview as { minor: number }).minor;
    const input = { amountMinor, categoryId: categoryId!, date, description: description.trim() || null, paymentMethod: payment };
    save.mutate(
      { id: expense?.id, input },
      {
        onSuccess: (saved) => {
          try {
            if (payment) localStorage.setItem(LAST_PAYMENT_KEY, payment);
          } catch {
            /* ignore */
          }
          const savedMonth = monthKeyOf(saved.date);
          const outside = savedMonth !== viewedMonth;
          toast.success(expense ? "Expense updated" : "Expense added", {
            description: `${fmt(saved.amountMinor)} · ${selected?.name ?? ""} · ${formatDay(saved.date)}`,
            action: outside ? { label: `View ${monthLabel(savedMonth, true)}`, onClick: () => setMonth(savedMonth) } : undefined,
          });
          if (addAnother) {
            setAmount("");
            setDescription("");
            setCategoryId(null);
            setErrors({});
            amountRef.current?.focus();
          } else onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.fields) {
            setErrors({
              amount: err.fields.amountMinor,
              categoryId: err.fields.categoryId,
              date: err.fields.date,
              description: err.fields.description,
              form: err.message,
            });
          } else setErrors({ form: errorMessage(err) });
        },
      },
    );
  }

  const yesterday = addDays(today, -1);

  return (
    <form className="expense-form" onSubmit={(e) => submit(e)} noValidate>
      <div className={cn("field field--amount", errors.amount && "has-error")}>
        <label htmlFor="expense-amount" className="field__label">
          Amount <span className="req">*</span>
        </label>
        <div className="amount-input">
          <span className="amount-input__symbol" aria-hidden="true">
            {symbol}
          </span>
          <input
            id="expense-amount"
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
            aria-describedby={errors.amount ? "amount-error" : undefined}
          />
        </div>
        {errors.amount && (
          <p className="field__error" id="amount-error" role="alert">
            {errors.amount}
          </p>
        )}
      </div>

      <fieldset className={cn("field", errors.categoryId && "has-error")} aria-describedby={errors.categoryId ? "cat-error" : undefined}>
        <legend className="field__label">
          Category <span className="req">*</span>
        </legend>
        <div className="chip-grid" role="radiogroup" aria-label="Category">
          {selectable.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              checked={c.id === categoryId}
              onSelect={() => {
                setCategoryId(c.id);
                if (errors.categoryId) setErrors((x) => ({ ...x, categoryId: undefined }));
              }}
            />
          ))}
        </div>
        {errors.categoryId && (
          <p className="field__error" id="cat-error" role="alert">
            {errors.categoryId}
          </p>
        )}
      </fieldset>

      <div className="form-row">
        <div className={cn("field", errors.date && "has-error")}>
          <label htmlFor="expense-date" className="field__label">
            Date <span className="req">*</span>
          </label>
          <div className="date-row">
            <div className="input-icon">
              <CalendarDays size={16} aria-hidden="true" />
              <input id="expense-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required aria-invalid={!!errors.date} />
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
      </div>

      {/* Optional; clicking the selected method again clears it. */}
      <fieldset className="field">
        <legend className="field__label">
          Payment method <span className="optional">optional</span>
        </legend>
        <div className="chip-row">
          {PAYMENT_METHODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={cn("chip", payment === p.value && "is-active")}
              aria-pressed={payment === p.value}
              onClick={() => setPayment((cur) => (cur === p.value ? null : p.value))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={cn("field", errors.description && "has-error")}>
        <label htmlFor="expense-desc" className="field__label">
          Description <span className="optional">optional</span>
        </label>
        <input
          id="expense-desc"
          className="input"
          list="expense-desc-suggestions"
          placeholder={selected ? `e.g. ${suggestions[0] ?? "What was it for?"}` : "What was it for?"}
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
        />
        <datalist id="expense-desc-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {errors.description && <p className="field__error">{errors.description}</p>}
      </div>

      {errors.form && !errors.amount && !errors.categoryId && !errors.date && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}

      <div className="dialog__actions dialog__actions--split">
        {expense ? (
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => setConfirmDelete(true)}>
            <Trash size={16} /> Delete
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={(e) => submit(e, true)} disabled={save.isPending}>
            Save &amp; add another
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : expense ? "Save changes" : `Save${preview.ok ? ` ${fmt(preview.minor)}` : " expense"}`}
        </button>
      </div>

      {expense && (
        <DeleteExpenseConfirm expense={confirmDelete ? expense : null} onClose={() => setConfirmDelete(false)} onDeleted={onDone} />
      )}
    </form>
  );
}

function CategoryChip({ category, checked, onSelect }: { category: Category; checked: boolean; onSelect: () => void }) {
  const Icon = iconFor(category.icon);
  return (
    <label className={cn("cat-chip", checked && "is-active")} style={{ "--cat": category.color } as CSSProperties}>
      <input type="radio" name="expense-category" checked={checked} onChange={onSelect} className="sr-only" />
      <span className="cat-chip__icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="cat-chip__name">{category.name}</span>
    </label>
  );
}
