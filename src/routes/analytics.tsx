import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, EmptyState, Pnl, Stat } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import {
  computeStats,
  effectiveStartBalance,
  equityCurve,
  groupBy,
  groupPnl,
  money,
  pct,
  session,
  tradeRanges,
  tradesInRange,
  type TradeRange,
} from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — MT5 Trading Journal" },
      { name: "description", content: "Equity curve, drawdown, P&L by period, symbol and session." },
      { property: "og:title", content: "Analytics — MT5 Trading Journal" },
      { property: "og:description", content: "Equity curve, drawdown, P&L by period, symbol and session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };
const periods = ["day", "week", "month", "year"] as const;
const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
    on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
  );

function Analytics() {
  const { trades, startBalance, startBalanceManual, loading, mt5Balance, mt5Equity } = useTrades();
  const [period, setPeriod] = useState<(typeof periods)[number]>("day");
  const [range, setRange] = useState<TradeRange>("all");

  const scoped = useMemo(() => tradesInRange(trades, range), [trades, range]);
  const statsStart = useMemo(
    () => effectiveStartBalance(scoped, startBalance, mt5Balance, startBalanceManual),
    [scoped, startBalance, mt5Balance, startBalanceManual],
  );
  const currentEquity = mt5Balance != null ? (mt5Equity ?? mt5Balance) : null;
  const s = useMemo(() => computeStats(scoped, statsStart), [scoped, statsStart]);
  const curve = useMemo(
    () => equityCurve(scoped, statsStart, currentEquity),
    [scoped, statsStart, currentEquity],
  );
  const bars = useMemo(() => groupPnl(scoped, period).slice(-30), [scoped, period]);
  const bySym = useMemo(() => groupBy(scoped, (t) => t.symbol), [scoped]);
  const bySess = useMemo(() => groupBy(scoped, (t) => session(t.openTime)), [scoped]);
  const bySide = useMemo(() => groupBy(scoped, (t) => t.side.toUpperCase()), [scoped]);

  if (loading && !trades.length) {
    return (
      <AppShell title="Analytics">
        <div className="panel p-6 text-center text-sm text-muted-foreground">Loading your journal…</div>
      </AppShell>
    );
  }
  if (!trades.length && mt5Balance == null) return <AppShell title="Analytics"><EmptyState /></AppShell>;

  return (
    <AppShell title="Analytics">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Period</span>
        {tradeRanges.map(({ value, label }) => (
          <button key={value} className={chip(range === value)} onClick={() => setRange(value)}>
            {label}
          </button>
        ))}
      </div>

      {!scoped.length && (
        <div className="panel p-4 text-sm text-muted-foreground">
          No closed trades in this period. Your MT5 balance and equity are still shown below.
        </div>
      )}

      <section className="panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Equity curve</h2>
          {currentEquity != null && (
            <span className="num text-xs text-muted-foreground">Now {money(currentEquity)}</span>
          )}
        </div>
        <div className="mt-2 h-44"><ResponsiveContainer><AreaChart data={curve}>
          <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
          <XAxis dataKey="date" hide /><YAxis domain={["dataMin", "dataMax"]} width={52} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip {...tip} formatter={(v: number) => money(v)} />
          <Area dataKey="equity" stroke="var(--primary)" strokeWidth={2} fill="url(#g1)" />
        </AreaChart></ResponsiveContainer></div>
        <h2 className="mt-3 font-bold">Drawdown</h2>
        <div className="mt-2 h-24"><ResponsiveContainer><AreaChart data={curve}>
          <XAxis dataKey="date" hide /><YAxis width={52} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip {...tip} formatter={(v: number) => money(v)} />
          <Area dataKey="drawdown" stroke="var(--loss)" fill="var(--loss)" fillOpacity={0.2} />
        </AreaChart></ResponsiveContainer></div>
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">P&L by period</h2>
          <div className="flex gap-1">{periods.map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-md px-2 py-1 text-[11px] font-bold uppercase", period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{p[0]}</button>)}</div>
        </div>
        <div className="mt-2 h-40"><ResponsiveContainer><BarChart data={bars}>
          <XAxis dataKey="key" hide /><YAxis width={44} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} formatter={(v: number) => money(v, true)} />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{bars.map((b) => <Cell key={b.key} fill={b.pnl >= 0 ? "var(--profit)" : "var(--loss)"} />)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="MT5 balance"><span className="num">{mt5Balance != null ? money(mt5Balance) : "—"}</span></Stat>
        <Stat label="Live equity"><span className="num">{currentEquity != null ? money(currentEquity) : "—"}</span></Stat>
        <Stat label="Net profit"><Pnl v={s.net} fmt={(v) => money(v, true)} /></Stat>
        <Stat label="Profit factor"><span className="num">{isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}</span></Stat>
        <Stat label="Win / loss"><span className="num">{pct(s.winRate)} / {pct(s.lossRate)}</span></Stat>
        <Stat label="Avg R"><span className="num">{s.avgR != null ? `${s.avgR.toFixed(2)}R` : "—"}</span></Stat>
        <Stat label="Avg win"><Pnl v={s.avgWin} fmt={(v) => money(v, true)} /></Stat>
        <Stat label="Avg loss"><Pnl v={s.avgLoss} fmt={(v) => money(v, true)} /></Stat>
        <Stat label="Largest win"><Pnl v={s.largestWin} fmt={(v) => money(v, true)} /></Stat>
        <Stat label="Largest loss"><Pnl v={s.largestLoss} fmt={(v) => money(v, true)} /></Stat>
        <Stat label="Max drawdown"><span className="num text-loss">{money(-s.maxDrawdown)}</span></Stat>
        <Stat label="Streaks W/L"><span className="num">{s.maxWinStreak} / {s.maxLossStreak}</span></Stat>
      </div>

      {bySym.length > 0 && <Breakdown title="By symbol" rows={bySym} />}
      {bySess.length > 0 && <Breakdown title="By session" rows={bySess} />}
      {bySide.length > 0 && <Breakdown title="Buy vs sell" rows={bySide} />}
    </AppShell>
  );
}

function Breakdown({ title, rows }: { title: string; rows: ReturnType<typeof groupBy> }) {
  return (
    <section className="panel">
      <h2 className="px-4 pt-3 font-bold">{title}</h2>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between border-t px-4 py-2.5 text-sm first-of-type:border-t-0">
          <div><div className="font-semibold">{r.key}</div><div className="num text-xs text-muted-foreground">{r.total} trades · {pct(r.winRate)} win</div></div>
          <Pnl v={r.net} fmt={(v) => money(v, true)} className="font-bold" />
        </div>
      ))}
    </section>
  );
}
