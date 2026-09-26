import { Check, CircleCheck, Clock, Inbox, Mail, ShieldCheck, Trash, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import type { AdminUser, UserStatus } from "../../../shared/types";
import { errorMessage } from "../api/client";
import { useAdminAction, useAdminOverview, useAdminUsers, useSession } from "../api/queries";
import { Page } from "../components/layout/Page";
import { Card, CardHeader } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/Dialog";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { Segmented } from "../components/ui/Segmented";
import { cn } from "../utils/cn";

type Filter = UserStatus | "all";

const STATUS_LABEL: Record<UserStatus, string> = { pending: "Pending", active: "Approved", rejected: "Rejected" };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function Admin() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  // The server rejects non-admins regardless; this just keeps them out of an empty page.
  if (!isAdmin) return <Navigate to="/" replace />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const [filter, setFilter] = useState<Filter>("pending");
  const overview = useAdminOverview(true);
  const users = useAdminUsers(filter);
  const action = useAdminAction();
  const [confirm, setConfirm] = useState<{ user: AdminUser; action: "reject" | "delete" } | null>(null);

  const run = (user: AdminUser, kind: "approve" | "reject" | "delete") =>
    action.mutate(
      { id: user.id, action: kind },
      {
        onSuccess: () => {
          setConfirm(null);
          toast.success(
            kind === "approve" ? "Account approved" : kind === "reject" ? "Account rejected" : "Account deleted",
            { description: kind === "approve" ? `${user.email} can now sign in.` : user.email },
          );
        },
        onError: (e) => toast.error("Couldn't update the account", { description: errorMessage(e) }),
      },
    );

  const counts = overview.data?.counts;

  return (
    <Page title="Admin" subtitle="Review account requests and manage who can sign in">
      <div className="kpi-row">
        <Kpi icon={<Clock size={15} />} label="Pending" value={counts?.pending} tone="warning" />
        <Kpi icon={<CircleCheck size={15} />} label="Approved" value={counts?.active} />
        <Kpi icon={<UserX size={15} />} label="Rejected" value={counts?.rejected} />
        <div className="kpi">
          <span className="kpi__label">
            <Mail size={13} aria-hidden="true" /> Email alerts
          </span>
          <span className="kpi__value kpi__value--sm">{overview.data ? (overview.data.mailConfigured ? "On" : "Not configured") : "—"}</span>
          {overview.data && !overview.data.mailConfigured && <span className="kpi__hint">Set SMTP_* in the server .env</span>}
        </div>
      </div>

      <Card aria-labelledby="requests-title">
        <CardHeader
          id="requests-title"
          title="Registration requests"
          subtitle="Approving an account lets that person sign in. Rejecting or deleting it signs them out immediately."
          action={
            <Segmented
              size="sm"
              label="Filter accounts"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "pending", label: `Pending${counts?.pending ? ` (${counts.pending})` : ""}` },
                { value: "active", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "all", label: "All" },
              ]}
            />
          }
        />
        {users.isLoading ? (
          <SkeletonRows rows={3} />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} compact />
        ) : !users.data?.length ? (
          <EmptyState
            compact
            icon={<Inbox size={20} />}
            title={filter === "pending" ? "No pending requests" : "No accounts here"}
            body={filter === "pending" ? "New signup requests will appear here." : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table admin-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" className="admin-table__email">
                      {u.email}
                    </th>
                    <td>{formatDateTime(u.createdAt)}</td>
                    <td>
                      <span className={cn("status-pill", `status-pill--${u.status}`)}>{STATUS_LABEL[u.status]}</span>
                    </td>
                    <td>{formatDateTime(u.lastLoginAt)}</td>
                    <td>
                      <div className="admin-actions">
                        {u.status !== "active" && (
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(u, "approve")} disabled={action.isPending}>
                            <Check size={14} /> Approve
                          </button>
                        )}
                        {u.status !== "rejected" && (
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ user: u, action: "reject" })} disabled={action.isPending}>
                            <UserX size={14} /> Reject
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn icon-btn--sm icon-btn--danger"
                          onClick={() => setConfirm({ user: u, action: "delete" })}
                          aria-label={`Delete ${u.email}`}
                          title="Delete"
                          disabled={action.isPending}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="muted small admin-note">
        <ShieldCheck size={14} aria-hidden="true" /> Each account's income, budgets, expenses and settings are private to that account. Admins can manage
        access but can't see other users' finances.
      </p>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "delete" ? "Delete this account?" : "Reject this account?"}
        description={
          confirm?.action === "delete"
            ? `${confirm.user.email} and all of their financial data will be permanently deleted. They could sign up again later.`
            : `${confirm?.user.email} won't be able to sign in. Any active session ends immediately. You can approve them later.`
        }
        confirmLabel={confirm?.action === "delete" ? "Delete account" : "Reject"}
        busy={action.isPending}
        onConfirm={() => confirm && run(confirm.user, confirm.action)}
      />
    </Page>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value?: number; tone?: "warning" }) {
  return (
    <div className="kpi">
      <span className="kpi__label">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
      <span className={cn("kpi__value", tone && value ? `text-${tone}` : undefined)}>{value ?? "—"}</span>
    </div>
  );
}
