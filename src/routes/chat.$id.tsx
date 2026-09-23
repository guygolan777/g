import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CenteredSpinner, Page, PageHeader } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { ChatThread, type ThreadMessage } from "@/components/chat-thread";
import { DateInviteCard, DateInviteDialog } from "@/components/date-invite";
import { Wine } from "lucide-react";
import type { DateInvite } from "@/lib/types";
import { RequireAuth } from "@/components/gates";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { channelName } from "@/lib/realtime";
import { BLOCKED_MESSAGE, fetchBlockedIds } from "@/lib/blocks";
import { PROFILE_MINI } from "@/lib/constants";
import { whoComesTitle } from "@/lib/event-title";
import { seo } from "@/lib/seo";
import type { MessageKind, Profile } from "@/lib/types";

type Kind = "dm" | "event" | "community";

export const Route = createFileRoute("/chat/$id")({
  validateSearch: (s: Record<string, unknown>): { kind?: Kind } => ({
    kind: s.kind === "event" || s.kind === "community" ? s.kind : undefined,
  }),
  head: () => seo({ title: "שיחה", description: "שיחה ב-mibale." }),
  component: () => (
    <RequireAuth reason="הצ׳אט זמין לחברי mibale.">
      <ChatRoom />
    </RequireAuth>
  ),
});

const TABLE = { event: "event_messages", community: "community_messages" } as const;
const FK = { event: "event_id", community: "community_id" } as const;

function ChatRoom() {
  const { id } = Route.useParams();
  const { kind = "dm" } = Route.useSearch();
  return kind === "dm" ? <DirectChat partnerId={id} /> : <GroupChat groupId={id} kind={kind} />;
}

