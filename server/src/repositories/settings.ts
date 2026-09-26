import { all, batch, type DB } from "../db/connection";
import { DEFAULT_SETTINGS, type AppSettings } from "../../../shared/constants";
import { settingsSchema } from "../../../shared/schemas";

export async function getSettings(db: DB, userId: number): Promise<AppSettings> {
  const rows = await all<{ key: string; value: string }>(db, "SELECT key, value FROM settings WHERE user_id = ?", [userId]);
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt values; defaults apply */
    }
  }
  // Only keep stored values that still validate, so a bad row can never break the app.
  const parsed = settingsSchema.safeParse(stored);
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export function updateSettingsStatements(userId: number, patch: Partial<AppSettings>) {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      sql: "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value",
      args: [userId, key, JSON.stringify(value)],
    }));
}

export async function updateSettings(db: DB, userId: number, patch: Partial<AppSettings>): Promise<AppSettings> {
  await batch(db, updateSettingsStatements(userId, patch));
  return getSettings(db, userId);
}
