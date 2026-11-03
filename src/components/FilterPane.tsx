import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const current = options.find((option) => option.value === value)?.label ?? value;
  const active = value !== options[0]?.value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border bg-background/40 px-2.5 py-1.5 text-left transition-colors",
            active ? "border-primary/45" : "hover:border-border",
            className,
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <span className={cn("block truncate text-xs font-semibold", !active && "text-muted-foreground")}>
              {current}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterPane({
  activeCount,
  onReset,
  summary,
  search,
  children,
}: {
  activeCount: number;
  onReset: () => void;
  summary?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between px-1 pb-2.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary">{activeCount}</span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>
      {search && <div className="mb-2">{search}</div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{children}</div>
      {summary && <div className="mt-2.5 border-t pt-2.5">{summary}</div>}
    </div>
  );
}
