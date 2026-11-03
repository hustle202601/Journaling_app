import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Upload } from "lucide-react";
import { AppShell, EmptyState, PageSkeleton, Pnl, SourceBadge } from "@/components/AppShell";
import { FilterPane, FilterSelect, type FilterOption } from "@/components/FilterPane";
import { TradeDetailSheet } from "@/components/TradeDetailSheet";
import { useTrades } from "@/lib/store";
import {
  durationLabel,
  money,
  netPnl,
  rMultiple,
  session,
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

type SortKey = "newest" | "oldest" | "pnl-desc" | "pnl-asc" | "symbol";
const PAGE_SIZE = 25;

const sourceOptions: FilterOption[] = [
  { value: "all", label: "All sources" },
  { value: "mt5", label: "MT5 sync" },
  { value: "manual", label: "Manual import" },
];

const sideOptions: FilterOption[] = [
  { value: "all", label: "All sides" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
];

const resultOptions: FilterOption[] = [
  { value: "all", label: "All results" },
  { value: "win", label: "Winning" },
  { value: "loss", label: "Losing" },
];

const sortOptions: FilterOption[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "pnl-desc", label: "Highest P&L" },
  { value: "pnl-asc", label: "Lowest P&L" },
  { value: "symbol", label: "Symbol A–Z" },
];

const periodOptions: FilterOption[] = tradeRanges.map(({ value, label }) => ({ value, label }));

function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <span className={cn("text-[9px]", active ? "text-primary" : "opacity-40")}>{active && direction === "asc" ? "▲" : "▼"}</span>
    </button>
  );
}

