import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page container. Mobile-first; on the web it widens ("wide", default) or stays
 * form-width ("narrow"). The bottom nav is mobile-only, so its padding goes away on lg.
 */
export function Page({
  children,
  className,
  withNav = true,
  size = "wide",
}: {
  children: React.ReactNode;
  className?: string;
  withNav?: boolean;
  size?: "wide" | "narrow";
}) {
  return (
    <main
      className={cn(
        "mx-auto min-h-dvh w-full max-w-lg px-4 pt-safe lg:px-8 lg:pt-4",
        size === "wide" ? "md:max-w-3xl lg:max-w-5xl" : "md:max-w-xl",
        withNav ? "pb-28 lg:pb-10" : "pb-10",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  back = false,
  actions,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  back?: boolean;
  actions?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header className={cn("sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-2 bg-background/90 px-4 py-3 backdrop-blur", className)}>
      {back && (
        <button
          onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/home" }))}
          className="-me-1 grid size-10 place-items-center rounded-full hover:bg-muted"
          aria-label="חזרה"
        >
          <ChevronRight className="size-6" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("mt-6 scroll-mt-20", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface-soft px-6 py-10 text-center">
      <div className="text-4xl">{emoji}</div>
      <p className="mt-3 font-bold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn("size-6 animate-spin rounded-full border-2 border-primary border-t-transparent", className)} />;
}

export function CenteredSpinner() {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <Spinner />
    </div>
  );
}
