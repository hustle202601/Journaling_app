import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Cloud, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/firebase/auth";
import { tradeStore, useTrades } from "@/lib/store";
import { readReportFile } from "@/lib/readFile";
import { effectiveStartBalance, money } from "@/lib/trades";

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
  const { user } = useAuth();
  const { trades, startBalance, startBalanceManual, localCount, mt5Balance } = useTrades();
  const shownStartBalance = startBalanceManual || mt5Balance == null
    ? startBalance
    : Math.round(effectiveStartBalance(trades, startBalance, mt5Balance, startBalanceManual) * 100) / 100;
  const [busy, setBusy] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function reportError(caught: unknown) {
    console.error(caught);
    setMsg({ ok: false, text: caught instanceof Error ? caught.message : "Something went wrong. Please try again." });
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const found = await readReportFile(f);
      if (!found.length) {
        setMsg({ ok: false, text: `No closed trades found in “${f.name}”. In MT5, make sure the History tab is set to “Positions” before saving the report.` });
      } else {
        const added = await tradeStore.importTrades(found);
        setMsg({ ok: true, text: `Imported ${added} new trades from “${f.name}” (${found.length - added} already in your journal).` });
      }
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function migrateLocal() {
    setMigrating(true);
    setMsg(null);
    try {
      const moved = await tradeStore.migrateLocalTrades();
      setMsg({ ok: true, text: `Moved ${moved} trades from this device to your account.` });
    } catch (caught) {
      reportError(caught);
    } finally {
      setMigrating(false);
    }
  }

  async function clearAll() {
    const question = user
      ? "Delete all trades from your journal? MT5-synced trades will be restored on the next sync."
      : "Delete all imported trades from this device?";
    if (!confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      await tradeStore.clear();
      setMsg({ ok: true, text: "All trades deleted." });
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }

  function updateStartBalance(value: number) {
    void tradeStore.setStartBalance(value).catch(reportError);
  }

  return (
    <AppShell title="Import">
      <section className="panel space-y-2 p-4">
        <div className="flex items-center gap-2 font-bold">
          <Cloud className="h-4 w-4 text-primary" /> Automatic MT5 sync
        </div>
        <p className="text-sm text-muted-foreground">
          Connect MetaTrader 5 once and the EA keeps your balance, equity, open positions and closed trades up to date.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/mt5" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            Open MT5 Sync
          </Link>
          {!user && (
            <Link to="/signin" className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold">
              Sign in to sync across devices
            </Link>
          )}
        </div>
      </section>

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

      {user && localCount > 0 && (
        <section className="panel space-y-2 border-primary/50 p-4">
          <h2 className="font-bold">Move {localCount} local trades to your account</h2>
          <p className="text-sm text-muted-foreground">
            These trades were saved on this device before you signed in. Move them so they appear on every device.
          </p>
          <button
            type="button"
            disabled={migrating}
            onClick={() => void migrateLocal()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {migrating && <Loader2 className="h-4 w-4 animate-spin" />}
            Move to my account
          </button>
        </section>
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
          <input type="number" value={shownStartBalance} onChange={(e) => updateStartBalance(+e.target.value || 0)}
            className="num mt-1 w-full rounded-lg border bg-input/40 px-3 py-2" />
        </label>
        <p className="text-xs text-muted-foreground">
          {mt5Balance != null && !startBalanceManual
            ? `Using the synced MT5 balance (${money(mt5Balance)}) automatically.`
            : "Used for analytics and the equity curve when no MT5 balance is synced."}
        </p>
        {mt5Balance != null && startBalanceManual && (
          <button
            type="button"
            onClick={() => void tradeStore.resetStartBalance().catch(reportError)}
            className="flex items-center gap-1.5 text-xs font-bold text-primary"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Use synced MT5 balance instead
          </button>
        )}
        <button className="w-full rounded-lg border border-destructive/50 px-3 py-2 text-sm font-bold text-destructive disabled:opacity-40" disabled={!trades.length || busy}
          onClick={() => void clearAll()}>Delete all trades</button>
        <p className="text-xs text-muted-foreground">
          {trades.length} trades in your journal{localCount ? ` · ${localCount} saved on this device` : ""}.
        </p>
      </section>
    </AppShell>
  );
}
