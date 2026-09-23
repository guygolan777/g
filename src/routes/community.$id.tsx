import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, MapPin, MessageCircle, Share2, Trash2, Users } from "lucide-react";
import { CenteredSpinner, EmptyState, Page, PageHeader, Section } from "@/components/app-shell";
import { CommunityThumb, joinCommunity } from "@/components/communities-browser";
import { Avatar } from "@/components/avatar";
import { ReportDialog } from "@/components/report-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS, EVENT_GUEST_COLUMNS, PROFILE_MINI, SITE_URL } from "@/lib/constants";
import { hobbyLabel } from "@/lib/hobby-categories";
import { formatDate, formatRelative, formatTime } from "@/lib/format";
import { whoComesTitle } from "@/lib/event-title";
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
    void qc.invalidateQueries({ queryKey: ["community-membership"] });
  };

  async function join() {
    if (!user) return void navigate({ to: "/signup" });
    if (await joinCommunity(id)) refresh();
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

  const upcoming = q.data!.events;
  return (
    <Page>
      <PageHeader title="קהילה" back />
      <div className="rounded-3xl bg-card p-6 text-center shadow-soft">
        <CommunityThumb community={c} className="mx-auto size-32 rounded-3xl" />
        <h1 className="mt-4 text-2xl font-bold">{c.name}</h1>
        <p className="font-semibold text-primary">{hobbyLabel(c.hobby, false)}</p>
        {c.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{c.description}</p>}
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-muted-foreground">
          {!isGuest && (
            <>
              <Users className="size-4" /> {members.length} חברים
            </>
          )}
          {c.city && (
            <>
              {!isGuest && " · "}
              <MapPin className="size-4" /> {c.city}
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {c.audience_gender !== "all" && <Badge variant="violet">{AUDIENCE[c.audience_gender]}</Badge>}
          {(c.min_age > 18 || c.max_age < 99) && (
            <Badge variant="muted">
              גילאי {c.min_age}–{c.max_age}
            </Badge>
          )}
          {!c.auto_approve && <Badge variant="partner">באישור מנהלים</Badge>}
        </div>

        <div className="mt-5 space-y-3">
          {me ? (
            <>
              <Button
                variant="secondary"
                size="lg"
                className="w-full shadow-soft"
                disabled={me.role === "founder"}
                onClick={() => void leave()}
              >
                {me.role === "founder" ? "את/ה מייסד/ת הקהילה" : "הצטרפתי — עזיבה"}
              </Button>
              <Button asChild variant="brand" size="lg" className="w-full">
                <Link to="/event/new" search={{ community: id }}>
                  <CalendarPlus /> פתיחת אירוע לקהילה
                </Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/chat/$id" params={{ id }} search={{ kind: "community" }}>
                  <MessageCircle /> צ׳אט הקהילה
                </Link>
              </Button>
            </>
          ) : q.data!.myRequest === "pending" ? (
            <Button variant="secondary" size="lg" className="w-full" disabled>
              הבקשה ממתינה לאישור
            </Button>
          ) : (
            <Button variant="brand" size="lg" className="w-full" onClick={() => void join()}>
              {c.auto_approve ? "הצטרפות לקהילה" : "בקשת הצטרפות"}
            </Button>
          )}
        </div>
      </div>

      <Section title="פעילות קרובה בקהילה">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין אירועים קרובים</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <Link key={e.id} to="/e/$id" params={{ id: e.id }} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-4 shadow-soft">
                <span className="truncate font-semibold">{whoComesTitle(e.title)}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{formatDate(e.starts_at, { weekday: "short", day: "2-digit", month: "2-digit" })}, {formatTime(e.starts_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {isAdmin && q.data!.requests.length > 0 && (
        <Section title={`בקשות הצטרפות (${q.data!.requests.length})`}>
          <div className="space-y-2">
            {q.data!.requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                <Avatar src={r.profile?.avatar_url} name={r.profile?.name} size={44} />
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
        </Section>
      )}

      {!isGuest && (
        <Section title="חברי הקהילה">
          <div className="space-y-2">
            {[...members]
              .sort((a, b) => ["founder", "admin", "member"].indexOf(a.role) - ["founder", "admin", "member"].indexOf(b.role))
              .map((m) => (
                <div key={m.profile_id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                  <Link to="/profile/$id" params={{ id: m.profile_id }}>
                    <Avatar src={m.profile?.avatar_url} name={m.profile?.name} size={52} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{m.profile?.name}</p>
                    <p className="text-sm text-muted-foreground">{ROLE_LABEL[m.role]}</p>
                  </div>
                  {me?.role === "founder" && m.role !== "founder" && (
                    <Button size="sm" variant="ghost" onClick={() => void setRole(m.profile_id, m.role === "admin" ? "member" : "admin")}>
                      {m.role === "admin" ? "הסרת ניהול" : "מינוי למנהל/ת"}
                    </Button>
                  )}
                </div>
              ))}
          </div>
        </Section>
      )}

      <div className="mt-10 flex justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => void shareLink({ title: c.name, url: `${SITE_URL}/community/${c.id}` })}>
          <Share2 /> שיתוף
        </Button>
        {me?.role === "founder" && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeCommunity()}>
            <Trash2 /> מחיקת הקהילה
          </Button>
        )}
        {!me && <ReportDialog targetType="community" targetId={c.id} />}
      </div>
    </Page>
  );
}