function Trades() {
  const { trades, loading } = useTrades();
  const [sym, setSym] = useState("All");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [res, setRes] = useState<"all" | "win" | "loss">("all");
  const [src, setSrc] = useState<"all" | "mt5" | "manual">("all");
  const [range, setRange] = useState<TradeRange>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Trade | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const symbols = useMemo(() => ["All", ...new Set(trades.map((trade) => trade.symbol))].sort((a, b) => a.localeCompare(b)), [trades]);
  const symbolOptions = useMemo<FilterOption[]>(
    () => symbols.map((symbol) => ({ value: symbol, label: symbol === "All" ? "All symbols" : symbol })),
    [symbols],
  );

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = tradesInRange(trades, range).filter((trade) => {
      if (sym !== "All" && trade.symbol !== sym) return false;
      if (side !== "all" && trade.side !== side) return false;
      if (res !== "all" && (res === "win" ? netPnl(trade) <= 0 : netPnl(trade) >= 0)) return false;
      if (src !== "all" && (trade.source ?? "manual") !== src) return false;
      if (term) {
        const haystack = `${trade.symbol} ${trade.id} ${trade.comment ?? ""} ${trade.positionId ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.closeTime.localeCompare(b.closeTime);
        case "pnl-desc":
          return netPnl(b) - netPnl(a);
        case "pnl-asc":
          return netPnl(a) - netPnl(b);
        case "symbol":
          return a.symbol.localeCompare(b.symbol) || b.closeTime.localeCompare(a.closeTime);
        default:
          return b.closeTime.localeCompare(a.closeTime);
      }
    });
  }, [trades, sym, side, res, src, range, search, sort]);

  const total = list.reduce((sum, trade) => sum + netPnl(trade), 0);
  const activeCount = [
    range !== "all",
    src !== "all",
    sym !== "All",
    side !== "all",
    res !== "all",
    search.trim().length > 0,
  ].filter(Boolean).length;

  const filterSignature = [search, range, src, sym, side, res, sort].join("|");
  const [pageState, setPageState] = useState<{ signature: string; page: number }>({
    signature: filterSignature,
    page: 1,
  });
  const page = pageState.signature === filterSignature ? pageState.page : 1;
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const setPage = (next: number) => setPageState({ signature: filterSignature, page: next });

  function resetFilters() {
    setRange("all");
    setSrc("all");
    setSym("All");
    setSide("all");
    setRes("all");
    setSearch("");
    setSort("newest");
  }

  function openTrade(trade: Trade) {
    setSelected(trade);
    setSheetOpen(true);
  }

  function toggleDateSort() {
    setSort((current) => (current === "newest" ? "oldest" : "newest"));
  }

  function togglePnlSort() {
    setSort((current) => (current === "pnl-desc" ? "pnl-asc" : "pnl-desc"));
  }

  if (loading && !trades.length) {
    return (
      <AppShell title="Trades" description="Every closed position in your journal.">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!trades.length) {
    return (
      <AppShell title="Trades" description="Every closed position in your journal.">
        <EmptyState
          icon={Upload}
          title="No trades in your journal"
          description="Import an MT5 history report or connect MetaTrader 5 to start building your trade history."
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

  return (
    <AppShell
      title="Trades"
      description="Search, filter and inspect every closed position in your journal."
      actions={
        <Link
          to="/import"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:text-sm"
        >
          <Upload className="h-4 w-4" /> Import
        </Link>
      }
    >
      <FilterPane
        activeCount={activeCount}
        onReset={resetFilters}
        search={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol, ticket, position or comment…"
              className="field pl-9"
              aria-label="Search trades"
            />
          </div>
        }
        summary={
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {list.length.toLocaleString("en-US")} {list.length === 1 ? "trade" : "trades"} match
              {activeCount > 0 ? " your filters" : ""}
            </span>
            <span className="flex items-center gap-2">
              <span>Net P&L</span>
              <Pnl v={total} fmt={(v) => money(v, true)} className="text-sm font-bold" />
            </span>
          </div>
        }
      >
        <FilterSelect label="Period" value={range} options={periodOptions} onChange={(value) => setRange(value as TradeRange)} />
        <FilterSelect label="Source" value={src} options={sourceOptions} onChange={(value) => setSrc(value as typeof src)} />
        <FilterSelect label="Symbol" value={sym} options={symbolOptions} onChange={setSym} />
        <FilterSelect label="Side" value={side} options={sideOptions} onChange={(value) => setSide(value as typeof side)} />
        <FilterSelect label="Result" value={res} options={resultOptions} onChange={(value) => setRes(value as typeof res)} />
        <FilterSelect label="Sort" value={sort} options={sortOptions} onChange={(value) => setSort(value as SortKey)} />
      </FilterPane>

      {!list.length ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Search className="h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">No trades match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a wider period or clear the filters.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-accent"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="panel hidden overflow-hidden md:block">
            <div className="max-h-[calc(100vh-22rem)] overflow-auto scrollbar-thin">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <SortHeader
                        label="Date"
                        active={sort === "newest" || sort === "oldest"}
                        direction={sort === "oldest" ? "asc" : "desc"}
                        onClick={toggleDateSort}
                      />
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <SortHeader label="Symbol" active={sort === "symbol"} direction="asc" onClick={() => setSort("symbol")} />
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Side</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Volume</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Entry</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Exit</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">SL</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">TP</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Gross</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Comm.</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Swap</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">
                      <SortHeader
                        label="Net"
                        align="right"
                        active={sort === "pnl-desc" || sort === "pnl-asc"}
                        direction={sort === "pnl-asc" ? "asc" : "desc"}
                        onClick={togglePnlSort}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">R</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((trade) => {
                    const r = rMultiple(trade);
                    return (
                      <tr
                        key={`${trade.source ?? "manual"}_${trade.id}`}
                        tabIndex={0}
                        onClick={() => openTrade(trade)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openTrade(trade);
                          }
                        }}
                        className="cursor-pointer border-b border-border/60 text-xs transition-colors last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="num text-[11px]">{trade.closeTime.slice(0, 16).replace("T", " ")}</div>
                          <div className="text-[10px] text-muted-foreground">{session(trade.openTime)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {trade.symbol}
                            <SourceBadge source={trade.source} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              trade.side === "buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
                            )}
                          >
                            {trade.side}
                          </span>
                        </td>
                        <td className="num px-3 py-2.5 text-right">{trade.volume}</td>
                        <td className="num px-3 py-2.5 text-right">{trade.openPrice}</td>
                        <td className="num px-3 py-2.5 text-right">{trade.closePrice}</td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">{trade.sl ?? "—"}</td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">{trade.tp ?? "—"}</td>
                        <td className="num px-3 py-2.5 text-right">
                          <span className={trade.profit >= 0 ? "text-profit" : "text-loss"}>{money(trade.profit, true)}</span>
                        </td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">{money(trade.commission, true)}</td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">{money(trade.swap, true)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Pnl v={netPnl(trade)} fmt={(v) => money(v, true)} className="font-bold" />
                        </td>
                        <td className="num px-3 py-2.5 text-right">{r != null ? `${r.toFixed(2)}R` : "—"}</td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">{durationLabel(trade)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {pageRows.map((trade) => {
              const r = rMultiple(trade);
              return (
                <button
                  key={`${trade.source ?? "manual"}_${trade.id}`}
                  type="button"
                  onClick={() => openTrade(trade)}
                  className="panel panel-hover flex w-full flex-col gap-2 p-3.5 text-left hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
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
                    </div>
                    <Pnl v={netPnl(trade)} fmt={(v) => money(v, true)} className="text-sm font-bold" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="num">{trade.closeTime.slice(0, 16).replace("T", " ")}</span>
                    <span className="num">{trade.volume} lot</span>
                    <span className="num">{trade.openPrice} → {trade.closePrice}</span>
                    {r != null && <span className="num">{r.toFixed(2)}R</span>}
                    <span className="num">{durationLabel(trade)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="num font-medium text-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, list.length)}
              </span>{" "}
              of <span className="num font-medium text-foreground">{list.length}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-2 text-xs text-muted-foreground">
                Page <span className="num">{currentPage}</span> of <span className="num">{pageCount}</span>
              </span>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <TradeDetailSheet trade={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </AppShell>
  );
}
