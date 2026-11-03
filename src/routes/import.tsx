import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  FileSpreadsheet,
  FileUp,
  History,
  Info,
  Loader2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/firebase/auth";
import { tradeStore, useTrades } from "@/lib/store";
import { readReportFile } from "@/lib/readFile";
import { effectiveStartBalance, money } from "@/lib/trades";
import { cn } from "@/lib/utils";

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

type Phase = "idle" | "reading" | "saving";
type ImportRecord = {
  id: number;
  name: string;
  added: number;
  duplicates: number;
  ok: boolean;
  at: string;
};

function ImportPage() {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { trades, startBalance, startBalanceManual, localCount, mt5Balance } = useTrades();
  const shownStartBalance =
    startBalanceManual || mt5Balance == null
      ? startBalance
      : Math.round(effectiveStartBalance(trades, startBalance, mt5Balance, startBalanceManual) * 100) / 100;

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const busy = phase !== "idle";

  function addHistory(record: Omit<ImportRecord, "id" | "at">) {
    setHistory((current) => [
      { ...record, id: Date.now() + Math.random(), at: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) },
      ...current,
    ].slice(0, 6));
  }

  function reportError(caught: unknown) {
    console.error(caught);
    const text = caught instanceof Error ? caught.message : "Something went wrong. Please try again.";
    setMsg({ ok: false, text });
    toast.error(text);
  }

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setMsg(null);
    setPhase("reading");
    try {
      const found = await readReportFile(file);
      if (!found.length) {
        const text = `No closed trades found in “${file.name}”. In MT5, make sure the History tab is set to “Positions” before saving the report.`;
        setMsg({ ok: false, text });
        addHistory({ name: file.name, added: 0, duplicates: 0, ok: false });
        toast.error("No closed trades found in that report.");
        return;
      }
      setPhase("saving");
      const added = await tradeStore.importTrades(found);
      const duplicates = found.length - added;
      const text = `Imported ${added} new ${added === 1 ? "trade" : "trades"} from “${file.name}”${duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""}.`;
      setMsg({ ok: true, text });
      addHistory({ name: file.name, added, duplicates, ok: true });
      if (added > 0) toast.success(text);
      else toast.info("All trades in that report are already in your journal.");
    } catch (caught) {
      reportError(caught);
      addHistory({ name: file.name, added: 0, duplicates: 0, ok: false });
    } finally {
      setPhase("idle");
      if (input.current) input.current.value = "";
    }
  }

  async function migrateLocal() {
    setMigrating(true);
    setMsg(null);
    try {
      const moved = await tradeStore.migrateLocalTrades();
      const text = `Moved ${moved} trades from this device to your account.`;
      setMsg({ ok: true, text });
      toast.success(text);
    } catch (caught) {
      reportError(caught);
    } finally {
      setMigrating(false);
    }
  }

  async function clearAll() {
    setMsg(null);
    try {
      await tradeStore.clear();
      setMsg({ ok: true, text: "All trades deleted." });
      toast.success("All trades deleted from your journal.");
    } catch (caught) {
      reportError(caught);
    } finally {
      setClearOpen(false);
    }
  }

  function updateStartBalance(value: number) {
    void tradeStore.setStartBalance(value).catch(reportError);
  }

  return (
    <AppShell
      title="Import Trades"
      description="Load an MT5 history report, or let the Expert Advisor keep your journal in sync automatically."
      actions={
        <Link
          to="/mt5"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold transition-colors hover:bg-accent sm:text-sm"
        >
          <Cloud className="h-4 w-4 text-primary" /> MT5 Connections
        </Link>
      }
    >
      {/* Source cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-4 lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Cloud className="h-4 w-4 text-primary" /> Automatic MT5 sync
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Connect MetaTrader 5 once. The EA sends balance, equity, open positions and closed trades with no manual
                uploads.
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
              Recommended
            </span>
          </div>
          <Link
            to="/mt5"
            className="mt-auto inline-flex h-9 w-fit items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open MT5 Sync
          </Link>
        </section>

        <section className="panel flex flex-col gap-3 p-4 lg:p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-info" /> Manual report import
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Upload an MT5 history report as HTML, CSV or Excel. Duplicate tickets are detected and skipped
              automatically.
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {["HTML", "CSV", "XLSX"].map((format) => (
              <span key={format} className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {format}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload MT5 history report"
        aria-busy={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !busy) {
            event.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void onFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "panel flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-accent/20",
        )}
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
        </span>
        <div>
          <p className="text-sm font-semibold">
            {phase === "reading" ? "Reading report…" : phase === "saving" ? "Saving trades…" : "Drop your MT5 report here"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            or <span className="font-semibold text-primary">browse files</span> · HTML, CSV or XLSX · duplicates skipped
          </p>
        </div>
        {busy && (
          <div className="h-1 w-40 overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full bg-primary transition-all", phase === "reading" ? "w-1/2" : "w-full")} />
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept=".html,.htm,.csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </div>

      {msg && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-xs",
            msg.ok ? "border-primary/30 bg-primary/10 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{msg.text}</span>
          {msg.ok && (
            <button type="button" onClick={() => nav({ to: "/" })} className="font-semibold text-primary hover:underline">
              View dashboard →
            </button>
          )}
        </div>
      )}

      {user && localCount > 0 && (
        <section className="panel space-y-2 border-primary/40 p-4">
          <h2 className="text-sm font-semibold">Move {localCount} local trades to your account</h2>
          <p className="text-xs text-muted-foreground">
            These trades were saved on this device before you signed in. Move them so they appear on every device.
          </p>
          <button
            type="button"
            disabled={migrating}
            onClick={() => void migrateLocal()}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {migrating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Move to my account
          </button>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Instructions */}
        <section className="panel p-4 lg:p-5">
          <h2 className="text-sm font-semibold">How to export from MT5</h2>
          <ol className="mt-4 space-y-3">
            {[
              "On MT5 desktop, open Toolbox → History.",
              "Right-click → Positions, then right-click → Period → All History.",
              "Right-click → Report → HTML or Open XML (Excel) and save the file.",
              "Upload the saved report here. Phone exports are not supported by the MT5 app.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3 text-xs text-muted-foreground">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
            Use MT5 on a computer or your broker&apos;s client area if you only trade on mobile.
          </p>
        </section>

        {/* Starting balance */}
        <section className="panel space-y-3 p-4 lg:p-5">
          <h2 className="text-sm font-semibold">Starting balance</h2>
          <label className="block text-xs font-medium text-muted-foreground">
            Deposit amount
            <input
              type="number"
              value={shownStartBalance}
              onChange={(event) => updateStartBalance(Number(event.target.value) || 0)}
              className="num field mt-1"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {mt5Balance != null && !startBalanceManual
              ? `Using the synced MT5 balance (${money(mt5Balance)}) automatically for the equity curve and analytics.`
              : "Used for analytics and the equity curve when no MT5 balance is synced."}
          </p>
          {mt5Balance != null && startBalanceManual && (
            <button
              type="button"
              onClick={() => void tradeStore.resetStartBalance().catch(reportError)}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Use synced MT5 balance instead
            </button>
          )}
        </section>
      </div>

      {/* Import history + data management */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-muted-foreground" /> Import history
            </h2>
            <span className="text-[10px] text-muted-foreground">This session</span>
          </div>
          {history.length ? (
            <ul className="mt-3 divide-y divide-border">
              {history.map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      {record.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-loss" />
                      )}
                      <span className="truncate">{record.name}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {record.ok
                        ? `${record.added} added${record.duplicates ? ` · ${record.duplicates} duplicates skipped` : ""}`
                        : "No closed trades found"}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[10px] text-muted-foreground">{record.at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Imports you run in this session will be listed here.
            </p>
          )}
        </section>

        <section className="panel p-4 lg:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" /> Journal data
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {trades.length} trades in your journal
            {localCount ? ` · ${localCount} saved on this device` : ""}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/trades"
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-accent"
            >
              View trades
            </Link>
            <button
              type="button"
              disabled={!trades.length || busy}
              onClick={() => setClearOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete all trades
            </button>
          </div>
          <p className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
            <FileUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Automatic MT5 trades are restored on the next sync if you delete them while still connected.
          </p>
        </section>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all trades?</AlertDialogTitle>
            <AlertDialogDescription>
              {user
                ? "This removes every trade from your journal. MT5-synced trades will be restored on the next sync while the account stays connected."
                : "This removes all imported trades from this device. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void clearAll()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete all trades
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
