import type { DB } from "../db/connection";
import { DEFAULT_SETTINGS, type AppSettings } from "../../../shared/constants";
import { settingsSchema } from "../../../shared/schemas";

export function getSettings(db: DB, userId: number): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings WHERE user_id = ?").all(userId) as { key: string; value: string }[];
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

export function updateSettings(db: DB, userId: number, patch: Partial<AppSettings>): AppSettings {
  const upsert = db.prepare(
    "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) upsert.run(userId, key, JSON.stringify(value));
    }
  })();
  return getSettings(db, userId);
}
