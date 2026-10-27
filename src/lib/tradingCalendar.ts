import { netPnl, type Trade } from "./trades";

export function tradingMonth(trades: Trade[], month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => {
    const key = `${month}-${String(i + 1).padStart(2, "0")}`;
    const entries = trades.filter((t) => t.closeTime.slice(0, 10) === key);
    return { key, day: i + 1, trades: entries, pnl: entries.reduce((sum, t) => sum + netPnl(t), 0) };
  });
  const cells = [
    ...Array.from({ length: first.getUTCDay() }, () => null),
    ...days,
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => {
    const weekDays = cells.slice(i * 7, i * 7 + 7);
    return {
      days: weekDays,
      pnl: weekDays.reduce((sum, d) => sum + (d?.pnl ?? 0), 0),
      count: weekDays.reduce((sum, d) => sum + (d?.trades.length ?? 0), 0),
    };
  });
  return { weeks, pnl: days.reduce((sum, d) => sum + d.pnl, 0), count: days.reduce((sum, d) => sum + d.trades.length, 0) };
}

export function moveMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}