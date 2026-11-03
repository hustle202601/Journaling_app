import { describe, expect, it } from "vitest";
import {
  computeStats,
  effectiveStartBalance,
  equityCurve,
  parseReport,
  rMultiple,
  tradesInRange,
  type Trade,
} from "./trades";

const base: Trade = { id: "1", symbol: "EURUSD", side: "buy", volume: 0.01, openTime: "2026-09-23T10:00:00Z", closeTime: "2026-09-23T11:00:00Z", openPrice: 1.165, closePrice: 1.169, sl: 1.163, tp: 1.169, commission: 0, swap: 0, profit: 4 };

describe("trades", () => {
  it("R-multiple of EURUSD buy 1.16500 SL 1.16300 closed at TP 1.16900 is 2R", () => {
    expect(rMultiple(base)).toBeCloseTo(2);
  });
  it("profit factor and win rate", () => {
    const s = computeStats([base, { ...base, id: "2", profit: -2 }]);
    expect(s.profitFactor).toBe(2);
    expect(s.winRate).toBe(0.5);
  });
  it("parses MT5 positions CSV", () => {
    const csv = "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit\n2026.09.23 10:00:00,123,EURUSD,buy,0.01,1.16500,1.16300,1.16900,2026.09.23 11:00:00,1.16900,-0.07,0,4.00\n";
    const t = parseReport(csv);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: "123", side: "buy", closePrice: 1.169, profit: 4, commission: -0.07 });
  });

  it("filters the journal by today, week, month and year in UTC", () => {
    const now = "2026-11-03T12:00:00Z";
    const at = (id: string, closeTime: string): Trade => ({ ...base, id, closeTime });
    const trades = [
      at("today", "2026-11-03T09:00:00Z"),
      at("this-week", "2026-11-02T09:00:00Z"),
      at("this-month", "2026-11-01T09:00:00Z"),
      at("this-year", "2026-06-15T09:00:00Z"),
      at("last-year", "2025-12-31T09:00:00Z"),
    ];

    expect(tradesInRange(trades, "all", now)).toHaveLength(5);
    expect(tradesInRange(trades, "today", now).map((t) => t.id)).toEqual(["today"]);
    expect(tradesInRange(trades, "week", now).map((t) => t.id)).toEqual(["today", "this-week"]);
    expect(tradesInRange(trades, "month", now).map((t) => t.id)).toEqual(["today", "this-week", "this-month"]);
    expect(tradesInRange(trades, "year", now)).toHaveLength(4);
  });

  it("anchors the starting balance to the live MT5 balance unless manually overridden", () => {
    expect(effectiveStartBalance([base], 10000, 500)).toBe(496);
    expect(effectiveStartBalance([base], 10000, 500, true)).toBe(10000);
    expect(effectiveStartBalance([base], 10000, null)).toBe(10000);
  });

  it("appends the live equity to the curve", () => {
    const curve = equityCurve([base], 496, 501.5);
    expect(curve).toHaveLength(2);
    expect(curve[0]?.equity).toBe(500);
    expect(curve[1]).toMatchObject({ date: "Now", equity: 501.5, drawdown: 0 });

    const underwater = equityCurve([base], 496, 499);
    expect(underwater[1]).toMatchObject({ date: "Now", equity: 499, drawdown: -1 });
  });
});
