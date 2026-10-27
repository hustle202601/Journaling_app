import { describe, expect, it } from "vitest";
import { moveMonth, tradingMonth } from "./tradingCalendar";
import type { Trade } from "./trades";

const trade: Trade = { id: "1", symbol: "EURUSD", side: "buy", volume: 0.1, openTime: "2026-09-30T23:00:00Z", closeTime: "2026-10-21T12:00:00Z", openPrice: 1, closePrice: 2, sl: null, tp: null, commission: -2, swap: -1, profit: 10 };

describe("trading calendar", () => {
  it("uses closed trade dates and net results, excluding other months", () => {
    const month = tradingMonth([trade, { ...trade, id: "2", profit: -4 }, { ...trade, id: "3", closeTime: "2026-11-01T00:00:00Z" }], "2026-10");
    expect(month.pnl).toBe(0);
    expect(month.count).toBe(2);
    expect(month.weeks[3]?.days[3]).toMatchObject({ day: 21, pnl: 0 });
    expect(month.weeks[3]?.count).toBe(2);
  });
  it("aligns Sunday-first rows and totals only days within the month", () => {
    const month = tradingMonth([trade], "2026-10");
    expect(month.weeks).toHaveLength(5);
    expect(month.weeks[0]?.days.slice(0, 4)).toEqual([null, null, null, null]);
    expect(month.weeks[3]?.pnl).toBe(7);
    expect(month.pnl).toBe(7);
    expect(tradingMonth([], "2028-02").weeks.flatMap((w) => w.days).filter(Boolean)).toHaveLength(29);
  });
  it("navigates across year boundaries", () => {
    expect(moveMonth("2026-12", 1)).toBe("2027-01");
    expect(moveMonth("2026-01", -1)).toBe("2025-12");
  });
});