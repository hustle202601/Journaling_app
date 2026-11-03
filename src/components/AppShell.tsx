import { Link } from "@tanstack/react-router";
import { LayoutDashboard, List, BarChart3, Upload, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { AuthMenu } from "@/components/AuthMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/trades", label: "Trades", icon: List },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/import", label: "Import", icon: Upload },
] as const;

export function AppShell({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto min-h-screen pb-24", wide ? "max-w-6xl" : "max-w-md")}>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background/85 px-5 pb-3 pt-5 backdrop-blur">
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        <div className="flex items-center gap-1">
          <span className="num rounded-full bg-secondary px-2.5 py-1 text-[10px] uppercase text-muted-foreground">MT5 Journal</span>
          <ThemeToggle />
          <AuthMenu />
        </div>
      </header>
      <main className="space-y-4 px-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
              className="flex flex-col items-center gap-1 py-3 text-[11px] font-semibold text-muted-foreground"
              activeProps={{ className: "text-primary" }}>
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Pnl({ v, className, fmt }: { v: number; className?: string; fmt: (v: number) => string }) {
  return <span className={cn("num", v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted-foreground", className)}>{fmt(v)}</span>;
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{children}</div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="panel p-6 text-center">
      <p className="font-semibold">No trades yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Import your MT5 history report to get started.</p>
      <Link to="/import" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Import trades</Link>
    </div>
  );
}
