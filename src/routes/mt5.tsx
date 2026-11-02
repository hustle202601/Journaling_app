import { createFileRoute, Link } from "@tanstack/react-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Check,
  Clipboard,
  Cloud,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/firebase/auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import { money } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mt5")({
  head: () => ({
    meta: [
      { title: "MT5 Sync — MT5 Trading Journal" },
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

const statusStyles: Record<AccountStatus, string> = {
  connected: "bg-profit/15 text-profit",
  pending: "bg-secondary text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
  disconnected: "bg-secondary text-muted-foreground",
};

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
      setNotice("Connection created. Copy the token and paste it into the EA.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the connection.");
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
      setNotice("A new token was created. The previous token no longer works.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rotate the token.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(account: Mt5Account) {
    if (!user) return;
    if (!confirm(`Disconnect ${account.label}? The EA will stop syncing immediately.`)) return;
    setBusy(`disconnect:${account.id}`);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/mt5/connections/${account.id}/disconnect`, user);
      setNotice("Connection disconnected. Existing synced trades were kept.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect.");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow(account: Mt5Account) {
    if (!user) return;
    setBusy(`sync:${account.id}`);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/mt5/connections/${account.id}/sync-now`, user);
      setNotice("Full sync requested. The EA will pick it up on its next check-in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request a sync.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) {
    return (
      <AppShell title="MT5 Sync">
        <div className="panel flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="MT5 Sync">
        <section className="hero-panel p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Cloud className="h-4 w-4 text-primary" /> Automatic sync
          </div>
          <h2 className="mt-2 text-2xl font-extrabold">Connect your MT5 account</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in first. Your MT5 connection token is tied to your account, so only your EA can write to your
            journal.
          </p>
          <Link
            to="/signin"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Sign in or create an account
          </Link>
        </section>
        {!configured && (
          <div className="panel border-destructive/60 p-3 text-sm">
            Firebase is not configured in this build. Add the <code>VITE_FIREBASE_*</code> environment values.
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title="MT5 Sync">
      <section className="hero-panel p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Cloud className="h-4 w-4 text-primary" /> Automatic sync
        </div>
        <h2 className="mt-2 text-2xl font-extrabold">MetaTrader 5 connections</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The EA sends closed trades, open positions, balance and equity to this journal. It never sends your MT5
          password.
        </p>
      </section>

      {token && (
        <section className="panel space-y-3 border-primary/50 p-4">
          <div className="flex items-center gap-2 font-bold">
            <KeyRound className="h-4 w-4 text-primary" /> Token for {token.accountLabel}
          </div>
          <p className="text-sm text-muted-foreground">
            Copy this now. It is shown only once. Paste it into the <code>InpToken</code> input of the EA.
          </p>
          <code className="block max-h-32 overflow-auto break-all rounded-lg bg-secondary p-3 text-xs">{token.value}</code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copy(token.value, "token")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
            >
              {copied === "token" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied === "token" ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              onClick={() => setToken(null)}
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </section>
      )}

      {error && <div className="panel border-destructive/60 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="panel p-3 text-sm">{notice}</div>}
      {loadError && <div className="panel border-destructive/60 p-3 text-sm text-destructive">{loadError}</div>}

      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">Add a connection</h2>
        <label className="block text-sm font-semibold">
          Label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            placeholder="e.g. IC Markets live"
            className="mt-1 w-full rounded-lg border bg-input/40 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy === "create"}
          onClick={() => void createConnection()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Create connection token
        </button>
      </section>

      {accountsLoading ? (
        <div className="panel flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : accounts.length ? (
        accounts.map((account) => {
          const connected = account.status === "connected";
          return (
            <section key={account.id} className="panel space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold">{account.label}</h2>
                  <div className="text-xs text-muted-foreground">
                    {account.login ? `${account.login}${account.server ? ` · ${account.server}` : ""}` : "Waiting for first sync"}
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", statusStyles[account.status])}>
                  {account.status}
                </span>
              </div>

              {connected || account.balance !== undefined ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</div>
                    <div className="num mt-0.5 font-bold">{account.balance !== undefined ? money(account.balance) : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Equity</div>
                    <div className="num mt-0.5 font-bold">{account.equity !== undefined ? money(account.equity) : "—"}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Open MT5, attach the EA with this connection's token, and it will appear here automatically.
                </p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Last sync: {ago(account.lastSyncAt)}</span>
                {account.tokenLast4 && <span>Token: •••• {account.tokenLast4}</span>}
                {account.broker && <span>{account.broker}</span>}
                {account.currency && <span>{account.currency}</span>}
              </div>

              {account.lastError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{account.lastError}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === `sync:${account.id}` || account.status === "disconnected"}
                  onClick={() => void syncNow(account)}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  {busy === `sync:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync now
                </button>
                <button
                  type="button"
                  disabled={busy === `rotate:${account.id}`}
                  onClick={() => void rotate(account)}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  {busy === `rotate:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  New token
                </button>
                <button
                  type="button"
                  disabled={busy === `disconnect:${account.id}` || account.status === "disconnected"}
                  onClick={() => void disconnect(account)}
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/50 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-40"
                >
                  {busy === `disconnect:${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  Disconnect
                </button>
              </div>
            </section>
          );
        })
      ) : (
        <div className="panel p-6 text-center text-sm text-muted-foreground">
          No connections yet. Create one above, then attach the EA in MetaTrader 5.
        </div>
      )}

      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">Set up the EA</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Download <a href="/TradingJournalSyncEA.mq5" download className="inline-flex items-center gap-1 font-bold text-primary">
              TradingJournalSyncEA.mq5 <Download className="h-3.5 w-3.5" />
            </a>
            .
          </li>
          <li>In MT5: <b>File → Open Data Folder → MQL5 → Experts</b>, then paste the file there.</li>
          <li>In MT5: <b>Tools → Options → Expert Advisors</b>, enable <b>Allow WebRequest for listed URL</b> and add the server URL below.</li>
          <li>Attach the EA to any chart, paste the token into <code>InpToken</code>, set <code>InpServerUrl</code> to the server URL, and enable AutoTrading.</li>
        </ol>
        <div className="rounded-lg bg-secondary p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Server URL</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{origin || "Your journal URL"}</code>
            {origin && (
              <button
                type="button"
                onClick={() => void copy(origin, "origin")}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
              >
                {copied === "origin" ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                {copied === "origin" ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
          The EA only needs a connection token. Never enter your MT5 password here. Revoke a token at any time with
          “New token” or “Disconnect”.
        </p>
      </section>

      {latestAccount?.status === "error" && (
        <div className="panel flex items-start gap-2 border-destructive/60 p-3 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          The last sync failed. Check the EA Experts log and the server URL.
        </div>
      )}
    </AppShell>
  );
}
