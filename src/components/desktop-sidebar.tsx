import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, Compass, Heart, Home, MapPin, MessageCircle, Plus, Search, Settings, User } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { QuickCreateSheet } from "@/components/quick-create";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCounts } from "@/lib/queries";
import { cn } from "@/lib/utils";

const HIDDEN = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding", "/story/", "/scan/"];

export function useSidebarVisible() {
  const { pathname } = useLocation();
  return pathname !== "/" && !HIDDEN.some((p) => pathname.startsWith(p));
}

/** Web (≥1024px) navigation: fixed sidebar on the right, replacing the bottom nav. Same routes, same data. */
export function DesktopSidebar() {
  const { pathname } = useLocation();
  const { user, profile, isGuest } = useAuth();
  const unread = useUnreadCounts();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  if (!useSidebarVisible()) return null;

  const items: Array<{ to: string; label: string; Icon: typeof Home; badge?: number; member?: boolean; match?: string[] }> = [
    { to: "/home", label: "בית", Icon: Home, match: ["/home"] },
    { to: "/discover", label: "גילוי אירועים", Icon: Compass },
    { to: "/search", label: "חיפוש", Icon: Search },
    { to: "/nearby", label: "קרוב אליי", Icon: MapPin, member: true },
    { to: "/likes", label: "לייקים והתאמות", Icon: Heart, member: true },
    { to: "/chat", label: "הודעות", Icon: MessageCircle, badge: unread.messages, member: true },
    { to: "/notifications", label: "התראות", Icon: Bell, badge: unread.notifications, member: true },
    { to: "/calendar", label: "היומן שלי", Icon: CalendarDays, member: true },
    { to: "/me", label: "הפרופיל שלי", Icon: User, member: true },
    { to: "/settings", label: "הגדרות", Icon: Settings, member: true },
  ];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 hidden w-64 flex-col border-s border-border bg-surface px-4 py-6 lg:flex" dir="rtl">
      <Link to="/home" className="px-3 font-display text-4xl font-extrabold text-gradient-brand">
        mibale
      </Link>
      <nav className="mt-8 flex flex-col gap-1">
        {items
          .filter((i) => !i.member || user)
          .map(({ to, label, Icon, badge }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition",
                  active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-5" />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="grid min-w-5 place-items-center rounded-full bg-like px-1.5 text-xs font-bold text-like-foreground">{badge}</span>}
              </Link>
            );
          })}
      </nav>
      <Button variant="brand" size="lg" className="mt-6" onClick={() => (isGuest ? void navigate({ to: "/signup" }) : setOpen(true))}>
        <Plus /> {isGuest ? "הצטרפות חינם" : "יצירה"}
      </Button>
      <div className="mt-auto">
        {user ? (
          <Link to="/me" className="flex items-center gap-3 rounded-2xl p-2 hover:bg-muted">
            <Avatar src={profile?.avatar_url} name={profile?.name} size={40} />
            <span className="truncate font-semibold">{profile?.name}</span>
          </Link>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">התחברות</Link>
          </Button>
        )}
      </div>
      <QuickCreateSheet open={open} onOpenChange={setOpen} />
    </aside>
  );
}
