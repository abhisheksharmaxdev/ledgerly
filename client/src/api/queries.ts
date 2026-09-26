/** React Query hooks — the only place components talk to the API. */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminOverview,
  AdminUser,
  UserStatus,
  AppSettings,
  Category,
  DataStatus,
  Expense,
  ExpenseList,
  ImportPreview,
  InsightsResponse,
  MonthAnalytics,
  MonthListItem,
  MonthSummary,
  MonthlyPlan,
  PlanResponse,
  SessionInfo,
  TrendPoint,
} from "../../../shared/types";
import type { ExpenseInput, PlanInput } from "../../../shared/schemas";

export const qk = {
  session: ["session"] as const,
  health: ["health"] as const,
  settings: ["settings"] as const,
  categories: ["categories"] as const,
  months: ["months"] as const,
  summary: (month: string, today: string) => ["summary", month, today] as const,
  analytics: (month: string, today: string) => ["analytics", month, today] as const,
  insights: (month: string, today: string) => ["insights", month, today] as const,
  trend: (end: string, count: number, today: string) => ["trend", end, count, today] as const,
  plan: (month: string) => ["plan", month] as const,
  expenses: (params: string) => ["expenses", params] as const,
  dataStatus: ["dataStatus"] as const,
};

/**
 * Drops every cached query except the session itself. Used whenever the signed-in account
 * changes so one account's data can never be shown to another. (The session query is kept
 * because the app root is subscribed to it; it's updated in place instead.)
 */
export function clearAccountData(qc: QueryClient) {
  qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
}

/** After any data change every derived view must refresh (totals, charts, insights…). */
function useInvalidateData() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      predicate: (q) => !["session", "health", "settings", "admin"].includes(String(q.queryKey[0])),
    });
}

// ---------- session ----------

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: () => api<SessionInfo>("GET", "/auth/session"), staleTime: Infinity, retry: 1 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<SessionInfo>("POST", "/auth/login", body),
    onSuccess: (s) => {
      // Never let one account's cached data leak into the next account's session.
      clearAccountData(qc);
      qc.setQueryData(qk.session, s);
    },
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<{ status: "pending"; message: string }>("POST", "/auth/signup", body),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SessionInfo>("POST", "/auth/logout"),
    onSuccess: (s) => {
      clearAccountData(qc);
      qc.setQueryData(qk.session, s);
    },
  });
}

// ---------- admin (access is enforced by the server) ----------

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api<AdminOverview>("GET", "/admin/overview"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useAdminUsers(status: UserStatus | "all") {
  return useQuery({
    queryKey: ["admin", "users", status],
    queryFn: () => api<AdminUser[]>("GET", `/admin/users?status=${status}`),
    placeholderData: keepPreviousData,
  });
}

export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" | "delete" }): Promise<AdminUser | null> =>
      action === "delete" ? (await api<void>("DELETE", `/admin/users/${id}`), null) : api<AdminUser>("POST", `/admin/users/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api<{ ok: boolean }>("GET", "/health"),
    refetchInterval: (q) => (q.state.status === "error" ? 5000 : 60000),
    retry: false,
  });
}

// ---------- reference data ----------

export function useSettings(enabled = true) {
  return useQuery({ queryKey: qk.settings, queryFn: () => api<AppSettings>("GET", "/settings"), staleTime: 5 * 60_000, enabled });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api<AppSettings>("PUT", "/settings", patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.settings });
      const prev = qc.getQueryData<AppSettings>(qk.settings);
      if (prev) qc.setQueryData(qk.settings, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(qk.settings, ctx.prev),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s);
      qc.invalidateQueries({ queryKey: ["insights"] }); // currency affects insight wording
    },
  });
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: () => api<Category[]>("GET", "/categories"), staleTime: 60_000 });
}

export function useCreateCategory() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: (input: { name: string; color: string; icon: string; kind: "expense" | "savings" }) =>
      api<Category>("POST", "/categories", input),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; name?: string; color?: string; icon?: string; archived?: boolean }) =>
      api<Category>("PATCH", `/categories/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useMonths() {
  return useQuery({ queryKey: qk.months, queryFn: () => api<MonthListItem[]>("GET", "/months") });
}

// ---------- month views ----------

export function useSummary(month: string, today: string) {
  return useQuery({
    queryKey: qk.summary(month, today),
    queryFn: () => api<MonthSummary>("GET", `/months/${month}/summary?today=${today}`),
    placeholderData: keepPreviousData,
  });
}

export function useAnalytics(month: string, today: string) {
  return useQuery({
    queryKey: qk.analytics(month, today),
    queryFn: () => api<MonthAnalytics>("GET", `/months/${month}/analytics?today=${today}`),
    placeholderData: keepPreviousData,
  });
}

export function useInsights(month: string, today: string) {
  return useQuery({
    queryKey: qk.insights(month, today),
    queryFn: () => api<InsightsResponse>("GET", `/months/${month}/insights?today=${today}`),
    placeholderData: keepPreviousData,
  });
}

export function useTrend(end: string, count: number, today: string) {
  return useQuery({
    queryKey: qk.trend(end, count, today),
    queryFn: () => api<TrendPoint[]>("GET", `/analytics/trend?end=${end}&months=${count}&today=${today}`),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(month: string) {
  return useQuery({ queryKey: qk.plan(month), queryFn: () => api<PlanResponse>("GET", `/plans/${month}`) });
}

export function useSavePlan() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: ({ month, input }: { month: string; input: PlanInput }) => api<MonthlyPlan>("PUT", `/plans/${month}`, input),
    onSuccess: invalidate,
  });
}

// ---------- expenses ----------

export function useExpenses(params: URLSearchParams | string, opts: { enabled?: boolean } = {}) {
  const qs = typeof params === "string" ? params : params.toString();
  return useQuery({
    queryKey: qk.expenses(qs),
    queryFn: () => api<ExpenseList>("GET", `/expenses${qs ? `?${qs}` : ""}`),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

export function useSaveExpense() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: ExpenseInput }) =>
      id ? api<Expense>("PUT", `/expenses/${id}`, input) : api<Expense>("POST", "/expenses", input),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: (id: number) => api<void>("DELETE", `/expenses/${id}`),
    onSuccess: invalidate,
  });
}

// ---------- data management ----------

export function useDataStatus() {
  return useQuery({ queryKey: qk.dataStatus, queryFn: () => api<DataStatus>("GET", "/data/status") });
}

export function useImportCsv() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: (body: { csv: string; dryRun: boolean; skipDuplicates: boolean }) =>
      api<ImportPreview & { duplicates: number }>("POST", "/data/import/csv", body),
    onSuccess: (r) => {
      if (r.imported > 0) invalidate();
    },
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backup: unknown) =>
      api<{ expenses: number; plans: number; categories: number }>("POST", "/data/restore", { confirm: "REPLACE", backup }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDemoData() {
  const invalidate = useInvalidateData();
  const load = useMutation({
    mutationFn: (today: string) => api<{ expenses: number; plans: number; skippedPlans: number }>("POST", `/data/demo?today=${today}`),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api<{ expenses: number; plans: number }>("DELETE", "/data/demo"),
    onSuccess: invalidate,
  });
  return { load, remove };
}

export function useClearData() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: () => api<{ expenses: number; plans: number }>("POST", "/data/clear", { confirm: "DELETE" }),
    onSuccess: invalidate,
  });
}