function DirectChat({ partnerId }: { partnerId: string }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const uid = user!.id;
  const key = ["dm", uid, partnerId];

  const partner = useQuery({
    queryKey: ["dm-partner", partnerId],
    queryFn: async () => {
      const [{ data }, blocked] = await Promise.all([
        supabase.from("profiles").select(PROFILE_MINI).eq("id", partnerId).maybeSingle(),
        fetchBlockedIds(true),
      ]);
      return { profile: data as Pick<Profile, "id" | "name" | "avatar_url"> | null, blocked: blocked.has(partnerId) };
    },
  });

  const msgs = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${uid},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${uid})`)
        .order("created_at", { ascending: true })
        .limit(500);
      return (data ?? []) as ThreadMessage[];
    },
  });

  const invites = useQuery({
    queryKey: ["date-invites", uid, partnerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("date_invites")
        .select("*")
        .or(`and(sender_id.eq.${uid},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${uid})`);
      return new Map(((data ?? []) as DateInvite[]).map((d) => [d.id, d]));
    },
  });
  const [inviteOpen, setInviteOpen] = React.useState(false);

  React.useEffect(() => {
    const ch = supabase
      .channel(channelName(`date-invites-${uid}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "date_invites", filter: `sender_id=eq.${uid}` }, () =>
        void qc.invalidateQueries({ queryKey: ["date-invites", uid, partnerId] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [uid, partnerId, qc]);

  const online = useQuery({
    queryKey: ["online", partnerId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("online_status", { ids: [partnerId] });
      return ((data ?? []) as Array<{ is_online: boolean }>)[0]?.is_online ?? false;
    },
  });

  // Mark incoming as read.
  React.useEffect(() => {
    if (!msgs.data?.some((m) => m.sender_id === partnerId)) return;
    void supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", uid)
      .eq("sender_id", partnerId)
      .is("read_at", null)
      .then(() => void qc.invalidateQueries({ queryKey: ["unread"] }));
  }, [msgs.data, uid, partnerId, qc]);

  React.useEffect(() => {
    const ch = supabase
      .channel(channelName(`dm-${uid}-${partnerId}`))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${uid}` }, (p) => {
        if ((p.new as ThreadMessage).sender_id === partnerId) {
          void qc.invalidateQueries({ queryKey: key });
          void qc.invalidateQueries({ queryKey: ["date-invites", uid, partnerId] });
        }
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, partnerId, qc]);

  if (partner.isLoading) return <CenteredSpinner />;
  const p = partner.data?.profile;
  const blocked = partner.data?.blocked || !p;

  return (
    <Page withNav={false} className="pb-0">
      <PageHeader
        back
        title={
          p ? (
            <Link to="/profile/$id" params={{ id: partnerId }} className="flex items-center gap-2">
              <Avatar src={p.avatar_url} name={p.name} size={36} />
              <span className="truncate">{p.name}</span>
            </Link>
          ) : (
            "שיחה"
          )
        }
        subtitle={
          p ? (
            <Link to="/profile/$id" params={{ id: partnerId }} className="text-muted-foreground">
              {!blocked && online.data ? "מחובר/ת עכשיו · " : ""}צפייה בפרופיל
            </Link>
          ) : undefined
        }
        actions={
          !blocked && (
            <button onClick={() => setInviteOpen(true)} className="grid size-12 place-items-center rounded-full bg-like-soft text-like" aria-label="הזמנה לדייט">
              <Wine className="size-6" />
            </button>
          )
        }
      />
      <DateInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        senderId={uid}
        recipientId={partnerId}
        onSent={() => {
          void qc.invalidateQueries({ queryKey: key });
          void qc.invalidateQueries({ queryKey: ["date-invites", uid, partnerId] });
        }}
      />
      <ChatThread
        renderSpecial={(m) => {
          if (m.kind !== "date_invite" || !m.date_invite_id) return null;
          const inv = invites.data?.get(m.date_invite_id);
          return inv ? (
            <DateInviteCard invite={inv} viewerId={uid} onAnswered={() => void qc.invalidateQueries({ queryKey: ["date-invites", uid, partnerId] })} />
          ) : null;
        }}
        messages={msgs.data ?? []}
        senders={new Map([[uid, { id: uid, name: profile?.name ?? "", avatar_url: profile?.avatar_url ?? null }], ...(p ? [[p.id, p] as const] : [])])}
        showSenders={false}
        disabled={blocked}
        disabledText={BLOCKED_MESSAGE}
        onSend={async (m) => {
          const { error } = await supabase.from("direct_messages").insert({ sender_id: uid, recipient_id: partnerId, ...m });
          if (error) {
            toast.error("ההודעה לא נשלחה");
            return false;
          }
          void qc.invalidateQueries({ queryKey: key });
          void qc.invalidateQueries({ queryKey: ["conversations"] });
          return true;
        }}
      />
    </Page>
  );
}

function GroupChat({ groupId, kind }: { groupId: string; kind: "event" | "community" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user!.id;
  const key = ["group-chat", kind, groupId];

  const meta = useQuery({
    queryKey: ["group-meta", kind, groupId],
    queryFn: async () => {
      if (kind === "event") {
        const { data } = await supabase.from("events").select("id, title, image_url").eq("id", groupId).maybeSingle();
        return data ? { title: whoComesTitle(data.title as string), image: data.image_url as string | null, link: `/e/${groupId}` } : null;
      }
      const { data } = await supabase.from("communities").select("id, name, image_url").eq("id", groupId).maybeSingle();
      return data ? { title: data.name as string, image: data.image_url as string | null, link: `/community/${groupId}` } : null;
    },
  });

  const msgs = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .select(`id, sender_id, kind, body, media_url, created_at, sender:profiles(${PROFILE_MINI})`)
        .eq(FK[kind], groupId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) return { rows: [] as ThreadMessage[], senders: new Map<string, Profile>(), denied: true };
      const rows = (data ?? []) as unknown as Array<ThreadMessage & { sender: Profile | null }>;
      const blocked = await fetchBlockedIds();
      return {
        rows: rows.filter((r) => !blocked.has(r.sender_id)),
        senders: new Map(rows.filter((r) => r.sender).map((r) => [r.sender_id, r.sender!])),
        denied: false,
      };
    },
  });

  const membership = useQuery({
    queryKey: ["group-member", kind, groupId, uid],
    queryFn: async () => {
      if (kind === "event") {
        const { data } = await supabase.from("event_participants").select("status").eq("event_id", groupId).eq("profile_id", uid).maybeSingle();
        return data?.status === "approved";
      }
      const { data } = await supabase.from("community_members").select("role").eq("community_id", groupId).eq("profile_id", uid).maybeSingle();
      return !!data;
    },
  });

  React.useEffect(() => {
    const ch = supabase
      .channel(channelName(`${kind}-chat-${groupId}`))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE[kind], filter: `${FK[kind]}=eq.${groupId}` }, () =>
        void qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, groupId, qc]);

  if (meta.isLoading || membership.isLoading) return <CenteredSpinner />;

  return (
    <Page withNav={false} className="pb-0">
      <PageHeader
        back
        title={
          <Link to={meta.data?.link ?? "/chat"} className="flex items-center gap-2">
            <Avatar src={meta.data?.image} name={meta.data?.title} size={36} />
            <span className="truncate">{meta.data?.title ?? "צ׳אט"}</span>
          </Link>
        }
        subtitle={kind === "event" ? "צ׳אט המשתתפים" : "צ׳אט הקהילה"}
      />
      <ChatThread
        messages={msgs.data?.rows ?? []}
        senders={msgs.data?.senders ?? new Map()}
        showSenders
        disabled={!membership.data}
        disabledText={kind === "event" ? "הצ׳אט פתוח למשתתפים מאושרים בלבד" : "הצ׳אט פתוח לחברי הקהילה בלבד"}
        onSend={async (m: { kind: MessageKind; body: string; media_url?: string | null }) => {
          const { error } = await supabase.from(TABLE[kind]).insert({ [FK[kind]]: groupId, sender_id: uid, ...m });
          if (error) {
            toast.error("ההודעה לא נשלחה");
            return false;
          }
          void qc.invalidateQueries({ queryKey: key });
          return true;
        }}
      />
    </Page>
  );
}
