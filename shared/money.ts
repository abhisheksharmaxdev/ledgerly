/**
 * Money is stored and computed as integer minor units (paise for INR).
 * Floats are only used at the very edge, for display.
 */
import { CURRENCIES, MAX_AMOUNT_MINOR, type CurrencyCode } from "./constants";

const AMOUNT_RE = /^(\d+)(?:\.(\d{0,2}))?$/;

export type ParseAmountResult = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Parses user text such as "250", "1,250.5", "₹ 99.99" into integer minor units
 * using string arithmetic only (no float multiplication).
 */
export function parseAmount(input: string | number, opts: { allowZero?: boolean } = {}): ParseAmountResult {
  let text = typeof input === "number" ? numberToPlainString(input) : String(input);
  text = text.trim().replace(/^(INR|Rs\.?)/i, "").replace(/[₹$€£,\s]/g, "");
  if (text === "") return { ok: false, error: "Enter an amount" };
  if (text.startsWith("-")) return { ok: false, error: "Amount cannot be negative" };
  if (text.startsWith(".")) text = `0${text}`;
  const m = AMOUNT_RE.exec(text);
  if (!m) {
    if (/^\d+\.\d{3,}$/.test(text)) return { ok: false, error: "Use at most 2 decimal places" };
    return { ok: false, error: "Enter a valid number" };
  }
  const whole = m[1].replace(/^0+(?=\d)/, "");
  if (whole.length > 12) return { ok: false, error: "Amount is too large" };
  const frac = (m[2] ?? "").padEnd(2, "0");
  const minor = Number(whole) * 100 + Number(frac);
  if (minor > MAX_AMOUNT_MINOR) return { ok: false, error: "Amount is too large (max 100 crore)" };
  if (minor === 0 && !opts.allowZero) return { ok: false, error: "Amount must be greater than 0" };
  return { ok: true, minor };
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  if (n < 0) return `-${numberToPlainString(-n)}`;
  // Reject >2 decimals rather than silently rounding; toFixed(2) strips float noise (0.1 + 0.2).
  const fixed = n.toFixed(2);
  if (Math.abs(Number(fixed) - n) > 1e-9) return n.toString();
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

/** Converts minor units back to an editable string (125050 → "1250.50", 25000 → "250"). */
export function minorToInput(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const frac = Math.abs(minor % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

/** Minor units → plain decimal string for exports ("1250.50"). */
export function minorToDecimalString(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, fractionDigits: number, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${fractionDigits}|${compact}`;
  let f = formatterCache.get(key);
  if (!f) {
    const meta = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
    f = new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: compact ? 0 : fractionDigits,
      maximumFractionDigits: compact ? 1 : fractionDigits,
      notation: compact ? "compact" : "standard",
    });
    formatterCache.set(key, f);
  }
  return f;
}

/** Formats minor units: whole amounts without decimals, fractional amounts with 2 decimals. */
export function formatMoney(
  minor: number,
  currency: CurrencyCode = "INR",
  opts: { compact?: boolean; signed?: boolean } = {},
): string {
  const hasFraction = minor % 100 !== 0;
  const text = getFormatter(currency, hasFraction ? 2 : 0, !!opts.compact).format(Math.abs(minor) / 100);
  if (minor < 0) return `−${text}`;
  if (opts.signed && minor > 0) return `+${text}`;
  return text;
}

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? "₹";
}

/** Ratio as a percentage rounded to one decimal, or null when the denominator is 0. */
export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}
