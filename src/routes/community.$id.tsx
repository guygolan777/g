import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { SafeImg } from "@/components/safe-img";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, MessageCircle, Plus, Share2, Trash2 } from "lucide-react";
import { CenteredSpinner, EmptyState, Page } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { EventCard } from "@/components/event-card";
import { ReportDialog } from "@/components/report-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useEventFeed } from "@/hooks/use-event-feed";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS, EVENT_GUEST_COLUMNS, PROFILE_MINI, SITE_URL } from "@/lib/constants";
import { hobbyLabel } from "@/lib/hobby-categories";
import { formatRelative } from "@/lib/format";
import { shareLink } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { Community, EventRow, Profile } from "@/lib/types";

export const Route = createFileRoute("/community/$id")({
  head: () => seo({ title: "קהילה", description: "קהילה ב-mibale: אירועים, חברים וצ׳אט סביב תחביב משותף." }),
  component: CommunityPage,
});

type Member = { profile_id: string; role: "founder" | "admin" | "member"; profile: Pick<Profile, "id" | "name" | "avatar_url"> | null };
type Req = { id: string; profile_id: string; created_at: string; message: string | null; profile: Pick<Profile, "id" | "name" | "avatar_url"> | null };

const AUDIENCE = { all: "לכולם", female: "לנשים", male: "לגברים" } as const;
const ROLE_LABEL = { founder: "מייסד/ת", admin: "מנהל/ת", member: "חבר/ה" } as const;

