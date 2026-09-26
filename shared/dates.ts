/**
 * Timezone-free calendar helpers. Dates are "YYYY-MM-DD" strings, months are "YYYY-MM".
 * The client decides what "today" is (in the user's timezone) and passes it to the API.
 */

export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return y >= 1970 && y <= 2200 && d <= daysInMonth(y, m);
}

export function isValidMonthKey(value: string): boolean {
  if (!MONTH_KEY_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  return y >= 1970 && y <= 2200;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

export function toMonthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return toMonthKey(Math.floor(index / 12), (index % 12) + 1);
}

export function monthBounds(key: string): { start: string; end: string; days: number } {
  const { year, month } = parseMonthKey(key);
  const days = daysInMonth(year, month);
  return { start: `${key}-01`, end: `${key}-${pad2(days)}`, days };
}

export function monthLabel(key: string, short = false): string {
  const { year, month } = parseMonthKey(key);
  const name = MONTH_NAMES[month - 1];
  return short ? `${name.slice(0, 3)} ${year}` : `${name} ${year}`;
}

export function monthName(key: string, short = false): string {
  const name = MONTH_NAMES[parseMonthKey(key).month - 1];
  return short ? name.slice(0, 3) : name;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayShort(isoDate: string): string {
  return WEEKDAYS[dayOfWeek(isoDate)];
}

export function isWeekend(isoDate: string): boolean {
  const dow = dayOfWeek(isoDate);
  return dow === 0 || dow === 6;
}

export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** "25 Sep" · "25 Sep 2026" · "25 September 2026" */
export function formatDay(isoDate: string, style: "short" | "medium" | "long" = "short"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const mon = MONTH_NAMES[m - 1];
  if (style === "long") return `${d} ${mon} ${y}`;
  if (style === "medium") return `${d} ${mon.slice(0, 3)} ${y}`;
  return `${d} ${mon.slice(0, 3)}`;
}

/** Today's date in the runtime's local timezone (the browser's, on the client). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
