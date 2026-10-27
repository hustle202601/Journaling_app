import { describe, expect, it } from "vitest";
import { computeStats, parseReport, rMultiple, type Trade } from "./trades";

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
});
