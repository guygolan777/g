import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { rememberRedirect, useGuestStats } from "@/lib/guest";
import { cn } from "@/lib/utils";

/** Sign-up link that brings the guest back to where they were. */
export function SignupLink({ children, className, variant = "brand", size = "lg", to = "/signup" }: {
  children: React.ReactNode;
  className?: string;
  variant?: "brand" | "outline" | "ghost" | "like";
  size?: "sm" | "default" | "lg";
  to?: "/signup" | "/login";
}) {
  const { pathname, searchStr } = useLocation();
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link to={to} onClick={() => rememberRedirect(pathname + (searchStr ?? ""))}>
        {children}
      </Link>
    </Button>
  );
}

/** Soft "locked" block: blurred placeholder avatars (never real people) + a reason to join. */
export function GuestTeaser({ title, text, emoji = "👀", className }: { title: string; text?: string; emoji?: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-surface-soft p-5 text-center", className)}>
      <div className="flex justify-center -space-x-3 space-x-reverse blur-[2px]" aria-hidden>
        {["bg-event-soft", "bg-like-soft", "bg-partner-soft", "bg-teal-soft", "bg-violet-soft"].map((c) => (
          <span key={c} className={cn("size-11 rounded-full ring-2 ring-surface", c)} />
        ))}
      </div>
      <p className="mt-3 text-lg font-bold">
        {emoji} {title}
      </p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
      <SignupLink className="mt-4 w-full max-w-xs" size="default">
        <Lock className="size-4" /> הצטרפות חינם
      </SignupLink>
    </div>
  );
}

/** Aggregate social proof for guests. */
export function GuestStatsRow({ className }: { className?: string }) {
  const { data } = useGuestStats();
  if (!data) return null;
  const items = [
    { n: data.members, l: "חברים" },
    { n: data.events_week, l: "אירועים השבוע" },
    { n: data.communities, l: "קהילות" },
  ];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {items.map((i) => (
        <div key={i.l} className="rounded-2xl bg-surface p-3 text-center shadow-soft">
          <p className="text-2xl font-extrabold text-gradient-brand">{i.n}</p>
          <p className="text-xs text-muted-foreground">{i.l}</p>
        </div>
      ))}
    </div>
  );
}

// Event and community pages have their own sign-up call to action.
const BAR_ROUTES = ["/home", "/discover", "/search", "/communities"];

/** Sticky sign-up bar on browsable pages for guests. */
export function GuestSignupBar() {
  const { isGuest } = useAuth();
  const { pathname } = useLocation();
  if (!isGuest || !BAR_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-4 lg:ps-64" dir="rtl">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-foreground p-3 text-background shadow-lift">
        <Sparkles className="size-5 shrink-0 text-partner" />
        <p className="flex-1 text-sm font-semibold">הצטרפו חינם — ותראו מי בא, איפה ומתי 👀</p>
        <SignupLink size="sm" className="shrink-0">
          הרשמה
        </SignupLink>
      </div>
    </div>
  );
}
