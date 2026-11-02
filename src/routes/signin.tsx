import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
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
      <AppShell title="Account">
        <div className="panel flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (user) {
    return (
      <AppShell title="Account">
        <section className="hero-panel p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-profit" /> Signed in
          </div>
          <div className="mt-2 break-all text-lg font-bold">{user.email}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your journal is private to this account. MT5 connections can only write trades for you.
          </p>
        </section>

        <section className="panel space-y-2 p-4 text-sm">
          <Link to="/mt5" className="block rounded-lg border bg-background px-4 py-3 font-semibold">
            MT5 automatic sync
          </Link>
          <Link to="/import" className="block rounded-lg border bg-background px-4 py-3 font-semibold">
            Import an MT5 history report
          </Link>
          <Link to="/" className="block rounded-lg border bg-background px-4 py-3 font-semibold">
            Go to dashboard
          </Link>
        </section>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/50 px-3 py-2 text-sm font-bold text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell title="Account">
      <section className="hero-panel p-5">
        <h2 className="text-lg font-extrabold">{mode === "signin" ? "Sign in" : "Create an account"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to keep your journal in the cloud and connect MetaTrader 5 for automatic sync.
        </p>
      </section>

      {!configured && (
        <div className="panel border-destructive/60 p-3 text-sm">
          Firebase is not configured. Add the <code>VITE_FIREBASE_*</code> values to your environment.
        </div>
      )}

      <form onSubmit={onSubmit} className="panel space-y-3 p-4">
        <label className="block text-sm font-semibold">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-input/40 px-3 py-2"
            placeholder="you@example.com"
          />
        </label>
        <label className="block text-sm font-semibold">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-input/40 px-3 py-2"
            placeholder="At least 6 characters"
          />
        </label>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy || !configured}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
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
          className="w-full text-center text-xs font-semibold text-primary"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>

      <p className="px-1 text-xs text-muted-foreground">
        We never ask for or store your MT5 password. The EA uses a one-time connection token that you can revoke at any time.
      </p>
    </AppShell>
  );
}
