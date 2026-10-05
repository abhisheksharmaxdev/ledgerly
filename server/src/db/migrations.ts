import type { Client, InStatement } from "@libsql/client";
import { DEFAULT_CATEGORIES, PAYMENT_METHOD_VALUES } from "../../../shared/constants";

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const paymentList = PAYMENT_METHOD_VALUES.map((p) => `'${p}'`).join(",");

interface Migration {
  version: number;
  name: string;
  /** Table rebuilds need foreign keys off (SQLite's documented 12-step ALTER procedure). */
  foreignKeysOff?: boolean;
  statements: () => InStatement[];
}

/** Splits a migration script into statements (the scripts contain no semicolons inside literals). */
const script = (sql: string): string[] =>
  sql
    .split(/;\s*(?:\n|$)/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);

/** Append-only list. Never edit a migration that has shipped; add a new one instead. */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    statements: () => [
      ...script(`
        CREATE TABLE categories (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          slug        TEXT    NOT NULL UNIQUE,
          name        TEXT    NOT NULL,
          color       TEXT    NOT NULL,
          icon        TEXT    NOT NULL,
          kind        TEXT    NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','savings')),
          sort_order  INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          created_at  TEXT    NOT NULL DEFAULT ${NOW},
          updated_at  TEXT    NOT NULL DEFAULT ${NOW}
        );
        CREATE UNIQUE INDEX ux_categories_name ON categories (lower(name));

        CREATE TABLE monthly_plans (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          year         INTEGER NOT NULL CHECK (year BETWEEN 1970 AND 2200),
          month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
          income_minor INTEGER NOT NULL DEFAULT 0 CHECK (income_minor >= 0),
          is_demo      INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
          created_at   TEXT    NOT NULL DEFAULT ${NOW},
          updated_at   TEXT    NOT NULL DEFAULT ${NOW},
          UNIQUE (year, month)
        );

        CREATE TABLE plan_budgets (
          plan_id      INTEGER NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
          category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
          PRIMARY KEY (plan_id, category_id)
        ) WITHOUT ROWID;
        CREATE INDEX ix_plan_budgets_category ON plan_budgets (category_id);

        CREATE TABLE expenses (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
          category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          date           TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
          description    TEXT,
          payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN (${paymentList})),
          is_demo        INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
          created_at     TEXT    NOT NULL DEFAULT ${NOW},
          updated_at     TEXT    NOT NULL DEFAULT ${NOW}
        );
        CREATE INDEX ix_expenses_date ON expenses (date);
        CREATE INDEX ix_expenses_category_date ON expenses (category_id, date);

        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;
      `),
      ...DEFAULT_CATEGORIES.map((c, i) => ({
        sql: "INSERT INTO categories (slug, name, color, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        args: [c.slug, c.name, c.color, c.icon, c.kind, (i + 1) * 10],
      })),
    ],
  },
  {
    version: 2,
    name: "multi-user accounts",
    foreignKeysOff: true,
    // Existing rows keep their ids and get user_id = NULL ("unclaimed").
    // They are invisible to everyone until the admin account is created, which claims them.
    statements: () =>
      script(`
        CREATE TABLE users (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          email           TEXT    NOT NULL COLLATE NOCASE UNIQUE,
          password_hash   TEXT    NOT NULL,
          role            TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
          status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
          session_version INTEGER NOT NULL DEFAULT 1,
          created_at      TEXT    NOT NULL DEFAULT ${NOW},
          updated_at      TEXT    NOT NULL DEFAULT ${NOW},
          reviewed_at     TEXT,
          last_login_at   TEXT
        );
        -- Exactly one administrator account.
        CREATE UNIQUE INDEX ux_users_single_admin ON users (role) WHERE role = 'admin';
        CREATE INDEX ix_users_status ON users (status, created_at);

        CREATE TABLE app_secrets (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE categories_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
          slug        TEXT    NOT NULL,
          name        TEXT    NOT NULL,
          color       TEXT    NOT NULL,
          icon        TEXT    NOT NULL,
          kind        TEXT    NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','savings')),
          sort_order  INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          created_at  TEXT    NOT NULL DEFAULT ${NOW},
          updated_at  TEXT    NOT NULL DEFAULT ${NOW},
          UNIQUE (user_id, slug)
        );
        INSERT INTO categories_new (id, user_id, slug, name, color, icon, kind, sort_order, archived_at, created_at, updated_at)
          SELECT id, NULL, slug, name, color, icon, kind, sort_order, archived_at, created_at, updated_at FROM categories;
        DROP TABLE categories;
        ALTER TABLE categories_new RENAME TO categories;
        CREATE UNIQUE INDEX ux_categories_user_name ON categories (user_id, lower(name));

        CREATE TABLE monthly_plans_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
          year         INTEGER NOT NULL CHECK (year BETWEEN 1970 AND 2200),
          month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
          income_minor INTEGER NOT NULL DEFAULT 0 CHECK (income_minor >= 0),
          is_demo      INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
          created_at   TEXT    NOT NULL DEFAULT ${NOW},
          updated_at   TEXT    NOT NULL DEFAULT ${NOW},
          UNIQUE (user_id, year, month)
        );
        INSERT INTO monthly_plans_new (id, user_id, year, month, income_minor, is_demo, created_at, updated_at)
          SELECT id, NULL, year, month, income_minor, is_demo, created_at, updated_at FROM monthly_plans;
        DROP TABLE monthly_plans;
        ALTER TABLE monthly_plans_new RENAME TO monthly_plans;

        CREATE TABLE settings_new (
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          key     TEXT NOT NULL,
          value   TEXT NOT NULL,
          UNIQUE (user_id, key)
        );
        INSERT INTO settings_new (user_id, key, value) SELECT NULL, key, value FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;

        ALTER TABLE expenses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX ix_expenses_user_date ON expenses (user_id, date);
      `),
  },
  {
    version: 3,
    name: "credit card amount per plan",
    statements: () => [
      "ALTER TABLE monthly_plans ADD COLUMN credit_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0)",
    ],
  },
];

/** Applies pending migrations; each one runs as a single atomic batch. */
export async function runMigrations(db: Client): Promise<number[]> {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
  const applied = new Set((await db.execute("SELECT version FROM schema_migrations")).rows.map((r) => Number(r.version)));
  const ran: number[] = [];
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    // PRAGMA foreign_keys can't change inside a transaction, so toggle it around the batch.
    // Hosted libSQL may not honour per-connection pragmas; that's fine there because a new
    // hosted database runs these rebuilds on empty tables.
    if (m.foreignKeysOff) await pragma(db, "PRAGMA foreign_keys = OFF");
    try {
      await db.batch(
        [...m.statements(), { sql: "INSERT INTO schema_migrations (version, name) VALUES (?, ?)", args: [m.version, m.name] }],
        "write",
      );
      if (m.foreignKeysOff) {
        const broken = (await pragma(db, "PRAGMA foreign_key_check"))?.rows.length ?? 0;
        if (broken) throw new Error(`Migration ${m.version} left ${broken} broken foreign keys`);
      }
    } finally {
      if (m.foreignKeysOff) await pragma(db, "PRAGMA foreign_keys = ON");
    }
    ran.push(m.version);
  }
  return ran;
}

async function pragma(db: Client, sql: string) {
  try {
    return await db.execute(sql);
  } catch {
    return null;
  }
}
