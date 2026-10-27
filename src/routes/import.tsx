import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { tradeStore, useTrades } from "@/lib/store";
import { readReportFile } from "@/lib/readFile";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import MT5 Report — MT5 Trading Journal" },
      { name: "description", content: "Upload your MetaTrader 5 history report (HTML, Excel or CSV) to import trades." },
      { property: "og:title", content: "Import MT5 Report — MT5 Trading Journal" },
      { property: "og:description", content: "Upload your MetaTrader 5 history report (HTML, Excel or CSV) to import trades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { trades, startBalance } = useTrades();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const found = await readReportFile(f);
      if (!found.length) {
        setMsg({ ok: false, text: `No closed trades found in “${f.name}”. In MT5, make sure the History tab is set to “Positions” before saving the report.` });
      } else {
        const added = tradeStore.importTrades(found);
        setMsg({ ok: true, text: `Imported ${added} new trades from “${f.name}” (${found.length - added} already in your journal).` });
      }
    } catch (e) {
      console.error(e);
      setMsg({ ok: false, text: `Couldn't read “${f.name}”. Please upload the report saved from MT5 (HTML, Excel or CSV).` });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <AppShell title="Import">
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="hero-panel flex w-full flex-col items-center gap-2 p-8 text-center">
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
        <span className="font-bold">{busy ? "Reading report…" : "Upload MT5 history report"}</span>
        <span className="text-xs text-muted-foreground">HTML, Excel (.xlsx) or CSV · duplicates are skipped</span>
        <span className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Choose file</span>
      </button>
      <input ref={input} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {msg && (
        <div className={`panel p-3 text-sm ${msg.ok ? "" : "border-destructive/60"}`}>
          {msg.text}{" "}
          {msg.ok && <button className="font-bold text-primary" onClick={() => nav({ to: "/" })}>View dashboard →</button>}
        </div>
      )}

      <section className="panel space-y-2 p-4 text-sm">
        <h2 className="font-bold">How to export from MT5</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>On MT5 desktop, open <b>Toolbox → History</b>.</li>
          <li>Right-click → <b>Positions</b>, then right-click → <b>Period → All History</b>.</li>
          <li>Right-click → <b>Report → HTML</b> or <b>Open XML</b> (Excel) and save it.</li>
          <li>Send the file to your phone and upload it here.</li>
        </ol>
        <p className="text-xs text-muted-foreground">The MT5 phone app can't export reports — use MT5 on a computer or your broker's client area.</p>
      </section>

      <section className="panel space-y-3 p-4">
        <label className="block text-sm font-semibold">Starting balance (deposit)
          <input type="number" value={startBalance} onChange={(e) => tradeStore.setStartBalance(+e.target.value || 0)}
            className="num mt-1 w-full rounded-lg border bg-input/40 px-3 py-2" />
        </label>
        <button className="w-full rounded-lg border border-destructive/50 px-3 py-2 text-sm font-bold text-destructive disabled:opacity-40" disabled={!trades.length}
          onClick={() => confirm("Delete all imported trades from this device?") && tradeStore.clear()}>Clear all trades</button>
        <p className="text-xs text-muted-foreground">{trades.length} trades stored on this device.</p>
      </section>
    </AppShell>
  );
}
