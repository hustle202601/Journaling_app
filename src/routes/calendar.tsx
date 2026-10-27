import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell, Pnl } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useTrades } from "@/lib/store";
import { moveMonth, tradingMonth } from "@/lib/tradingCalendar";
import { money, netPnl } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [
    { title: "Trading Calendar — MT5 Trading Journal" },
    { name: "description", content: "Daily net trading results, weekly totals and monthly P&L from your imported MT5 trades." },
    { property: "og:title", content: "Trading Calendar — MT5 Trading Journal" },
    { property: "og:description", content: "Review your imported trades by day with weekly and monthly net results." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: TradingCalendar,
});

function TradingCalendar() {
  const { trades } = useTrades();
  const [month, setMonth] = useState("");
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const now = new Date().toISOString().slice(0, 10);
    setToday(now);
    setMonth((value) => value || trades.reduce((latest, t) => t.closeTime.slice(0, 7) > latest ? t.closeTime.slice(0, 7) : latest, "") || now.slice(0, 7));
  }, [trades]);
  const data = useMemo(() => month ? tradingMonth(trades, month) : null, [trades, month]);
  const entries = useMemo(() => trades.filter((t) => t.closeTime.slice(0, 10) === selected).sort((a, b) => a.closeTime.localeCompare(b.closeTime)), [trades, selected]);
  const changeMonth = (value: string) => { setMonth(value); setSelected(null); };
  const label = month ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return <AppShell title="Trading Calendar" wide>
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs text-muted-foreground">Monthly P&L</div><Pnl v={data?.pnl ?? 0} fmt={(v) => money(v, true)} className="text-xl font-bold" /><div className="text-xs text-muted-foreground">{data?.count ?? 0} trades · UTC</div></div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" title="Previous month" disabled={!month} onClick={() => changeMonth(moveMonth(month, -1))}><ChevronLeft /></Button>
          <h2 className="w-36 text-center text-sm font-bold">{label}</h2>
          <Button variant="ghost" size="icon" aria-label="Next month" title="Next month" disabled={!month} onClick={() => changeMonth(moveMonth(month, 1))}><ChevronRight /></Button>
        </div>
        <Button variant="outline" size="sm" disabled={!today} onClick={() => changeMonth(today.slice(0, 7))}>Today</Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-8 bg-secondary/40">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Week total"].map((day) => <div key={day} className="py-3 text-center text-[11px] font-semibold uppercase text-muted-foreground">{day}</div>)}
          </div>
          {data?.weeks.map((week, i) => <div key={i} className="grid grid-cols-8 border-t">
            {week.days.map((day, j) => day ? <Button key={day.key} variant="ghost" aria-label={`${day.key}, ${day.trades.length} trades, ${money(day.pnl, true)}`} aria-pressed={selected === day.key} onClick={() => setSelected(day.key)} className={cn("h-28 min-w-0 flex-col items-start justify-between gap-1 whitespace-normal rounded-none border-r p-2 text-left", day.trades.length ? day.pnl > 0 ? "bg-profit/10 hover:bg-profit/20" : day.pnl < 0 ? "bg-loss/10 hover:bg-loss/20" : "bg-secondary/50" : "bg-card/30", selected === day.key && "ring-2 ring-inset ring-primary")}>
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center text-xs", day.key === today && "rounded-full bg-primary font-bold text-primary-foreground")}>{day.day}</span>
              {day.trades.length > 0 && <span className="block w-full"><Pnl v={day.pnl} fmt={(v) => money(v, true)} className="block break-all text-[10px] font-semibold sm:text-xs" /><span className="block text-[10px] text-muted-foreground">{day.trades.length} {day.trades.length === 1 ? "trade" : "trades"}</span></span>}
            </Button> : <div key={`blank-${j}`} className="h-28 border-r bg-muted/20" />)}
            <div className="flex min-w-0 flex-col justify-end bg-secondary/30 p-2 text-[10px]">
              <span className="text-muted-foreground">Week {i + 1}</span>
              {week.count > 0 ? <><Pnl v={week.pnl} fmt={(v) => money(v, true)} className="break-all font-bold sm:text-xs" /><span className="text-muted-foreground">{week.count} trades</span></> : <span className="text-muted-foreground">—</span>}
            </div>
          </div>)}
        </div>
      </div>
      {!trades.length && <div className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-muted-foreground">No imported trades yet.</span><Button asChild size="sm"><Link to="/import">Import trades</Link></Button></div>}
    </section>
    {selected && <section className="border-t py-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">{new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</h2><Pnl v={entries.reduce((sum, t) => sum + netPnl(t), 0)} fmt={(v) => money(v, true)} className="text-sm font-bold" /></div>
      {!entries.length && <p className="text-sm text-muted-foreground">No closed trades on this day.</p>}
      {entries.map((t) => <Link key={t.id} to="/trades/$id" params={{ id: t.id }} className="flex items-center justify-between gap-3 border-b py-3"><div><span className="text-sm font-bold">{t.symbol}</span><span className="ml-2 text-xs text-muted-foreground">{t.side.toUpperCase()} · {t.volume} lot</span><div className="text-xs text-muted-foreground">{t.closeTime.slice(11, 16)} UTC · #{t.id}</div></div><Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="text-sm font-bold" /></Link>)}
    </section>}
  </AppShell>;
}