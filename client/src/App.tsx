import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Component, lazy, Suspense, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { createBrowserRouter, Link, Outlet, RouterProvider, useLocation } from "react-router";
import { Toaster } from "sonner";
import { RotateCcw, ServerCrash } from "lucide-react";
import { ApiError, errorMessage, onUnauthorized } from "./api/client";
import { clearAccountData, qk, useSession, useSettings } from "./api/queries";
import { AppShell } from "./components/layout/AppShell";
import { useAppliedTheme } from "./components/charts/theme";
import { useMediaQuery } from "./hooks";
import { readLastViewedMonth, useUi } from "./store/ui";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Plan = lazy(() => import("./pages/Plan"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Retry only transient failures (network/proxy), never validation or auth errors.
      retry: (count, err) => err instanceof ApiError && (err.status === 0 || err.status >= 502) && count < 2,
    },
    mutations: { retry: false },
  },
});

function Root() {
  const session = useSession();
  const qc = useQueryClient();
  const userId = session.data?.user?.id ?? null;
  const { data: settings } = useSettings(userId !== null);
  const setMonth = useUi((s) => s.setMonth);
  const appliedDefault = useRef<number | null>(null);

  // Session expired or was revoked: drop every cached query and show the sign-in screen.
  useEffect(
    () =>
      onUnauthorized(() => {
        clearAccountData(qc);
        qc.setQueryData(qk.session, { authenticated: false, user: null });
      }),
    [qc],
  );

  // Honour the "default month" preference once per signed-in account.
  useEffect(() => {
    if (!settings || userId === null || appliedDefault.current === userId) return;
    appliedDefault.current = userId;
    if (settings.defaultMonth === "last_viewed") {
      const last = readLastViewedMonth();
      if (last) setMonth(last);
    }
  }, [settings, setMonth, userId]);

  if (session.isLoading) return <FullScreenMessage loading />;
  if (session.isError)
    return (
      <FullScreenMessage
        title="Can't reach the Ledgerly server"
        body={`${errorMessage(session.error)} If you're running locally, start it with "npm run dev".`}
        onRetry={() => session.refetch()}
      />
    );
  if (!session.data?.authenticated)
    return (
      <Suspense fallback={<FullScreenMessage loading />}>
        <Login />
      </Suspense>
    );

  return (
    <AppShell>
      <PageErrorBoundary>
        <Suspense fallback={<div className="page-loading" aria-busy="true" aria-label="Loading page" />}>
          <Outlet />
        </Suspense>
      </PageErrorBoundary>
    </AppShell>
  );
}

function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 80 }}>
      <p className="empty__title">Page not found</p>
      <p className="empty__body">The page you're looking for doesn't exist.</p>
      <div className="empty__action">
        <Link to="/" className="btn btn--primary">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "expenses", element: <Expenses /> },
      { path: "analytics", element: <Analytics /> },
      { path: "plan", element: <Plan /> },
      { path: "settings", element: <Settings /> },
      { path: "admin", element: <Admin /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function ThemedToaster() {
  const mobile = useMediaQuery("(max-width: 760px)");
  const theme = useAppliedTheme();
  return (
    <Toaster
      theme={theme}
      position={mobile ? "top-center" : "bottom-right"}
      toastOptions={{ className: "toast", duration: 4000 }}
      closeButton
      visibleToasts={3}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ThemedToaster />
    </QueryClientProvider>
  );
}

function FullScreenMessage({ loading, title, body, onRetry }: { loading?: boolean; title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="fullscreen">
      <div className="backdrop" aria-hidden="true" />
      {loading ? (
        <div className="boot-loader" role="status" aria-label="Loading Ledgerly">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="card card--raised fullscreen__card" role="alert">
          <div className="card__inner">
            <ServerCrash size={28} aria-hidden="true" />
            <h1 className="login__title">{title}</h1>
            <p className="muted">{body}</p>
            {onRetry && (
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                <RotateCcw size={16} /> Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Catches render errors in a page without taking down the whole shell. Resets on navigation. */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <Boundary resetKey={location.pathname}>{children}</Boundary>;
}

class Boundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] render error", error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty empty--error" role="alert" style={{ marginTop: 60 }}>
          <p className="empty__title">Something went wrong on this page</p>
          <p className="empty__body">Your data is safe. Try reloading the page.</p>
          <div className="empty__action">
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
