import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell, Pnl } from "@/components/AppShell";
import { useTrades } from "@/lib/store";
import { durationLabel, money, netPnl, rMultiple, session } from "@/lib/trades";

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

function TradeDetail() {
  const { id } = Route.useParams();
  const t = useTrades().trades.find((x) => x.id === id);
  if (!t) return <AppShell title="Trade"><p className="text-muted-foreground">Trade not found.</p></AppShell>;
  const r = rMultiple(t);
  const rows: [string, string][] = [
    ["Lot size", String(t.volume)], ["Entry", String(t.openPrice)], ["Exit", String(t.closePrice)],
    ["Stop loss", t.sl ? String(t.sl) : "—"], ["Take profit", t.tp ? String(t.tp) : "—"],
    ["Gross profit", money(t.profit, true)], ["Commission", money(t.commission)], ["Swap", money(t.swap)],
    ["R-multiple", r != null ? `${r.toFixed(2)}R` : "—"], ["Duration", durationLabel(t)], ["Session", session(t.openTime)],
    ["Opened", t.openTime.slice(0, 19).replace("T", " ")], ["Closed", t.closeTime.slice(0, 19).replace("T", " ")], ["Ticket", t.id],
  ];
  return (
    <AppShell title={t.symbol}>
      <Link to="/trades" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Trades</Link>
      <section className="hero-panel p-5">
        <div className="text-xs font-bold uppercase text-muted-foreground">{t.side} · {t.volume} lot</div>
        <Pnl v={netPnl(t)} fmt={(v) => money(v, true)} className="mt-1 block text-4xl font-bold" />
        <div className="mt-1 text-sm text-muted-foreground">Net result after costs</div>
      </section>
      <section className="panel">
        <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Imported from MT5</div>
        {rows.map(([k, v]) => <div key={k} className="flex justify-between border-t px-4 py-2.5 text-sm first-of-type:border-t-0"><span className="text-muted-foreground">{k}</span><span className="num">{v}</span></div>)}
      </section>
    </AppShell>
  );
}
