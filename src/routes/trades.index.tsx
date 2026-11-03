import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, EmptyState, Pnl } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import {
  money,
  netPnl,
  rMultiple,
  tradeRanges,
  tradesInRange,
  type Trade,
  type TradeRange,
} from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trades/")({
  head: () => ({
    meta: [
      { title: "Trade History — MT5 Trading Journal" },
      { name: "description", content: "Every imported MT5 trade, filterable by period, source, symbol, side and result." },
      { property: "og:title", content: "Trade History — MT5 Trading Journal" },
      { property: "og:description", content: "Every imported MT5 trade, filterable by period, source, symbol, side and result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Trades,
});

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
    on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
  );

function SourceBadge({ source }: { source?: Trade["source"] }) {
  const mt5 = source === "mt5";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        mt5 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
      )}
    >
      {mt5 ? "MT5" : "Manual"}
    </span>
  );
}

function Trades() {
  const { trades, loading } = useTrades();
  const [sym, setSym] = useState("All");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [res, setRes] = useState<"all" | "win" | "loss">("all");
  const [src, setSrc] = useState<"all" | "mt5" | "manual">("all");
  const [range, setRange] = useState<TradeRange>("all");

  const symbols = useMemo(() => ["All", ...new Set(trades.map((t) => t.symbol))], [trades]);
  const list = useMemo(
    () =>
      tradesInRange(trades, range)
        .filter(
          (t) =>
            (sym === "All" || t.symbol === sym) &&
            (side === "all" || t.side === side) &&
            (res === "all" || (res === "win" ? netPnl(t) > 0 : netPnl(t) < 0)) &&
            (src === "all" || (t.source ?? "manual") === src),
        )
        .sort((a, b) => b.closeTime.localeCompare(a.closeTime)),
    [trades, sym, side, res, src, range],
  );
  const total = list.reduce((a, t) => a + netPnl(t), 0);

  if (loading && !trades.length) {
    return (
      <AppShell title="Trades">
        <div className="panel p-6 text-center text-sm text-muted-foreground">Loading your journal…</div>
      </AppShell>
    );
  }
  if (!trades.length) return <AppShell title="Trades"><EmptyState /></AppShell>;

  return (
    <AppShell title="Trades">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Period</span>
        {tradeRanges.map(({ value, label }) => (
          <button key={value} className={chip(range === value)} onClick={() => setRange(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Source</span>
        {(["all", "mt5", "manual"] as const).map((value) => (
          <button key={value} className={chip(src === value)} onClick={() => setSrc(value)}>
            {value === "all" ? "All" : value === "mt5" ? "MT5" : "Manual"}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {symbols.map((s) => (
          <button key={s} className={chip(sym === s)} onClick={() => setSym(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {(["all", "buy", "sell"] as const).map((s) => (
          <button key={s} className={chip(side === s)} onClick={() => setSide(s)}>
            {s}
          </button>
        ))}
        <span className="w-px bg-border" />
        {(["all", "win", "loss"] as const).map((s) => (
          <button key={s} className={chip(res === s)} onClick={() => setRes(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{list.length} trades</span>
        <Pnl v={total} fmt={(v) => money(v, true)} className="font-bold" />
      </div>
      {!list.length && (
        <div className="panel p-6 text-center text-sm text-muted-foreground">No trades match these filters.</div>
      )}
      <div className="panel overflow-hidden">
        {list.map((t) => {
          const r = rMultiple(t);
          return (
            <Link
              key={`${t.source ?? "manual"}_${t.id}`}
              to="/trades/$id"
              params={{ id: t.id }}
              className="flex items-center justify-between border-t px-4 py-3 first:border-t-0"
            >
              <div>
                <div className="flex items-center gap-2 font-bold">
                  <span>{t.symbol}</span>
                  <span className={cn("text-xs", t.side === "buy" ? "text-profit" : "text-loss")}>
                    {t.side.toUpperCase()}
                  </span>
                  <SourceBadge source={t.source} />
                </div>
                <div className="num text-xs text-muted-foreground">
                  {t.closeTime.slice(0, 16).replace("T", " ")} · {t.volume} lot
                </div>
              </div>
              <div className="text-right">
                <Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="font-bold" />
                {r != null && (
                  <div className="num text-xs text-muted-foreground">
                    {r >= 0 ? "+" : ""}
                    {r.toFixed(2)}R
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
