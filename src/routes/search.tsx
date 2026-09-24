import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { EmptyState, Page, Section } from "@/components/app-shell";
import { CategoryFilterRow, matchesCategories, useCategoryFilter } from "@/components/category-filter";
import { CommunityCard, useCommunityEventCounts } from "@/components/communities-browser";
import { PersonRow } from "@/components/person-row";
import { EventCard } from "@/components/event-card";
import { useAuth } from "@/hooks/use-auth";
import { useEventFeed } from "@/hooks/use-event-feed";
import { supabase } from "@/lib/supabase";
import { PROFILE_COLUMNS, PROFILE_VIEW } from "@/lib/constants";
import { useBlockedIds, useCommunities } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { hobbyLabel } from "@/lib/hobby-categories";
import { seo } from "@/lib/seo";
import type { Profile } from "@/lib/types";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({ q: typeof s.q === "string" ? s.q : undefined }),
  head: () => seo({ title: "חיפוש", description: "חיפוש אירועים, קהילות ואנשים ב-mibale לפי שם, עיר ותחביב." }),
  component: SearchPage,
});

const norm = (s: string) => s.toLowerCase().replace(/["״׳']/g, "");
const has = (hay: Array<string | null | undefined>, q: string) => {
  const h = norm(hay.filter(Boolean).join(" "));
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w));
};

function SearchPage() {
  const { q: initial = "" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = React.useState(initial);
  const [cats, setCats] = useCategoryFilter("search");
  const { user, isGuest } = useAuth();
  const feed = useEventFeed();
  const { data: communities = [] } = useCommunities();
  const { data: counts = new Map<string, number>() } = useCommunityEventCounts();
  const { data: blocked } = useBlockedIds();

  const people = useQuery({
    queryKey: ["search-people", q],
    enabled: !!user && q.trim().length >= 2,
    queryFn: async () => {
      const term = q.trim().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from(PROFILE_VIEW)
        .select(PROFILE_COLUMNS)
        .or(`name.ilike.%${term}%,city.ilike.%${term}%`)
        .eq("onboarded", true)
        .limit(20);
      return (data ?? []) as Profile[];
    },
  });

  const active = q.trim().length > 0 || cats.length > 0;
  const events = feed.events.filter(
    (e) => matchesCategories(e.category, cats) && has([e.title, e.description, e.city, e.location_name, hobbyLabel(e.subcategory ?? e.category, false)], q),
  );
  const comms = communities.filter((c) => matchesCategories(c.hobby, cats) && has([c.name, c.description, c.city, hobbyLabel(c.hobby, false)], q));
  const ppl = withoutBlocked(people.data ?? [], blocked ?? new Set(), (p) => p.id).filter((p) => p.id !== user?.id);

  return (
    <Page>
      <div className="sticky top-0 z-30 -mx-4 bg-background/95 px-4 pt-3 pb-2 backdrop-blur">
        <label className="flex h-12 items-center gap-2 rounded-full border border-input bg-surface px-4 shadow-soft">
          <SearchIcon className="size-5 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void navigate({ search: { q: e.target.value || undefined }, replace: true });
            }}
            placeholder="אירועים, קהילות, אנשים…"
            className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="mt-2">
          <CategoryFilterRow selected={cats} onChange={setCats} />
        </div>
      </div>

      {!active ? (
        <div className="mt-8">
          <EmptyState emoji="🔎" title="מה מחפשים היום?" text="נסו ״ריצה״, ״תל אביב״ או ״משחקי קופסה״" />
        </div>
      ) : (
        <>
          {events.length > 0 && (
            <Section title={`אירועים (${events.length})`}>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
                {events.slice(0, 20).map((e) => (
                  <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={feed.isGuest} onHide={feed.hide} />
                ))}
              </div>
            </Section>
          )}
          {comms.length > 0 && (
            <Section title={`קהילות (${comms.length})`}>
              <div className="space-y-2">
                {comms.map((c) => (
                  <CommunityCard key={c.id} community={c} eventCount={counts.get(c.id) ?? 0} />
                ))}
              </div>
            </Section>
          )}
          {!isGuest && ppl.length > 0 && (
            <Section title="אנשים">
              <div className="space-y-2">
                {ppl.map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </div>
            </Section>
          )}
          {isGuest && q.trim().length >= 2 && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link to="/signup" className="font-semibold text-primary">
                הרשמו
              </Link>{" "}
              כדי לחפש גם אנשים
            </p>
          )}
          {!events.length && !comms.length && !ppl.length && (
            <div className="mt-8">
              <EmptyState emoji="🤷" title="לא נמצאו תוצאות" />
            </div>
          )}
        </>
      )}
    </Page>
  );
}
