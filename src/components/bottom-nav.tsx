import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Heart, Home, MessageCircle, Plus, User, CalendarPlus, Camera, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCounts } from "@/lib/queries";
import { CountBadge } from "@/components/ui/badge";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding", "/story/", "/scan/", "/admin"];

export function BottomNav() {
  const { pathname } = useLocation();
  const { isGuest, user } = useAuth();
  const unread = useUnreadCounts();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (/^\/chat\/.+/.test(pathname)) return null;

  const item = (to: string, label: string, Icon: typeof Home, active: boolean, badge = 0) => (
    <Link
      to={to}
      aria-label={label}
      className={cn("relative flex flex-1 items-center justify-center py-3 transition", active ? "text-primary" : "text-muted-foreground")}
    >
      <span className="relative">
        <Icon className="size-7" strokeWidth={active ? 2.3 : 1.8} />
        <CountBadge count={badge} />
      </span>
    </Link>
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur" dir="rtl">
        <div className="mx-auto flex max-w-lg items-center px-2">
          {item("/home", "בית", Home, pathname.startsWith("/home") || pathname.startsWith("/discover"))}
          {item("/likes", "לייקים והתאמות", Heart, pathname.startsWith("/likes"))}
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => (isGuest ? navigate({ to: "/signup" }) : setOpen(true))}
              className="-mt-8 grid size-16 place-items-center rounded-full bg-gradient-brand text-primary-foreground shadow-lift ring-4 ring-surface transition active:scale-95"
              aria-label="יצירה מהירה"
            >
              <Plus className="size-8" strokeWidth={2.6} />
            </button>
          </div>
          {item("/chat", "צ׳אט", MessageCircle, pathname.startsWith("/chat"), user ? unread.messages : 0)}
          {item("/me", "פרופיל", User, pathname.startsWith("/me") || pathname.startsWith("/settings"))}
        </div>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent title="מה יוצרים היום?">
          <div className="grid grid-cols-3 gap-3">
            {[
              { to: "/event/new", label: "אירוע", Icon: CalendarPlus, cls: "bg-event-soft text-event" },
              { to: "/story/new", label: "סטורי", Icon: Camera, cls: "bg-like-soft text-like" },
              { to: "/community/new", label: "קהילה", Icon: Users, cls: "bg-teal-soft text-teal" },
            ].map(({ to, label, Icon, cls }) => (
              <button
                key={to}
                onClick={() => {
                  setOpen(false);
                  void navigate({ to });
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-surface-soft p-4 font-semibold"
              >
                <span className={cn("grid size-12 place-items-center rounded-full", cls)}>
                  <Icon className="size-6" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Dialog>
    </>
  );
}
