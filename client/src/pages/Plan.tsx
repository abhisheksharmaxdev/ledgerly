import { Copy, Info, Save, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useBlocker } from "react-router";
import { toast } from "sonner";
import { monthLabel, monthName, shiftMonth } from "../../../shared/dates";
import { minorToInput, parseAmount } from "../../../shared/money";
import type { Category, PlanResponse } from "../../../shared/types";
import { errorMessage } from "../api/client";
import { useCategories, usePlan, useSavePlan } from "../api/queries";
import { Page } from "../components/layout/Page";
import { Card, CardHeader } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/Dialog";
import { ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { AnimatedMoney } from "../components/ui/Money";
import { useMoney } from "../hooks";
import { useUi } from "../store/ui";
import { CategoryBadge } from "../utils/categoryIcon";
import { cn } from "../utils/cn";

export default function Plan() {
  const month = useUi((s) => s.month);
  const plan = usePlan(month);
  const categories = useCategories();

  return (
    <Page title="Monthly Plan" subtitle={`Income and category budgets for ${monthLabel(month)}. Each month keeps its own plan.`}>
      {plan.error || categories.error ? (
        <Card>
          <ErrorState error={plan.error ?? categories.error} onRetry={() => (plan.refetch(), categories.refetch())} />
        </Card>
      ) : !plan.data || !categories.data || plan.data.month !== month ? (
        <Card>
          <SkeletonRows rows={8} height={52} />
        </Card>
      ) : (
        <PlanForm key={`${month}-${plan.data.plan?.updatedAt ?? "new"}`} month={month} data={plan.data} categories={categories.data} />
      )}
    </Page>
  );
}

type Values = { income: string; budgets: Record<number, string> };

function valuesFrom(p: { incomeMinor: number; budgets: { categoryId: number; amountMinor: number }[] } | null): Values {
  if (!p) return { income: "", budgets: {} };
  return {
    income: p.incomeMinor ? minorToInput(p.incomeMinor) : "",
    budgets: Object.fromEntries(p.budgets.map((b) => [b.categoryId, b.amountMinor ? minorToInput(b.amountMinor) : "0"])),
  };
}

function parseField(v: string | undefined): { minor: number; error?: string } {
  if (!v || !v.trim()) return { minor: 0 };
  const r = parseAmount(v, { allowZero: true });
  if (r.ok) return { minor: r.minor };
  return { minor: 0, error: r.error.replace("Amount", "Value") };
}

function PlanForm({ month, data, categories }: { month: string; data: PlanResponse; categories: Category[] }) {
  const { fmt, symbol } = useMoney();
  const save = useSavePlan();
  const initial = useMemo(() => valuesFrom(data.plan), [data.plan]);
  const [values, setValues] = useState<Values>(initial);
  const [confirmOver, setConfirmOver] = useState(false);

  const planBudgetIds = new Set(data.plan?.budgets.map((b) => b.categoryId) ?? []);
  const rows = categories.filter((c) => !c.archived || planBudgetIds.has(c.id));
  const expenseRows = rows.filter((c) => c.kind === "expense");
  const savingsRows = rows.filter((c) => c.kind === "savings");
  const lastSpend = new Map(data.previousMonthSpend.map((b) => [b.categoryId, b.amountMinor]));

  const income = parseField(values.income);
  const parsed = new Map(rows.map((c) => [c.id, parseField(values.budgets[c.id])]));
  const planned = expenseRows.reduce((s, c) => s + (parsed.get(c.id)?.minor ?? 0), 0);
  const savingsTarget = savingsRows.reduce((s, c) => s + (parsed.get(c.id)?.minor ?? 0), 0);
  const allocated = planned + savingsTarget;
  const unallocated = income.minor - allocated;
  const hasErrors = !!income.error || [...parsed.values()].some((p) => p.error);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  // Protect unsaved edits from accidental navigation.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const setBudget = (id: number, v: string) => setValues((s) => ({ ...s, budgets: { ...s.budgets, [id]: v } }));

  const doSave = () => {
    const budgets = rows
      .filter((c) => (values.budgets[c.id] ?? "").trim() !== "")
      .map((c) => ({ categoryId: c.id, amountMinor: parsed.get(c.id)!.minor }));
    save.mutate(
      { month, input: { incomeMinor: income.minor, budgets } },
      {
        onSuccess: () => {
          setConfirmOver(false);
          toast.success("Monthly plan saved", { description: `${monthLabel(month)} · ${fmt(income.minor)} income · ${fmt(allocated)} allocated` });
        },
        onError: (e) => toast.error("Couldn't save the plan", { description: errorMessage(e) }),
      },
    );
  };

  const submit = () => {
    if (hasErrors) {
      toast.error("Some values need fixing before saving");
      return;
    }
    if (unallocated < 0) setConfirmOver(true);
    else doSave();
  };

  const scale = Math.max(income.minor, allocated, 1);
  const w = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;

  return (
    <form
      className="plan-layout"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="plan-main">
        {!data.plan && data.suggestion && (
          <Card className="plan-suggestion">
            <div className="plan-suggestion__body">
              <Info size={18} aria-hidden="true" />
              <p>
                No plan for {monthName(month)} yet. Start from your <strong>{monthLabel(data.suggestion.month)}</strong> plan? Nothing is saved until you click Save.
              </p>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setValues(valuesFrom(data.suggestion))}>
              <Copy size={15} /> Copy {monthName(data.suggestion.month, true)} plan
            </button>
          </Card>
        )}

        <Card aria-labelledby="income-title">
          <CardHeader id="income-title" title="Income" subtitle="Total money coming in this month" />
          <MoneyField id="income" label="Monthly income" symbol={symbol} value={values.income} error={income.error} onChange={(v) => setValues((s) => ({ ...s, income: v }))} large />
        </Card>

        <Card aria-labelledby="budgets-title">
          <CardHeader id="budgets-title" title="Spending budgets" subtitle="How much you plan to spend in each category" />
          <div className="plan-rows">
            {expenseRows.map((c) => (
              <PlanRow key={c.id} c={c} symbol={symbol} value={values.budgets[c.id] ?? ""} error={parsed.get(c.id)?.error} last={lastSpend.get(c.id)} lastLabel={monthName(shiftMonth(month, -1), true)} onChange={(v) => setBudget(c.id, v)} />
            ))}
          </div>
        </Card>

        <Card aria-labelledby="savings-title" className="plan-savings">
          <CardHeader id="savings-title" title="Savings / Investments target" subtitle="Money you intend to set aside. It is tracked separately and never counted as spending." />
          <div className="plan-rows">
            {savingsRows.map((c) => (
              <PlanRow key={c.id} c={c} symbol={symbol} value={values.budgets[c.id] ?? ""} error={parsed.get(c.id)?.error} last={lastSpend.get(c.id)} lastLabel={monthName(shiftMonth(month, -1), true)} onChange={(v) => setBudget(c.id, v)} />
            ))}
          </div>
        </Card>
      </div>

      <aside className="plan-aside">
        <Card variant="raised" className="plan-summary" aria-labelledby="alloc-title">
          <CardHeader id="alloc-title" title="Allocation" subtitle={monthLabel(month)} />
          <dl className="alloc-list">
            <div>
              <dt>Income</dt>
              <dd>
                <AnimatedMoney minor={income.minor} />
              </dd>
            </div>
            <div>
              <dt>
                <span className="dot dot--spent" /> Planned expenses
              </dt>
              <dd>
                <AnimatedMoney minor={planned} />
              </dd>
            </div>
            <div>
              <dt>
                <span className="dot dot--saved" /> Savings target
              </dt>
              <dd>
                <AnimatedMoney minor={savingsTarget} />
              </dd>
            </div>
            <div className="alloc-list__total">
              <dt>Total planned allocation</dt>
              <dd>
                <AnimatedMoney minor={allocated} />
              </dd>
            </div>
            <div className={cn("alloc-list__left", unallocated < 0 && "is-negative")}>
              <dt>{unallocated < 0 ? "Over-allocated by" : "Unallocated"}</dt>
              <dd>
                <AnimatedMoney minor={Math.abs(unallocated)} />
              </dd>
            </div>
          </dl>
          <div className="alloc__bar alloc__bar--lg" role="img" aria-label={`${fmt(planned)} planned spending and ${fmt(savingsTarget)} savings out of ${fmt(income.minor)} income`}>
            <span className="alloc__seg alloc__seg--spent" style={{ width: w(planned) }} />
            <span className="alloc__seg alloc__seg--saved" style={{ width: w(savingsTarget) }} />
            {income.minor > 0 && allocated > income.minor && <span className="alloc__income-mark" style={{ left: w(income.minor) }} title="Income" />}
          </div>

          {unallocated < 0 && (
            <p className="callout callout--warning" role="status">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>
                Your plan allocates {fmt(-unallocated)} more than your income. You can still save it; lower a few budgets if you'd like it to balance.
              </span>
            </p>
          )}
          {income.minor === 0 && allocated > 0 && (
            <p className="callout callout--info">
              <Info size={16} aria-hidden="true" />
              <span>Add your income to see how much is left unallocated.</span>
            </p>
          )}

          <div className="plan-summary__actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={save.isPending || (!dirty && !!data.plan)}>
              <Save size={16} /> {save.isPending ? "Saving…" : "Save monthly plan"}
            </button>
            {dirty && (
              <button type="button" className="btn btn--ghost btn--block btn--sm" onClick={() => setValues(initial)}>
                Discard changes
              </button>
            )}
            <p className="muted small">{dirty ? "You have unsaved changes." : data.plan ? "Plan saved." : "Not saved yet."}</p>
          </div>
        </Card>
      </aside>

      {/* Mobile sticky save bar */}
      <div className="plan-savebar" aria-hidden={false}>
        <div>
          <span className="muted small">{unallocated < 0 ? "Over-allocated" : "Unallocated"}</span>
          <strong className={cn(unallocated < 0 && "text-negative")}>{fmt(Math.abs(unallocated))}</strong>
        </div>
        <button type="submit" className="btn btn--primary" disabled={save.isPending || (!dirty && !!data.plan)}>
          <Save size={16} /> Save plan
        </button>
      </div>

      <ConfirmDialog
        open={confirmOver}
        onOpenChange={setConfirmOver}
        title="Plan exceeds income"
        description={`You're allocating ${fmt(allocated)} against ${fmt(income.minor)} of income: ${fmt(-unallocated)} more than you earn this month. Save it anyway?`}
        confirmLabel="Save anyway"
        tone="primary"
        busy={save.isPending}
        onConfirm={doSave}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(o) => !o && blocker.reset?.()}
        title="Discard unsaved changes?"
        description="Your monthly plan has changes that haven't been saved."
        confirmLabel="Discard and leave"
        onConfirm={() => blocker.proceed?.()}
      />
    </form>
  );
}

