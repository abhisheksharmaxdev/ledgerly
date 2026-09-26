/** API response shapes shared by the server and the client. Money = integer minor units. */
import type { AppSettings, CategoryKind, PaymentMethod } from "./constants";

export interface Category {
  id: number;
  slug: string;
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
  sortOrder: number;
  archived: boolean;
  expenseCount: number;
}

export interface Expense {
  id: number;
  amountMinor: number;
  categoryId: number;
  date: string;
  description: string | null;
  paymentMethod: PaymentMethod | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseList {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
  totalAmountMinor: number;
}

export interface BudgetLine {
  categoryId: number;
  amountMinor: number;
}

export interface MonthlyPlan {
  month: string;
  incomeMinor: number;
  budgets: BudgetLine[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanResponse {
  month: string;
  plan: MonthlyPlan | null;
  /** Most recent earlier plan, offered as a starting point (never applied automatically). */
  suggestion: MonthlyPlan | null;
  /** Actual per-category totals of the previous month, shown as hints while planning. */
  previousMonthSpend: BudgetLine[];
}

export type BudgetStatus = "none" | "ok" | "warning" | "over" | "unbudgeted";

export interface CategoryBreakdown {
  categoryId: number;
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
  archived: boolean;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number | null;
  status: BudgetStatus;
  count: number;
  /** Share of total consumption spending (expense categories only). */
  sharePercent: number | null;
}

export interface MonthSummary {
  month: string;
  hasPlan: boolean;
  planIsDemo: boolean;
  /** "past" | "current" | "future" relative to the client's today. */
  period: "past" | "current" | "future";
  daysInMonth: number;
  daysElapsed: number;
  incomeMinor: number;
  spentMinor: number;
  savedMinor: number;
  plannedSpendMinor: number;
  savingsTargetMinor: number;
  unallocatedMinor: number;
  /** income − spent − saved: money still unspent and not yet moved to savings. */
  remainingMinor: number;
  budgetRemainingMinor: number;
  budgetUtilization: number | null;
  savingsRate: number | null;
  savingsProgress: number | null;
  transactionCount: number;
  todaySpentMinor: number | null;
  avgDailySpentMinor: number;
  previous: {
    month: string;
    spentMinor: number;
    savedMinor: number;
    hasData: boolean;
    /** Spending of the previous month up to the same day-of-month (only for the current month). */
    samePeriodSpentMinor: number | null;
  };
  changeMinor: number | null;
  changePercent: number | null;
  categories: CategoryBreakdown[];
  overBudgetCount: number;
  warningCount: number;
}

export interface DailyPoint {
  date: string;
  spentMinor: number;
  savedMinor: number;
  count: number;
  cumulativeMinor: number;
}

export interface PaymentBreakdown {
  method: PaymentMethod | "none";
  label: string;
  amountMinor: number;
  count: number;
}

export interface MonthAnalytics {
  month: string;
  daily: DailyPoint[];
  paymentMethods: PaymentBreakdown[];
  weekdayPattern: {
    weekdayAvgMinor: number;
    weekendAvgMinor: number;
    weekdayDays: number;
    weekendDays: number;
  };
  byWeekday: { dow: number; label: string; amountMinor: number }[];
  largestExpense: Expense | null;
}

export interface TrendPoint {
  month: string;
  incomeMinor: number;
  spentMinor: number;
  savedMinor: number;
  plannedSpendMinor: number;
  hasPlan: boolean;
  count: number;
}

export interface MonthListItem {
  month: string;
  hasPlan: boolean;
  incomeMinor: number;
  spentMinor: number;
  savedMinor: number;
  count: number;
}

export type InsightTone = "positive" | "neutral" | "warning" | "negative";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail?: string;
}

export interface InsightsResponse {
  month: string;
  status: "ok" | "insufficient";
  message: string | null;
  insights: Insight[];
}

export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "active" | "rejected";

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
}

export interface SessionInfo {
  authenticated: boolean;
  user: SessionUser | null;
}

/** A registration as seen by the administrator. */
export interface AdminUser {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  reviewedAt: string | null;
  lastLoginAt: string | null;
}

export interface AdminOverview {
  counts: Record<UserStatus, number>;
  mailConfigured: boolean;
}

export interface DataStatus {
  expenseCount: number;
  planCount: number;
  demoExpenseCount: number;
  demoPlanCount: number;
}

export interface ImportPreview {
  valid: boolean;
  totalRows: number;
  validRows: number;
  totalAmountMinor: number;
  errors: { row: number; message: string }[];
  months: string[];
  imported: number;
}

export type { AppSettings };
