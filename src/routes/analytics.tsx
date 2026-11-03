import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CircleDollarSign,
  Gauge,
  Percent,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell, EmptyState, MetricCard, PageSkeleton, Pnl } from "@/components/AppShell";
import { ChartCard, ChartEmpty, SegmentedControl, axisTick, chartTooltipProps } from "@/components/ChartCard";
import { FilterSelect } from "@/components/FilterPane";
import { useTrades } from "@/lib/store";
import {
  computeStats,
  cumulativePnl,
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

const periodOptions = [
  { value: "day" as const, label: "Daily" },
  { value: "week" as const, label: "Weekly" },
  { value: "month" as const, label: "Monthly" },
  { value: "year" as const, label: "Yearly" },
];
const rangeOptions = tradeRanges.map(({ value, label }) => ({ value, label }));

function Analytics() {
  const { trades, startBalance, startBalanceManual, loading, mt5Balance, mt5Equity, mt5AccountLabel } = useTrades();
  const [period, setPeriod] = useState<(typeof periodOptions)[number]["value"]>("day");
  const [range, setRange] = useState<TradeRange>("all");

  const scoped = useMemo(() => tradesInRange(trades, range), [trades, range]);
  const statsStart = useMemo(
    () => effectiveStartBalance(scoped, startBalance, mt5Balance, startBalanceManual),
    [scoped, startBalance, mt5Balance, startBalanceManual],
  );
  const currentEquity = mt5Balance != null ? (mt5Equity ?? mt5Balance) : null;
  const s = useMemo(() => computeStats(scoped, statsStart), [scoped, statsStart]);
  const curve = useMemo(() => equityCurve(scoped, statsStart, currentEquity), [scoped, statsStart, currentEquity]);
  const cumulative = useMemo(() => cumulativePnl(scoped), [scoped]);
  const bars = useMemo(() => groupPnl(scoped, period).slice(-30), [scoped, period]);
  const bySym = useMemo(() => groupBy(scoped, (trade) => trade.symbol), [scoped]);
  const bySess = useMemo(() => groupBy(scoped, (trade) => session(trade.openTime)), [scoped]);
  const bySide = useMemo(() => groupBy(scoped, (trade) => trade.side.toUpperCase()), [scoped]);

  const winLoss = useMemo(
    () => [
      { name: "Wins", value: s.wins, color: "var(--profit)" },
      { name: "Losses", value: s.losses, color: "var(--loss)" },
      { name: "Breakeven", value: Math.max(0, s.total - s.wins - s.losses), color: "var(--muted-foreground)" },
    ].filter((entry) => entry.value > 0),
    [s],
  );

  if (loading && !trades.length) {
    return (
      <AppShell title="Analytics" description="Deep analysis of your trading performance.">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!trades.length && mt5Balance == null) {
    return (
      <AppShell title="Analytics" description="Deep analysis of your trading performance.">
        <EmptyState
          icon={TrendingUp}
          title="Analytics will appear after your first trades"
          description="Import an MT5 history report or connect MetaTrader 5. Your equity curve, drawdown and performance breakdowns will populate automatically."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Analytics"
      description="Performance, risk and instrument breakdowns calculated from your closed trades."
      actions={
        <div className="flex items-center gap-2">
          <div className="w-36">
            <FilterSelect label="Date range" value={range} options={rangeOptions} onChange={(value) => setRange(value as TradeRange)} />
          </div>
        </div>
      }
    >
      {/* Balance strip */}
      <section className="panel flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">MT5 balance</span>
          <span className="num text-sm font-semibold">{mt5Balance != null ? money(mt5Balance) : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <CircularGaugeIcon />
          <span className="text-xs text-muted-foreground">Live equity</span>
          <span className="num text-sm font-semibold">{currentEquity != null ? money(currentEquity) : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">{mt5AccountLabel ?? "No live account"}</span>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="num font-medium text-foreground">{scoped.length}</span> closed trades in range
        </div>
      </section>

      {!scoped.length && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
          No closed trades in this period. Your MT5 balance and equity are still shown above.
        </div>
      )}

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Net profit"
          value={<Pnl v={s.net} fmt={(v) => money(v, true)} />}
          icon={CircleDollarSign}
          hint="After commission and swap"
          tone={s.net > 0 ? "profit" : s.net < 0 ? "loss" : "default"}
        />
        <MetricCard
          label="Gross profit"
          value={<span className="text-profit">{money(s.grossProfit)}</span>}
          icon={TrendingUp}
          hint={`${s.wins} winning trades`}
        />
        <MetricCard
          label="Gross loss"
          value={<span className="text-loss">{money(s.grossLoss)}</span>}
          icon={TrendingDown}
          hint={`${s.losses} losing trades`}
        />
        <MetricCard
          label="Win rate"
          value={pct(s.winRate)}
          icon={Target}
          hint={`${s.wins}W · ${s.losses}L`}
        />
        <MetricCard
          label="Profit factor"
          value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
          icon={Scale}
          hint="Gross profit ÷ gross loss"
        />
        <MetricCard label="Average win" value={<Pnl v={s.avgWin} fmt={(v) => money(v, true)} />} icon={Percent} hint="Per winning trade" />
        <MetricCard label="Average loss" value={<Pnl v={s.avgLoss} fmt={(v) => money(v, true)} />} icon={Percent} hint="Per losing trade" />
        <MetricCard
          label="Maximum drawdown"
          value={pct(s.maxDrawdownPct)}
          icon={TrendingDown}
          hint={`${money(-s.maxDrawdown)} peak-to-trough`}
          tone={s.maxDrawdownPct > 0 ? "loss" : "default"}
        />
      </section>

      {/* Equity + distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Equity curve"
          subtitle="Account equity across the selected range."
          className="lg:col-span-2"
        >
          {curve.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={28} />
                  <YAxis width={62} tick={axisTick} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} tickFormatter={(value: number) => money(value)} />
                  <Tooltip {...chartTooltipProps} formatter={(value: number) => [money(Number(value)), "Equity"]} />
                  <Area type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2} fill="url(#analyticsEquity)" activeDot={{ r: 3 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="Your equity curve will appear after trades in this range." />
          )}
        </ChartCard>

        <ChartCard title="Win / loss distribution" subtitle={`${s.total} closed trades`}>
          {winLoss.length ? (
            <div className="flex h-72 flex-col">
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={winLoss} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                      {winLoss.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltipProps} formatter={(value: number, name: string) => [`${value} trades`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {winLoss.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="num font-semibold">
                      {entry.value} · {pct(s.total ? entry.value / s.total : 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ChartEmpty message="No wins or losses to chart." />
          )}
        </ChartCard>
      </div>

      {/* Period P&L + cumulative */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="P&L by period"
          subtitle="Net result per period, most recent 30."
          className="lg:col-span-2"
          actions={<SegmentedControl value={period} options={periodOptions} onChange={setPeriod} ariaLabel="P&L grouping period" />}
        >
          {bars.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={18} />
                  <YAxis width={62} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value)} />
                  <Tooltip {...chartTooltipProps} formatter={(value: number) => [money(Number(value), true), "Net P&L"]} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                    {bars.map((entry) => (
                      <Cell key={entry.key} fill={entry.pnl >= 0 ? "var(--profit)" : "var(--loss)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="No period performance to chart." />
          )}
        </ChartCard>

        <ChartCard title="Cumulative P&L" subtitle="Running net result from zero.">
          {cumulative.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulative} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumulativePnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.3} />
                      <stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={28} />
                  <YAxis width={54} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value)} />
                  <Tooltip {...chartTooltipProps} formatter={(value: number) => [money(Number(value), true), "Cumulative"]} />
                  <Area type="monotone" dataKey="pnl" stroke="var(--chart-2)" strokeWidth={2} fill="url(#cumulativePnl)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="Cumulative P&L needs closed trades." />
          )}
        </ChartCard>
      </div>

      {/* Drawdown + sides */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Drawdown" subtitle="Distance below the running equity peak." className="lg:col-span-2">
          {curve.length ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsDrawdown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--loss)" stopOpacity={0.05} />
                      <stop offset="1" stopColor="var(--loss)" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={28} />
                  <YAxis width={62} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value)} />
                  <Tooltip {...chartTooltipProps} formatter={(value: number) => [money(Number(value)), "Drawdown"]} />
                  <Area type="monotone" dataKey="drawdown" stroke="var(--loss)" strokeWidth={1.5} fill="url(#analyticsDrawdown)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="Drawdown appears once the curve has data." />
          )}
        </ChartCard>

        <section className="panel p-4 lg:p-5">
          <h2 className="text-sm font-semibold">Long vs short</h2>
          <p className="text-xs text-muted-foreground">Performance by position direction.</p>
          <div className="mt-4 space-y-4">
            {["BUY", "SELL"].map((label) => {
              const side = bySide.find((entry) => entry.key === label);
              const max = Math.max(...bySide.map((entry) => Math.abs(entry.net)), 1);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-semibold", label === "BUY" ? "text-profit" : "text-loss")}>
                      {label === "BUY" ? "Long" : "Short"}
                    </span>
                    <Pnl v={side?.net ?? 0} fmt={(v) => money(v, true)} className="font-semibold" />
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", (side?.net ?? 0) >= 0 ? "bg-profit" : "bg-loss")}
                      style={{ width: `${(Math.abs(side?.net ?? 0) / max) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {side?.total ?? 0} trades · {pct(side?.winRate ?? 0)} win
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Average R multiple</span>
              <span className="num font-semibold">{s.avgR != null ? `${s.avgR.toFixed(2)}R` : "—"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Expectancy</span>
              <Pnl v={s.expectancy} fmt={(v) => money(v, true)} className="font-semibold" />
            </div>
          </div>
        </section>
      </div>

      {/* Instruments + sessions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Performance by instrument" subtitle="Net P&L per symbol." className="lg:col-span-2">
          {bySym.length ? (
            <div style={{ height: Math.max(220, bySym.slice(0, 8).length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bySym.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value)} />
                  <YAxis type="category" dataKey="key" width={86} tick={axisTick} tickLine={false} axisLine={false} />
                  <Tooltip {...chartTooltipProps} formatter={(value: number) => [money(Number(value), true), "Net P&L"]} />
                  <Bar dataKey="net" radius={[0, 3, 3, 0]} maxBarSize={20}>
                    {bySym.slice(0, 8).map((entry) => (
                      <Cell key={entry.key} fill={entry.net >= 0 ? "var(--profit)" : "var(--loss)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="No instrument performance yet." />
          )}
        </ChartCard>

        <section className="panel p-4 lg:p-5">
          <h2 className="text-sm font-semibold">Performance by session</h2>
          <p className="text-xs text-muted-foreground">UTC trading sessions.</p>
          <div className="mt-4 space-y-4">
            {bySess.length ? (
              bySess.map((entry) => {
                const max = Math.max(...bySess.map((row) => Math.abs(row.net)), 1);
                return (
                  <div key={entry.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{entry.key}</span>
                      <Pnl v={entry.net} fmt={(v) => money(v, true)} className="font-semibold" />
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full", entry.net >= 0 ? "bg-profit" : "bg-loss")}
                        style={{ width: `${(Math.abs(entry.net) / max) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {entry.total} trades · {pct(entry.winRate)} win
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">No session data yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* Detailed stats */}
      <section className="panel p-4 lg:p-5">
        <h2 className="text-sm font-semibold">Detailed statistics</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {[
            ["Total trades", s.total.toLocaleString("en-US")],
            ["Average trade", money(s.avgTrade, true)],
            ["Expectancy", money(s.expectancy, true)],
            ["Average R:R", s.avgR != null ? `${s.avgR.toFixed(2)}R` : "—"],
            ["Largest win", money(s.largestWin, true)],
            ["Largest loss", money(s.largestLoss, true)],
            ["Max win streak", String(s.maxWinStreak)],
            ["Max loss streak", String(s.maxLossStreak)],
            ["Win rate", pct(s.winRate)],
            ["Loss rate", pct(s.lossRate)],
            ["Gross profit", money(s.grossProfit)],
            ["Gross loss", money(s.grossLoss)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="num font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function CircularGaugeIcon() {
  return <Gauge className="h-4 w-4 text-info" />;
}
