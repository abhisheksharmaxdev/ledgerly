import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";
import { runMigrations } from "./migrations";

export type DB = Client;
export type Args = InValue[];

/**
 * Opens the database and applies pending migrations.
 * `url` is either a local file (`file:data/ledgerly.db`, `:memory:`) or a Turso database
 * (`libsql://…` plus an auth token), so the same code runs locally and on free hosting.
 */
export async function openDatabase(url: string, authToken?: string): Promise<DB> {
  const isLocalFile = url.startsWith("file:");
  if (isLocalFile) {
    const file = url.startsWith("file://") ? fileURLToPath(url) : url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = createClient({ url, authToken: authToken || undefined });
  if (isLocalFile) {
    await db.execute("PRAGMA journal_mode = WAL");
    await db.execute("PRAGMA busy_timeout = 5000");
  }
  await runMigrations(db);
  return db;
}

/** Rows as plain objects keyed by column name. */
export async function all<T>(db: DB, sql: string, args: Args = []): Promise<T[]> {
  const rs = await db.execute({ sql, args });
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])) as T);
}

export async function get<T>(db: DB, sql: string, args: Args = []): Promise<T | undefined> {
  return (await all<T>(db, sql, args))[0];
}

/** Runs a write and returns the number of affected rows. */
export async function run(db: DB, sql: string, args: Args = []): Promise<number> {
  return (await db.execute({ sql, args })).rowsAffected;
}

/** Runs several statements atomically: either all of them apply or none do. */
export async function batch(db: DB, statements: InStatement[]): Promise<void> {
  if (statements.length) await db.batch(statements, "write");
}

export type { InStatement };
