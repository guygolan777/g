import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, Heart, UserPlus, Users } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Avatar } from "@/components/avatar";
import { PendingReminder } from "@/components/pending-reminder";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { PROFILE_MINI } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { Notification, Profile } from "@/lib/types";
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
  date_invite: { Icon: Heart, cls: "bg-like-soft text-like" },
  date_answer: { Icon: Heart, cls: "bg-like-soft text-like" },
  follow: { Icon: UserPlus, cls: "bg-primary-soft text-primary" },
  follow_request: { Icon: UserPlus, cls: "bg-primary-soft text-primary" },
  follow_accepted: { Icon: UserPlus, cls: "bg-success-soft text-success" },
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
    <Page size="narrow">
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
      <FollowRequests />
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

/** Requests to follow my private profile: approve or decline. */
function FollowRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["follow-requests", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("follower_id").eq("following_id", user!.id).eq("approved", false);
      const ids = (data ?? []).map((r) => r.follower_id as string);
      if (!ids.length) return [];
      const { data: ps } = await supabase.from("profiles").select(PROFILE_MINI).in("id", ids);
      return (ps ?? []) as Profile[];
    },
  });
  const list = q.data ?? [];
  if (!list.length) return null;

  async function answer(id: string, approve: boolean) {
    const res = approve
      ? await supabase.from("follows").update({ approved: true }).eq("follower_id", id).eq("following_id", user!.id)
      : await supabase.from("follows").delete().eq("follower_id", id).eq("following_id", user!.id);
    if (res.error) return;
    void qc.invalidateQueries({ queryKey: ["follow-requests"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["graph"] });
    void qc.invalidateQueries({ queryKey: ["follow-counts"] });
    void qc.invalidateQueries({ queryKey: ["profile-graph"] });
  }

  return (
    <section className="mb-4 rounded-2xl bg-surface p-3 shadow-soft">
      <h2 className="mb-2 font-bold">בקשות מעקב ({list.length})</h2>
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <Link to="/profile/$id" params={{ id: p.id }} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={p.avatar_url} name={p.name} size={44} />
              <span className="truncate font-semibold">{p.name}</span>
            </Link>
            <Button size="sm" variant="brand" onClick={() => void answer(p.id, true)}>
              אישור
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void answer(p.id, false)}>
              דחייה
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