function PlanRow({ c, symbol, value, error, last, lastLabel, onChange }: { c: Category; symbol: string; value: string; error?: string; last?: number; lastLabel: string; onChange: (v: string) => void }) {
  const { fmt } = useMoney();
  const id = `budget-${c.id}`;
  return (
    <div className={cn("plan-row", error && "has-error")} style={{ "--cat": c.color } as CSSProperties}>
      <CategoryBadge icon={c.icon} color={c.color} size={34} />
      <div className="plan-row__label">
        <label htmlFor={id}>{c.name}</label>
        {last ? (
          <button type="button" className="hint-btn" onClick={() => onChange(minorToInput(last))} title="Use last month's actual spending">
            {lastLabel}: {fmt(last)}
          </button>
        ) : (
          <span className="hint-muted">{c.archived ? "Archived category" : `No ${lastLabel} spending`}</span>
        )}
      </div>
      <MoneyField id={id} label={c.name} symbol={symbol} value={value} error={error} onChange={onChange} hideLabel />
    </div>
  );
}

function MoneyField({ id, label, symbol, value, error, onChange, large, hideLabel }: { id: string; label: string; symbol: string; value: string; error?: string; onChange: (v: string) => void; large?: boolean; hideLabel?: boolean }) {
  return (
    <div className={cn("money-field", large && "money-field--lg", error && "has-error")}>
      {!hideLabel && (
        <label htmlFor={id} className="field__label">
          {label}
        </label>
      )}
      <div className="money-input">
        <span aria-hidden="true">{symbol}</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      </div>
      {error && (
        <p className="field__error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}
