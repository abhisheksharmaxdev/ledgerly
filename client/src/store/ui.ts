import { create } from "zustand";
import type { Expense, IncomeEntry } from "../../../shared/types";
import { isValidMonthKey, localToday, monthKeyOf } from "../../../shared/dates";

const LAST_MONTH_KEY = "ledgerly.lastMonth";

export function readLastViewedMonth(): string | null {
  try {
    const v = localStorage.getItem(LAST_MONTH_KEY);
    return v && isValidMonthKey(v) ? v : null;
  } catch {
    return null;
  }
}

interface ExpenseDialogState {
  open: boolean;
  expense: Expense | null;
  /** Changes on every open so the form remounts with fresh defaults (e.g. today's date). */
  key: number;
}

interface IncomeDialogState {
  open: boolean;
  entry: IncomeEntry | null;
  key: number;
}

interface UiState {
  month: string;
  setMonth: (month: string) => void;
  expenseDialog: ExpenseDialogState;
  openAddExpense: () => void;
  openEditExpense: (expense: Expense) => void;
  closeExpenseDialog: () => void;
  incomeDialog: IncomeDialogState;
  openAddIncome: () => void;
  openEditIncome: (entry: IncomeEntry) => void;
  closeIncomeDialog: () => void;
}

export const useUi = create<UiState>((set) => ({
  month: monthKeyOf(localToday()),
  setMonth: (month) => {
    try {
      localStorage.setItem(LAST_MONTH_KEY, month);
    } catch {
      /* ignore */
    }
    set({ month });
  },
  expenseDialog: { open: false, expense: null, key: 0 },
  openAddExpense: () => set((s) => ({ expenseDialog: { open: true, expense: null, key: s.expenseDialog.key + 1 } })),
  openEditExpense: (expense) => set((s) => ({ expenseDialog: { open: true, expense, key: s.expenseDialog.key + 1 } })),
  closeExpenseDialog: () => set((s) => ({ expenseDialog: { ...s.expenseDialog, open: false } })),
  incomeDialog: { open: false, entry: null, key: 0 },
  openAddIncome: () => set((s) => ({ incomeDialog: { open: true, entry: null, key: s.incomeDialog.key + 1 } })),
  openEditIncome: (entry) => set((s) => ({ incomeDialog: { open: true, entry, key: s.incomeDialog.key + 1 } })),
  closeIncomeDialog: () => set((s) => ({ incomeDialog: { ...s.incomeDialog, open: false } })),
}));
