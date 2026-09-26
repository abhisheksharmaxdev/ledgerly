import { useSyncExternalStore } from "react";

/** Resolved chart colours per theme (SVG attributes can't reliably use CSS variables). */
const THEMES = {
  dark: {
    grid: "#1c2340",
    axis: "#6f78a0",
    text: "#a9b1d6",
    accent: "#8b93ff",
    accentSoft: "rgba(139,147,255,0.28)",
    saved: "#a3e635",
    income: "#5eead4",
    budget: "#3a4266",
    negative: "#fb7185",
    warning: "#fbbf24",
    other: "#64748b",
    surface: "#0e1428",
  },
  light: {
    grid: "#e3e7f1",
    axis: "#7a819c",
    text: "#4a5170",
    accent: "#5b5fe6",
    accentSoft: "rgba(91,95,230,0.20)",
    saved: "#65a30d",
    income: "#0d9488",
    budget: "#c9cee0",
    negative: "#e11d48",
    warning: "#d97706",
    other: "#94a3b8",
    surface: "#ffffff",
  },
};

export type ChartTheme = (typeof THEMES)["dark"];

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** The theme currently applied to <html data-theme>, kept in sync via MutationObserver. */
export function useAppliedTheme(): "dark" | "light" {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute("data-theme") ?? "dark",
    () => "dark",
  );
  return theme === "light" ? "light" : "dark";
}

export function useChartTheme(): ChartTheme {
  return THEMES[useAppliedTheme()];
}
