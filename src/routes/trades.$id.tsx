import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Clock3, Crosshair, Gauge, Ticket } from "lucide-react";
import { AppShell, Pnl, SourceBadge } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import { durationLabel, money, netPnl, rMultiple, session } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trades/$id")({
  head: () => ({
    meta: [
      { title: "Trade Details — MT5 Trading Journal" },
      { name: "description", content: "Entry, exit, risk, R-multiple and costs for a single MT5 trade." },
      { property: "og:title", content: "Trade Details — MT5 Trading Journal" },
      { property: "og:description", content: "Entry, exit, risk, R-multiple and costs for a single MT5 trade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradeDetail,
});

function DetailCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <dl className="divide-y divide-border/60">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num max-w-[60%] break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TradeDetail() {
  const { id } = Route.useParams();
  const { trades, accountLabels } = useTrades();
  const t = trades.find((x) => x.id === id);

  if (!t) {
    return (
      <AppShell title="Trade not found" description="This trade may have been deleted or belongs to another account.">
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Ticket className="h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Trade not found</p>
          <Link
            to="/trades"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to trades
          </Link>
        </div>
      </AppShell>
    );
  }

  const r = rMultiple(t);
  const source = t.source ?? "manual";

  const execution: [string, string][] = [
    ["Lot size", String(t.volume)],
    ["Entry price", String(t.openPrice)],
    ["Exit price", String(t.closePrice)],
    ["Stop loss", t.sl ? String(t.sl) : "—"],
    ["Take profit", t.tp ? String(t.tp) : "—"],
  ];

  const costs: [string, string][] = [
    ["Gross profit", money(t.profit, true)],
    ["Commission", money(t.commission, true)],
    ["Swap", money(t.swap, true)],
    ["Net result", money(netPnl(t), true)],
  ];

  const timing: [string, string][] = [
    ["Opened", t.openTime.slice(0, 19).replace("T", " ")],
    ["Closed", t.closeTime.slice(0, 19).replace("T", " ")],
    ["Duration", durationLabel(t)],
    ["Session", session(t.openTime)],
  ];

  const metadata: [string, string][] = [
    ["Ticket", t.id],
    ["Source", source === "mt5" ? "MT5 sync" : "Manual import"],
  ];
  if (t.accountId) metadata.push(["MT5 account", accountLabels[t.accountId] ?? t.accountId]);
  if (t.positionId) metadata.push(["Position", t.positionId]);
  if (t.dealId) metadata.push(["Deal", t.dealId]);
  if (t.closeReason) metadata.push(["Close reason", t.closeReason]);
  if (t.comment) metadata.push(["Comment", t.comment]);
  if (t.magic != null) metadata.push(["Magic", String(t.magic)]);

  return (
    <AppShell
      title={`${t.symbol} trade`}
      description={`${t.side === "buy" ? "Long" : "Short"} ${t.volume} lot · closed ${t.closeTime.slice(0, 16).replace("T", " ")} UTC`}
      actions={
        <Link
          to="/trades"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold transition-colors hover:bg-accent sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> All trades
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="hero-panel overflow-hidden p-5 lg:col-span-2 lg:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{t.symbol}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                t.side === "buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
              )}
            >
              {t.side}
            </span>
            <SourceBadge source={t.source} />
            <span className="num text-[11px] text-muted-foreground">{t.volume} lot</span>
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Net result after costs
            </div>
            <Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="mt-1 block text-4xl font-bold tracking-tight" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border/70 pt-4 sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Entry</div>
              <div className="num mt-1 text-sm font-semibold">{t.openPrice}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Exit</div>
              <div className="num mt-1 text-sm font-semibold">{t.closePrice}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Stop loss</div>
              <div className="num mt-1 text-sm font-semibold">{t.sl ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Take profit</div>
              <div className="num mt-1 text-sm font-semibold">{t.tp ?? "—"}</div>
            </div>
          </div>
        </section>

        <section className="panel grid grid-cols-2 gap-3 p-4">
          {[
            { label: "R-multiple", value: r != null ? `${r.toFixed(2)}R` : "—", icon: Crosshair },
            { label: "Duration", value: durationLabel(t), icon: Clock3 },
            { label: "Session", value: session(t.openTime), icon: Gauge },
            { label: "Ticket", value: t.id, icon: Ticket },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-background/30 p-3">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
              <div className="num mt-0.5 break-all text-xs font-semibold">{value}</div>
            </div>
          ))}
          <Link
            to="/analytics"
            className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border text-[11px] font-semibold transition-colors hover:bg-accent"
          >
            Compare in analytics <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Execution" rows={execution} />
        <DetailCard title="Costs & result" rows={costs} />
        <DetailCard title="Timing (UTC)" rows={timing} />
        <DetailCard title={source === "mt5" ? "Synced from MT5" : "Import details"} rows={metadata} />
      </div>
    </AppShell>
  );
}
