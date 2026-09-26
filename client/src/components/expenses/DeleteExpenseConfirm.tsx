import { toast } from "sonner";
import type { Expense } from "../../../../shared/types";
import { formatDay } from "../../../../shared/dates";
import { errorMessage } from "../../api/client";
import { useCategories, useDeleteExpense, useSaveExpense } from "../../api/queries";
import { useMoney } from "../../hooks";
import { ConfirmDialog } from "../ui/Dialog";

/** Confirmation + delete + "Undo" toast (re-creates the same expense). */
export function DeleteExpenseConfirm({ expense, onClose, onDeleted }: { expense: Expense | null; onClose: () => void; onDeleted?: () => void }) {
  const del = useDeleteExpense();
  const restore = useSaveExpense();
  const { fmt } = useMoney();
  const { data: categories } = useCategories();
  const category = categories?.find((c) => c.id === expense?.categoryId);

  const confirm = () => {
    if (!expense) return;
    del.mutate(expense.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
        toast.success("Expense deleted", {
          duration: 8000,
          description: `${fmt(expense.amountMinor)} · ${category?.name ?? "Expense"} · ${formatDay(expense.date)}`,
          action: {
            label: "Undo",
            onClick: () =>
              restore.mutate(
                {
                  input: {
                    amountMinor: expense.amountMinor,
                    categoryId: expense.categoryId,
                    date: expense.date,
                    description: expense.description,
                    paymentMethod: expense.paymentMethod,
                  },
                },
                {
                  onSuccess: () => toast.success("Expense restored"),
                  onError: (e) => toast.error("Couldn't restore the expense", { description: errorMessage(e) }),
                },
              ),
          },
        });
      },
      onError: (e) => toast.error("Couldn't delete the expense", { description: errorMessage(e) }),
    });
  };

  return (
    <ConfirmDialog
      open={!!expense}
      onOpenChange={(o) => !o && onClose()}
      title="Delete this expense?"
      description={
        expense ? (
          <>
            {fmt(expense.amountMinor)} for {category?.name ?? "this category"} on {formatDay(expense.date, "long")}
            {expense.description ? ` (“${expense.description}”)` : ""} will be removed. Your totals update immediately.
          </>
        ) : null
      }
      confirmLabel="Delete expense"
      busy={del.isPending}
      onConfirm={confirm}
    />
  );
}
