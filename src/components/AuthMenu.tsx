import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth";
import { cn } from "@/lib/utils";

export function AuthMenu() {
  const { user, loading } = useAuth();

  if (loading) {
    return <span className="h-8 w-8 animate-pulse rounded-full bg-secondary" aria-hidden />;
  }

  return (
    <Link
      to="/signin"
      aria-label={user ? `Account: ${user.email ?? "signed in"}` : "Sign in"}
      title={user ? user.email ?? "Account" : "Sign in to sync"}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        user && "text-primary",
      )}
    >
      <UserRound className="h-4 w-4" />
      {user && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-profit ring-2 ring-background" />
      )}
    </Link>
  );
}
