import { Keyboard, LogOut, Palette, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { toast } from "sonner";
import { CURRENCIES, type AppSettings } from "../../../shared/constants";
import { errorMessage } from "../api/client";
import { useLogout, useSession, useSettings, useUpdateSettings } from "../api/queries";
import { Page } from "../components/layout/Page";
import { CategoryManager } from "../components/settings/CategoryManager";
import { DataManager } from "../components/settings/DataManager";
import { Card, CardHeader } from "../components/ui/Card";
import { ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { Segmented } from "../components/ui/Segmented";

export default function Settings() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const { data: session } = useSession();
  const logout = useLogout();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    update.mutate({ [key]: value } as Partial<AppSettings>, {
      onSuccess: () => toast.success("Preference saved"),
      onError: (e) => toast.error("Couldn't save preference", { description: errorMessage(e) }),
    });

  const s = settings.data;

  return (
    <Page title="Settings" subtitle="Preferences, categories and data management">
      <div className="settings-grid">
        <Card aria-labelledby="pref-title">
          <CardHeader id="pref-title" title="Preferences" />
          {settings.error ? (
            <ErrorState error={settings.error} onRetry={() => settings.refetch()} compact />
          ) : !s ? (
            <SkeletonRows rows={5} />
          ) : (
            <div className="pref-list">
              <PrefRow icon={<Palette size={16} />} title="Theme" desc="Dark is the signature look; light is great in daylight.">
                <Segmented
                  label="Theme"
                  value={s.theme}
                  onChange={(v) => set("theme", v)}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                    { value: "system", label: "System" },
                  ]}
                />
              </PrefRow>
              <PrefRow title="Animations" desc="Reduced turns off motion, tilt and count-up effects. Your OS reduced-motion setting is always respected.">
                <Segmented
                  label="Animations"
                  value={s.animations}
                  onChange={(v) => set("animations", v)}
                  options={[
                    { value: "full", label: "Full" },
                    { value: "reduced", label: "Reduced" },
                  ]}
                />
              </PrefRow>
              <PrefRow title="3D background" desc="Auto disables the WebGL layer on low-power and small touch devices.">
                <Segmented
                  label="3D background"
                  value={s.background3d}
                  onChange={(v) => set("background3d", v)}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </PrefRow>
              <PrefRow icon={<SlidersHorizontal size={16} />} title="Currency" desc="Changes how amounts are displayed. Amounts are not converted.">
                <select className="input input--compact" value={s.currency} onChange={(e) => set("currency", e.target.value as AppSettings["currency"])} aria-label="Currency">
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </PrefRow>
              <PrefRow title="Default month" desc="Which month opens when you start the app.">
                <Segmented
                  label="Default month"
                  value={s.defaultMonth}
                  onChange={(v) => set("defaultMonth", v)}
                  options={[
                    { value: "current", label: "Current month" },
                    { value: "last_viewed", label: "Last viewed" },
                  ]}
                />
              </PrefRow>
            </div>
          )}
        </Card>

        <CategoryManager />
        <DataManager />

        <Card aria-labelledby="kbd-title">
          <CardHeader id="kbd-title" title="Keyboard shortcuts" />
          <ul className="shortcut-list">
            <li>
              <Keyboard size={15} aria-hidden="true" /> Add expense <kbd className="kbd">N</kbd>
            </li>
            <li>
              Save the expense form <kbd className="kbd">Enter</kbd>
            </li>
            <li>
              Close a dialog <kbd className="kbd">Esc</kbd>
            </li>
            <li>
              Move between category or option choices <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd>
            </li>
          </ul>
        </Card>

        <Card aria-labelledby="account-title">
          <CardHeader id="account-title" title="Account" subtitle={session?.user ? `Signed in as ${session.user.email}` : undefined} />
          <div className="btn-row">
            {session?.user?.role === "admin" && (
              <Link to="/admin" className="btn btn--ghost">
                <ShieldCheck size={16} /> Admin dashboard
              </Link>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => logout.mutate()}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function PrefRow({ icon, title, desc, children }: { icon?: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <div className="pref-row">
      <div className="pref-row__text">
        <p className="pref-row__title">
          {icon && <span aria-hidden="true">{icon}</span>}
          {title}
        </p>
        <p className="pref-row__desc">{desc}</p>
      </div>
      <div className="pref-row__control">{children}</div>
    </div>
  );
}
