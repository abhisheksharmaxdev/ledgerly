import type { DB } from "../db/connection";
import type { AdminUser, UserRole, UserStatus } from "../../../shared/types";
import { seedDefaultCategories } from "./categories";

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  session_version: number;
  created_at: string;
  reviewed_at: string | null;
  last_login_at: string | null;
}

export type UserRecord = UserRow;

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export const toAdminUser = (r: UserRow): AdminUser => ({
  id: r.id,
  email: r.email,
  role: r.role,
  status: r.status,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
  lastLoginAt: r.last_login_at,
});

export function getUserById(db: DB, id: number): UserRecord | null {
  return (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
}

export function getUserByEmail(db: DB, email: string): UserRecord | null {
  return (db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined) ?? null;
}

export function getAdmin(db: DB): UserRecord | null {
  return (db.prepare("SELECT * FROM users WHERE role = 'admin'").get() as UserRow | undefined) ?? null;
}

/** New self-registered accounts always start as pending, ordinary users. */
export function createPendingUser(db: DB, email: string, passwordHash: string): UserRecord {
  return db.transaction(() => {
    const row = db
      .prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'pending') RETURNING *")
      .get(email.trim().toLowerCase(), passwordHash) as UserRow;
    seedDefaultCategories(db, row.id);
    return row;
  })();
}

export function listUsers(db: DB, status?: UserStatus): AdminUser[] {
  const rows = db
    .prepare(
      `SELECT * FROM users WHERE role = 'user' AND (? IS NULL OR status = ?)
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`,
    )
    .all(status ?? null, status ?? null) as UserRow[];
  return rows.map(toAdminUser);
}

export function countUsersByStatus(db: DB): Record<UserStatus, number> {
  const counts: Record<UserStatus, number> = { pending: 0, active: 0, rejected: 0 };
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM users WHERE role = 'user' GROUP BY status").all() as { status: UserStatus; n: number }[];
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/**
 * Changes an account's approval status. Anything other than "active" also bumps
 * session_version, which immediately invalidates every existing session of that user.
 */
export function setUserStatus(db: DB, id: number, status: UserStatus): UserRecord | null {
  return (
    (db
      .prepare(
        `UPDATE users SET status = ?, reviewed_at = ${NOW}, updated_at = ${NOW},
           session_version = session_version + CASE WHEN ? = 'active' THEN 0 ELSE 1 END
         WHERE id = ? AND role = 'user' RETURNING *`,
      )
      .get(status, status, id) as UserRow | undefined) ?? null
  );
}

export function touchLogin(db: DB, id: number): void {
  db.prepare(`UPDATE users SET last_login_at = ${NOW} WHERE id = ?`).run(id);
}

/** Removes a user and every row of their financial data (explicit order; no reliance on cascades). */
export function deleteUserAndData(db: DB, id: number): boolean {
  return db.transaction(() => {
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as { role: UserRole } | undefined;
    if (!user || user.role !== "user") return false;
    db.prepare("DELETE FROM expenses WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM plan_budgets WHERE plan_id IN (SELECT id FROM monthly_plans WHERE user_id = ?)").run(id);
    db.prepare("DELETE FROM monthly_plans WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM settings WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM categories WHERE user_id = ?").run(id);
    return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
  })();
}

/** Data created before accounts existed (user_id NULL) is handed to the admin. */
function claimUnownedData(db: DB, userId: number): number {
  let claimed = 0;
  for (const table of ["categories", "monthly_plans", "expenses", "settings"]) {
    claimed += db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId).changes;
  }
  return claimed;
}

/**
 * Creates or updates the single administrator account. If a different account was admin,
 * it is renamed to the new email so the admin's financial data stays with the admin.
 * Returns what happened, for logging.
 */
export function ensureAdmin(db: DB, email: string, passwordHash: string): { action: "created" | "updated" | "promoted"; claimed: number } {
  const normalized = email.trim().toLowerCase();
  return db.transaction(() => {
    const existingAdmin = getAdmin(db);
    const byEmail = getUserByEmail(db, normalized);
    let adminId: number;
    let action: "created" | "updated" | "promoted";

    if (byEmail && byEmail.role === "admin") {
      db.prepare(`UPDATE users SET password_hash = ?, status = 'active', updated_at = ${NOW} WHERE id = ?`).run(passwordHash, byEmail.id);
      adminId = byEmail.id;
      action = "updated";
    } else if (byEmail) {
      // A registered user becomes the administrator; the old admin (if any) becomes a normal user.
      if (existingAdmin) db.prepare(`UPDATE users SET role = 'user', updated_at = ${NOW} WHERE id = ?`).run(existingAdmin.id);
      db.prepare(
        `UPDATE users SET role = 'admin', status = 'active', password_hash = ?, session_version = session_version + 1,
           reviewed_at = COALESCE(reviewed_at, ${NOW}), updated_at = ${NOW} WHERE id = ?`,
      ).run(passwordHash, byEmail.id);
      adminId = byEmail.id;
      action = "promoted";
    } else if (existingAdmin) {
      db.prepare(
        `UPDATE users SET email = ?, password_hash = ?, session_version = session_version + 1, updated_at = ${NOW} WHERE id = ?`,
      ).run(normalized, passwordHash, existingAdmin.id);
      adminId = existingAdmin.id;
      action = "updated";
    } else {
      const row = db
        .prepare(`INSERT INTO users (email, password_hash, role, status, reviewed_at) VALUES (?, ?, 'admin', 'active', ${NOW}) RETURNING id`)
        .get(normalized, passwordHash) as { id: number };
      adminId = row.id;
      action = "created";
    }

    const claimed = claimUnownedData(db, adminId);
    const hasCategories = db.prepare("SELECT 1 FROM categories WHERE user_id = ? LIMIT 1").get(adminId);
    if (!hasCategories) seedDefaultCategories(db, adminId);
    return { action, claimed };
  })();
}

/** Session-signing secret persisted in the DB when SESSION_SECRET isn't configured. */
export function getOrCreateSecret(db: DB, key: string, generate: () => string): string {
  const row = db.prepare("SELECT value FROM app_secrets WHERE key = ?").get(key) as { value: string } | undefined;
  if (row) return row.value;
  const value = generate();
  db.prepare("INSERT INTO app_secrets (key, value) VALUES (?, ?)").run(key, value);
  return value;
}
