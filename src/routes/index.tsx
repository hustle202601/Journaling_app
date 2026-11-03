import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  ListChecks,
  Scale,
  Target,
  TrendingDown,
  Upload,
} from "lucide-react";
import { AppShell, EmptyState, MetricCard, PageSkeleton, Pnl, SourceBadge } from "@/components/AppShell";
import { ChartCard, ChartEmpty, SegmentedControl, axisTick, chartTooltipProps } from "@/components/ChartCard";
import { useTrades } from "@/lib/store";
import {
  computeStats,
  effectiveStartBalance,
  equityCurve,
  groupBy,
  groupPnl,
  money,
  netPnl,
  pct,
  periodKey,
  rMultiple,
  tradeRanges,
  tradesInRange,
  type TradeRange,
} from "@/lib/trades";
import { cn } from "@/lib/utils";

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

function ago(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const rangeOptions = tradeRanges.map(({ value, label }) => ({ value, label }));

function Dashboard() {
  const {
    trades,
    startBalance,
    startBalanceManual,
    isSample,
    loading,
    mt5Balance,
    mt5Equity,
    mt5AccountLabel,
    mt5LastSyncAt,
  } = useTrades();

  const [range, setRange] = useState<TradeRange>("all");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setDateLabel(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, []);

  const d = useMemo(() => {
    const now = new Date().toISOString();
    const sum = (key: "day" | "week" | "month") =>
      trades
        .filter((trade) => periodKey[key](trade.closeTime) === periodKey[key](now))
        .reduce((total, trade) => total + netPnl(trade), 0);

    const statsStart = effectiveStartBalance(trades, startBalance, mt5Balance, startBalanceManual);
    const s = computeStats(trades, statsStart);
    const balance = mt5Balance ?? startBalance + s.net;
    const equity = mt5Equity ?? balance;
    const currentEquity = mt5Balance != null ? equity : null;
    const withStop = trades.filter((trade) => rMultiple(trade) != null).length;

    return {
      s,
      withStop,
      today: sum("day"),
      week: sum("week"),
      month: sum("month"),
      balance,
      equity,
      openPnl: mt5Balance != null && mt5Equity != null ? mt5Equity - mt5Balance : null,
      currentEquity,
      statsStart,
    };
  }, [trades, startBalance, startBalanceManual, mt5Balance, mt5Equity]);

  const scoped = useMemo(() => tradesInRange(trades, range), [trades, range]);

  const curve = useMemo(() => {
    const start = effectiveStartBalance(scoped, startBalance, mt5Balance, startBalanceManual);
    const points = equityCurve(scoped, start, d.currentEquity);
    const closed = scoped.reduce((sum, trade) => sum + netPnl(trade), 0);
    return points.map((point) => ({
      ...point,
      balance: point.date === "Now" ? +(start + closed).toFixed(2) : point.equity,
    }));
  }, [scoped, startBalance, mt5Balance, startBalanceManual, d.currentEquity]);

  const daily = useMemo(() => {
    const grouped = new Map(groupPnl(trades, "day").map((entry) => [entry.key, entry]));
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (13 - index));
      const key = date.toISOString().slice(0, 10);
      const entry = grouped.get(key);
      return { key, label: key.slice(5), pnl: entry?.pnl ?? 0, trades: entry?.trades ?? 0 };
    });
  }, [trades]);

  const instruments = useMemo(
    () => groupBy(trades, (trade) => trade.symbol).filter((entry) => entry.total > 0).slice(0, 5),
    [trades],
  );
  const recent = useMemo(
    () => [...trades].sort((a, b) => b.closeTime.localeCompare(a.closeTime)).slice(0, 6),
    [trades],
  );

  if (loading && !trades.length) {
    return (
      <AppShell title="Dashboard" description="Your live trading performance overview.">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!trades.length && mt5Balance == null) {
    return (
      <AppShell title="Dashboard" description="Your live trading performance overview.">
        <EmptyState
          icon={CircleDollarSign}
          title="Your performance dashboard is ready"
          description="Import an MT5 history report or connect MetaTrader 5 to populate your balance, P&L and analytics."
          action={
            <>
              <Link
                to="/import"
                className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Import trades
              </Link>
              <Link
                to="/mt5"
                className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-accent"
              >
                Connect MT5
              </Link>
            </>
          }
        />
      </AppShell>
    );
  }

  const hasMt5 = mt5Balance != null;
  const syncLabel = mt5LastSyncAt ? `Synced ${ago(mt5LastSyncAt)}` : hasMt5 ? "Waiting for first sync" : "Manual journal";
  const syncTone = !hasMt5
    ? "bg-muted-foreground"
    : !mt5LastSyncAt || Date.now() - mt5LastSyncAt > 60 * 60_000
      ? "bg-warning"
      : "bg-profit";

  return (
    <AppShell
      title="Dashboard"
      description="Your live trading performance overview."
      actions={
        <>
          <Link
            to="/import"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:text-sm"
          >
            <Upload className="h-4 w-4" /> Import trades
          </Link>
          <Link
            to="/analytics"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold transition-colors hover:bg-accent sm:text-sm"
          >
            Analytics <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </>
      }
    >
      {isSample && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Showing sample trades for preview.
          <Link to="/import" className="font-semibold underline">
            Import your own
          </Link>
        </div>
      )}

      {/* Account overview */}
      <section className="hero-panel overflow-hidden p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {dateLabel || "Today"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", syncTone)} /> {syncLabel}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight lg:text-2xl">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mt5AccountLabel ? (
                <>
                  Live account <span className="font-semibold text-foreground">{mt5AccountLabel}</span>
                </>
              ) : (
                "A clear view of your trading account and performance."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/mt5"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-background/40 px-3.5 text-xs font-semibold transition-colors hover:bg-accent"
            >
              {hasMt5 ? "Manage MT5 sync" : "Connect MT5"}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border/70 pt-5 sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Balance</div>
            <div className="num mt-1 text-lg font-bold tracking-tight sm:text-xl">{money(d.balance)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Equity</div>
            <div className="num mt-1 text-lg font-bold tracking-tight sm:text-xl">{money(d.equity)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Open P&L</div>
            <div className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
              {d.openPnl != null ? <Pnl v={d.openPnl} fmt={(v) => money(v, true)} /> : <span className="text-muted-foreground">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Closed P&L</div>
            <div className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
              <Pnl v={d.s.net} fmt={(v) => money(v, true)} />
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Net profit"
          value={<Pnl v={d.s.net} fmt={(v) => money(v, true)} />}
          icon={CircleDollarSign}
          hint={`${pct(d.s.winRate)} win rate · after costs`}
          tone={d.s.net > 0 ? "profit" : d.s.net < 0 ? "loss" : "default"}
        />
        <MetricCard
          label="Win rate"
          value={pct(d.s.winRate)}
          icon={Target}
          hint={`${d.s.wins}W · ${d.s.losses}L`}
        />
        <MetricCard
          label="Total trades"
          value={d.s.total.toLocaleString("en-US")}
          icon={ListChecks}
          hint={`${d.s.wins} profitable · ${d.s.losses} losing`}
        />
        <MetricCard
          label="Profit factor"
          value={Number.isFinite(d.s.profitFactor) ? d.s.profitFactor.toFixed(2) : "∞"}
          icon={Scale}
          hint={`${money(d.s.grossProfit)} gross profit`}
        />
        <MetricCard
          label="Avg R multiple"
          value={d.s.avgR != null ? `${d.s.avgR.toFixed(2)}R` : "—"}
          icon={Gauge}
          hint={d.withStop ? `Across ${d.withStop} trades with a stop loss` : "No stop-loss data"}
        />
        <MetricCard
          label="Max drawdown"
          value={pct(d.s.maxDrawdownPct)}
          icon={TrendingDown}
          hint={`${money(-d.s.maxDrawdown)} peak-to-trough`}
          tone={d.s.maxDrawdownPct > 0 ? "loss" : "default"}
        />
      </section>

      {/* Equity + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Equity curve"
          subtitle="Closed-trade equity and live MT5 equity."
          className="lg:col-span-2"
          actions={
            <SegmentedControl
              value={range}
              options={rangeOptions}
              onChange={setRange}
              ariaLabel="Equity curve date range"
            />
          }
        >
          {curve.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--primary)" stopOpacity={0.28} />
                      <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={28}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={62}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value: number) => money(value)}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number, name: string) => [money(Number(value)), name === "equity" ? "Equity" : "Balance"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#dashEquity)"
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                  {hasMt5 && (
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--muted-foreground)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="No closed trades in this range yet." />
          )}
        </ChartCard>

        <div className="flex flex-col gap-4">
          <section className="panel p-4 lg:p-5">
            <h2 className="text-sm font-semibold">Performance summary</h2>
            <div className="mt-3 space-y-3">
              {[
                { label: "Today", value: d.today },
                { label: "This week", value: d.week },
                { label: "This month", value: d.month },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <Pnl v={row.value} fmt={(v) => money(v, true)} className="text-sm font-semibold" />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Win / loss distribution</span>
                <span className="num">
                  {d.s.wins}W · {d.s.losses}L
                </span>
              </div>
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="bg-profit" style={{ width: `${d.s.total ? (d.s.wins / d.s.total) * 100 : 0}%` }} />
                <div className="bg-loss" style={{ width: `${d.s.total ? (d.s.losses / d.s.total) * 100 : 0}%` }} />
              </div>
            </div>
          </section>

          <ChartCard title="Daily P&L" subtitle="Last 14 calendar days" className="flex-1">
            {daily.some((day) => day.trades > 0) ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ ...axisTick, fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                    <Tooltip
                      {...chartTooltipProps}
                      labelFormatter={(label: string) => `Day ${label}`}
                      formatter={(value: number) => [money(Number(value), true), "P&L"]}
                    />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false}>
                      {daily.map((day) => (
                        <Cell
                          key={day.key}
                          fill={day.pnl > 0 ? "var(--profit)" : day.pnl < 0 ? "var(--loss)" : "var(--muted)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmpty message="No trading activity in the last 14 days." />
            )}
          </ChartCard>
        </div>
      </div>

      {/* Recent trades + instruments */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-2 px-4 py-3.5 lg:px-5">
            <div>
              <h2 className="text-sm font-semibold">Recent trades</h2>
              <p className="text-xs text-muted-foreground">Latest closed positions from your journal.</p>
            </div>
            <Link to="/trades" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recent.length ? (
            <div className="divide-y divide-border border-t border-border">
              {recent.map((trade) => (
                <Link
                  key={`${trade.source ?? "manual"}_${trade.id}`}
                  to="/trades/$id"
                  params={{ id: trade.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/50 lg:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {trade.symbol}
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                          trade.side === "buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
                        )}
                      >
                        {trade.side}
                      </span>
                      <SourceBadge source={trade.source} />
                    </div>
                    <div className="num mt-0.5 text-[11px] text-muted-foreground">
                      {trade.closeTime.slice(0, 16).replace("T", " ")} · {trade.volume} lot
                    </div>
                  </div>
                  <Pnl v={netPnl(trade)} fmt={(v) => money(v, true)} className="shrink-0 text-sm font-semibold" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="border-t border-border px-5 py-10 text-center text-sm text-muted-foreground">
              Closed trades will appear here after your next import or MT5 sync.
            </div>
          )}
        </section>

        <section className="panel p-4 lg:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Top instruments</h2>
              <p className="text-xs text-muted-foreground">Best net performers</p>
            </div>
            <Link to="/analytics" className="text-xs font-semibold text-primary hover:underline">
              Details
            </Link>
          </div>
          {instruments.length ? (
            <div className="mt-4 space-y-3.5">
              {instruments.map((instrument) => {
                const max = Math.max(...instruments.map((entry) => Math.abs(entry.net)), 1);
                return (
                  <div key={instrument.key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{instrument.key}</span>
                      <Pnl v={instrument.net} fmt={(v) => money(v, true)} className="font-semibold" />
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full", instrument.net >= 0 ? "bg-profit" : "bg-loss")}
                        style={{ width: `${(Math.abs(instrument.net) / max) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {instrument.total} trades · {pct(instrument.winRate)} win
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 text-center text-xs text-muted-foreground">No instrument data yet.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
