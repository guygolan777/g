import { Link, createFileRoute } from "@tanstack/react-router";
import { Activity, Pencil, Settings, Ticket, Users } from "lucide-react";
import { CenteredSpinner, Page } from "@/components/app-shell";
import { ProfileView } from "@/components/profile-view";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/me/")({
  validateSearch: (s: Record<string, unknown>): { filter?: "pending" } => ({ filter: s.filter === "pending" ? "pending" : undefined }),
  head: () => seo({ title: "הפרופיל שלי", description: "האירועים, הקהילות, העוקבים והתחביבים שלך ב-mibale.", type: "profile" }),
  component: MyProfile,
});

function MyProfile() {
  const { profile } = useAuth();
  const { filter } = Route.useSearch();
  if (!profile) return <CenteredSpinner />;
  return (
    <Page>
      <div className="absolute top-0 right-0 left-0 z-10 mx-auto flex max-w-lg justify-end gap-2 px-4 pt-safe">
        <div className="mt-3 flex gap-2">
          <Button asChild size="icon" variant="outline" className="bg-surface/90" aria-label="הגדרות">
            <Link to="/settings">
              <Settings />
            </Link>
          </Button>
        </div>
      </div>
      <ProfileView
        profile={profile}
        isMe
        initialFilter={filter}
        actions={
          <div className="grid grid-cols-4 gap-2">
            {[
              { to: "/me/edit", label: "עריכה", Icon: Pencil },
              { to: "/tickets", label: "כרטיסים", Icon: Ticket },
              { to: "/contacts", label: "אנשי קשר", Icon: Users },
              { to: "/me/activity", label: "פעילות", Icon: Activity },
            ].map(({ to, label, Icon }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1 rounded-2xl bg-surface py-3 text-xs font-semibold shadow-soft">
                <Icon className="size-5 text-primary" />
                {label}
              </Link>
            ))}
          </div>
        }
      />
    </Page>
  );
}
