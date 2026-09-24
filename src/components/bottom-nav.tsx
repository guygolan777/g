import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Heart, Home, MessageCircle, Plus, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCounts } from "@/lib/queries";
import { CountBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const HIDDEN_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding", "/story/", "/scan/", "/admin"];

export function BottomNav() {
  const { pathname } = useLocation();
  const { isGuest, user } = useAuth();
  const unread = useUnreadCounts();
  const navigate = useNavigate();

  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (/^\/chat\/.+/.test(pathname)) return null;

  const item = (to: string, label: string, Icon: typeof Home, active: boolean, badge = 0) => (
    <Link
      to={to}
      aria-label={label}
      className={cn("relative flex min-w-0 flex-1 items-center justify-center py-3 transition", active ? "text-primary" : "text-muted-foreground")}
    >
      <span className="relative">
        <Icon className="size-7" strokeWidth={active ? 2.3 : 1.8} />
        <CountBadge count={badge} />
      </span>
    </Link>
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur lg:hidden" dir="rtl">
        <div className="mx-auto flex w-full max-w-lg items-center px-2">
          {item("/home", "בית", Home, pathname.startsWith("/home") || pathname.startsWith("/discover"))}
          {item("/likes", "מי בא לדייט?", Heart, pathname.startsWith("/likes"))}
          <div className="flex min-w-0 flex-1 justify-center">
            <button
              onClick={() => (isGuest ? navigate({ to: "/signup" }) : navigate({ to: "/event/new" }))}
              className="-mt-8 grid size-16 place-items-center rounded-full bg-gradient-brand text-brand-foreground shadow-lift ring-4 ring-surface transition active:scale-95"
              aria-label="אירוע חדש"
            >
              <Plus className="size-8" strokeWidth={2.6} />
            </button>
          </div>
          {item("/chat", "צ׳אט", MessageCircle, pathname.startsWith("/chat"), user ? unread.messages : 0)}
          {item("/me", "פרופיל", User, pathname.startsWith("/me") || pathname.startsWith("/settings"))}
        </div>
      </nav>
    </>
  );
}
