import { toast } from "sonner";
import type { IncomeEntry } from "../../../../shared/types";
import { formatDay } from "../../../../shared/dates";
import { errorMessage } from "../../api/client";
import { useDeleteIncome, useSaveIncome } from "../../api/queries";
import { useMoney } from "../../hooks";
import { ConfirmDialog } from "../ui/Dialog";

/** Confirmation + delete + "Undo" toast (re-creates the same entry). */
export function DeleteIncomeConfirm({ entry, onClose, onDeleted }: { entry: IncomeEntry | null; onClose: () => void; onDeleted?: () => void }) {
  const del = useDeleteIncome();
  const restore = useSaveIncome();
  const { fmt } = useMoney();

  const confirm = () => {
    if (!entry) return;
    del.mutate(entry.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
        toast.success("Entry deleted", {
          duration: 8000,
          description: `${fmt(entry.amountMinor)} · ${entry.description ?? "Money received"} · ${formatDay(entry.date)}`,
          action: {
            label: "Undo",
            onClick: () =>
              restore.mutate(
                { input: { amountMinor: entry.amountMinor, date: entry.date, description: entry.description, paymentMethod: entry.paymentMethod } },
                {
                  onSuccess: () => toast.success("Entry restored"),
                  onError: (e) => toast.error("Couldn't restore the entry", { description: errorMessage(e) }),
                },
              ),
          },
        });
      },
      onError: (e) => toast.error("Couldn't delete the entry", { description: errorMessage(e) }),
    });
  };

  return (
    <ConfirmDialog
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title="Delete this entry?"
      description={
        entry ? (
          <>
            {fmt(entry.amountMinor)} received on {formatDay(entry.date, "long")}
            {entry.description ? ` (“${entry.description}”)` : ""} will be removed from that month's income.
          </>
        ) : null
      }
      confirmLabel="Delete entry"
      busy={del.isPending}
      onConfirm={confirm}
    />
  );
}
