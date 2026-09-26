import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { localToday } from "../../../shared/dates";
import { currencySymbol, formatMoney } from "../../../shared/money";
import { DEFAULT_SETTINGS } from "../../../shared/constants";
import { useSettings } from "../api/queries";

/** Local calendar date; rolls over at midnight without a reload. */
export function useToday(): string {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const id = window.setInterval(() => setToday((prev) => (prev === localToday() ? prev : localToday())), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the OS asks for reduced motion or the user picked "Reduced" in settings. */
export function useReducedMotion(): boolean {
  const os = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { data } = useSettings();
  return os || data?.animations === "reduced";
}

export function useMoney() {
  const { data } = useSettings();
  const currency = data?.currency ?? DEFAULT_SETTINGS.currency;
  const fmt = useCallback(
    (minor: number, opts?: { compact?: boolean; signed?: boolean }) => formatMoney(minor, currency, opts),
    [currency],
  );
  return { fmt, currency, symbol: currencySymbol(currency) };
}

/** Animates an integer (minor units) from its previous value to the new one. */
export function useCountUp(value: number, duration = 700): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      setDisplay(next);
      fromRef.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return display;
}

/**
 * Subtle 3D tilt that follows the pointer. Writes CSS variables only (no re-renders).
 * Disabled for touch devices and reduced motion.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 4) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !fine) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--rx", `${(-y * maxDeg).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(x * maxDeg).toFixed(2)}deg`);
        el.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, fine, maxDeg]);
  return ref;
}

/** Single-key shortcut that ignores typing contexts and open dialogs. */
export function useHotkey(key: string, handler: () => void) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      saved.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
