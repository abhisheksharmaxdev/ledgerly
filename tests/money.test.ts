import { describe, expect, it } from "vitest";
import { formatMoney, minorToDecimalString, minorToInput, parseAmount, percent } from "../shared/money";
import { dayOfWeek, isValidIsoDate, monthBounds, shiftMonth } from "../shared/dates";

describe("parseAmount", () => {
  it("parses integers and decimals without float error", () => {
    expect(parseAmount("250")).toEqual({ ok: true, minor: 25000 });
    expect(parseAmount("0.1")).toEqual({ ok: true, minor: 10 });
    expect(parseAmount("0.29")).toEqual({ ok: true, minor: 29 });
    expect(parseAmount("1,250.5")).toEqual({ ok: true, minor: 125050 });
    expect(parseAmount("₹ 99.99")).toEqual({ ok: true, minor: 9999 });
    expect(parseAmount(".5")).toEqual({ ok: true, minor: 50 });
    expect(parseAmount(0.1 + 0.2)).toEqual({ ok: true, minor: 30 });
  });

  it("handles large amounts exactly", () => {
    expect(parseAmount("99999999.99")).toEqual({ ok: true, minor: 9999999999 });
    expect(parseAmount("100000000")).toEqual({ ok: true, minor: 10000000000 });
    expect(parseAmount("100000000.01").ok).toBe(false);
  });

  it("rejects invalid input", () => {
    expect(parseAmount("").ok).toBe(false);
    expect(parseAmount("-5").ok).toBe(false);
    expect(parseAmount("abc").ok).toBe(false);
    expect(parseAmount("1.234").ok).toBe(false);
    expect(parseAmount("0").ok).toBe(false);
    expect(parseAmount("0", { allowZero: true })).toEqual({ ok: true, minor: 0 });
    expect(parseAmount("1e5").ok).toBe(false);
  });

  it("sums many decimal amounts exactly", () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += (parseAmount("0.10") as { minor: number }).minor;
    expect(total).toBe(10000);
  });
});

describe("formatting", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatMoney(2000000)).toBe("₹20,000");
    expect(formatMoney(1234567850)).toBe("₹1,23,45,678.50");
    expect(formatMoney(-755000)).toBe("−₹7,550");
  });
  it("round-trips input strings", () => {
    expect(minorToInput(125050)).toBe("1250.50");
    expect(minorToInput(25000)).toBe("250");
    expect(minorToDecimalString(5)).toBe("0.05");
  });
  it("computes percentages safely", () => {
    expect(percent(215000, 300000)).toBe(71.7);
    expect(percent(5, 0)).toBeNull();
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthBounds("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30", days: 30 });
  });
  it("knows weekdays", () => {
    expect(dayOfWeek("2026-09-25")).toBe(5); // Friday
  });
});
