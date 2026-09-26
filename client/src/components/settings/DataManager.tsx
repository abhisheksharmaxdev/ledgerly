import { Database, Download, FileJson, FileSpreadsheet, FlaskConical, Trash, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { monthLabel } from "../../../../shared/dates";
import type { ImportPreview } from "../../../../shared/types";
import { downloadFile, errorMessage } from "../../api/client";
import { useClearData, useDataStatus, useDemoData, useImportCsv, useRestoreBackup } from "../../api/queries";
import { useMoney, useToday } from "../../hooks";
import { useUi } from "../../store/ui";
import { Card, CardHeader } from "../ui/Card";
import { ConfirmDialog, Dialog } from "../ui/Dialog";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function readFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error("File is larger than 8 MB"));
  return file.text();
}

export function DataManager() {
  const month = useUi((s) => s.month);
  const today = useToday();
  const { fmt } = useMoney();
  const status = useDataStatus();
  const importCsv = useImportCsv();
  const restore = useRestoreBackup();
  const demo = useDemoData();
  const clear = useClearData();

  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState<(ImportPreview & { duplicates: number }) | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [backup, setBackup] = useState<{ name: string; data: unknown; expenses: number; plans: number } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState("");

  const download = async (path: string, name: string, label: string) => {
    try {
      await downloadFile(path, name);
      toast.success(`${label} downloaded`);
    } catch (e) {
      toast.error("Export failed", { description: errorMessage(e) });
    }
  };

  const onCsvChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFile(file);
      setCsvText(text);
      setCsvName(file.name);
      importCsv.mutate(
        { csv: text, dryRun: true, skipDuplicates: true },
        { onSuccess: setPreview, onError: (err) => toast.error("Couldn't read that file", { description: errorMessage(err) }) },
      );
    } catch (err) {
      toast.error("Couldn't read that file", { description: errorMessage(err) });
    }
  };

  const confirmImport = () => {
    if (!csvText) return;
    importCsv.mutate(
      { csv: csvText, dryRun: false, skipDuplicates },
      {
        onSuccess: (r) => {
          if (!r.valid) return setPreview(r);
          toast.success(`Imported ${r.imported} expense${r.imported === 1 ? "" : "s"}`, {
            description: r.months.length ? `Months: ${r.months.map((m) => monthLabel(m, true)).join(", ")}` : undefined,
          });
          setPreview(null);
          setCsvText(null);
        },
        onError: (err) => toast.error("Import failed", { description: errorMessage(err) }),
      },
    );
  };

  const onJsonChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await readFile(file)) as { app?: string; expenses?: unknown[]; plans?: unknown[] };
      if (data?.app !== "ledgerly") throw new Error("This doesn't look like a Ledgerly backup file.");
      setBackup({ name: file.name, data, expenses: data.expenses?.length ?? 0, plans: data.plans?.length ?? 0 });
    } catch (err) {
      toast.error("Invalid backup file", { description: err instanceof SyntaxError ? "The file is not valid JSON." : errorMessage(err) });
    }
  };

  const s = status.data;
  const demoLoaded = (s?.demoExpenseCount ?? 0) + (s?.demoPlanCount ?? 0) > 0;

  return (
    <Card aria-labelledby="data-title" id="data">
      <CardHeader id="data-title" title="Data" subtitle={s ? `${s.expenseCount} expenses · ${s.planCount} monthly plans stored` : "Export, import and manage your data"} />

      <div className="settings-group">
        <h3 className="settings-group__title">
          <Download size={15} aria-hidden="true" /> Export
        </h3>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={() => download(`/data/export.csv?month=${month}`, `ledgerly-${month}.csv`, "CSV")}>
            <FileSpreadsheet size={16} /> {monthLabel(month, true)} as CSV
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => download("/data/export.csv", "ledgerly-expenses.csv", "CSV")}>
            <FileSpreadsheet size={16} /> All expenses as CSV
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => download("/data/export.json", "ledgerly-backup.json", "Backup")}>
            <FileJson size={16} /> Full JSON backup
          </button>
        </div>
        <p className="muted small">CSV columns: Date, Amount, Category, Description, Payment Method. The JSON backup also includes plans, categories and settings.</p>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">
          <Upload size={15} aria-hidden="true" /> Import
        </h3>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={() => csvInput.current?.click()} disabled={importCsv.isPending}>
            <FileSpreadsheet size={16} /> Import CSV…
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => jsonInput.current?.click()}>
            <FileJson size={16} /> Restore JSON backup…
          </button>
          <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={onCsvChosen} />
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={onJsonChosen} />
        </div>
        <p className="muted small">CSV files are validated first. If any row is invalid, nothing is imported and you'll see exactly which rows to fix.</p>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">
          <FlaskConical size={15} aria-hidden="true" /> Demo data
        </h3>
        <p className="muted small">
          Sample expenses and plans for the last 4 months, flagged as demo so they can be removed without touching your own entries. Months that already have
          your plan keep it.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={demo.load.isPending || demoLoaded}
            title={demoLoaded ? "Demo data is already loaded" : undefined}
            onClick={() =>
              demo.load.mutate(today, {
                onSuccess: (r) => toast.success("Demo data loaded", { description: `${r.expenses} expenses and ${r.plans} plans added.` }),
                onError: (e) => toast.error("Couldn't load demo data", { description: errorMessage(e) }),
              })
            }
          >
            <FlaskConical size={16} /> Load demo data
          </button>
          {demoLoaded && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={demo.remove.isPending}
              onClick={() =>
                demo.remove.mutate(undefined, {
                  onSuccess: (r) => toast.success("Demo data removed", { description: `${r.expenses} expenses and ${r.plans} plans removed.` }),
                  onError: (e) => toast.error("Couldn't remove demo data", { description: errorMessage(e) }),
                })
              }
            >
              <Trash size={16} /> Remove demo data ({s?.demoExpenseCount ?? 0})
            </button>
          )}
        </div>
      </div>

      <div className="settings-group settings-group--danger">
        <h3 className="settings-group__title">
          <Database size={15} aria-hidden="true" /> Danger zone
        </h3>
        <p className="muted small">Permanently delete every expense and monthly plan. Categories and settings are kept. Export a backup first.</p>
        <button type="button" className="btn btn--danger-outline" onClick={() => (setClearText(""), setClearOpen(true))}>
          <Trash size={16} /> Delete all data…
        </button>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && (setPreview(null), setCsvText(null))} title="Import preview" description={csvName} size="md">
        {preview && (
          <div className="import-preview">
            {preview.valid ? (
              <>
                <dl className="import-stats">
                  <div>
                    <dt>Rows</dt>
                    <dd>{preview.validRows}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{fmt(preview.totalAmountMinor)}</dd>
                  </div>
                  <div>
                    <dt>Months</dt>
                    <dd>{preview.months.length}</dd>
                  </div>
                </dl>
                <p className="muted small">{preview.months.map((m) => monthLabel(m, true)).join(" · ")}</p>
                {preview.duplicates > 0 && (
                  <label className="checkbox">
                    <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                    <span>
                      Skip {preview.duplicates} row{preview.duplicates === 1 ? "" : "s"} that already exist (same date, amount, category and description)
                    </span>
                  </label>
                )}
                <div className="dialog__actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setPreview(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn--primary" onClick={confirmImport} disabled={importCsv.isPending}>
                    {importCsv.isPending
                      ? "Importing…"
                      : `Import ${skipDuplicates ? preview.validRows - preview.duplicates : preview.validRows} expenses`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="callout callout--negative" role="alert">
                  Nothing was imported. {preview.errors.length} problem{preview.errors.length === 1 ? "" : "s"} found
                  {preview.totalRows ? ` in ${preview.totalRows} rows` : ""}. Fix them and try again.
                </p>
                <ul className="error-list">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      <strong>Row {e.row}:</strong> {e.message}
                    </li>
                  ))}
                </ul>
                <div className="dialog__actions">
                  <button type="button" className="btn btn--primary" onClick={() => setPreview(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!backup}
        onOpenChange={(o) => !o && setBackup(null)}
        title="Restore this backup?"
        description={
          backup
            ? `“${backup.name}” contains ${backup.expenses} expenses and ${backup.plans} plans. Restoring replaces ALL current expenses and plans. This can't be undone.`
            : ""
        }
        confirmLabel="Replace my data"
        busy={restore.isPending}
        onConfirm={() =>
          backup &&
          restore.mutate(backup.data, {
            onSuccess: (r) => {
              toast.success("Backup restored", { description: `${r.expenses} expenses, ${r.plans} plans, ${r.categories} categories.` });
              setBackup(null);
            },
            onError: (e) => toast.error("Restore failed. Your data was not changed.", { description: errorMessage(e) }),
          })
        }
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen} title="Delete all data?" description="This permanently removes every expense and monthly plan." size="sm" role="alertdialog">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (clearText !== "DELETE") return;
            clear.mutate(undefined, {
              onSuccess: (r) => {
                toast.success("All data deleted", { description: `${r.expenses} expenses and ${r.plans} plans removed.` });
                setClearOpen(false);
              },
              onError: (err) => toast.error("Couldn't delete data", { description: errorMessage(err) }),
            });
          }}
        >
          <div className="field">
            <label htmlFor="clear-confirm" className="field__label">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input id="clear-confirm" className="input" value={clearText} onChange={(e) => setClearText(e.target.value)} autoComplete="off" />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setClearOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--danger" disabled={clearText !== "DELETE" || clear.isPending}>
              {clear.isPending ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
