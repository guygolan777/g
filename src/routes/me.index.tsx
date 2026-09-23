import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, Search, Settings, Ticket, Users, Activity } from "lucide-react";
import { CenteredSpinner, Page } from "@/components/app-shell";
import { ProfileView } from "@/components/profile-view";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCounts } from "@/lib/queries";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/me/")({
  validateSearch: (s: Record<string, unknown>): { filter?: "pending" } => ({ filter: s.filter === "pending" ? "pending" : undefined }),
  head: () => seo({ title: "הפרופיל שלי", description: "האירועים, הקהילות, העוקבים והתחביבים שלך ב-mibale.", type: "profile" }),
  component: MyProfile,
});

function MyProfile() {
  const { profile } = useAuth();
  const { filter } = Route.useSearch();
  const unread = useUnreadCounts();
  if (!profile) return <CenteredSpinner />;
  const icon = "grid size-12 place-items-center rounded-full bg-surface-soft";
  return (
    <Page>
      <header className="flex items-center justify-between py-3">
        <h1 className="text-3xl font-extrabold text-gradient-brand">הפרופיל שלי</h1>
        <div className="flex gap-2">
          <Link to="/search" className={icon} aria-label="חיפוש">
            <Search className="size-5" />
          </Link>
          <Link to="/notifications" className={`relative ${icon}`} aria-label="התראות">
            <Bell className="size-5" />
            {unread.notifications > 0 && <span className="absolute top-2.5 left-3 size-2.5 rounded-full bg-like ring-2 ring-surface-soft" />}
          </Link>
          <Link to="/settings" className={icon} aria-label="הגדרות">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>
      <ProfileView
        profile={profile}
        isMe
        initialFilter={filter}
        actions={
          <div className="flex justify-center gap-2">
            {[
              { to: "/tickets", label: "הכרטיסים שלי", Icon: Ticket },
              { to: "/contacts", label: "אנשי קשר", Icon: Users },
              { to: "/me/activity", label: "פעילות", Icon: Activity },
            ].map(({ to, label, Icon }) => (
              <Link key={to} to={to} className="flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-2 text-xs font-semibold">
                <Icon className="size-4 text-primary" />
                {label}
              </Link>
            ))}
          </div>
        }
      />
    </Page>
  );
}
