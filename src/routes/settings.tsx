import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BellOff,
  Cable,
  Database,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Wallet,
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
import { useTheme, type Theme } from "@/lib/theme";
import { effectiveStartBalance, money } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MT5 Trading Journal" },
      { name: "description", content: "Manage your profile, appearance, trading preferences and journal data." },
    ],
  }),
  component: SettingsPage,
});

const themeOptions: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", description: "Optimized for trading sessions", icon: Moon },
  { value: "light", label: "Light", description: "Bright, high-contrast workspace", icon: Sun },
  { value: "system", label: "System", description: "Follow your device setting", icon: Monitor },
];

function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const { theme, resolved, setTheme } = useTheme();
  const { trades, startBalance, startBalanceManual, mt5Balance, mt5Equity, mt5AccountLabel } = useTrades();
  const [balanceDraft, setBalanceDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const displayStart = startBalanceManual || mt5Balance == null
    ? startBalance
    : Math.round(effectiveStartBalance(trades, startBalance, mt5Balance, startBalanceManual) * 100) / 100;

  useEffect(() => {
    setBalanceDraft(String(displayStart));
  }, [displayStart]);

  async function saveBalance() {
    setBusy(true);
    try {
      await tradeStore.setStartBalance(Number(balanceDraft) || 0);
      toast.success("Starting balance updated.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the starting balance.");
    } finally {
      setBusy(false);
    }
  }

  async function useSyncedBalance() {
    setBusy(true);
    try {
      await tradeStore.resetStartBalance();
      toast.success("Using the synced MT5 balance again.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not switch to the synced balance.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      await tradeStore.clear();
      toast.success("All trades deleted.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not delete trades.");
    } finally {
      setBusy(false);
      setClearOpen(false);
    }
  }

  return (
    <AppShell
      title="Settings"
      description="Account, appearance, trading preferences and journal data."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile */}
        <section className="panel p-4 lg:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound className="h-4 w-4 text-muted-foreground" /> Profile
          </h2>
          {loading ? (
            <div className="mt-4 h-16 animate-pulse rounded-lg bg-secondary" />
          ) : user ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {(user.email?.[0] ?? "U").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{user.email}</div>
                  <div className="text-[11px] text-muted-foreground">Cloud journal enabled</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                You are using a guest journal stored on this device. Sign in to sync across devices and connect MT5.
              </p>
              <Link
                to="/signin"
                className="mt-4 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                Sign in or create account
              </Link>
            </>
          )}
          <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-profit" />
            Your journal is private to your account. MT5 passwords are never requested or stored.
          </p>
        </section>

        {/* Appearance */}
        <section className="panel p-4 lg:col-span-2 lg:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-muted-foreground" /> Appearance
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Currently using the <span className="font-medium text-foreground">{resolved}</span> theme.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {themeOptions.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  theme === value
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border bg-background/30 hover:border-border/80 hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-md",
                    theme === value ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{label}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trading preferences */}
        <section className="panel space-y-3 p-4 lg:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" /> Trading preferences
          </h2>
          <div className="rounded-lg border border-border bg-background/30 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Starting balance mode</div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {startBalanceManual ? "Manual override" : mt5Balance != null ? "Synced MT5 balance" : "Manual (no MT5 sync)"}
              </span>
              {mt5Balance != null && (
                <span className="num text-xs text-muted-foreground">MT5 {money(mt5Balance)}</span>
              )}
            </div>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            Manual starting balance
            <input
              type="number"
              value={balanceDraft}
              onChange={(event) => setBalanceDraft(event.target.value)}
              className="num field mt-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveBalance()}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save balance
            </button>
            {mt5Balance != null && startBalanceManual && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void useSyncedBalance()}
                className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50"
              >
                Use synced MT5 balance
              </button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {mt5Balance != null && !startBalanceManual
              ? "The equity curve and analytics use your live MT5 balance automatically."
              : "Used for the equity curve and analytics when a synced MT5 balance is unavailable or overridden."}
          </p>
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Live equity</div>
              <div className="num mt-1 text-sm font-semibold">{mt5Equity != null ? money(mt5Equity) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">MT5 account</div>
              <div className="mt-1 truncate text-sm font-semibold">{mt5AccountLabel ?? "Not connected"}</div>
            </div>
          </div>
        </section>

        {/* Data & sync */}
        <section className="panel space-y-3 p-4 lg:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" /> Data & synchronization
          </h2>
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5 text-xs">
            <span className="text-muted-foreground">Trades in journal</span>
            <span className="num font-semibold">{trades.length.toLocaleString("en-US")}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5 text-xs">
            <span className="text-muted-foreground">Import history</span>
            <Link to="/import" className="font-semibold text-primary hover:underline">
              Open import
            </Link>
          </div>
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5 text-xs">
            <span className="text-muted-foreground">MT5 connections</span>
            <Link to="/mt5" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <Cable className="h-3.5 w-3.5" /> Manage
            </Link>
          </div>
          <button
            type="button"
            disabled={!trades.length || busy}
            onClick={() => setClearOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete all trades
          </button>
          <p className="text-[11px] text-muted-foreground">
            Deleting trades does not disconnect MT5. Synced trades return on the next EA sync while connected.
          </p>
        </section>
      </div>

      {/* Notifications */}
      <section className="panel flex items-start gap-3 p-4 lg:p-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
          <BellOff className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Notifications</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Email and push notification preferences are not available in this build. In-app confirmations are shown as
            toasts for imports, sync actions and data changes.
          </p>
        </div>
      </section>

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
