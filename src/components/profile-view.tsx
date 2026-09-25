import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Heart, Pause, Pencil, Play, Volume2, VolumeX } from "lucide-react";
import { Section, EmptyState } from "@/components/app-shell";
import { CommunityCard, useCommunityEventCounts, useCommunityMembership } from "@/components/communities-browser";
import { PrefsSheet } from "@/components/dating-prefs";
import { PersonCard } from "@/components/person-row";
import { SafeImg } from "@/components/safe-img";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS, PROFILE_COLUMNS, PROFILE_VIEW } from "@/lib/constants";
import { useBlockedIds, useMyCommunities } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { ageFromBirthYear, formatDate, formatTime } from "@/lib/format";
import { hobbyLabel, hobbyToneClass } from "@/lib/hobby-categories";
import { getTrait, traitToneClass } from "@/lib/traits";
import { whoComesTitle } from "@/lib/event-title";
import { hapticTap } from "@/lib/native";
import type { EventRow, ParticipantStatus, Profile } from "@/lib/types";
import { VIDEO_POSTER, cn, isVideoUrl, videoFrameSrc } from "@/lib/utils";

type EventFilter = "all" | "organizer" | "participant" | "pending";
type Role = "organizer" | "participant" | "pending";
type ProfileEvent = { event: EventRow; role: Role; pendingRequests: number };


/** Followers / following for a profile. */
export function useProfileGraph(profileId: string) {
  const { data: blocked } = useBlockedIds();
  const q = useQuery({
    queryKey: ["profile-graph", profileId],
    queryFn: async () => {
      // Approved follows only (pending requests aren't followers yet); profiles through the view.
      const [a, b] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", profileId).eq("approved", true),
        supabase.from("follows").select("follower_id").eq("following_id", profileId).eq("approved", true),
      ]);
      const followingIds = (a.data ?? []).map((r) => r.following_id as string);
      const followerIds = (b.data ?? []).map((r) => r.follower_id as string);
      const all = [...new Set([...followingIds, ...followerIds])];
      const { data: ps } = all.length ? await supabase.from(PROFILE_VIEW).select(PROFILE_COLUMNS).in("id", all) : { data: [] };
      const byId = new Map(((ps ?? []) as Profile[]).map((p) => [p.id, p]));
      return {
        following: followingIds.flatMap((id) => byId.get(id) ?? []),
        followers: followerIds.flatMap((id) => byId.get(id) ?? []),
      };
    },
  });
  const bl = blocked ?? new Set<string>();
  return {
    following: withoutBlocked(q.data?.following ?? [], bl, (p) => p.id),
    followers: withoutBlocked(q.data?.followers ?? [], bl, (p) => p.id),
    isLoading: q.isLoading,
  };
}

/** Upcoming + past events of a profile; an event I opened appears exactly once — as organizer. */
function useProfileEvents(profileId: string, isMe: boolean) {
  return useQuery({
    queryKey: ["profile-events", profileId, isMe],
    queryFn: async () => {
      let q = supabase.from("event_participants").select(`status, event:events(${EVENT_COLUMNS})`).eq("profile_id", profileId);
      if (!isMe) q = q.eq("status", "approved");
      const { data } = await q;
      const rows = ((data ?? []) as unknown as Array<{ status: ParticipantStatus; event: EventRow | null }>).filter(
        (r) => r.event && r.status !== "declined",
      );
      const organizedIds = rows.filter((r) => r.event!.organizer_id === profileId).map((r) => r.event!.id);
      const pendingByEvent = new Map<string, number>();
      if (isMe && organizedIds.length) {
        const { data: pend } = await supabase.from("event_participants").select("event_id").in("event_id", organizedIds).eq("status", "pending");
        for (const p of (pend ?? []) as Array<{ event_id: string }>) pendingByEvent.set(p.event_id, (pendingByEvent.get(p.event_id) ?? 0) + 1);
      }
      const byId = new Map<string, ProfileEvent>();
      for (const r of rows) {
        const e = r.event!;
        const role: Role = e.organizer_id === profileId ? "organizer" : r.status === "pending" ? "pending" : "participant";
        if (!byId.has(e.id) || role === "organizer") byId.set(e.id, { event: e, role, pendingRequests: pendingByEvent.get(e.id) ?? 0 });
      }
      const now = new Date().toISOString();
      const all = [...byId.values()];
      return {
        upcoming: all.filter((x) => (x.event.ends_at ?? x.event.starts_at) >= now).sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at)),
        past: all
          .filter((x) => (x.event.ends_at ?? x.event.starts_at) < now && x.role !== "pending")
          .sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at)),
      };
    },
  });
}

