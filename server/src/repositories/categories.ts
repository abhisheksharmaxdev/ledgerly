import type { DB } from "../db/connection";
import type { Category } from "../../../shared/types";
import { DEFAULT_CATEGORIES, type CategoryKind } from "../../../shared/constants";
import { conflict, notFound } from "../utils/errors";

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
  sort_order: number;
  archived_at: string | null;
  expense_count: number;
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  color: r.color,
  icon: r.icon,
  kind: r.kind,
  sortOrder: r.sort_order,
  archived: r.archived_at !== null,
  expenseCount: r.expense_count,
});

// Every query is scoped to one user: categories are per-account.
const SELECT = `
  SELECT c.*, (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id AND e.user_id = c.user_id) AS expense_count
  FROM categories c`;

/** Gives a new account its own copy of the default categories. */
export function seedDefaultCategories(db: DB, userId: number): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO categories (user_id, slug, name, color, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  DEFAULT_CATEGORIES.forEach((c, i) => insert.run(userId, c.slug, c.name, c.color, c.icon, c.kind, (i + 1) * 10));
}

export function listCategories(db: DB, userId: number): Category[] {
  return (db.prepare(`${SELECT} WHERE c.user_id = ? ORDER BY c.sort_order, c.id`).all(userId) as CategoryRow[]).map(toCategory);
}

export function getCategory(db: DB, userId: number, id: number): Category | null {
  const row = db.prepare(`${SELECT} WHERE c.id = ? AND c.user_id = ?`).get(id, userId) as CategoryRow | undefined;
  return row ? toCategory(row) : null;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "category"
  );
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && String((err as { code: string }).code).startsWith("SQLITE_CONSTRAINT_UNIQUE");
}

export function createCategory(
  db: DB,
  userId: number,
  input: { name: string; color: string; icon: string; kind: CategoryKind },
): Category {
  const base = slugify(input.name);
  let slug = base;
  const taken = db.prepare("SELECT 1 FROM categories WHERE user_id = ? AND slug = ?");
  for (let i = 2; taken.get(userId, slug); i++) slug = `${base}-${i}`;
  const { next } = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM categories WHERE user_id = ?")
    .get(userId) as { next: number };
  try {
    const info = db
      .prepare("INSERT INTO categories (user_id, slug, name, color, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, slug, input.name, input.color, input.icon, input.kind, next);
    return getCategory(db, userId, Number(info.lastInsertRowid))!;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A category named "${input.name}" already exists`);
    throw err;
  }
}

export function updateCategory(
  db: DB,
  userId: number,
  id: number,
  patch: { name?: string; color?: string; icon?: string; archived?: boolean },
): Category {
  const existing = getCategory(db, userId, id);
  if (!existing) throw notFound("Category not found");
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), params.push(patch.name));
  if (patch.color !== undefined) (sets.push("color = ?"), params.push(patch.color));
  if (patch.icon !== undefined) (sets.push("icon = ?"), params.push(patch.icon));
  if (patch.archived !== undefined) {
    sets.push(patch.archived ? "archived_at = COALESCE(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))" : "archived_at = NULL");
  }
  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    try {
      db.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...params, id, userId);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`A category named "${patch.name}" already exists`);
      throw err;
    }
  }
  return getCategory(db, userId, id)!;
}

/** Resolves a category by id, slug or (case-insensitive) name — used by CSV import. */
export function buildCategoryResolver(categories: Category[]): (value: string) => Category | undefined {
  const map = new Map<string, Category>();
  for (const c of categories) {
    map.set(c.slug.toLowerCase(), c);
    map.set(c.name.toLowerCase(), c);
    map.set(String(c.id), c);
  }
  return (value) => map.get(value.trim().toLowerCase());
}
