import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, EmptyState, Pnl } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import { money, netPnl, rMultiple } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trades/")({
  head: () => ({
    meta: [
      { title: "Trade History — MT5 Trading Journal" },
      { name: "description", content: "Every imported MT5 trade, filterable by symbol, side and result." },
      { property: "og:title", content: "Trade History — MT5 Trading Journal" },
      { property: "og:description", content: "Every imported MT5 trade, filterable by symbol, side and result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Trades,
});

const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground");

function Trades() {
  const { trades } = useTrades();
  const [sym, setSym] = useState("All");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [res, setRes] = useState<"all" | "win" | "loss">("all");
  const symbols = useMemo(() => ["All", ...new Set(trades.map((t) => t.symbol))], [trades]);
  const list = useMemo(() => [...trades]
    .filter((t) => (sym === "All" || t.symbol === sym) && (side === "all" || t.side === side) && (res === "all" || (res === "win" ? netPnl(t) > 0 : netPnl(t) < 0)))
    .sort((a, b) => b.closeTime.localeCompare(a.closeTime)), [trades, sym, side, res]);
  const total = list.reduce((a, t) => a + netPnl(t), 0);

  if (!trades.length) return <AppShell title="Trades"><EmptyState /></AppShell>;
  return (
    <AppShell title="Trades">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{symbols.map((s) => <button key={s} className={chip(sym === s)} onClick={() => setSym(s)}>{s}</button>)}</div>
      <div className="flex gap-2">
        {(["all", "buy", "sell"] as const).map((s) => <button key={s} className={chip(side === s)} onClick={() => setSide(s)}>{s}</button>)}
        <span className="w-px bg-border" />
        {(["all", "win", "loss"] as const).map((s) => <button key={s} className={chip(res === s)} onClick={() => setRes(s)}>{s}</button>)}
      </div>
      <div className="flex justify-between text-sm text-muted-foreground"><span>{list.length} trades</span><Pnl v={total} fmt={(v) => money(v, true)} className="font-bold" /></div>
      <div className="panel overflow-hidden">
        {list.map((t) => { const r = rMultiple(t); return (
          <Link key={t.id} to="/trades/$id" params={{ id: t.id }} className="flex items-center justify-between border-t px-4 py-3 first:border-t-0">
            <div>
              <div className="font-bold">{t.symbol} <span className={cn("text-xs", t.side === "buy" ? "text-profit" : "text-loss")}>{t.side.toUpperCase()}</span></div>
              <div className="num text-xs text-muted-foreground">{t.closeTime.slice(0, 16).replace("T", " ")} · {t.volume} lot</div>
            </div>
            <div className="text-right">
              <Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="font-bold" />
              {r != null && <div className="num text-xs text-muted-foreground">{r >= 0 ? "+" : ""}{r.toFixed(2)}R</div>}
            </div>
          </Link>); })}
      </div>
    </AppShell>
  );
}
