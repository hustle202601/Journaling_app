import { Link } from "@tanstack/react-router";
import { Cable, LogOut, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AuthMenu() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <span className="h-8 w-8 animate-pulse rounded-full bg-secondary" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        to="/signin"
        aria-label="Sign in"
        title="Sign in to sync"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <UserRound className="h-4 w-4" />
      </Link>
    );
  }

  const initial = (user.email?.[0] ?? "U").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu: ${user.email ?? "signed in"}`}
          title={user.email ?? "Account"}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary transition-colors",
            "hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-xs font-semibold">{user.email}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Signed in</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 text-xs">
          <Link to="/settings">
            <Settings className="h-3.5 w-3.5 text-muted-foreground" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 text-xs">
          <Link to="/mt5">
            <Cable className="h-3.5 w-3.5 text-muted-foreground" /> MT5 connections
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 text-xs">
          <Link to="/signin">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()} className="gap-2 text-xs text-destructive focus:text-destructive">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
