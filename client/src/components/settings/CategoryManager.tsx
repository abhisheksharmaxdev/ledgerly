import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { toast } from "sonner";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../../../../shared/constants";
import type { Category } from "../../../../shared/types";
import { ApiError, errorMessage } from "../../api/client";
import { useCategories, useCreateCategory, useUpdateCategory } from "../../api/queries";
import { CategoryBadge, iconFor } from "../../utils/categoryIcon";
import { cn } from "../../utils/cn";
import { Card, CardHeader } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { SkeletonRows } from "../ui/Feedback";

export function CategoryManager() {
  const { data: categories, isLoading } = useCategories();
  const update = useUpdateCategory();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const toggleArchive = (c: Category) =>
    update.mutate(
      { id: c.id, archived: !c.archived },
      {
        onSuccess: () => toast.success(c.archived ? `${c.name} restored` : `${c.name} archived`, { description: c.archived ? undefined : "Past expenses keep this category." }),
        onError: (e) => toast.error("Couldn't update category", { description: errorMessage(e) }),
      },
    );

  return (
    <Card aria-labelledby="cat-title" id="categories">
      <CardHeader
        id="cat-title"
        title="Categories"
        subtitle="Add your own categories or archive ones you don't use. Archived categories keep their history."
        action={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> Add category
          </button>
        }
      />
      {isLoading || !categories ? (
        <SkeletonRows rows={5} />
      ) : (
        <ul className="cat-manage">
          {categories.map((c) => (
            <li key={c.id} className={cn(c.archived && "is-archived")}>
              <CategoryBadge icon={c.icon} color={c.color} size={32} />
              <span className="cat-manage__name">
                {c.name}
                {c.kind === "savings" && <span className="pill pill--saved">Savings</span>}
                {c.archived && <span className="pill pill--muted">Archived</span>}
              </span>
              <span className="cat-manage__count muted small">
                {c.expenseCount} expense{c.expenseCount === 1 ? "" : "s"}
              </span>
              <span className="cat-manage__actions">
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`} title="Edit">
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => toggleArchive(c)}
                  aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                  title={c.archived ? "Restore" : "Archive"}
                  disabled={update.isPending}
                >
                  {c.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Add category" : "Edit category"} size="sm">
        {editing !== null && <CategoryForm category={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<string>(category?.color ?? CATEGORY_COLORS[11]);
  const [icon, setIcon] = useState<string>(category?.icon ?? "tag");
  const [kind, setKind] = useState<"expense" | "savings">(category?.kind ?? "expense");
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    const onError = (err: unknown) => setError(err instanceof ApiError ? (err.fields?.name ?? err.message) : errorMessage(err));
    if (category) {
      update.mutate(
        { id: category.id, name: name.trim(), color, icon },
        { onSuccess: () => (toast.success("Category updated"), onDone()), onError },
      );
    } else {
      create.mutate(
        { name: name.trim(), color, icon, kind },
        { onSuccess: () => (toast.success("Category added", { description: "It's now available in the expense form and monthly plan." }), onDone()), onError },
      );
    }
  };

  return (
    <form onSubmit={submit} className="stack-form" noValidate>
      <div className={cn("field", error && "has-error")}>
        <label className="field__label" htmlFor="cat-name">
          Name
        </label>
        <input id="cat-name" className="input" value={name} maxLength={40} onChange={(e) => (setName(e.target.value), setError(null))} autoFocus />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      {!category && (
        <fieldset className="field">
          <legend className="field__label">Type</legend>
          <div className="chip-row">
            <button type="button" className={cn("chip", kind === "expense" && "is-active")} aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>
              Spending
            </button>
            <button type="button" className={cn("chip", kind === "savings" && "is-active")} aria-pressed={kind === "savings"} onClick={() => setKind("savings")}>
              Savings / investment
            </button>
          </div>
        </fieldset>
      )}
      <fieldset className="field">
        <legend className="field__label">Colour</legend>
        <div className="swatches">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn("swatch", color === c && "is-active")}
              style={{ "--sw": c } as CSSProperties}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field__label">Icon</legend>
        <div className="icon-grid">
          {CATEGORY_ICONS.map((k) => {
            const Icon = iconFor(k);
            return (
              <button
                key={k}
                type="button"
                className={cn("icon-pick", icon === k && "is-active")}
                style={{ "--cat": color } as CSSProperties}
                onClick={() => setIcon(k)}
                aria-label={`Icon ${k}`}
                aria-pressed={icon === k}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="dialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : category ? "Save category" : "Add category"}
        </button>
      </div>
    </form>
  );
}
