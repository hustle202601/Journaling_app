import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Pnl, SourceBadge } from "@/components/AppShell";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTrades } from "@/lib/store";
import { durationLabel, money, netPnl, rMultiple, session, type Trade } from "@/lib/trades";
import { cn } from "@/lib/utils";

export function TradeDetailSheet({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { accountLabels } = useTrades();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-card p-0 sm:max-w-md">
        {trade && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg font-bold">{trade.symbol}</SheetTitle>
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
              <SheetDescription className="num text-xs">
                {trade.closeTime.slice(0, 16).replace("T", " ")} UTC · {trade.volume} lot
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Net result after costs
                </div>
                <Pnl v={netPnl(trade)} fmt={(v) => money(v, true)} className="mt-1 block text-3xl font-bold" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Entry", String(trade.openPrice)],
                  ["Exit", String(trade.closePrice)],
                  ["Stop loss", trade.sl ? String(trade.sl) : "—"],
                  ["Take profit", trade.tp ? String(trade.tp) : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-background/30 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
                    <div className="num mt-1 text-sm font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              <dl className="space-y-2 text-xs">
                {[
                  ["Gross profit", money(trade.profit, true)],
                  ["Commission", money(trade.commission, true)],
                  ["Swap", money(trade.swap, true)],
                  ["R-multiple", rMultiple(trade) != null ? `${rMultiple(trade)!.toFixed(2)}R` : "—"],
                  ["Duration", durationLabel(trade)],
                  ["Session", session(trade.openTime)],
                  ["Opened", trade.openTime.slice(0, 16).replace("T", " ")],
                  ["Closed", trade.closeTime.slice(0, 16).replace("T", " ")],
                  ["Ticket", trade.id],
                  ["Source", (trade.source ?? "manual") === "mt5" ? "MT5 sync" : "Manual import"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="num text-right font-medium">{value}</dd>
                  </div>
                ))}
                {trade.accountId && (
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">MT5 account</dt>
                    <dd className="text-right font-medium">{accountLabels[trade.accountId] ?? trade.accountId}</dd>
                  </div>
                )}
                {trade.positionId && (
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">Position</dt>
                    <dd className="num text-right font-medium">{trade.positionId}</dd>
                  </div>
                )}
                {trade.dealId && (
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">Deal</dt>
                    <dd className="num text-right font-medium">{trade.dealId}</dd>
                  </div>
                )}
                {trade.closeReason && (
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">Close reason</dt>
                    <dd className="text-right font-medium">{trade.closeReason}</dd>
                  </div>
                )}
                {trade.comment && (
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">Comment</dt>
                    <dd className="max-w-[60%] text-right font-medium">{trade.comment}</dd>
                  </div>
                )}
              </dl>

              <Link
                to="/trades/$id"
                params={{ id: trade.id }}
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold transition-colors hover:bg-accent"
              >
                Open full trade page <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
