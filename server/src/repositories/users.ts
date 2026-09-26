import { all, batch, get, run, type DB, type InStatement } from "../db/connection";
import type { AdminUser, UserRole, UserStatus } from "../../../shared/types";
import { defaultCategoryStatements } from "./categories";
import { deletePlansStatements } from "./plans";

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

export async function getUserById(db: DB, id: number): Promise<UserRecord | null> {
  return (await get<UserRow>(db, "SELECT * FROM users WHERE id = ?", [id])) ?? null;
}

export async function getUserByEmail(db: DB, email: string): Promise<UserRecord | null> {
  return (await get<UserRow>(db, "SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()])) ?? null;
}

export async function getAdmin(db: DB): Promise<UserRecord | null> {
  return (await get<UserRow>(db, "SELECT * FROM users WHERE role = 'admin'")) ?? null;
}

/** New self-registered accounts always start as pending, ordinary users. */
export async function createPendingUser(db: DB, email: string, passwordHash: string): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase();
  await batch(db, [
    {
      sql: "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'user', 'pending')",
      args: [normalized, passwordHash],
    },
    ...defaultCategoryStatements("(SELECT id FROM users WHERE email = ?)", [normalized]),
  ]);
  return (await getUserByEmail(db, normalized))!;
}

export async function listUsers(db: DB, status?: UserStatus): Promise<AdminUser[]> {
  const rows = await all<UserRow>(
    db,
    `SELECT * FROM users WHERE role = 'user' AND (? IS NULL OR status = ?)
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`,
    [status ?? null, status ?? null],
  );
  return rows.map(toAdminUser);
}

export async function countUsersByStatus(db: DB): Promise<Record<UserStatus, number>> {
  const counts: Record<UserStatus, number> = { pending: 0, active: 0, rejected: 0 };
  const rows = await all<{ status: UserStatus; n: number }>(db, "SELECT status, COUNT(*) AS n FROM users WHERE role = 'user' GROUP BY status");
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/**
 * Changes an account's approval status. Anything other than "active" also bumps
 * session_version, which immediately invalidates every existing session of that user.
 */
export async function setUserStatus(db: DB, id: number, status: UserStatus): Promise<UserRecord | null> {
  return (
    (await get<UserRow>(
      db,
      `UPDATE users SET status = ?, reviewed_at = ${NOW}, updated_at = ${NOW},
         session_version = session_version + CASE WHEN ? = 'active' THEN 0 ELSE 1 END
       WHERE id = ? AND role = 'user' RETURNING *`,
      [status, status, id],
    )) ?? null
  );
}

export async function touchLogin(db: DB, id: number): Promise<void> {
  await run(db, `UPDATE users SET last_login_at = ${NOW} WHERE id = ?`, [id]);
}

/** Removes a user and every row of their financial data, children first, in one atomic batch. */
export async function deleteUserAndData(db: DB, id: number): Promise<boolean> {
  const user = await get<{ role: UserRole }>(db, "SELECT role FROM users WHERE id = ?", [id]);
  if (!user || user.role !== "user") return false;
  await batch(db, [
    { sql: "DELETE FROM expenses WHERE user_id = ?", args: [id] },
    ...deletePlansStatements(id),
    { sql: "DELETE FROM settings WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM categories WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM users WHERE id = ? AND role = 'user'", args: [id] },
  ]);
  return true;
}

/**
 * Creates or updates the single administrator account. If a different account was admin,
 * it is renamed to the new email so the admin's financial data stays with the admin.
 * Data created before accounts existed (user_id NULL) is handed to the admin.
 */
export async function ensureAdmin(
  db: DB,
  email: string,
  passwordHash: string,
): Promise<{ action: "created" | "updated" | "promoted"; claimed: number }> {
  const normalized = email.trim().toLowerCase();
  const [existingAdmin, byEmail] = await Promise.all([getAdmin(db), getUserByEmail(db, normalized)]);
  const statements: InStatement[] = [];
  let action: "created" | "updated" | "promoted";

  if (byEmail && byEmail.role === "admin") {
    statements.push({ sql: `UPDATE users SET password_hash = ?, status = 'active', updated_at = ${NOW} WHERE id = ?`, args: [passwordHash, byEmail.id] });
    action = "updated";
  } else if (byEmail) {
    // A registered user becomes the administrator; the old admin (if any) becomes a normal user.
    if (existingAdmin) statements.push({ sql: `UPDATE users SET role = 'user', updated_at = ${NOW} WHERE id = ?`, args: [existingAdmin.id] });
    statements.push({
      sql: `UPDATE users SET role = 'admin', status = 'active', password_hash = ?, session_version = session_version + 1,
              reviewed_at = COALESCE(reviewed_at, ${NOW}), updated_at = ${NOW} WHERE id = ?`,
      args: [passwordHash, byEmail.id],
    });
    action = "promoted";
  } else if (existingAdmin) {
    statements.push({
      sql: `UPDATE users SET email = ?, password_hash = ?, session_version = session_version + 1, updated_at = ${NOW} WHERE id = ?`,
      args: [normalized, passwordHash, existingAdmin.id],
    });
    action = "updated";
  } else {
    statements.push({
      sql: `INSERT INTO users (email, password_hash, role, status, reviewed_at) VALUES (?, ?, 'admin', 'active', ${NOW})`,
      args: [normalized, passwordHash],
    });
    action = "created";
  }

  const counts = await get<{ n: number }>(
    db,
    `SELECT (SELECT COUNT(*) FROM categories WHERE user_id IS NULL) + (SELECT COUNT(*) FROM monthly_plans WHERE user_id IS NULL)
          + (SELECT COUNT(*) FROM expenses WHERE user_id IS NULL) + (SELECT COUNT(*) FROM settings WHERE user_id IS NULL) AS n`,
  );
  const adminId = "(SELECT id FROM users WHERE role = 'admin')";
  for (const table of ["categories", "monthly_plans", "expenses", "settings"]) {
    statements.push({ sql: `UPDATE ${table} SET user_id = ${adminId} WHERE user_id IS NULL`, args: [] });
  }
  // A brand-new admin still needs categories; INSERT OR IGNORE skips ones the admin already has.
  statements.push(...defaultCategoryStatements(adminId, []));
  await batch(db, statements);
  return { action, claimed: counts?.n ?? 0 };
}

/** Session-signing secret persisted in the DB when SESSION_SECRET isn't configured. */
export async function getOrCreateSecret(db: DB, key: string, generate: () => string): Promise<string> {
  await run(db, "INSERT OR IGNORE INTO app_secrets (key, value) VALUES (?, ?)", [key, generate()]);
  return (await get<{ value: string }>(db, "SELECT value FROM app_secrets WHERE key = ?", [key]))!.value;
}
