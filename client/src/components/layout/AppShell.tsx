import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { MotionConfig } from "motion/react";
import {
  ChartPie,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Target,
  WifiOff,
} from "lucide-react";
import { useAdminOverview, useDataStatus, useHealth, useLogout, useSession, useSettings } from "../../api/queries";
import { useHotkey, useMediaQuery, useReducedMotion } from "../../hooks";
import { useUi } from "../../store/ui";
import { cn } from "../../utils/cn";
import { ExpenseDialog } from "../expenses/ExpenseDialog";
import { MonthSwitcher } from "./MonthSwitcher";

const Background3D = lazy(() => import("../three/Background3D"));

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/analytics", label: "Analytics", icon: ChartPie },
  { to: "/plan", label: "Monthly Plan", icon: Target },
  { to: "/settings", label: "Settings", icon: Settings },
];

function useResolvedTheme(): "dark" | "light" {
  const { data } = useSettings();
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  const pref = data?.theme ?? "dark";
  const theme = pref === "system" ? (prefersLight ? "light" : "dark") : pref;
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eef1f8" : "#070a14");
    try {
      localStorage.setItem("ledgerly.theme", pref);
    } catch {
      /* ignore */
    }
  }, [theme, pref]);
  return theme;
}

/** Decides whether the WebGL layer is worth rendering on this device. */
function use3DBackground(): { enabled: boolean; animate: boolean } {
  const { data } = useSettings();
  const reduced = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 820px)");
  const mode = data?.background3d ?? "auto";
  if (mode === "off") return { enabled: false, animate: false };
  if (mode === "on") return { enabled: true, animate: !reduced };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const lowPower =
    (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || !!nav.connection?.saveData || (coarse && narrow);
  return { enabled: !lowPower, animate: !reduced };
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useResolvedTheme();
  const bg = use3DBackground();
  const reduced = useReducedMotion();
  const { data: settings } = useSettings();
  const openAdd = useUi((s) => s.openAddExpense);
  const location = useLocation();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { data: adminOverview } = useAdminOverview(isAdmin);
  const pendingCount = adminOverview?.counts.pending ?? 0;
  const logout = useLogout();
  const { data: dataStatus } = useDataStatus();
  const health = useHealth();
  const [showBg, setShowBg] = useState(false);

  useHotkey("n", openAdd);

  useEffect(() => {
    if (reduced) document.documentElement.setAttribute("data-motion", "reduced");
    else document.documentElement.removeAttribute("data-motion");
    try {
      localStorage.setItem("ledgerly.animations", settings?.animations ?? "full");
    } catch {
      /* ignore */
    }
  }, [reduced, settings?.animations]);

  // Defer the WebGL layer until the app has painted, so it never delays first render.
  useEffect(() => {
    const id = window.setTimeout(() => setShowBg(true), 300);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const demoCount = (dataStatus?.demoExpenseCount ?? 0) + (dataStatus?.demoPlanCount ?? 0);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <div className="app">
        <div className="backdrop" aria-hidden="true" />
        {bg.enabled && showBg && (
          <Suspense fallback={null}>
            <Background3D theme={theme} animate={bg.animate} />
          </Suspense>
        )}

        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <aside className="sidebar" aria-label="Primary">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="22" height="22">
                <path d="M8 23V9M8 23h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M12.5 18.5l4-4.5 3 2.5 4.5-5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
            <span className="brand__name">Ledgerly</span>
          </div>
          <nav className="side-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("side-nav__link", isActive && "is-active")}>
                <n.icon size={19} aria-hidden="true" />
                <span>{n.label}</span>
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => cn("side-nav__link", isActive && "is-active")}>
                <ShieldCheck size={19} aria-hidden="true" />
                <span>Admin</span>
                {pendingCount > 0 && <span className="nav-count" aria-label={`${pendingCount} pending requests`}>{pendingCount}</span>}
              </NavLink>
            )}
          </nav>
          <div className="sidebar__foot">
            <button type="button" className="btn btn--primary btn--block sidebar__add" onClick={openAdd}>
              <Plus size={18} /> <span>Add expense</span>
              <kbd className="kbd" aria-hidden="true">
                N
              </kbd>
            </button>
            {session?.user && (
              <p className="sidebar__user" title={session.user.email}>
                {session.user.email}
              </p>
            )}
            <button type="button" className="btn btn--ghost btn--block btn--sm" onClick={() => logout.mutate()} title="Sign out">
              <LogOut size={15} /> <span>Sign out</span>
            </button>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <div className="topbar__brand-mobile">
              <span className="brand__mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="18" height="18">
                  <path d="M8 23V9M8 23h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M12.5 18.5l4-4.5 3 2.5 4.5-5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </span>
            </div>
            <MonthSwitcher />
            <div className="topbar__right">
              {isAdmin && pendingCount > 0 && (
                <NavLink to="/admin" className="demo-badge admin-badge" title="Account requests waiting for approval">
                  <ShieldCheck size={14} aria-hidden="true" /> <span>{pendingCount} pending</span>
                </NavLink>
              )}
              {demoCount > 0 && (
                <NavLink to="/settings#data" className="demo-badge" title="Demo data is loaded. Remove it from Settings → Data.">
                  <FlaskConical size={14} aria-hidden="true" /> <span>Demo data</span>
                </NavLink>
              )}
              <button type="button" className="btn btn--primary topbar__add" onClick={openAdd}>
                <Plus size={18} /> Add expense
              </button>
            </div>
          </header>

          {health.isError && (
            <div className="offline-banner" role="status">
              <WifiOff size={16} aria-hidden="true" />
              <span>Can't reach the Ledgerly server. Your data is safe on the server; changes will work again once it reconnects. Retrying…</span>
            </div>
          )}

          <main id="main" className="main" tabIndex={-1}>
            {children}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Primary">
          {NAV.slice(0, 2).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("mobile-nav__link", isActive && "is-active")}>
              <n.icon size={20} aria-hidden="true" />
              <span>{n.label === "Dashboard" ? "Home" : n.label}</span>
            </NavLink>
          ))}
          <button type="button" className="fab" onClick={openAdd} aria-label="Add expense">
            <Plus size={26} />
          </button>
          {NAV.slice(2, 4).map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("mobile-nav__link", isActive && "is-active")}>
              <n.icon size={20} aria-hidden="true" />
              <span>{n.label === "Monthly Plan" ? "Plan" : n.label}</span>
            </NavLink>
          ))}
          <NavLink to="/settings" className={({ isActive }) => cn("mobile-nav__link", isActive && "is-active")}>
            <Settings size={20} aria-hidden="true" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <ExpenseDialog />
      </div>
    </MotionConfig>
  );
}
