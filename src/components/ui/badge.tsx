import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      soft: "bg-primary-soft text-primary",
      event: "bg-event-soft text-event",
      partner: "bg-partner-soft text-partner-foreground",
      like: "bg-like-soft text-like",
      teal: "bg-teal-soft text-teal",
      violet: "bg-violet-soft text-violet",
      success: "bg-success-soft text-success",
      muted: "bg-muted text-muted-foreground",
      destructive: "bg-destructive-soft text-destructive",
    },
  },
  defaultVariants: { variant: "soft" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "absolute -top-1 -left-1 grid min-w-4.5 place-items-center rounded-full bg-like px-1 text-[10px] leading-4.5 font-bold text-like-foreground ring-2 ring-surface",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export { Badge, CountBadge, badgeVariants };
