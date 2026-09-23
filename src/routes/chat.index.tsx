import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users } from "lucide-react";
import { EmptyState, Page } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { RequireAuth } from "@/components/gates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { channelName } from "@/lib/realtime";
import { PROFILE_MINI } from "@/lib/constants";
import { useMyCommunities, useMyParticipations } from "@/lib/queries";
import { messagePreview } from "@/lib/message-text";
import { whoComesTitle } from "@/lib/event-title";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { MessageKind, Profile } from "@/lib/types";

export const Route = createFileRoute("/chat/")({
  head: () => seo({ title: "צ׳אט", description: "הודעות אישיות, צ׳אטים של אירועים וקהילות ב-mibale." }),
  component: () => (
    <RequireAuth reason="הצ׳אט זמין לחברי mibale.">
      <ChatList />
    </RequireAuth>
  ),
});

type Conv = { partner_id: string; last_body: string; last_kind: MessageKind; last_sender: string; last_at: string; unread: number };

function ChatList() {
  const { user } = useAuth();
  const convs = useQuery({
    queryKey: ["conversations", user?.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_conversations");
      const rows = (data ?? []) as Conv[];
      const ids = rows.map((r) => r.partner_id);
      const { data: ps } = ids.length ? await supabase.from("profiles").select(PROFILE_MINI).in("id", ids) : { data: [] };
      const map = new Map(((ps ?? []) as Profile[]).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, partner: map.get(r.partner_id) }));
    },
  });

  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(channelName(`chat-list-${user.id}`))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` }, () => void convs.refetch())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [user, convs]);

  const { data: parts = [] } = useMyParticipations();
  const { data: comms = [] } = useMyCommunities(user?.id);
  const eventChats = parts
    .filter((p) => p.status === "approved" && p.event && new Date(p.event.ends_at ?? p.event.starts_at).getTime() > Date.now() - 7 * 86_400_000)
    .sort((a, b) => new Date(a.event!.starts_at).getTime() - new Date(b.event!.starts_at).getTime());

  return (
    <Page size="narrow">
      <header className="py-3">
        <h1 className="text-3xl font-extrabold text-gradient-brand">הודעות</h1>
      </header>
      <Tabs defaultValue="direct">
        <TabsList>
          <TabsTrigger value="direct">אישי</TabsTrigger>
          <TabsTrigger value="events">אירועים</TabsTrigger>
          <TabsTrigger value="communities">קהילות</TabsTrigger>
        </TabsList>
        <TabsContent value="direct">
          {convs.data?.length === 0 && <EmptyState emoji="💬" title="עוד אין שיחות" text="התחילו שיחה מתוך פרופיל של מישהו" />}
          <div className="space-y-1">
            {convs.data?.map((c) => (
              <Link key={c.partner_id} to="/chat/$id" params={{ id: c.partner_id }} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-muted">
                <Avatar src={c.partner?.avatar_url} name={c.partner?.name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{c.partner?.name ?? "משתמש/ת"}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(c.last_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${c.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {messagePreview({ kind: c.last_kind, body: c.last_body, sender_id: c.last_sender }, user?.id)}
                    </p>
                    {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-like px-1.5 text-xs font-bold text-like-foreground">{c.unread}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="events">
          {eventChats.length === 0 && <EmptyState emoji="🗓️" title="אין צ׳אטים של אירועים" text="אחרי אישור לאירוע, הצ׳אט שלו יופיע כאן" />}
          <div className="space-y-1">
            {eventChats.map(({ event }) => (
              <Link key={event!.id} to="/chat/$id" params={{ id: event!.id }} search={{ kind: "event" }} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-muted">
                <div className="grid size-13 shrink-0 place-items-center overflow-hidden rounded-2xl bg-event-soft text-event">
                  {event!.image_url ? <SafeImg src={event!.image_url} alt="" className="size-full object-cover" /> : <CalendarDays />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{whoComesTitle(event!.title)}</p>
                  <p className="text-xs text-muted-foreground">צ׳אט המשתתפים</p>
                </div>
              </Link>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="communities">
          {comms.length === 0 && <EmptyState emoji="👥" title="עוד לא הצטרפת לקהילות" />}
          <div className="space-y-1">
            {comms.map(({ community }) => (
              <Link key={community!.id} to="/chat/$id" params={{ id: community!.id }} search={{ kind: "community" }} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-muted">
                <div className="grid size-13 shrink-0 place-items-center overflow-hidden rounded-2xl bg-teal-soft text-teal">
                  {community!.image_url ? <SafeImg src={community!.image_url} alt="" className="size-full object-cover" /> : <Users />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{community!.name}</p>
                  <p className="text-xs text-muted-foreground">צ׳אט הקהילה</p>
                </div>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
