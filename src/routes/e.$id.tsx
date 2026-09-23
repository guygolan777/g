import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link, Outlet, createFileRoute, useChildMatches, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  Eye,
  MapPin,
  MessageCircle,
  Pencil,
  QrCode,
  Share2,
  Star,
  Ticket,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { CenteredSpinner, EmptyState, Page, Section } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { JoinButton } from "@/components/join-button";
import { ReportDialog } from "@/components/report-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { channelName } from "@/lib/realtime";
import { EVENT_COLUMNS, EVENT_GUEST_COLUMNS, PROFILE_MINI, UNLIMITED_SEATS } from "@/lib/constants";
import { whoComesTitle } from "@/lib/event-title";
import { formatDate, formatEventWhen, formatRelative, formatTime } from "@/lib/format";
import { hobbyLabel } from "@/lib/hobby-categories";
import { eventShareUrl, hapticTap, shareLink, whatsappShareUrl } from "@/lib/native";
import { useBlockedIds, useInvalidateEvents } from "@/lib/queries";
import { getEventOg } from "@/lib/server/og";
import { seo } from "@/lib/seo";
import type { EventRow, ParticipantStatus, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/e/$id")({
  loader: async ({ params }) => {
    try {
      return { og: await getEventOg({ data: params.id }) };
    } catch {
      return { og: null };
    }
  },
  head: ({ loaderData }) => {
    const og = loaderData?.og;
    if (!og) return seo({ title: "אירוע", description: "אירוע ב-mibale — בואו לראות מי בא.", type: "article" });
    return seo({
      title: whoComesTitle(og.title),
      description: `${formatEventWhen(og.starts_at)} · הצטרפו ב-mibale וגלו מי בא.`,
      type: "article",
      image: og.image_url,
    });
  },
  component: EventRoute,
});

type Row = { event_id: string; profile_id: string; status: ParticipantStatus; created_at: string; profile: Pick<Profile, "id" | "name" | "avatar_url"> | null };

function EventRoute() {
  const children = useChildMatches();
  if (children.length) return <Outlet />;
  return <EventPage />;
}

function EventPage() {
  const { id } = Route.useParams();
  const { ready, user, isGuest } = useAuth();

  const eventQ = useQuery({
    queryKey: ["events", id, isGuest],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(isGuest ? EVENT_GUEST_COLUMNS : EVENT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EventRow | null;
    },
  });

  if (!ready || eventQ.isLoading) return <CenteredSpinner />;
  const event = eventQ.data;
  if (!event) {
    return (
      <Page>
        <div className="pt-20">
          <EmptyState emoji="🫥" title="האירוע לא נמצא" text="ייתכן שהוא נמחק או שאין לך גישה אליו" />
        </div>
      </Page>
    );
  }
  if (isGuest || !user) return <GuestEvent event={event} />;
  return <MemberEvent event={event} viewerId={user.id} />;
}

function Hero({ event }: { event: EventRow }) {
  const navigate = useNavigate();
  return (
    <div className="relative -mx-4 aspect-[4/3] bg-muted">
      {event.image_url && <SafeImg src={event.image_url} alt="" className="size-full object-cover" />}
      <button
        onClick={() => (window.history.length > 1 ? window.history.back() : void navigate({ to: "/home" }))}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface/90 shadow-soft backdrop-blur"
        aria-label="חזרה"
      >
        <ChevronRight className="size-6" />
      </button>
    </div>
  );
}

/** Guests see only name, image, date and time. */
function GuestEvent({ event }: { event: EventRow }) {
  return (
    <Page>
      <Hero event={event} />
      <div className="-mt-6 rounded-t-3xl bg-background pt-5">
        <Badge variant="event">{hobbyLabel(event.subcategory ?? event.category)}</Badge>
        <h1 className="mt-2 text-2xl font-bold">{whoComesTitle(event.title)}</h1>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatDate(event.starts_at, { weekday: "long", day: "numeric", month: "long" })} · {formatTime(event.starts_at)}
        </p>
        <div className="mt-8 rounded-2xl bg-primary-soft p-5 text-center">
          <p className="font-bold">רוצים לדעת איפה, מי בא ולהצטרף?</p>
          <p className="mt-1 text-sm text-muted-foreground">מיקום, תיאור, משתתפים וצ׳אט זמינים לחברי mibale</p>
          <Button asChild variant="brand" size="lg" className="mt-4 w-full">
            <Link to="/signup">הרשמה והצטרפות</Link>
          </Button>
          <Button asChild variant="ghost" className="mt-1 w-full">
            <Link to="/login">כבר יש לי חשבון</Link>
          </Button>
        </div>
      </div>
    </Page>
  );
}

