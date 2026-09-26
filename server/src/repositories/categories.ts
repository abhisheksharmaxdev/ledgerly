import { all, get, run, type DB, type InStatement } from "../db/connection";
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

/** Statements that give an account its own copy of the default categories. */
export function defaultCategoryStatements(userIdSql: string, userIdArgs: (string | number)[]): InStatement[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    sql: `INSERT OR IGNORE INTO categories (user_id, slug, name, color, icon, kind, sort_order) VALUES (${userIdSql}, ?, ?, ?, ?, ?, ?)`,
    args: [...userIdArgs, c.slug, c.name, c.color, c.icon, c.kind, (i + 1) * 10],
  }));
}

export async function listCategories(db: DB, userId: number): Promise<Category[]> {
  return (await all<CategoryRow>(db, `${SELECT} WHERE c.user_id = ? ORDER BY c.sort_order, c.id`, [userId])).map(toCategory);
}

export async function getCategory(db: DB, userId: number, id: number): Promise<Category | null> {
  const row = await get<CategoryRow>(db, `${SELECT} WHERE c.id = ? AND c.user_id = ?`, [id, userId]);
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
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  const text = `${e?.code ?? ""} ${e?.cause?.code ?? ""} ${e?.message ?? ""}`;
  return text.includes("UNIQUE") || text.includes("SQLITE_CONSTRAINT_UNIQUE");
}

export async function createCategory(
  db: DB,
  userId: number,
  input: { name: string; color: string; icon: string; kind: CategoryKind },
): Promise<Category> {
  const base = slugify(input.name);
  const taken = new Set(
    (await all<{ slug: string }>(db, "SELECT slug FROM categories WHERE user_id = ?", [userId])).map((r) => r.slug),
  );
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  try {
    const row = await get<{ id: number }>(
      db,
      `INSERT INTO categories (user_id, slug, name, color, icon, kind, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM categories WHERE user_id = ?))
       RETURNING id`,
      [userId, slug, input.name, input.color, input.icon, input.kind, userId],
    );
    return (await getCategory(db, userId, row!.id))!;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A category named "${input.name}" already exists`);
    throw err;
  }
}

export async function updateCategory(
  db: DB,
  userId: number,
  id: number,
  patch: { name?: string; color?: string; icon?: string; archived?: boolean },
): Promise<Category> {
  const existing = await getCategory(db, userId, id);
  if (!existing) throw notFound("Category not found");
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), params.push(patch.name));
  if (patch.color !== undefined) (sets.push("color = ?"), params.push(patch.color));
  if (patch.icon !== undefined) (sets.push("icon = ?"), params.push(patch.icon));
  if (patch.archived !== undefined) {
    sets.push(patch.archived ? "archived_at = COALESCE(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))" : "archived_at = NULL");
  }
  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    try {
      await run(db, `UPDATE categories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [...params, id, userId]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`A category named "${patch.name}" already exists`);
      throw err;
    }
  }
  return (await getCategory(db, userId, id))!;
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
