import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { Section, EmptyState } from "@/components/app-shell";
import { PhotoCarousel } from "@/components/pickers";
import { CommunityCard, useCommunityEventCounts } from "@/components/communities-browser";
import { PersonCard } from "@/components/person-row";
import { Chip, ChipRow, Tag } from "@/components/chip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS, PROFILE_COLUMNS } from "@/lib/constants";
import { useBlockedIds, useMyCommunities } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { ageFromBirthYear, formatEventWhen } from "@/lib/format";
import { hobbyLabel } from "@/lib/hobby-categories";
import { getTrait } from "@/lib/traits";
import { whoComesTitle } from "@/lib/event-title";
import type { EventRow, ParticipantStatus, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

type EventFilter = "all" | "organizer" | "participant" | "pending";
type ProfileEvent = { event: EventRow; role: "organizer" | "participant" | "pending"; pendingRequests: number };

/** Followers / following / events-count for a profile. */
export function useProfileGraph(profileId: string) {
  const { data: blocked } = useBlockedIds();
  const q = useQuery({
    queryKey: ["profile-graph", profileId],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("follows").select(`following:profiles!follows_following_id_fkey(${PROFILE_COLUMNS})`).eq("follower_id", profileId),
        supabase.from("follows").select(`follower:profiles!follows_follower_id_fkey(${PROFILE_COLUMNS})`).eq("following_id", profileId),
      ]);
      return {
        following: ((a.data ?? []) as unknown as Array<{ following: Profile | null }>).map((r) => r.following).filter(Boolean) as Profile[],
        followers: ((b.data ?? []) as unknown as Array<{ follower: Profile | null }>).map((r) => r.follower).filter(Boolean) as Profile[],
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

/** Upcoming events of a profile; an event I opened appears exactly once — as organizer. */
function useProfileEvents(profileId: string, isMe: boolean) {
  return useQuery({
    queryKey: ["profile-events", profileId, isMe],
    queryFn: async () => {
      const now = new Date().toISOString();
      let q = supabase
        .from("event_participants")
        .select(`status, event:events(${EVENT_COLUMNS})`)
        .eq("profile_id", profileId);
      if (!isMe) q = q.eq("status", "approved");
      const { data } = await q;
      const rows = ((data ?? []) as unknown as Array<{ status: ParticipantStatus; event: EventRow | null }>).filter(
        (r) => r.event && (r.event.ends_at ?? r.event.starts_at) >= now && r.status !== "declined",
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
        const role: ProfileEvent["role"] = e.organizer_id === profileId ? "organizer" : r.status === "pending" ? "pending" : "participant";
        const prev = byId.get(e.id);
        if (!prev || role === "organizer") byId.set(e.id, { event: e, role, pendingRequests: pendingByEvent.get(e.id) ?? 0 });
      }
      return [...byId.values()].sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
    },
  });
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
  const graph = useProfileGraph(profile.id);
  const events = useProfileEvents(profile.id, isMe);
  const { data: communities = [] } = useMyCommunities(profile.id);
  const { data: counts = new Map<string, number>() } = useCommunityEventCounts();
  const [filter, setFilter] = React.useState<EventFilter>(initialFilter ?? "all");
  const followersRef = React.useRef<HTMLDivElement>(null);
  const followingRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);

  const all = events.data ?? [];
  const pendingCount = all.reduce((n, e) => n + e.pendingRequests + (e.role === "pending" ? 1 : 0), 0);
  const shown = all.filter((e) =>
    filter === "all"
      ? e.role !== "pending" || isMe
      : filter === "organizer"
        ? e.role === "organizer"
        : filter === "participant"
          ? e.role === "participant"
          : e.role === "pending" || e.pendingRequests > 0,
  );
  const age = ageFromBirthYear(profile.birth_year);
  const photos = profile.photos?.length ? profile.photos : profile.avatar_url ? [profile.avatar_url] : [];

  const stat = (n: number, label: string, onClick?: () => void) => (
    <button onClick={onClick} className="flex flex-1 flex-col items-center rounded-2xl py-2 hover:bg-muted">
      <span className="text-xl font-bold">{n}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );

  return (
    <div>
      {/* 1. Big photo + stats */}
      <PhotoCarousel photos={photos} className="-mx-4 aspect-[4/5] rounded-none rounded-b-3xl">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-scrim" />
        <div className="absolute right-4 bottom-4 left-4 text-scrim-foreground">
          <h1 className="text-3xl font-bold">
            {profile.name}
            {age ? <span className="font-normal">, {age}</span> : null}
          </h1>
          {profile.city && (
            <p className="mt-1 flex items-center gap-1 text-sm opacity-90">
              <MapPin className="size-4" /> {profile.city}
            </p>
          )}
        </div>
      </PhotoCarousel>
      <div className="mt-3 flex rounded-2xl bg-surface p-1 shadow-soft">
        {stat(graph.followers.length, "עוקבים", () => followersRef.current?.scrollIntoView({ behavior: "smooth" }))}
        {stat(graph.following.length, "נעקבים", () => followingRef.current?.scrollIntoView({ behavior: "smooth" }))}
        {stat(all.filter((e) => e.role !== "pending").length, "אירועים")}
      </div>
      {actions && <div className="mt-3">{actions}</div>}

      {/* 2. Upcoming events with filters + calendar link in the same row */}
      <Section title="אירועים קרובים">
        <div className="flex items-center gap-2">
          <ChipRow className="me-0 min-w-0 flex-1 pe-0">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              הכל
            </Chip>
            <Chip active={filter === "organizer"} onClick={() => setFilter("organizer")}>
              כמארגן
            </Chip>
            <Chip active={filter === "participant"} onClick={() => setFilter("participant")}>
              כמשתתף
            </Chip>
            {isMe && (
              <Chip active={filter === "pending"} onClick={() => setFilter("pending")}>
                ממתינים
                {pendingCount > 0 && <span className="rounded-full bg-partner px-1.5 text-xs text-partner-foreground">{pendingCount}</span>}
              </Chip>
            )}
          </ChipRow>
          {isMe && (
            <Link to="/calendar" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
              <CalendarDays className="size-4" /> ליומן
            </Link>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {shown.length === 0 && <p className="text-sm text-muted-foreground">אין אירועים להצגה</p>}
          {shown.map(({ event, role, pendingRequests }) => (
            <Link key={event.id} to="/e/$id" params={{ id: event.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {event.image_url && <SafeImg src={event.image_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{whoComesTitle(event.title)}</p>
                <p className="text-xs text-event">{formatEventWhen(event.starts_at)}</p>
              </div>
              {role === "organizer" && <Badge variant="partner">מארגן/ת</Badge>}
              {role === "pending" && <Badge variant="muted">ממתין</Badge>}
              {isMe && pendingRequests > 0 && <Badge variant="like">{pendingRequests} בקשות</Badge>}
            </Link>
          ))}
        </div>
      </Section>

      {/* 3. Communities */}
      {communities.length > 0 && (
        <Section title={isMe ? "הקהילות שלי" : "קהילות"}>
          <div className="space-y-2">
            {communities.map(({ community }) => (
              <CommunityCard key={community!.id} community={community!} eventCount={counts.get(community!.id) ?? 0} />
            ))}
          </div>
        </Section>
      )}

      {/* 4. Following / followers carousels */}
      <div ref={followingRef} className="scroll-mt-20">
        <PeopleCarousel title="עוקב/ת אחרי" people={graph.following} />
      </div>
      <div ref={followersRef} className="scroll-mt-20">
        <PeopleCarousel title="עוקבים" people={graph.followers} />
      </div>

      {/* 5. About */}
      {profile.bio && (
        <Section title="קצת עליי">
          <p className="leading-relaxed whitespace-pre-line">{profile.bio}</p>
        </Section>
      )}

      {/* 6. Hobbies & traits */}
      {((profile.hobbies?.length ?? 0) > 0 || (profile.traits?.length ?? 0) > 0) && (
        <Section title="תחביבים ומאפיינים">
          <div className="flex flex-wrap gap-2">
            {profile.hobbies?.map((h) => (
              <Tag key={h} className="bg-primary-soft text-primary">
                {hobbyLabel(h)}
              </Tag>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.traits?.map((t) => {
              const tr = getTrait(t);
              return tr ? (
                <Tag key={t}>
                  {tr.emoji} {tr.label}
                </Tag>
              ) : null;
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function PeopleCarousel({ title, people }: { title: string; people: Profile[] }) {
  return (
    <Section title={`${title} (${people.length})`}>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">עדיין אין</p>
      ) : (
        <div className={cn("-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none")} dir="rtl">
          {people.map((p) => (
            <PersonCard key={p.id} person={p} />
          ))}
        </div>
      )}
    </Section>
  );
}

export function ProfileUnavailable({ text }: { text: string }) {
  return (
    <div className="pt-20">
      <EmptyState emoji="🚫" title="הפרופיל אינו זמין" text={text} />
    </div>
  );
}