/** Photo/video carousel card with arrows, dots, and (on my profile) edit + dating toggle. */
function MediaCard({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const { refreshProfile, settings } = useAuth();
  const qc = useQueryClient();
  const [askPrefs, setAskPrefs] = React.useState(false);
  const media = profile.photos?.length ? profile.photos : profile.avatar_url ? [profile.avatar_url] : [];
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [muted, setMuted] = React.useState(true);
  const [progress, setProgress] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [dating, setDating] = React.useState(!!profile.dating_enabled);
  React.useEffect(() => setDating(!!profile.dating_enabled), [profile.dating_enabled]);
  const current = media[idx];
  const age = ageFromBirthYear(profile.birth_year);
  // Finger swipe between items. RTL: "next" sits on the left, so dragging right brings the next one in.
  const touch = React.useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || media.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    go(dx > 0 ? 1 : -1);
  };
  const go = (d: number) => {
    if (!media.length) return;
    setIdx((i) => (i + d + media.length) % media.length);
    setPlaying(true);
    setProgress(0);
  };

  async function toggleDating(on: boolean) {
    // First time: ask for romantic preferences; saving them is what opens the heart.
    if (on && !settings?.dating_prefs_at) return void setAskPrefs(true);
    setDating(on);
    const { error } = await supabase.from("profiles").update({ dating_enabled: on }).eq("id", profile.id);
    if (error) {
      setDating(!on);
      return void toast.error("השמירה נכשלה");
    }
    if (on) void hapticTap("success");
    toast.success(on ? "מצב היכרויות פתוח" : "מצב היכרויות סגור");
    await refreshProfile();
    void qc.invalidateQueries({ queryKey: ["dating-candidates"] });
  }

  return (
    <>
    <div
      className="relative aspect-[4/5] touch-pan-y overflow-hidden rounded-[2rem] bg-surface-soft shadow-lift select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {!current && <div className="grid size-full place-items-center text-7xl">🙂</div>}
      {current && isVideoUrl(current) ? (
        <video
          ref={videoRef}
          key={current}
          src={videoFrameSrc(current)}
          poster={VIDEO_POSTER}
          autoPlay
          loop
          playsInline
          muted={muted}
          className="size-full object-cover"
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        />
      ) : (
        current && <SafeImg key={current} src={current} className="size-full object-cover" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-scrim" />

      {isMe && (
        <Link to="/me/edit" className="absolute top-4 left-4 grid size-14 place-items-center rounded-full bg-surface shadow-soft" aria-label="עריכת פרופיל">
          <Pencil className="size-6" />
        </Link>
      )}
      {media.length > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/30 text-scrim-foreground backdrop-blur" aria-label="הקודם">
            <ChevronRight className="size-6" />
          </button>
          <button onClick={() => go(1)} className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/30 text-scrim-foreground backdrop-blur" aria-label="הבא">
            <ChevronLeft className="size-6" />
          </button>
        </>
      )}
      {current && isVideoUrl(current) && (
        <button
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
            setPlaying(!v.paused);
          }}
          className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow-soft"
          aria-label={playing ? "השהיה" : "ניגון"}
        >
          {playing ? <Pause className="size-9 fill-current" /> : <Play className="size-9 fill-current" />}
        </button>
      )}

      <div className="absolute right-6 bottom-12 text-scrim-foreground">
        <p className="text-3xl font-extrabold">{profile.name}</p>
        <p className="text-lg opacity-90">{[age, profile.city].filter(Boolean).join(", ")}</p>
      </div>
      {current && isVideoUrl(current) && (
        <button onClick={() => setMuted(!muted)} className="absolute bottom-12 left-1/2 text-scrim-foreground" aria-label={muted ? "הפעלת קול" : "השתקה"}>
          {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
        </button>
      )}
      {isMe && (
        <div className="absolute bottom-10 left-5 flex items-center gap-3">
          <button
            onClick={() => void toggleDating(!dating)}
            className={cn("grid size-14 place-items-center rounded-full shadow-soft", dating ? "bg-like text-like-foreground" : "bg-surface/40 text-scrim-foreground backdrop-blur")}
            aria-label="מצב היכרויות"
          >
            <Heart className={cn("size-7", dating && "fill-current")} />
          </button>
          <Switch checked={dating} onCheckedChange={(c) => void toggleDating(c)} aria-label="מצב היכרויות" className="h-8 w-14 [&>span]:size-7 data-[state=checked]:[&>span]:translate-x-6" />
        </div>
      )}

      <div className="absolute inset-x-6 bottom-4 flex items-center gap-3">
        {current && isVideoUrl(current) && (
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-scrim-foreground/30" dir="ltr">
            <div className="h-full bg-scrim-foreground" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {media.length > 1 && (
          <div className="mx-auto flex gap-1.5">
            {media.map((_, i) => (
              <span key={i} className={cn("size-2.5 rounded-full", i === idx ? "bg-scrim-foreground" : "bg-scrim-foreground/40")} />
            ))}
          </div>
        )}
      </div>
    </div>
      {/* Outside the card: portal events still bubble through React, and the card swipes on touch. */}
      {isMe && (
        <PrefsSheet
          open={askPrefs}
          onOpenChange={setAskPrefs}
          enableDating
          onSaved={() => {
            setDating(true);
            void hapticTap("success");
            toast.success("מצב היכרויות פתוח 💘");
          }}
        />
      )}
    </>
  );
}

const ROLE_TAG: Record<Role, { label: string; cls: string }> = {
  organizer: { label: "מארגן", cls: "bg-event-soft text-event" },
  participant: { label: "משתתף", cls: "bg-success-soft text-success" },
  pending: { label: "ממתין", cls: "bg-muted text-muted-foreground" },
};

function ProfileEventCard({ item, isMe }: { item: ProfileEvent; isMe: boolean }) {
  const { event, role, pendingRequests } = item;
  const tag = ROLE_TAG[role];
  return (
    <Link to="/e/$id" params={{ id: event.id }} className="flex h-full flex-col gap-2 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-event-soft text-primary">
          <CalendarDays className="size-6" />
        </span>
        <p className="line-clamp-1 text-lg font-bold">{whoComesTitle(event.title)}</p>
      </div>
      <p className="truncate text-sm text-muted-foreground">
        {formatDate(event.starts_at, { weekday: "short" })}, {formatDate(event.starts_at, { day: "2-digit", month: "2-digit" })}, {formatTime(event.starts_at)}
        {event.is_online ? " · אונליין" : event.city ? ` · ${event.city}` : event.location_name ? ` · ${event.location_name}` : ""}
      </p>
      <div className="mt-auto flex items-center gap-2">
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", tag.cls)}>{tag.label}</span>
        {isMe && pendingRequests > 0 && <span className="rounded-full bg-like-soft px-3 py-1 text-sm font-semibold text-like">{pendingRequests} בקשות</span>}
      </div>
    </Link>
  );
}

function CountPill({ n }: { n: number }) {
  return <span className="grid h-7 min-w-7 place-items-center rounded-full bg-surface-soft px-2 text-sm font-bold text-muted-foreground">{n}</span>;
}

function Rail({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none" dir="rtl">
      {children.map((c, i) => (
        <div key={i} className="w-[72vw] max-w-[270px] shrink-0 snap-start">
          {c}
        </div>
      ))}
    </div>
  );
}

export function ProfileView({
  profile,
  isMe,
  actions,
  initialFilter,
}: {
  profile: Profile;
  isMe: boolean;
  actions?: React.ReactNode;
  initialFilter?: EventFilter;
}) {
  // Private profile I'm not approved for: name, main photo and age only.
  const locked = !isMe && !!profile.is_private && !profile.full_access;
  const graph = useProfileGraph(profile.id);
  // Counts include people whose own profile is private (hidden from the lists).
  const followCounts = useQuery({
    queryKey: ["follow-counts", profile.id],
    enabled: !locked,
    queryFn: async () => {
      const { data } = await supabase.rpc("follow_counts", { _id: profile.id });
      return ((data ?? [])[0] as { followers: number; following: number } | undefined) ?? null;
    },
  });
  const events = useProfileEvents(profile.id, isMe);
  const { data: communities = [] } = useMyCommunities(profile.id);
  const { data: counts = new Map<string, number>() } = useCommunityEventCounts();
  const membership = useCommunityMembership();
  const [filter, setFilter] = React.useState<EventFilter>(initialFilter ?? "all");
  const followersRef = React.useRef<HTMLDivElement>(null);
  const followingRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);

  const upcoming = events.data?.upcoming ?? [];
  const past = events.data?.past ?? [];
  const pendingCount = upcoming.reduce((n, e) => n + e.pendingRequests + (e.role === "pending" ? 1 : 0), 0);
  const shown = upcoming.filter((e) =>
    filter === "all"
      ? e.role !== "pending" || isMe
      : filter === "organizer"
        ? e.role === "organizer"
        : filter === "participant"
          ? e.role === "participant"
          : e.role === "pending" || e.pendingRequests > 0,
  );

  const stat = (n: number, label: string, onClick?: () => void) => (
    <button onClick={onClick} className="flex flex-1 flex-col items-center py-2">
      <span className="text-3xl font-extrabold">{n}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </button>
  );
  const chip = (v: EventFilter, label: React.ReactNode) => (
    <button
      onClick={() => setFilter(v)}
      className={cn(
        "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
        filter === v ? "bg-gradient-brand text-brand-foreground" : "bg-surface-soft text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
  const editLink = isMe ? (
    <Link to="/me/edit" className="text-sm font-semibold text-primary">
      שינוי
    </Link>
  ) : undefined;

  if (locked) {
    return (
      <div className="mx-auto max-w-md">
        <MediaCard profile={profile} isMe={false} />
        {actions && <div className="mt-3">{actions}</div>}
        <div className="mt-6 flex flex-col items-center rounded-3xl bg-surface-soft px-6 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-surface text-2xl">🔒</span>
          <p className="mt-3 text-lg font-bold">הפרופיל פרטי</p>
          <p className="mt-1 text-sm text-muted-foreground">שלחו בקשת מעקב — אחרי אישור יוצגו התמונות, האירועים והקהילות.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-4">
      <MediaCard profile={profile} isMe={isMe} />

      <div className="mt-4 flex">
        {stat(upcoming.filter((e) => e.role !== "pending").length + past.length, "אירועים")}
        {stat(communities.length, "קהילות")}
        {stat(followCounts.data?.followers ?? graph.followers.length, "עוקבים", () => followersRef.current?.scrollIntoView({ behavior: "smooth" }))}
        {stat(followCounts.data?.following ?? graph.following.length, "עוקב/ת", () => followingRef.current?.scrollIntoView({ behavior: "smooth" }))}
      </div>
      {actions && <div className="mt-3">{actions}</div>}
      </div>

      <div className="min-w-0 lg:[&>section:first-child]:mt-0">
      {/* Upcoming events: filters and the calendar link on the same row */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="shrink-0 text-lg font-bold">אירועים עתידיים</h2>
          <CountPill n={upcoming.filter((e) => e.role !== "pending" || isMe).length} />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
            {chip("all", "הכל")}
            {chip("organizer", "כמארגן")}
            {chip("participant", "כמשתתף")}
            {isMe &&
              chip(
                "pending",
                <>
                  ממתינים{pendingCount > 0 && <span className="ms-1 rounded-full bg-partner px-1.5 text-xs text-partner-foreground">{pendingCount}</span>}
                </>,
              )}
          </div>
          {isMe && (
            <Link to="/calendar" className="shrink-0 text-sm font-semibold text-primary">
              ליומן
            </Link>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין אירועים להצגה</p>
        ) : (
          <Rail>{shown.map((e) => <ProfileEventCard key={e.event.id} item={e} isMe={isMe} />)}</Rail>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold">אירועים שעברו</h2>
            <CountPill n={past.length} />
          </div>
          <Rail>{past.map((e) => <ProfileEventCard key={e.event.id} item={e} isMe={isMe} />)}</Rail>
        </section>
      )}

      {communities.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold">{isMe ? "הקהילות שלי" : "קהילות"}</h2>
            <CountPill n={communities.length} />
            <Link to="/home" search={{ tab: "communities" }} className="ms-auto text-sm font-semibold text-primary">
              לכל הקהילות
            </Link>
          </div>
          <Rail>
            {communities.map(({ community, role }) => (
              <CommunityCard
                key={community!.id}
                community={community!}
                eventCount={counts.get(community!.id) ?? 0}
                role={role}
                members={membership.data?.counts.get(community!.id)}
              />
            ))}
          </Rail>
        </section>
      )}

      <div ref={followingRef} className="scroll-mt-20">
        <PeopleCarousel title="עוקב/ת אחרי" people={graph.following} />
      </div>
      <div ref={followersRef} className="scroll-mt-20">
        <PeopleCarousel title="עוקבים" people={graph.followers} />
      </div>

      {profile.bio && (
        <Section title="קצת עליי">
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{profile.bio}</p>
        </Section>
      )}

      {(profile.hobbies?.length ?? 0) > 0 && (
        <Section title="תחומי עניין" action={editLink}>
          <div className="flex flex-wrap gap-2">
            {profile.hobbies?.map((h) => (
              <span key={h} className={cn("rounded-full px-4 py-2 text-sm font-semibold", hobbyToneClass(h))}>
                {hobbyLabel(h, false)}
              </span>
            ))}
          </div>
        </Section>
      )}

      {(profile.traits?.length ?? 0) > 0 && (
        <Section title="מאפיינים אישיים" action={editLink}>
          <div className="flex flex-wrap gap-2">
            {profile.traits?.map((t) => {
              const tr = getTrait(t);
              return tr ? (
                <span key={t} className={cn("rounded-full px-4 py-2 text-sm font-semibold", traitToneClass(t))}>
                  {tr.label}
                </span>
              ) : null;
            })}
          </div>
        </Section>
      )}
      </div>
    </div>
  );
}

function PeopleCarousel({ title, people }: { title: string; people: Profile[] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <CountPill n={people.length} />
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">עדיין אין</p>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none" dir="rtl">
          {people.map((p) => (
            <PersonCard key={p.id} person={p} className="w-40 shrink-0" />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProfileUnavailable({ text }: { text: string }) {
  return (
    <div className="pt-20">
      <EmptyState emoji="🚫" title="הפרופיל אינו זמין" text={text} />
    </div>
  );
}
