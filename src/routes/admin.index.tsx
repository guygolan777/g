import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () =>
    seo({
      title: "ניהול · סקירה",
      description:
        "נתוני מערכת: משתמשים, אירועים, קהילות, סטוריז ודיווחים פתוחים.",
    }),
  component: Overview,
});

type Overview = {
  users: number;
  new_this_week: number;
  events: number;
  upcoming_events: number;
  communities: number;
  active_stories: number;
  open_reports: number;
  banned: number;
  reports_24h?: number;
  auto_flags?: number;
  hidden?: number;
  actions_7d?: number;
};

const SAFETY: Array<{
  key: keyof Overview;
  label: string;
  cls: string;
  to: string;
}> = [
  {
    key: "open_reports",
    label: "דיווחים פתוחים",
    cls: "bg-destructive-soft text-destructive",
    to: "/admin/reports",
  },
  {
    key: "reports_24h",
    label: "דיווחים ב-24 שעות",
    cls: "bg-partner-soft text-partner-strong",
    to: "/admin/reports",
  },
  {
    key: "auto_flags",
    label: "סימונים אוטומטיים",
    cls: "bg-violet-soft text-violet",
    to: "/admin/reports",
  },
  {
    key: "hidden",
    label: "תוכן מוסתר",
    cls: "bg-muted text-foreground",
    to: "/admin/reports",
  },
  {
    key: "banned",
    label: "מושהים",
    cls: "bg-destructive-soft text-destructive",
    to: "/admin/users",
  },
  {
    key: "actions_7d",
    label: "פעולות צוות השבוע",
    cls: "bg-primary-soft text-primary",
    to: "/admin/log",
  },
];

const CARDS: Array<{ key: keyof Overview; label: string; cls: string }> = [
  { key: "users", label: "משתמשים", cls: "bg-primary-soft text-primary" },
  {
    key: "new_this_week",
    label: "חדשים השבוע",
    cls: "bg-success-soft text-success",
  },
  { key: "events", label: "אירועים", cls: "bg-event-soft text-event" },
  {
    key: "upcoming_events",
    label: "עתידיים",
    cls: "bg-violet-soft text-violet",
  },
  { key: "communities", label: "קהילות", cls: "bg-teal-soft text-teal" },
  { key: "active_stories", label: "סטוריז", cls: "bg-like-soft text-like" },
];

function Overview() {
  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview");
      if (error) throw error;
      return data as Overview;
    },
  });
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 font-bold">בטיחות</h2>
        <div className="grid grid-cols-3 gap-2">
          {SAFETY.map((c) =>
            q.isLoading ? (
              <Skeleton key={c.key} className="h-20 rounded-2xl" />
            ) : (
              <Link
                key={c.key}
                to={c.to}
                className={cn("rounded-2xl p-3", c.cls)}
              >
                <p className="text-2xl font-bold">{q.data?.[c.key] ?? 0}</p>
                <p className="text-xs leading-tight font-semibold">{c.label}</p>
              </Link>
            ),
          )}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">פעילות</h2>
        <div className="grid grid-cols-2 gap-3">
          {CARDS.map((c) =>
            q.isLoading ? (
              <Skeleton key={c.key} className="h-24 rounded-2xl" />
            ) : (
              <div key={c.key} className={cn("rounded-2xl p-4", c.cls)}>
                <p className="text-3xl font-bold">{q.data?.[c.key] ?? 0}</p>
                <p className="text-sm font-semibold">{c.label}</p>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
