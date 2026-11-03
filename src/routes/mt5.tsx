import { createFileRoute, Link } from "@tanstack/react-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Cable,
  Check,
  Clipboard,
  Cloud,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Unplug,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageSkeleton } from "@/components/AppShell";
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
import { getFirebaseDb } from "@/lib/firebase/client";
import { money } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mt5")({
  head: () => ({
    meta: [
      { title: "MT5 Connections — MT5 Trading Journal" },
      {
        name: "description",
        content: "Connect MetaTrader 5 and sync balance, open positions and closed trades automatically.",
      },
    ],
  }),
  component: Mt5Page,
});

type AccountStatus = "pending" | "connected" | "error" | "disconnected";

interface Mt5Account {
  id: string;
  label: string;
  status: AccountStatus;
  tokenLast4?: string;
  login?: string;
  server?: string;
  broker?: string;
  accountName?: string;
  currency?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  lastSyncAt?: number;
  syncRequestedAt?: number;
  lastError?: string;
  createdAt?: number;
}

function text(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function accountFromDoc(id: string, data: Record<string, unknown>): Mt5Account {
  const status = text(data, "status");
  const parsedStatus: AccountStatus =
    status === "connected" || status === "error" || status === "disconnected" ? status : "pending";
  const account: Mt5Account = {
    id,
    label: text(data, "label") ?? "MetaTrader 5",
    status: parsedStatus,
  };
  const optionalText: [keyof Mt5Account, string][] = [
    ["tokenLast4", "tokenLast4"],
    ["login", "login"],
    ["server", "server"],
    ["broker", "broker"],
    ["accountName", "accountName"],
    ["currency", "currency"],
    ["lastError", "lastError"],
  ];
  for (const [field, key] of optionalText) {
    const value = text(data, key);
    if (value !== undefined) (account as unknown as Record<string, unknown>)[field] = value;
  }
  const optionalNumber: [keyof Mt5Account, string][] = [
    ["balance", "balance"],
    ["equity", "equity"],
    ["margin", "margin"],
    ["freeMargin", "freeMargin"],
    ["leverage", "leverage"],
    ["lastSyncAt", "lastSyncAt"],
    ["syncRequestedAt", "syncRequestedAt"],
    ["createdAt", "createdAt"],
  ];
  for (const [field, key] of optionalNumber) {
    const value = numberValue(data, key);
    if (value !== undefined) (account as unknown as Record<string, unknown>)[field] = value;
  }
  return account;
}

async function apiRequest(
  path: string,
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload["ok"] === false) {
    throw new Error(typeof payload["error"] === "string" ? payload["error"] : `Request failed (${response.status}).`);
  }
  return payload;
}