function CommunityPage() {
  const { id } = Route.useParams();
  const { user, isGuest, ready } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const feed = useEventFeed();

  const q = useQuery({
    queryKey: ["community", id, isGuest],
    enabled: ready,
    queryFn: async () => {
      const [{ data: c }, { data: evs }] = await Promise.all([
        supabase.from("communities").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("events")
          .select(isGuest ? EVENT_GUEST_COLUMNS : EVENT_COLUMNS)
          .eq("community_id", id)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at"),
      ]);
      let members: Member[] = [];
      let requests: Req[] = [];
      let myRequest: string | null = null;
      if (!isGuest) {
        const [{ data: m }, { data: r }] = await Promise.all([
          supabase.from("community_members").select(`profile_id, role, profile:profiles(${PROFILE_MINI})`).eq("community_id", id),
          supabase
            .from("community_join_requests")
            .select(`id, profile_id, status, created_at, message, profile:profiles!community_join_requests_profile_id_fkey(${PROFILE_MINI})`)
            .eq("community_id", id)
            .eq("status", "pending"),
        ]);
        members = (m ?? []) as unknown as Member[];
        const all = (r ?? []) as unknown as Array<Req & { status: string }>;
        myRequest = all.find((x) => x.profile_id === user?.id)?.status ?? null;
        requests = all.filter((x) => x.profile_id !== user?.id);
      }
      return { community: c as Community | null, events: (evs ?? []) as unknown as EventRow[], members, requests, myRequest };
    },
  });

  if (!ready || q.isLoading) return <CenteredSpinner />;
  const c = q.data?.community;
  if (!c) {
    return (
      <Page>
        <div className="pt-20">
          <EmptyState emoji="🫥" title="הקהילה לא נמצאה" />
        </div>
      </Page>
    );
  }
  const members = q.data!.members;
  const me = members.find((m) => m.profile_id === user?.id);
  const isAdmin = me?.role === "founder" || me?.role === "admin";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["community", id] });
    void qc.invalidateQueries({ queryKey: ["my-communities"] });
  };

  async function join() {
    if (!user) return void navigate({ to: "/signup" });
    const { data, error } = await supabase.rpc("request_community_join", { _community_id: id, _message: null });
    if (error) {
      const m = error.message;
      return void toast.error(m.includes("audience") ? "הקהילה מיועדת לקהל אחר" : m.includes("age") ? "הקהילה מיועדת לטווח גילאים אחר" : "ההצטרפות נכשלה");
    }
    toast.success(data === "member" ? "🎉 הצטרפת לקהילה" : "הבקשה נשלחה למנהלי הקהילה");
    refresh();
  }

  async function leave() {
    if (!confirm("לעזוב את הקהילה?")) return;
    const { error } = await supabase.from("community_members").delete().eq("community_id", id).eq("profile_id", user!.id);
    if (error) return void toast.error("לא הצלחנו להסיר אותך");
    refresh();
  }

  async function review(reqId: string, approve: boolean) {
    const { error } = await supabase.rpc("review_community_join", { _request_id: reqId, _approve: approve });
    if (error) return void toast.error("הפעולה נכשלה");
    toast.success(approve ? "אושר/ה ✔" : "נדחה");
    refresh();
  }

  async function setRole(profileId: string, role: "admin" | "member") {
    const { error } = await supabase.from("community_members").update({ role }).eq("community_id", id).eq("profile_id", profileId);
    if (error) return void toast.error("הפעולה נכשלה");
    refresh();
  }

  async function removeCommunity() {
    if (!confirm("למחוק את הקהילה לצמיתות?")) return;
    const { error } = await supabase.from("communities").delete().eq("id", id);
    if (error) return void toast.error("המחיקה נכשלה");
    toast.success("הקהילה נמחקה");
    void navigate({ to: "/home", search: { tab: "communities" }, replace: true });
  }

  return (
    <Page>
      <div className="relative -mx-4 aspect-[16/9] bg-teal-soft">
        {c.image_url && <SafeImg src={c.image_url} alt="" className="size-full object-cover" />}
        <button
          onClick={() => window.history.back()}
          className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface/90 shadow-soft"
          aria-label="חזרה"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
      <div className="relative -mt-6 rounded-t-3xl bg-background pt-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="teal">{hobbyLabel(c.hobby)}</Badge>
          {c.audience_gender !== "all" && <Badge variant="violet">{AUDIENCE[c.audience_gender]}</Badge>}
          <Badge variant="muted">
            גילאי {c.min_age}–{c.max_age}
          </Badge>
          {!c.auto_approve && <Badge variant="partner">באישור מנהלים</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{c.name}</h1>
        <p className="text-sm text-muted-foreground">
          {c.city ? `${c.city} · ` : ""}
          {isGuest ? "" : `${members.length} חברים · `}
          {q.data!.events.length} אירועים זמינים
        </p>
        {c.description && <p className="mt-3 leading-relaxed whitespace-pre-line">{c.description}</p>}

        <div className="mt-4 flex gap-2">
          {me ? (
            <>
              <Button asChild variant="brand" className="flex-1">
                <Link to="/chat/$id" params={{ id }} search={{ kind: "community" }}>
                  <MessageCircle /> צ׳אט הקהילה
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/event/new">
                  <Plus /> אירוע
                </Link>
              </Button>
            </>
          ) : q.data!.myRequest === "pending" ? (
            <Button variant="secondary" className="flex-1" disabled>
              הבקשה ממתינה לאישור
            </Button>
          ) : (
            <Button variant="brand" className="flex-1" onClick={() => void join()}>
              {c.auto_approve ? "הצטרפות לקהילה" : "בקשת הצטרפות"}
            </Button>
          )}
          <Button size="icon" variant="outline" onClick={() => void shareLink({ title: c.name, url: `${SITE_URL}/community/${c.id}` })} aria-label="שיתוף">
            <Share2 />
          </Button>
        </div>

        <Tabs defaultValue="events" className="mt-6">
          <TabsList>
            <TabsTrigger value="events">אירועים</TabsTrigger>
            {!isGuest && <TabsTrigger value="members">חברים</TabsTrigger>}
            {isAdmin && (
              <TabsTrigger value="requests">
                בקשות{q.data!.requests.length > 0 && ` (${q.data!.requests.length})`}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="events">
            {q.data!.events.length === 0 ? (
              <EmptyState emoji="🗓️" title="אין אירועים קרובים" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {q.data!.events.map((e) => (
                  <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={isGuest} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="members">
            <div className="space-y-2">
              {members
                .sort((a, b) => ["founder", "admin", "member"].indexOf(a.role) - ["founder", "admin", "member"].indexOf(b.role))
                .map((m) => (
                  <div key={m.profile_id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                    <Link to="/profile/$id" params={{ id: m.profile_id }}>
                      <Avatar src={m.profile?.avatar_url} name={m.profile?.name} size={40} />
                    </Link>
                    <p className="flex-1 truncate font-semibold">{m.profile?.name}</p>
                    <Badge variant={m.role === "member" ? "muted" : "teal"}>{ROLE_LABEL[m.role]}</Badge>
                    {me?.role === "founder" && m.role !== "founder" && (
                      <Button size="sm" variant="ghost" onClick={() => void setRole(m.profile_id, m.role === "admin" ? "member" : "admin")}>
                        {m.role === "admin" ? "הסרת ניהול" : "מינוי למנהל/ת"}
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          </TabsContent>
          <TabsContent value="requests">
            {q.data!.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין בקשות ממתינות</p>
            ) : (
              <div className="space-y-2">
                {q.data!.requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                    <Avatar src={r.profile?.avatar_url} name={r.profile?.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.profile?.name}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(r.created_at)}</p>
                    </div>
                    <Button size="sm" onClick={() => void review(r.id, true)}>
                      אישור
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void review(r.id, false)}>
                      דחייה
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-10 flex justify-center gap-2">
          {me && me.role !== "founder" && (
            <Button variant="ghost" size="sm" onClick={() => void leave()}>
              עזיבת הקהילה
            </Button>
          )}
          {me?.role === "founder" && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeCommunity()}>
              <Trash2 /> מחיקת הקהילה
            </Button>
          )}
          {!me && <ReportDialog targetType="community" targetId={c.id} />}
        </div>
      </div>
    </Page>
  );
}
