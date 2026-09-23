import * as React from "react";
import { cn } from "@/lib/utils";

export function Chip({
  active,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-95",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none", className)}>{children}</div>;
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1 text-sm", className)}>{children}</span>
  );
}
