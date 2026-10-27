export type Side = "buy" | "sell";

export interface Trade {
  id: string; // MT5 position/ticket
  symbol: string;
  side: Side;
  volume: number;
  openTime: string; // ISO
  closeTime: string; // ISO
  openPrice: number;
  closePrice: number;
  sl: number | null;
  tp: number | null;
  commission: number;
  swap: number;
  profit: number; // gross profit from MT5
}

export const netPnl = (t: Trade) => t.profit + t.commission + t.swap;

/** R-multiple based on SL distance; null when no SL. */
export function rMultiple(t: Trade): number | null {
  if (!t.sl) return null;
  const risk = Math.abs(t.openPrice - t.sl);
  if (!risk) return null;
  const move = t.side === "buy" ? t.closePrice - t.openPrice : t.openPrice - t.closePrice;
  return move / risk;
}

export function session(iso: string): "Asia" | "London" | "New York" {
  const h = new Date(iso).getUTCHours();
  if (h >= 13 && h < 21) return "New York";
  if (h >= 7 && h < 13) return "London";
  return "Asia";
}

export function durationLabel(t: Trade) {
  const m = Math.max(0, Math.round((+new Date(t.closeTime) - +new Date(t.openTime)) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

/* ---------------- Parsing ---------------- */

const num = (s: string | undefined) => {
  if (s == null) return NaN;
  const v = parseFloat(s.replace(/\s/g, "").replace(/,/g, ""));
  return v;
};

// MT5 dates look like "2026.09.23 14:05:11"
function toIso(s: string): string {
  const m = s.trim().match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(s).toISOString();
  const n = (i: number) => +(m[i] ?? 0);
  return new Date(Date.UTC(n(1), n(2) - 1, n(3), n(4), n(5), n(6))).toISOString();
}

export function rowsToTrades(rows: string[][]): Trade[] {
  // Find header row containing "Symbol" and "Profit"
  const hIdx = rows.findIndex((r) => {
    const l = r.map((c) => c.trim().toLowerCase());
    return l.includes("symbol") && l.includes("profit") && l.includes("type") && l.some((c) => c === "time" || c === "open time");
  });
  if (hIdx < 0) return [];
  const header = rows[hIdx]!.map((c) => c.trim().toLowerCase().replace(/\s+/g, " "));
  const idxAll = (name: string) => header.map((h, i) => (h === name ? i : -1)).filter((i) => i >= 0);
  const times = [...idxAll("time"), ...idxAll("open time"), ...idxAll("close time")];
  const prices = [...idxAll("price"), ...idxAll("open price"), ...idxAll("close price")];
  const g = (n: string) => header.indexOf(n);
  const iPos = g("position") >= 0 ? g("position") : g("ticket");
  const iSym = g("symbol"), iType = g("type"), iVol = g("volume");
  const iSl = g("s / l") >= 0 ? g("s / l") : g("s/l") >= 0 ? g("s/l") : g("sl");
  const iTp = g("t / p") >= 0 ? g("t / p") : g("t/p") >= 0 ? g("t/p") : g("tp");
  const iCom = g("commission"), iSwap = g("swap"), iProfit = g("profit");

  const out: Trade[] = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r]!;
    const type = (row[iType] ?? "").trim().toLowerCase();
    if (type !== "buy" && type !== "sell") {
      // Stop at next section (Orders / Deals) once we've collected positions
      if (out.length && row.some((c) => /^(orders|deals)$/i.test(c.trim()))) break;
      continue;
    }
    const profit = num(row[iProfit]);
    if (isNaN(profit) || !row[iSym]) continue;
    const t: Trade = {
      id: (row[iPos] ?? `${r}`).trim() || `${r}`,
      symbol: row[iSym].trim(),
      side: type as Side,
      volume: num(row[iVol]) || 0,
      openTime: toIso(row[times[0]!] ?? ""),
      closeTime: toIso(row[(times[1] ?? times[0])!] ?? ""),
      openPrice: num(row[prices[0]!]) || 0,
      closePrice: num(row[(prices[1] ?? prices[0])!]) || 0,
      sl: num(row[iSl]) || null,
      tp: num(row[iTp]) || null,
      commission: num(row[iCom]) || 0,
      swap: num(row[iSwap]) || 0,
      profit,
    };
    out.push(t);
  }
  return out;
}

function parseCsv(text: string): string[][] {
  const delim = (text.split("\n")[0]!.match(/;/g)?.length ?? 0) > (text.split("\n")[0]!.match(/,/g)?.length ?? 0) ? ";" : text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let cur: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { cur.push(f); f = ""; }
    else if (c === "\n") { cur.push(f.replace(/\r$/, "")); rows.push(cur); cur = []; f = ""; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}

function parseHtml(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return Array.from(doc.querySelectorAll("tr")).map((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll("td,th").forEach((td) => {
      const span = parseInt(td.getAttribute("colspan") ?? "1") || 1;
      cells.push(td.textContent ?? "");
      // Hidden spacer cells in MT5 reports carry colspan; pad to keep columns aligned
      for (let i = 1; i < span; i++) cells.push("");
    });
    return cells;
  });
}

/** Parses an MT5 "Positions" history report exported as HTML or CSV. */
export function parseReport(text: string): Trade[] {
  const isHtml = /<table|<tr/i.test(text);
  let trades = rowsToTrades(isHtml ? parseHtml(text) : parseCsv(text));
  if (!trades.length && isHtml) {
    // Fallback: strip empty spacer cells
    trades = rowsToTrades(parseHtml(text).map((r) => r.filter((c) => c !== "")));
  }
  return trades;
}

/** Decode file bytes; MT5 HTML reports are often UTF-16LE. */
export function decodeFile(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b.length > 1 && b[1] === 0 && b[3] === 0) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

/* ---------------- Stats ---------------- */

export interface Stats {
  total: number; wins: number; losses: number; winRate: number; lossRate: number;
  grossProfit: number; grossLoss: number; net: number; avgTrade: number;
  avgWin: number; avgLoss: number; largestWin: number; largestLoss: number;
  profitFactor: number; maxDrawdown: number; maxDrawdownPct: number; avgR: number | null;
  expectancy: number; maxWinStreak: number; maxLossStreak: number;
}

export function computeStats(trades: Trade[], startBalance = 0): Stats {
  const sorted = [...trades].sort((a, b) => a.closeTime.localeCompare(b.closeTime));
  const p = sorted.map(netPnl);
  const winsArr = p.filter((x) => x > 0), lossArr = p.filter((x) => x < 0);
  const gp = winsArr.reduce((a, b) => a + b, 0), gl = lossArr.reduce((a, b) => a + b, 0);
  let eq = startBalance, peak = startBalance, mdd = 0, mddPct = 0;
  let ws = 0, ls = 0, mws = 0, mls = 0;
  for (const x of p) {
    eq += x; peak = Math.max(peak, eq);
    const dd = peak - eq;
    if (dd > mdd) mdd = dd;
    if (peak > 0) mddPct = Math.max(mddPct, dd / peak);
    if (x > 0) { ws++; ls = 0; } else if (x < 0) { ls++; ws = 0; }
    mws = Math.max(mws, ws); mls = Math.max(mls, ls);
  }
  const rs = sorted.map(rMultiple).filter((r): r is number => r != null);
  const n = p.length;
  return {
    total: n, wins: winsArr.length, losses: lossArr.length,
    winRate: n ? winsArr.length / n : 0, lossRate: n ? lossArr.length / n : 0,
    grossProfit: gp, grossLoss: gl, net: gp + gl, avgTrade: n ? (gp + gl) / n : 0,
    avgWin: winsArr.length ? gp / winsArr.length : 0, avgLoss: lossArr.length ? gl / lossArr.length : 0,
    largestWin: winsArr.length ? Math.max(...winsArr) : 0, largestLoss: lossArr.length ? Math.min(...lossArr) : 0,
    profitFactor: gl ? gp / Math.abs(gl) : gp > 0 ? Infinity : 0,
    maxDrawdown: mdd, maxDrawdownPct: mddPct,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    expectancy: n ? (gp + gl) / n : 0, maxWinStreak: mws, maxLossStreak: mls,
  };
}

const dayKey = (iso: string) => iso.slice(0, 10);
function weekKey(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
export const periodKey = {
  day: dayKey, week: weekKey, month: (iso: string) => iso.slice(0, 7), year: (iso: string) => iso.slice(0, 4),
};

export function groupPnl(trades: Trade[], by: keyof typeof periodKey) {
  const m = new Map<string, { key: string; pnl: number; trades: number; wins: number }>();
  for (const t of trades) {
    const k = periodKey[by](t.closeTime);
    const e = m.get(k) ?? { key: k, pnl: 0, trades: 0, wins: 0 };
    e.pnl += netPnl(t); e.trades++; if (netPnl(t) > 0) e.wins++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function groupBy(trades: Trade[], fn: (t: Trade) => string) {
  const m = new Map<string, Trade[]>();
  for (const t of trades) m.set(fn(t), [...(m.get(fn(t)) ?? []), t]);
  return [...m.entries()].map(([key, ts]) => ({ key, ...computeStats(ts) })).sort((a, b) => b.net - a.net);
}

export function equityCurve(trades: Trade[], start = 0) {
  let eq = start, peak = start;
  return [...trades].sort((a, b) => a.closeTime.localeCompare(b.closeTime)).map((t, i) => {
    eq += netPnl(t); peak = Math.max(peak, eq);
    return { i: i + 1, date: dayKey(t.closeTime), equity: +eq.toFixed(2), drawdown: +(eq - peak).toFixed(2) };
  });
}

/* ---------------- Formatting ---------------- */
export const money = (v: number, sign = false) =>
  `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/* ---------------- Sample data ---------------- */
export function sampleTrades(): Trade[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const syms: [string, number, number][] = [["EURUSD", 1.165, 0.002], ["GBPUSD", 1.27, 0.0025], ["XAUUSD", 2650, 8], ["USDJPY", 149.5, 0.3], ["NAS100", 20100, 40]];
  const out: Trade[] = [];
  const now = Date.now();
  for (let i = 0; i < 140; i++) {
    const [symbol, base, risk] = syms[Math.floor(rnd() * syms.length)]!;
    const side: Side = rnd() > 0.5 ? "buy" : "sell";
    const open = new Date(now - (90 - i * 0.64) * 86400000 + rnd() * 8 * 3600000);
    const close = new Date(+open + (10 + rnd() * 300) * 60000);
    const win = rnd() < 0.58;
    const r = win ? 0.6 + rnd() * 2 : -(0.4 + rnd() * 0.6);
    const dir = side === "buy" ? 1 : -1;
    const entry = base * (1 + (rnd() - 0.5) * 0.02);
    const vol = [0.01, 0.05, 0.1, 0.2][Math.floor(rnd() * 4)]!;
    const profit = +(r * 40 * (vol / 0.1) * (0.8 + rnd() * 0.4)).toFixed(2);
    out.push({
      id: String(5000000 + i), symbol, side, volume: vol,
      openTime: open.toISOString(), closeTime: close.toISOString(),
      openPrice: +entry.toFixed(5), closePrice: +(entry + dir * r * risk).toFixed(5),
      sl: +(entry - dir * risk).toFixed(5), tp: +(entry + dir * risk * 2).toFixed(5),
      commission: -+(vol * 7).toFixed(2), swap: rnd() > 0.8 ? -+(rnd() * 2).toFixed(2) : 0, profit,
    });
  }
  return out;
}
