import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, EmptyState, Pnl, Stat } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import { computeStats, equityCurve, money, netPnl, pct, periodKey } from "@/lib/trades";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MT5 Trading Journal" },
      { name: "description", content: "Your MT5 balance, P&L, win rate and drawdown at a glance." },
      { property: "og:title", content: "Dashboard — MT5 Trading Journal" },
      { property: "og:description", content: "Your MT5 balance, P&L, win rate and drawdown at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { trades, startBalance, isSample } = useTrades();
  const d = useMemo(() => {
    const now = new Date().toISOString();
    const sum = (k: keyof typeof periodKey) => trades.filter((t) => periodKey[k](t.closeTime) === periodKey[k](now)).reduce((a, t) => a + netPnl(t), 0);
    const s = computeStats(trades, startBalance);
    return { s, today: sum("day"), week: sum("week"), month: sum("month"), curve: equityCurve(trades, startBalance) };
  }, [trades, startBalance]);

  if (!trades.length) return <AppShell title="Dashboard"><EmptyState /></AppShell>;
  const recent = [...trades].sort((a, b) => b.closeTime.localeCompare(a.closeTime)).slice(0, 5);

  return (
    <AppShell title="Dashboard">
      {isSample && <div className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">Showing sample trades. <Link to="/import" className="font-bold text-primary">Import yours →</Link></div>}
      <section className="hero-panel p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</div>
        <div className="num mt-1 text-4xl font-bold">{money(startBalance + d.s.net)}</div>
        <div className="mt-1 text-sm">Overall <Pnl v={d.s.net} fmt={(v) => money(v, true)} className="font-bold" /></div>
        <div className="mt-4 h-24 -mx-2">
          <ResponsiveContainer>
            <AreaChart data={d.curve}>
              <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="1" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
              <YAxis hide domain={["dataMin", "dataMax"]} /><XAxis hide dataKey="i" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: number) => money(v)} labelFormatter={() => ""} />
              <Area dataKey="equity" stroke="var(--primary)" strokeWidth={2} fill="url(#eq)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Today"><Pnl v={d.today} fmt={(v) => money(v, true)} className="text-base" /></Stat>
        <Stat label="Week"><Pnl v={d.week} fmt={(v) => money(v, true)} className="text-base" /></Stat>
        <Stat label="Month"><Pnl v={d.month} fmt={(v) => money(v, true)} className="text-base" /></Stat>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Win rate"><span className="num">{pct(d.s.winRate)}</span></Stat>
        <Stat label="Profit factor"><span className="num">{isFinite(d.s.profitFactor) ? d.s.profitFactor.toFixed(2) : "∞"}</span></Stat>
        <Stat label="Max drawdown"><span className="num text-loss">{pct(d.s.maxDrawdownPct)}</span></Stat>
        <Stat label="Trades"><span className="num">{d.s.total}</span></Stat>
      </div>
      <section className="panel">
        <div className="flex items-center justify-between px-4 pt-3"><h2 className="font-bold">Recent trades</h2><Link to="/trades" className="text-xs font-bold text-primary">See all</Link></div>
        {recent.map((t) => (
          <Link key={t.id} to="/trades/$id" params={{ id: t.id }} className="flex items-center justify-between border-t px-4 py-3 first-of-type:border-t-0">
            <div><div className="font-bold">{t.symbol} <span className={t.side === "buy" ? "text-profit text-xs" : "text-loss text-xs"}>{t.side.toUpperCase()}</span></div>
              <div className="num text-xs text-muted-foreground">{t.volume} lot · {t.closeTime.slice(0, 10)}</div></div>
            <Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="font-bold" />
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
