import { Link } from "react-router";
import { Plus, ReceiptText } from "lucide-react";
import { useState } from "react";
import type { Expense } from "../../../../shared/types";
import { monthName } from "../../../../shared/dates";
import { useCategories, useExpenses } from "../../api/queries";
import { useUi } from "../../store/ui";
import { cn } from "../../utils/cn";
import { DeleteExpenseConfirm } from "../expenses/DeleteExpenseConfirm";
import { ExpenseList } from "../expenses/ExpenseList";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "../ui/Feedback";

export function RecentTransactions({ month, className }: { month: string; className?: string }) {
  const { openAddExpense, openEditExpense } = useUi();
  const list = useExpenses(`month=${month}&pageSize=8&sort=date&order=desc`);
  const { data: categories = [] } = useCategories();
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const total = list.data?.total ?? 0;

  return (
    <Card className={cn("recent", className)} aria-labelledby="recent-title">
      <CardHeader
        id="recent-title"
        title="Recent transactions"
        subtitle={total ? `${total} in ${monthName(month)}` : undefined}
        action={
          total > 0 ? (
            <Link to={`/expenses?month=${month}`} className="btn btn--ghost btn--sm">
              View all
            </Link>
          ) : undefined
        }
      />
      {list.isLoading ? (
        <SkeletonRows rows={4} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} compact />
      ) : total === 0 ? (
        <EmptyState
          icon={<ReceiptText size={22} />}
          title="No expenses recorded yet."
          body={`Nothing logged for ${monthName(month)} so far.`}
          action={
            <button type="button" className="btn btn--primary" onClick={openAddExpense}>
              <Plus size={16} /> Add your first expense
            </button>
          }
        />
      ) : (
        <ExpenseList label="Recent transactions" items={list.data!.items} categories={categories} onEdit={openEditExpense} onDelete={setToDelete} />
      )}
      <DeleteExpenseConfirm expense={toDelete} onClose={() => setToDelete(null)} />
    </Card>
  );
}
