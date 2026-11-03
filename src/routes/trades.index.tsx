import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, EmptyState, Pnl } from "@/components/AppShell";
import { FilterPane, FilterSelect, type FilterOption } from "@/components/FilterPane";
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

const sourceOptions: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "mt5", label: "MT5" },
  { value: "manual", label: "Manual" },
];

const sideOptions: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
];

const resultOptions: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "win", label: "Win" },
  { value: "loss", label: "Loss" },
];

const periodOptions: FilterOption[] = tradeRanges.map(({ value, label }) => ({ value, label }));

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
  const symbolOptions = useMemo<FilterOption[]>(
    () => symbols.map((symbol) => ({ value: symbol, label: symbol })),
    [symbols],
  );
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
  const activeCount = [range !== "all", src !== "all", sym !== "All", side !== "all", res !== "all"].filter(
    Boolean,
  ).length;
  const resetFilters = () => {
    setRange("all");
    setSrc("all");
    setSym("All");
    setSide("all");
    setRes("all");
  };

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
      <FilterPane
        activeCount={activeCount}
        onReset={resetFilters}
        summary={
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{list.length} trades</span>
            <Pnl v={total} fmt={(v) => money(v, true)} className="text-sm font-bold" />
          </div>
        }
      >
        <FilterSelect
          label="Period"
          value={range}
          options={periodOptions}
          onChange={(value) => setRange(value as TradeRange)}
        />
        <FilterSelect
          label="Source"
          value={src}
          options={sourceOptions}
          onChange={(value) => setSrc(value as typeof src)}
        />
        <FilterSelect
          label="Symbol"
          value={sym}
          options={symbolOptions}
          onChange={setSym}
          className="col-span-2"
        />
        <FilterSelect
          label="Side"
          value={side}
          options={sideOptions}
          onChange={(value) => setSide(value as typeof side)}
        />
        <FilterSelect
          label="Result"
          value={res}
          options={resultOptions}
          onChange={(value) => setRes(value as typeof res)}
        />
      </FilterPane>
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
