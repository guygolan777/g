import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, Heart, UserPlus, Users } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { PendingReminder } from "@/components/pending-reminder";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => seo({ title: "התראות", description: "בקשות הצטרפות, אישורים, עוקבים חדשים והתאמות — כל ההתראות שלך." }),
  component: () => (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  ),
});

const ICONS: Record<string, { Icon: typeof Bell; cls: string }> = {
  event_join_request: { Icon: CalendarCheck, cls: "bg-partner-soft text-partner-strong" },
  event_joined: { Icon: CalendarCheck, cls: "bg-event-soft text-event" },
  event_approved: { Icon: CalendarCheck, cls: "bg-success-soft text-success" },
  event_invite: { Icon: CalendarCheck, cls: "bg-violet-soft text-violet" },
  follow: { Icon: UserPlus, cls: "bg-primary-soft text-primary" },
  story_like: { Icon: Heart, cls: "bg-like-soft text-like" },
  match: { Icon: Heart, cls: "bg-like-soft text-like" },
  community_join_request: { Icon: Users, cls: "bg-teal-soft text-teal" },
  community_approved: { Icon: Users, cls: "bg-teal-soft text-teal" },
};

function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("recipient_id", user!.id).order("created_at", { ascending: false }).limit(100);
      return (data ?? []) as Notification[];
    },
  });

  const markAll = React.useCallback(async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user!.id).is("read_at", null);
    void qc.invalidateQueries({ queryKey: ["unread"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }, [user, qc]);

  // Viewing the center marks everything read (after a beat, so unread styling is visible).
  React.useEffect(() => {
    const t = window.setTimeout(() => void markAll(), 2500);
    return () => window.clearTimeout(t);
  }, [markAll]);

  const list = q.data ?? [];
  return (
    <Page>
      <PageHeader
        title="התראות"
        back
        actions={
          list.some((n) => !n.read_at) && (
            <Button size="sm" variant="ghost" onClick={() => void markAll()}>
              סימון הכל כנקרא
            </Button>
          )
        }
      />
      <PendingReminder />
      {!q.isLoading && list.length === 0 && <EmptyState emoji="🔔" title="אין התראות חדשות" />}
      <div className="space-y-1">
        {list.map((n) => {
          const ui = ICONS[n.type] ?? { Icon: Bell, cls: "bg-muted text-foreground" };
          const inner = (
            <div className={cn("flex items-start gap-3 rounded-2xl p-3", !n.read_at && "bg-primary-soft/60")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", ui.cls)}>
                <ui.Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatRelative(n.created_at)}</p>
              </div>
            </div>
          );
          return n.link ? (
            <Link key={n.id} to={n.link}>
              {inner}
            </Link>
          ) : (
            <div key={n.id}>{inner}</div>
          );
        })}
      </div>
    </Page>
  );
}
