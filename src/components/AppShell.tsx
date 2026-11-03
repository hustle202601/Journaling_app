import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Cable,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Upload,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AuthMenu } from "@/components/AuthMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/firebase/auth";
import { useTrades } from "@/lib/store";
import { money } from "@/lib/trades";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trades", label: "Trades", icon: List },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/import", label: "Import Trades", icon: Upload },
  { to: "/mt5", label: "MT5 Connections", icon: Cable },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV = NAV.slice(0, 4);
const SIDEBAR_KEY = "tj.sidebar.collapsed.v1";

function ago(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className={cn("flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")} aria-label="Main navigation">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = isActivePath(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();
  const { mt5AccountLabel, mt5Balance } = useTrades();

  return (
    <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
      <Link
        to="/settings"
        title={collapsed ? "Settings" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-sidebar-accent",
          collapsed && "justify-center",
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {(user?.email?.[0] ?? "G").toUpperCase()}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-sidebar-foreground">
              {user?.email ?? "Guest session"}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {mt5AccountLabel ?? "No MT5 account"}
              {mt5Balance != null ? ` · ${money(mt5Balance)}` : ""}
            </span>
          </span>
        )}
        {!collapsed && <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </Link>
      {!collapsed && (
        <div className="mt-1">
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          ) : (
            <Link
              to="/signin"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <UserRound className="h-3.5 w-3.5" /> Sign in to sync
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link to="/" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="h-5 w-5" />
        </Link>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">TradeJournal</div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              MT5 Performance
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        <NavList collapsed={collapsed} />
        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="mx-auto mt-2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SyncStatus() {
  const { mt5AccountLabel, mt5LastSyncAt } = useTrades();

  if (!mt5AccountLabel) {
    return (
      <Link
        to="/mt5"
        className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
        title="Connect MetaTrader 5"
      >
        <Cable className="h-3.5 w-3.5" />
        Connect MT5
      </Link>
    );
  }

  const age = mt5LastSyncAt ? Date.now() - mt5LastSyncAt : null;
  const tone =
    age == null ? "bg-warning" : age < 5 * 60_000 ? "bg-profit" : age < 60 * 60_000 ? "bg-warning" : "bg-loss";
  const label = mt5LastSyncAt ? `Synced ${ago(mt5LastSyncAt)}` : "Awaiting sync";

  return (
    <Link
      to="/mt5"
      className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
      title={`${mt5AccountLabel} — ${label}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} />
      <span className="max-w-[120px] truncate">{label}</span>
    </Link>
  );
}

function AccountChip() {
  const { mt5AccountLabel, mt5Balance } = useTrades();
  if (!mt5AccountLabel) return null;

  return (
    <Link
      to="/mt5"
      className="hidden items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 transition-colors hover:border-primary/40 md:flex"
      title="MT5 account"
    >
      <Wallet className="h-3.5 w-3.5 text-primary" />
      <span className="max-w-[130px] truncate text-[11px] font-medium">{mt5AccountLabel}</span>
      {mt5Balance != null && (
        <span className="num border-l border-border pl-2 text-[11px] font-semibold text-muted-foreground">
          {money(mt5Balance)}
        </span>
      )}
    </Link>
  );
}

function Topbar({ title, onOpenNav }: { title: string; onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <span className="text-muted-foreground">Journal</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="truncate font-semibold">{title}</span>
      </div>
      <span className="min-w-0 truncate text-sm font-semibold sm:hidden">{title}</span>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <SyncStatus />
        <AccountChip />
        <ThemeToggle />
        <AuthMenu />
      </div>
    </header>
  );
}

function MobileNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
          const active = isActivePath(pathname, to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Kept for backwards compatibility with existing routes. */
  wide?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // Storage may be unavailable; keep the expanded sidebar.
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        <Topbar title={title} onOpenNav={() => setNavOpen(true)} />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {(description || actions) && (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight lg:text-[28px]">{title}</h1>
                {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          )}
          <div className="space-y-4 lg:space-y-6">{children}</div>
        </main>
      </div>

      <MobileNav onOpenMore={() => setNavOpen(true)} />

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="flex h-16 flex-row items-center gap-2.5 space-y-0 border-b border-sidebar-border px-4 py-0 pr-12 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-bold tracking-tight">TradeJournal</SheetTitle>
              <SheetDescription className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]">
                MT5 Performance
              </SheetDescription>
            </div>
          </SheetHeader>
          <div className="flex h-[calc(100%-4rem)] flex-col">
            <div className="flex-1 overflow-y-auto py-3">
              <NavList onNavigate={() => setNavOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function Pnl({ v, className, fmt }: { v: number; className?: string; fmt: (v: number) => string }) {
  return (
    <span className={cn("num", v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted-foreground", className)}>
      {fmt(v)}
    </span>
  );
}

export function SourceBadge({ source }: { source?: "mt5" | "manual" | undefined }) {
  const mt5 = source === "mt5";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        mt5 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
      )}
    >
      {mt5 ? "MT5" : "Manual"}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  tone?: "default" | "profit" | "loss" | "warning";
}) {
  return (
    <div className="panel flex flex-col justify-between gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div>
        <div
          className={cn(
            "num text-[22px] font-bold leading-none tracking-tight",
            tone === "profit" && "text-profit",
            tone === "loss" && "text-loss",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

/** Legacy stat tile used by a few existing sections. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="num mt-2 text-lg font-bold">{children}</div>
    </div>
  );
}

export function EmptyState({
  title = "No trades yet",
  description = "Import your MT5 trading history to start analysing performance.",
  icon: Icon = List,
  action,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {action ?? (
          <Link
            to="/import"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Import trades
          </Link>
        )}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="panel h-36 animate-pulse" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="panel h-28 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel h-80 animate-pulse lg:col-span-2" />
        <div className="panel h-80 animate-pulse" />
      </div>
    </div>
  );
}
