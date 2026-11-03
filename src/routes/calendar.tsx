import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell, EmptyState, Pnl, SourceBadge } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import { moveMonth, tradingMonth } from "@/lib/tradingCalendar";
import { computeStats, money, netPnl, pct } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Trading Calendar — MT5 Trading Journal" },
      { name: "description", content: "Daily net trading results, weekly totals and monthly P&L from your imported MT5 trades." },
      { property: "og:title", content: "Trading Calendar — MT5 Trading Journal" },
      { property: "og:description", content: "Review your imported trades by day with weekly and monthly net results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradingCalendar,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TradingCalendar() {
  const { trades, loading } = useTrades();
  const [month, setMonth] = useState("");
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date().toISOString().slice(0, 10);
    setToday(now);
    setMonth(
      (value) =>
        value ||
        trades.reduce((latest, trade) => (trade.closeTime.slice(0, 7) > latest ? trade.closeTime.slice(0, 7) : latest), "") ||
        now.slice(0, 7),
    );
  }, [trades]);

  const data = useMemo(() => (month ? tradingMonth(trades, month) : null), [trades, month]);
  const monthTrades = useMemo(() => trades.filter((trade) => trade.closeTime.startsWith(month)), [trades, month]);
  const monthStats = useMemo(() => computeStats(monthTrades), [monthTrades]);
  const entries = useMemo(
    () => trades.filter((trade) => trade.closeTime.slice(0, 10) === selected).sort((a, b) => a.closeTime.localeCompare(b.closeTime)),
    [trades, selected],
  );
  const dayStats = useMemo(() => computeStats(entries), [entries]);

  const activeDays = useMemo(() => {
    if (!data) return [];
    const days: { key: string; pnl: number; count: number }[] = [];
    for (const week of data.weeks) {
      for (const day of week.days) {
        if (day && day.trades.length > 0) days.push({ key: day.key, pnl: day.pnl, count: day.trades.length });
      }
    }
    return days;
  }, [data]);
  const bestDay = activeDays.reduce<{ key: string; pnl: number; count: number } | null>(
    (best, day) => (!best || day.pnl > best.pnl ? day : best),
    null,
  );
  const worstDay = activeDays.reduce<{ key: string; pnl: number; count: number } | null>(
    (worst, day) => (!worst || day.pnl < worst.pnl ? day : worst),
    null,
  );

  const changeMonth = (value: string) => {
    setMonth(value);
    setSelected(null);
  };
  const label = month
    ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";

  if (loading && !trades.length) {
    return (
      <AppShell title="Calendar" description="Daily and monthly performance at a glance.">
        <div className="panel h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Calendar"
      description="Daily net results, weekly totals and monthly performance in UTC."
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            title="Previous month"
            disabled={!month}
            onClick={() => changeMonth(moveMonth(month, -1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold">{label}</span>
          <button
            type="button"
            aria-label="Next month"
            title="Next month"
            disabled={!month}
            onClick={() => changeMonth(moveMonth(month, 1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!today}
            onClick={() => changeMonth(today.slice(0, 7))}
            className="ml-1 h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-40"
          >
            Today
          </button>
        </div>
      }
    >
      {!trades.length && (
        <EmptyState
          icon={CalendarDays}
          title="No trading days yet"
          description="Your calendar fills automatically as trades are imported or synced from MetaTrader 5."
        />
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Monthly P&L</div>
          <Pnl v={data?.pnl ?? 0} fmt={(v) => money(v, true)} className="mt-2 block text-xl font-bold" />
          <div className="mt-1 text-[11px] text-muted-foreground">{data?.count ?? 0} closed trades</div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Win rate</div>
          <div className="num mt-2 text-xl font-bold">{pct(monthStats.winRate)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {monthStats.wins}W · {monthStats.losses}L
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Best day</div>
          <div className="mt-2 text-xl font-bold">
            {bestDay ? <Pnl v={bestDay.pnl} fmt={(v) => money(v, true)} /> : <span className="text-muted-foreground">—</span>}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{bestDay ? bestDay.key.slice(5) : "No activity"}</div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Worst day</div>
          <div className="mt-2 text-xl font-bold">
            {worstDay ? <Pnl v={worstDay.pnl} fmt={(v) => money(v, true)} /> : <span className="text-muted-foreground">—</span>}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{worstDay ? worstDay.key.slice(5) : "No activity"}</div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold">Trading days</h2>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-profit/60" /> Profit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-loss/60" /> Loss
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-secondary" /> No trades
            </span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[720px] border-t border-border">
            <div className="grid grid-cols-8 border-b border-border bg-secondary/40">
              {[...WEEKDAYS, "Week"].map((day) => (
                <div key={day} className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            {data?.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-8 border-b border-border last:border-b-0">
                {week.days.map((day, dayIndex) =>
                  day ? (
                    <button
                      key={day.key}
                      type="button"
                      aria-label={`${day.key}, ${day.trades.length} trades, ${money(day.pnl, true)}`}
                      aria-pressed={selected === day.key}
                      onClick={() => setSelected(day.key)}
                      className={cn(
                        "flex h-24 min-w-0 flex-col items-start justify-between gap-1 border-r border-border/60 p-2 text-left transition-colors last:border-r-0 hover:brightness-110",
                        day.trades.length
                          ? day.pnl > 0
                            ? "bg-profit/[0.07] hover:bg-profit/[0.12]"
                            : day.pnl < 0
                              ? "bg-loss/[0.07] hover:bg-loss/[0.12]"
                              : "bg-secondary/40 hover:bg-secondary/60"
                          : "bg-card/20 hover:bg-secondary/30",
                        selected === day.key && "ring-2 ring-inset ring-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                          day.key === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                        )}
                      >
                        {day.day}
                      </span>
                      {day.trades.length > 0 ? (
                        <span className="block w-full">
                          <Pnl
                            v={day.pnl}
                            fmt={(v) => money(v, true)}
                            className="block text-[11px] font-semibold leading-tight"
                          />
                          <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground">
                            {day.trades.length} {day.trades.length === 1 ? "trade" : "trades"} ·{" "}
                            {pct(day.trades.filter((trade) => netPnl(trade) > 0).length / day.trades.length)} win
                          </span>
                        </span>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/50">—</span>
                      )}
                    </button>
                  ) : (
                    <div key={`blank-${dayIndex}`} className="h-24 border-r border-border/40 bg-muted/10 last:border-r-0" />
                  ),
                )}
                <div className="flex h-24 min-w-0 flex-col justify-end bg-secondary/20 p-2">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">W{weekIndex + 1}</span>
                  {week.count > 0 ? (
                    <>
                      <Pnl v={week.pnl} fmt={(v) => money(v, true)} className="block break-all text-[11px] font-bold" />
                      <span className="text-[9px] text-muted-foreground">{week.count} trades</span>
                    </>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selected && (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">
                {new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "trade" : "trades"} · {pct(dayStats.winRate)} win rate
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Net P&L</div>
              <Pnl v={entries.reduce((sum, trade) => sum + netPnl(trade), 0)} fmt={(v) => money(v, true)} className="text-lg font-bold" />
            </div>
          </div>

          {!entries.length ? (
            <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No closed trades on this day.
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {entries.map((trade) => (
                <Link
                  key={`${trade.source ?? "manual"}_${trade.id}`}
                  to="/trades/$id"
                  params={{ id: trade.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{trade.symbol}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        trade.side === "buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
                      )}
                    >
                      {trade.side}
                    </span>
                    <SourceBadge source={trade.source} />
                    <span className="num text-[11px] text-muted-foreground">
                      {trade.closeTime.slice(11, 16)} UTC · {trade.volume} lot
                    </span>
                  </div>
                  <Pnl v={netPnl(trade)} fmt={(v) => money(v, true)} className="text-sm font-bold" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