function MemberEvent({ event, viewerId }: { event: EventRow; viewerId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const invalidate = useInvalidateEvents();
  const { data: blocked } = useBlockedIds();
  const isOrganizer = event.organizer_id === viewerId;

  const parts = useQuery({
    queryKey: ["event-participants", event.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_participants")
        .select(`event_id, profile_id, status, created_at, profile:profiles(${PROFILE_MINI})`)
        .eq("event_id", event.id)
        .order("created_at");
      return (data ?? []) as unknown as Row[];
    },
  });

  const organizer = useQuery({
    queryKey: ["profile-mini", event.organizer_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(PROFILE_MINI).eq("id", event.organizer_id!).maybeSingle();
      return data as Pick<Profile, "id" | "name" | "avatar_url"> | null;
    },
  });

  const myRow = parts.data?.find((p) => p.profile_id === viewerId);
  const myStatus = isOrganizer ? "approved" : myRow?.status;
  const approved = (parts.data ?? []).filter((p) => p.status === "approved" && !blocked?.has(p.profile_id));
  const pending = (parts.data ?? []).filter((p) => p.status === "pending");
  const count = Math.max(1, approved.length);
  const seats = event.seats ?? UNLIMITED_SEATS;

  const meeting = useQuery({
    queryKey: ["meeting-url", event.id, myStatus],
    enabled: !!event.is_online && myStatus === "approved",
    queryFn: async () => (await supabase.rpc("event_meeting_url", { _event_id: event.id })).data as string | null,
  });

  const saved = useQuery({
    queryKey: ["saved", event.id, viewerId],
    queryFn: async () => {
      const { data } = await supabase.from("event_saves").select("event_id").eq("event_id", event.id).eq("profile_id", viewerId).maybeSingle();
      return !!data;
    },
  });

  const views = useQuery({
    queryKey: ["event-views", event.id],
    enabled: isOrganizer,
    queryFn: async () => {
      const { count } = await supabase.from("event_views").select("viewer_id", { count: "exact", head: true }).eq("event_id", event.id);
      return count ?? 0;
    },
  });

  // Record my view (visible only to me and the organizer).
  React.useEffect(() => {
    void supabase.from("event_views").upsert({ event_id: event.id, viewer_id: viewerId, viewed_at: new Date().toISOString() });
  }, [event.id, viewerId]);

  // Realtime join requests / approvals for this event.
  React.useEffect(() => {
    const ch = supabase
      .channel(channelName(`event-${event.id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "event_participants", filter: `event_id=eq.${event.id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["event-participants", event.id] });
        invalidate();
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [event.id, qc, invalidate]);

  async function toggleSave() {
    const isSaved = saved.data;
    const { error } = isSaved
      ? await supabase.from("event_saves").delete().eq("event_id", event.id).eq("profile_id", viewerId)
      : await supabase.from("event_saves").insert({ event_id: event.id, profile_id: viewerId });
    if (error) return void toast.error("הפעולה נכשלה");
    void hapticTap();
    toast.success(isSaved ? "הוסר מהשמורים" : "נשמר ⭐");
    void qc.invalidateQueries({ queryKey: ["saved"] });
  }

  async function leave() {
    if (!confirm("לעזוב את האירוע?")) return;
    const { error } = await supabase.from("event_participants").delete().eq("event_id", event.id).eq("profile_id", viewerId);
    if (error) return void toast.error("לא הצלחנו להסיר אותך");
    toast.success("עזבת את האירוע");
    void qc.invalidateQueries({ queryKey: ["event-participants", event.id] });
    invalidate();
  }

  async function review(profileId: string, approve: boolean) {
    const { error } = await supabase.rpc("review_event_join", { _event_id: event.id, _profile_id: profileId, _approve: approve });
    if (error) return void toast.error(error.message.includes("full") ? "האירוע מלא" : "הפעולה נכשלה");
    if (approve) void hapticTap("success");
    toast.success(approve ? "אושר/ה ✔" : "הבקשה נדחתה");
    void qc.invalidateQueries({ queryKey: ["event-participants", event.id] });
    void qc.invalidateQueries({ queryKey: ["pending-requests"] });
  }

  async function remove() {
    const scope = event.recurrence && event.recurrence !== "none" && !event.recurrence_parent_id ? " (כולל כל המופעים החוזרים)" : "";
    if (!confirm(`למחוק את האירוע${scope}?`)) return;
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    if (error) return void toast.error("המחיקה נכשלה");
    toast.success("האירוע נמחק");
    invalidate();
    void navigate({ to: "/home", replace: true });
  }

  const shareTitle = whoComesTitle(event.title);
  const url = eventShareUrl(event.id);
  const ended = event.ends_at ? new Date(event.ends_at) < new Date() : false;

  return (
    <Page>
      <Hero event={event} />
      <div className="relative -mt-6 rounded-t-3xl bg-background pt-5">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="event">{hobbyLabel(event.subcategory ?? event.category)}</Badge>
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => void toggleSave()} aria-label="שמירה">
              <Bookmark className={cn(saved.data && "fill-primary text-primary")} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => void shareLink({ title: shareTitle, text: `${shareTitle} · ${formatEventWhen(event.starts_at)}`, url })} aria-label="שיתוף">
              <Share2 />
            </Button>
          </div>
        </div>
        <h1 className="mt-2 text-2xl leading-tight font-bold">{whoComesTitle(event.title)}</h1>

        <div className="mt-4 space-y-3 rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-event-soft text-event">
              <CalendarDays className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">{formatDate(event.starts_at, { weekday: "long", day: "numeric", month: "long" })}</span>
              <span className="text-sm text-muted-foreground">
                {formatTime(event.starts_at)}
                {event.ends_at && ` – ${formatTime(event.ends_at)}`}
                {event.recurrence && event.recurrence !== "none" && " · אירוע חוזר"}
              </span>
            </span>
          </p>
          {event.is_online ? (
            <p className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-violet-soft text-violet">
                <Video className="size-4" />
              </span>
              {myStatus === "approved" && meeting.data ? (
                <a href={meeting.data} target="_blank" rel="noreferrer" className="font-semibold text-primary underline" dir="ltr">
                  הצטרפות למפגש
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">אירוע אונליין — הקישור יוצג אחרי אישור</span>
              )}
            </p>
          ) : (
            <a
              className="flex items-center gap-3"
              href={
                event.lat != null
                  ? `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.location_name, event.city].filter(Boolean).join(", "))}`
              }
              target="_blank"
              rel="noreferrer"
            >
              <span className="grid size-9 place-items-center rounded-full bg-teal-soft text-teal">
                <MapPin className="size-4" />
              </span>
              <span>
                <span className="block font-semibold">{event.location_name}</span>
                {event.city && <span className="text-sm text-muted-foreground">{event.city}</span>}
              </span>
            </a>
          )}
          <p className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-partner-soft text-partner-strong">
              <Users className="size-4" />
            </span>
            <span className="text-sm">
              <b>{count}</b> משתתפים
              {seats < UNLIMITED_SEATS && ` מתוך ${seats}`}
              {!event.auto_approve && " · באישור המארגן"}
            </span>
          </p>
        </div>

        {/* Primary action */}
        <div className="mt-4 space-y-2">
          {isOrganizer ? (
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="soft">
                <Link to="/e/$id/edit" params={{ id: event.id }}>
                  <Pencil /> עריכה
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/scan/$id" params={{ id: event.id }}>
                  <QrCode /> סריקה
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/chat/$id" params={{ id: event.id }} search={{ kind: "event" }}>
                  <MessageCircle /> צ׳אט
                </Link>
              </Button>
            </div>
          ) : (
            !ended && <JoinButton event={event} status={myStatus === "declined" ? undefined : myStatus} size="lg" />
          )}
          {!isOrganizer && myStatus === "approved" && (
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link to="/ticket/$id" params={{ id: event.id }}>
                  <Ticket /> הכרטיס שלי
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/chat/$id" params={{ id: event.id }} search={{ kind: "event" }}>
                  <MessageCircle /> צ׳אט האירוע
                </Link>
              </Button>
            </div>
          )}
          <div className="flex items-center justify-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <a href={whatsappShareUrl(`${shareTitle} · ${formatEventWhen(event.starts_at)}`, url)} target="_blank" rel="noreferrer">
                שיתוף בוואטסאפ
              </a>
            </Button>
            {!isOrganizer && (myStatus === "approved" || myStatus === "pending") && (
              <Button variant="ghost" size="sm" onClick={() => void leave()}>
                {myStatus === "pending" ? "ביטול בקשה" : "עזיבת האירוע"}
              </Button>
            )}
            {!isOrganizer && <ReportDialog targetType="event" targetId={event.id} />}
          </div>
        </div>

        {isOrganizer && (
          <Section
            title={
              <span className="flex items-center gap-2">
                בקשות הצטרפות
                {pending.length > 0 && <Badge variant="partner">{pending.length}</Badge>}
              </span>
            }
            action={
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="size-3.5" /> {views.data ?? 0} צפיות
              </span>
            }
          >
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין בקשות ממתינות</p>
            ) : (
              <div className="space-y-2">
                {pending.map((p) => (
                  <div key={p.profile_id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                    <Link to="/profile/$id" params={{ id: p.profile_id }}>
                      <Avatar src={p.profile?.avatar_url} name={p.profile?.name} size={42} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.profile?.name}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(p.created_at)}</p>
                    </div>
                    <Button size="sm" onClick={() => void review(p.profile_id, true)}>
                      אישור
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void review(p.profile_id, false)}>
                      דחייה
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {event.description && (
          <Section title="על האירוע">
            <p className="leading-relaxed whitespace-pre-line text-foreground/90">{event.description}</p>
          </Section>
        )}

        <Section title="מארגן/ת">
          {organizer.data && (
            <Link to="/profile/$id" params={{ id: organizer.data.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <Avatar src={organizer.data.avatar_url} name={organizer.data.name} size={44} />
              <span className="font-semibold">{organizer.data.name}</span>
            </Link>
          )}
        </Section>

        <Section title={`מי בא (${count})`}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 scrollbar-none">
            {approved.map((p) => (
              <Link key={p.profile_id} to="/profile/$id" params={{ id: p.profile_id }} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <Avatar src={p.profile?.avatar_url} name={p.profile?.name} size={56} />
                <span className="w-full truncate text-center text-xs">
                  {p.profile_id === event.organizer_id ? "מארגן/ת" : p.profile?.name?.split(" ")[0]}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Reviews event={event} viewerId={viewerId} canReview={!isOrganizer && myStatus === "approved" && new Date(event.starts_at) < new Date()} />

        {event.recurrence && event.recurrence !== "none" && <Occurrences event={event} />}

        <div className="mt-10 flex justify-center">
          {isOrganizer && (
            <Button variant="ghost" className="text-destructive" onClick={() => void remove()}>
              <Trash2 /> מחיקת האירוע
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}

function Occurrences({ event }: { event: EventRow }) {
  const parentId = event.recurrence_parent_id ?? event.id;
  const q = useQuery({
    queryKey: ["occurrences", parentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, starts_at")
        .or(`id.eq.${parentId},recurrence_parent_id.eq.${parentId}`)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(8);
      return (data ?? []) as Array<{ id: string; starts_at: string }>;
    },
  });
  if (!q.data || q.data.length < 2) return null;
  return (
    <Section title="מופעים הבאים">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {q.data.map((o) => (
          <Link
            key={o.id}
            to="/e/$id"
            params={{ id: o.id }}
            className={cn("shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold", o.id === event.id ? "bg-primary text-primary-foreground" : "bg-surface shadow-soft")}
          >
            {formatDate(o.starts_at, { weekday: "short", day: "numeric", month: "short" })}
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Reviews({ event, viewerId, canReview }: { event: EventRow; viewerId: string; canReview: boolean }) {
  const qc = useQueryClient();
  const [rating, setRating] = React.useState(5);
  const [body, setBody] = React.useState("");
  const q = useQuery({
    queryKey: ["reviews", event.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_reviews")
        .select(`id, rating, body, created_at, profile_id, profile:profiles(${PROFILE_MINI})`)
        .eq("event_id", event.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Array<{ id: string; rating: number; body: string; created_at: string; profile_id: string; profile: Profile | null }>;
    },
  });
  const reviews = q.data ?? [];
  const mine = reviews.find((r) => r.profile_id === viewerId);
  if (!reviews.length && !canReview) return null;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return (
    <Section title={reviews.length ? `ביקורות · ${avg.toFixed(1)} ⭐` : "ביקורות"}>
      {canReview && !mine && (
        <div className="mb-3 rounded-2xl bg-surface p-4 shadow-soft">
          <div className="flex gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n} כוכבים`}>
                <Star className={cn("size-7", n <= rating ? "fill-partner text-partner" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea className="mt-2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="איך היה?" />
          <Button
            className="mt-2 w-full"
            onClick={async () => {
              const { error } = await supabase.from("event_reviews").insert({ event_id: event.id, profile_id: viewerId, rating, body });
              if (error) return void toast.error("השמירה נכשלה");
              toast.success("תודה על הביקורת!");
              void qc.invalidateQueries({ queryKey: ["reviews", event.id] });
            }}
          >
            פרסום ביקורת
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-2xl bg-card p-3 shadow-soft">
            <div className="flex items-center gap-2">
              <Avatar src={r.profile?.avatar_url} name={r.profile?.name} size={28} />
              <span className="text-sm font-semibold">{r.profile?.name}</span>
              <span className="ms-auto text-sm">{"⭐".repeat(r.rating)}</span>
            </div>
            {r.body && <p className="mt-2 text-sm">{r.body}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}
