import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cloud, Loader2, LogOut, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/firebase/auth";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Account — MT5 Trading Journal" },
      { name: "description", content: "Sign in to sync your MT5 account, trades and journal across devices." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { user, loading, configured, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      setPassword("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not sign in.";
      setError(message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Account" description="Cloud sync and MT5 connections.">
        <div className="panel flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (user) {
    return (
      <AppShell title="Account" description="Your cloud journal is active on every device.">
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="hero-panel p-5 lg:col-span-2 lg:p-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-profit">
              <ShieldCheck className="h-4 w-4" /> Signed in
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-base font-bold text-primary">
                {(user.email?.[0] ?? "U").toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="break-all text-lg font-bold">{user.email}</div>
                <div className="text-xs text-muted-foreground">Private cloud journal</div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Your trades are stored in your own Firestore documents. MT5 connections are tied to this account and can
              only write trades for you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Go to dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/mt5"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-accent"
              >
                <Cloud className="h-4 w-4" /> MT5 sync
              </Link>
            </div>
          </section>

          <aside className="panel divide-y divide-border">
            {[
              { to: "/import" as const, title: "Import a report", description: "HTML, CSV or Excel history file" },
              { to: "/settings" as const, title: "Preferences", description: "Theme, balance and data settings" },
              { to: "/trades" as const, title: "Trade history", description: "Search and inspect every position" },
            ].map((item) => (
              <Link key={item.to} to={item.to} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40">
                <span>
                  <span className="block text-xs font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.description}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <div className="p-4">
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Account" description="Sign in to keep your journal in the cloud and sync MetaTrader 5.">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="hero-panel flex flex-col justify-between p-5 lg:p-7">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-4 w-4" /> Cloud journal
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">One journal. Every device.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Sign in to sync trades through Firebase, connect MetaTrader 5, and keep your performance history private
              to your account.
            </p>
          </div>
          <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground">
            {[
              "Automatic MT5 synchronization via a revocable token",
              "Private Firestore storage scoped to your user",
              "No MT5 password is ever requested or stored",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-profit" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-5 lg:p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground">
              <UserRound className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{mode === "signin" ? "Sign in" : "Create an account"}</h2>
              <p className="text-[11px] text-muted-foreground">
                {mode === "signin" ? "Welcome back to your journal." : "Start syncing in under a minute."}
              </p>
            </div>
          </div>

          {!configured && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Firebase is not configured. Add the <code>VITE_FIREBASE_*</code> values to your environment.
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field mt-1"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Password
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field mt-1"
                placeholder="At least 6 characters"
              />
            </label>

            {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy || !configured}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="w-full text-center text-[11px] font-semibold text-primary hover:underline"
            >
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </form>

          <p className="mt-5 border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
            We never ask for or store your MT5 password. The EA uses a one-time connection token you can revoke at any
            time.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
