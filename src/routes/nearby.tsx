import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LocateFixed, MapPin, RefreshCw } from "lucide-react";
import { EmptyState, Page, PageHeader, Section } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { Chip, ChipRow } from "@/components/chip";
import { EventCard } from "@/components/event-card";
import { EventMap } from "@/components/event-map";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useEventFeed } from "@/hooks/use-event-feed";
import { PROFILE_COLUMNS } from "@/lib/constants";
import { ageFromBirthYear } from "@/lib/format";
import { hobbyEmoji } from "@/lib/hobby-categories";
import { useUpdateLocation } from "@/lib/location";
import { seo } from "@/lib/seo";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

const RADII = [5, 10, 25, 50] as const;
type Radius = (typeof RADII)[number];

export const Route = createFileRoute("/nearby")({
  head: () => seo({ title: "קרוב אליי", description: "אירועים ואנשים בסביבה שלך — לפי מרחק, בלי לחשוף מיקום מדויק." }),
  validateSearch: (s: Record<string, unknown>): { km?: Radius } => ({
    km: RADII.includes(Number(s.km) as Radius) ? (Number(s.km) as Radius) : undefined,
  }),
  component: () => (
    <RequireAuth reason="כדי לראות מי ומה קרוב אליך">
      <Nearby />
    </RequireAuth>
  ),
});

function Nearby() {
  const { km = 10 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const feed = useEventFeed();
  const update = useUpdateLocation();
  const [locating, setLocating] = React.useState(false);

  async function locate() {
    setLocating(true);
    const ok = await update();
    setLocating(false);
    if (ok) toast.success("המיקום עודכן 📍");
    else toast.error("לא הצלחנו לאתר מיקום — בדקו שהמיקום מופעל ושאישרתם גישה");
  }

  const events = React.useMemo(
    () =>
      feed.events
        .map(feed.toCard)
        .filter((c) => c.distanceKm != null && c.distanceKm <= km)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)),
    [feed.events, feed.toCard, km],
  );

  return (
    <Page>
      <PageHeader
        title="קרוב אליי"
        subtitle={feed.location ? `ברדיוס ${km} ק״מ ממך` : undefined}
        back
        actions={
          feed.location && (
            <Button size="icon-sm" variant="ghost" disabled={locating} onClick={() => void locate()} aria-label="רענון מיקום">
              <RefreshCw className={locating ? "animate-spin" : undefined} />
            </Button>
          )
        }
      />

      {!feed.location ? (
        feed.isLoading ? (
          <Skeleton className="h-64 w-full rounded-3xl" />
        ) : (
          <div className="rounded-3xl bg-surface p-6 text-center shadow-soft">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-teal-soft text-teal">
              <MapPin className="size-8" />
            </span>
            <h2 className="mt-4 text-xl font-bold">מה קורה בסביבה שלך?</h2>
            <p className="mt-2 text-muted-foreground">
              אפשרו גישה למיקום ונראה לכם אירועים ואנשים קרובים. אף אחד לא רואה את המיקום המדויק שלכם — רק מרחק מעוגל בק״מ.
            </p>
            <Button variant="brand" size="lg" className="mt-5 w-full" disabled={locating} onClick={() => void locate()}>
              <LocateFixed /> {locating ? "מאתרים…" : "הפעלת מיקום"}
            </Button>
          </div>
        )
      ) : (
        <>
          <ChipRow>
            {RADII.map((r) => (
              <Chip key={r} active={r === km} onClick={() => void navigate({ search: { km: r }, replace: true })}>
                עד {r} ק״מ
              </Chip>
            ))}
          </ChipRow>

          <Section title={`אירועים קרובים (${events.length})`}>
            <EventMap key={km} events={events.map((c) => c.event)} center={feed.location} radiusKm={km} />
            {events.length === 0 ? (
              <div className="mt-3">
                <EmptyState emoji="🗺️" title="אין אירועים ברדיוס הזה" text="נסו להרחיב את המרחק — או פתחו אירוע משלכם" />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
                {events.map((c) => (
                  <EventCard key={c.event.id} data={c} viewerId={feed.viewerId} onHide={feed.hide} layout="list" />
                ))}
              </div>
            )}
          </Section>

          <NearbyPeople km={km} />
        </>
      )}
    </Page>
  );
}

/** People within the radius — distance only (rounded km), never a position. Blocks are excluded server-side. */
function NearbyPeople({ km }: { km: number }) {
  const { user, profile } = useAuth();
  const q = useQuery({
    queryKey: ["nearby", "people", user?.id, km],
    enabled: !!user,
    queryFn: async () => {
      const { data: near } = await supabase.rpc("nearby_profiles", { radius_km: km });
      const rows = ((near ?? []) as Array<{ profile_id: string; distance_km: number }>).slice(0, 60);
      if (!rows.length) return [];
      const { data: people } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .in("id", rows.map((r) => r.profile_id))
        .eq("onboarded", true)
        .is("banned_at", null);
      const byId = new Map(((people ?? []) as Profile[]).map((p) => [p.id, p]));
      return rows.flatMap((r) => {
        const p = byId.get(r.profile_id);
        return p ? [{ person: p, km: r.distance_km }] : [];
      });
    },
  });
  const mine = new Set(profile?.hobbies ?? []);
  const list = q.data ?? [];

  return (
    <Section title={`אנשים קרובים (${list.length})`}>
      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : list.length === 0 ? (
        <EmptyState emoji="👋" title="עוד אין אנשים ברדיוס הזה" text="נסו להרחיב את המרחק" />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {list.map(({ person, km: d }) => {
            const age = ageFromBirthYear(person.birth_year);
            const common = (person.hobbies ?? []).filter((h) => mine.has(h)).slice(0, 3);
            return (
              <Link
                key={person.id}
                to="/profile/$id"
                params={{ id: person.id }}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-soft"
              >
                <Avatar src={person.avatar_url} name={person.name} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {person.name}
                    {age ? `, ${age}` : ""}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {person.city ?? ""}
                    {common.length > 0 && ` · ${common.map(hobbyEmoji).join(" ")} במשותף`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal">{d} ק״מ</span>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}