function ago(timestamp?: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const statusStyles: Record<AccountStatus, { badge: string; dot: string; label: string }> = {
  connected: { badge: "border-profit/30 bg-profit/10 text-profit", dot: "bg-profit", label: "Connected" },
  pending: { badge: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning", label: "Pending" },
  error: { badge: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-loss", label: "Error" },
  disconnected: { badge: "border-border bg-secondary text-muted-foreground", dot: "bg-muted-foreground", label: "Disconnected" },
};

const steps = [
  "Download the EA and place it in MQL5 → Experts.",
  "Allow the journal URL in MT5 under Tools → Options → Expert Advisors.",
  "Attach the EA to any chart and paste your connection token.",
  "Enable AutoTrading; balance, equity and closed trades sync automatically.",
];

function Mt5Page() {
  const { user, loading: authLoading, configured } = useAuth();
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<{ value: string; accountLabel: string } | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<Mt5Account | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!uid) {
      setAccounts([]);
      setAccountsLoading(false);
      return;
    }
    const db = getFirebaseDb();
    if (!db) {
      setAccountsLoading(false);
      setLoadError("Firestore is not available.");
      return;
    }
    setAccountsLoading(true);
    setLoadError(null);
    return onSnapshot(
      query(collection(db, "mt5Accounts"), where("userId", "==", uid)),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => accountFromDoc(item.id, item.data()))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setAccounts(next);
        setAccountsLoading(false);
      },
      (caught) => {
        console.error(caught);
        setLoadError("Could not load your MT5 connections. Make sure the Firestore rules have been deployed.");
        setAccountsLoading(false);
      },
    );
  }, [uid]);

  const latestAccount = useMemo(() => accounts[0], [accounts]);
  const connectedCount = useMemo(() => accounts.filter((account) => account.status === "connected").length, [accounts]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  async function createConnection() {
    if (!user) return;
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const payload = await apiRequest("/api/mt5/connections", user, { label: label.trim() || undefined });
      const account = payload["account"] as { label?: string } | undefined;
      const createdToken = payload["token"];
      if (typeof createdToken === "string") {
        setToken({ value: createdToken, accountLabel: account?.label ?? "MetaTrader 5" });
      }
      setLabel("");
      const message = "Connection created. Copy the token and paste it into the EA.";
      setNotice(message);
      toast.success(message);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create the connection.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function rotate(account: Mt5Account) {
    if (!user) return;
    setBusy(`rotate:${account.id}`);
    setError(null);
    setNotice(null);
    try {
      const payload = await apiRequest(`/api/mt5/connections/${account.id}/rotate`, user);
      const createdToken = payload["token"];
      if (typeof createdToken === "string") setToken({ value: createdToken, accountLabel: account.label });
      const message = "A new token was created. The previous token no longer works.";
      setNotice(message);
      toast.success(message);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not rotate the token.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(account: Mt5Account) {
    if (!user) return;
    setBusy(`disconnect:${account.id}`);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/mt5/connections/${account.id}/disconnect`, user);
      const message = "Connection disconnected. Existing synced trades were kept.";
      setNotice(message);
      toast.success(message);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not disconnect.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
      setDisconnectTarget(null);
    }
  }

  async function syncNow(account: Mt5Account) {
    if (!user) return;
    setBusy(`sync:${account.id}`);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/mt5/connections/${account.id}/sync-now`, user);
      const message = "Full sync requested. The EA will pick it up on its next check-in.";
      setNotice(message);
      toast.success(message);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not request a sync.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) {
    return (
      <AppShell title="MT5 Connections" description="Automatic MetaTrader 5 synchronization.">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="MT5 Connections" description="Automatic MetaTrader 5 synchronization.">
        <section className="hero-panel p-5 lg:p-7">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Cloud className="h-4 w-4 text-primary" /> Automatic sync
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Connect your MT5 account</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Sign in first. Your connection token is tied to your account, so only your Expert Advisor can write to your
            journal.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/signin"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in or create an account
            </Link>
            <Link
              to="/import"
              className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-accent"
            >
              Import a report instead
            </Link>
          </div>
          {!configured && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Firebase is not configured in this build. Add the <code>VITE_FIREBASE_*</code> environment values.
            </div>
          )}
        </section>

        <section className="panel p-4 lg:p-5">
          <h2 className="text-sm font-semibold">How automatic sync works</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-xs text-muted-foreground">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="MT5 Connections"
      description="Pair MetaTrader 5 with a revocable token. The EA never receives your MT5 password."
      actions={
        <Link
          to="/import"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold transition-colors hover:bg-accent sm:text-sm"
        >
          Import report instead
        </Link>
      }
    >
      <section className="hero-panel grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center lg:p-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Cloud className="h-4 w-4 text-primary" /> Automatic synchronization
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight">MetaTrader 5 connections</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The EA sends closed trades, open positions, balance and equity to this journal. Passwords are never stored.
          </p>
        </div>
        <div className="flex gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Connections</div>
            <div className="num mt-1 text-2xl font-bold">{accounts.length}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Connected</div>
            <div className="num mt-1 text-2xl font-bold text-profit">{connectedCount}</div>
          </div>
        </div>
      </section>

      {token && (
        <section className="panel space-y-3 border-primary/40 p-4 lg:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Token for {token.accountLabel}
          </div>
          <p className="text-xs text-muted-foreground">
            Copy this now — it is shown only once. Paste it into the <code>InpToken</code> input of the EA.
          </p>
          <code className="block max-h-32 overflow-auto break-all rounded-lg bg-secondary p-3 text-xs">{token.value}</code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy(token.value, "token")}
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
            >
              {copied === "token" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied === "token" ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              onClick={() => setToken(null)}
              className="h-9 rounded-lg border border-border px-3.5 text-xs font-semibold transition-colors hover:bg-accent"
            >
              Done
            </button>
          </div>
        </section>
      )}

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{error}</div>}
      {notice && <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs">{notice}</div>}
      {loadError && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{loadError}</div>}

      {/* Connections */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Your connections</h2>
            <p className="text-xs text-muted-foreground">Each connection has its own revocable token.</p>
          </div>
          {latestAccount?.status === "error" && (
            <span className="flex items-center gap-1.5 text-[11px] text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" /> Last sync failed
            </span>
          )}
        </div>

        {accountsLoading ? (
          <div className="panel flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : accounts.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {accounts.map((account) => {
              const connected = account.status === "connected";
              const status = statusStyles[account.status];
              return (
                <article key={account.id} className="panel flex flex-col gap-4 p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{account.label}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        {account.login ? (
                          <>
                            <span className="num">{account.login}</span>
                            {account.server && <span>· {account.server}</span>}
                          </>
                        ) : (
                          <span>Waiting for first sync</span>
                        )}
                        {account.broker && <span>· {account.broker}</span>}
                      </div>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide", status.badge)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  </div>

                  {account.balance !== undefined || connected ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Balance", account.balance],
                        ["Equity", account.equity],
                        ["Margin", account.margin],
                        ["Free margin", account.freeMargin],
                      ].map(([label, value]) => (
                        <div key={label as string} className="rounded-lg border border-border bg-background/30 p-2.5">
                          <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
                          <div className="num mt-0.5 text-xs font-semibold">
                            {typeof value === "number" ? money(value) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                      Open MT5, attach the EA with this connection&apos;s token, and account data will appear here automatically.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Last sync: {ago(account.lastSyncAt)}</span>
                    {account.tokenLast4 && <span>Token: •••• {account.tokenLast4}</span>}
                    {account.currency && <span>{account.currency}</span>}
                    {account.leverage && <span>1:{account.leverage}</span>}
                  </div>

                  {account.lastError && (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                      {account.lastError}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === `sync:${account.id}` || account.status === "disconnected"}
                      onClick={() => void syncNow(account)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold transition-colors hover:bg-accent disabled:opacity-40"
                    >
                      {busy === `sync:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync now
                    </button>
                    <button
                      type="button"
                      disabled={busy === `rotate:${account.id}`}
                      onClick={() => void rotate(account)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold transition-colors hover:bg-accent disabled:opacity-40"
                    >
                      {busy === `rotate:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      New token
                    </button>
                    <button
                      type="button"
                      disabled={busy === `disconnect:${account.id}` || account.status === "disconnected"}
                      onClick={() => setDisconnectTarget(account)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                    >
                      {busy === `disconnect:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                      Disconnect
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Cable className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-sm font-semibold">No connections yet</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Create a connection below, then attach the EA in MetaTrader 5 to enable automatic synchronization.
            </p>
          </div>
        )}
      </section>

      {/* Add connection + setup */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="panel space-y-3 p-4 lg:col-span-2 lg:p-5">
          <h2 className="text-sm font-semibold">Add a connection</h2>
          <p className="text-xs text-muted-foreground">Give this connection a name so you can tell accounts apart.</p>
          <label className="block text-xs font-medium text-muted-foreground">
            Label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
              placeholder="e.g. IC Markets live"
              className="field mt-1"
            />
          </label>
          <button
            type="button"
            disabled={busy === "create"}
            onClick={() => void createConnection()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Create connection token
          </button>
          <p className="flex items-start gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-profit" />
            Tokens are stored hashed and can be rotated or revoked at any time.
          </p>
        </section>

        <section className="panel space-y-4 p-4 lg:col-span-3 lg:p-5">
          <h2 className="text-sm font-semibold">Set up the Expert Advisor</h2>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-xs text-muted-foreground">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">
                  {index === 0 ? (
                    <>
                      Download{" "}
                      <a href="/TradingJournalSyncEA.mq5" download className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                        TradingJournalSyncEA.mq5 <Download className="h-3.5 w-3.5" />
                      </a>{" "}
                      and place it in <b>MQL5 → Experts</b>.
                    </>
                  ) : index === 2 ? (
                    <>
                      Attach the EA to any chart, paste the token into <code>InpToken</code> and set <code>InpServerUrl</code>{" "}
                      to the server URL below.
                    </>
                  ) : (
                    step
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              <Server className="h-3 w-3" /> Server URL
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs">{origin || "Your journal URL"}</code>
              {origin && (
                <button
                  type="button"
                  onClick={() => void copy(origin, "origin")}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold transition-colors hover:bg-accent"
                >
                  {copied === "origin" ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                  {copied === "origin" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
            The EA only needs a connection token. Never enter your MT5 password here.
          </p>
        </section>
      </div>

      {/* Troubleshooting */}
      <section className="panel p-4 lg:p-5">
        <h2 className="text-sm font-semibold">Troubleshooting</h2>
        <p className="text-xs text-muted-foreground">Common reasons data stops updating.</p>
        <div className="mt-3 divide-y divide-border">
          {[
            ["Last sync is stale", "Keep MetaTrader 5 open and AutoTrading enabled. The EA checks in about once a minute."],
            ["The EA reports 401 or invalid token", "Create a new token on the connection and paste it into InpToken, then restart the EA."],
            ["WebRequest is blocked", "Add the server URL under Tools → Options → Expert Advisors → Allow WebRequest for listed URL."],
            ["No trades appear", "In MT5 History, switch to Positions and confirm the trades are closed before the next sync."],
          ].map(([title, body]) => (
            <details key={title} className="group py-2.5">
              <summary className="cursor-pointer list-none text-xs font-semibold marker:hidden">
                <span className="flex items-center justify-between gap-2">
                  {title}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
            </details>
          ))}
        </div>
      </section>

      <AlertDialog open={Boolean(disconnectTarget)} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The EA will stop syncing immediately. Trades that were already synced stay in your journal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectTarget && void disconnect(disconnectTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
