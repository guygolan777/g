import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { List, Map as MapIcon } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { EventCard } from "@/components/event-card";
import { EventMap } from "@/components/event-map";
import { CategoryFilterRow, matchesCategories, useCategoryFilter } from "@/components/category-filter";
import { SortRow } from "@/components/events-feed";
import { Button } from "@/components/ui/button";
import { useEventFeed } from "@/hooks/use-event-feed";
import { buildHomeCarousels, rankEvents, type SortMode } from "@/lib/event-ranking";
import { seo } from "@/lib/seo";

type Section = "all" | "recommended" | "soon" | "following" | "nearby";
const TITLES: Record<Section, string> = {
  all: "גילוי אירועים",
  recommended: "מומלץ בשבילך",
  soon: "מתחילים בקרוב",
  following: "מאנשים במעקב",
  nearby: "קרוב אליך",
};

export const Route = createFileRoute("/discover")({
  validateSearch: (s: Record<string, unknown>): { section?: Section } => ({
    section: typeof s.section === "string" && s.section in TITLES ? (s.section as Section) : undefined,
  }),
  head: () => seo({ title: "גילוי אירועים", description: "כל האירועים ב-mibale לפי המלצה, זמן ומרחק — כרשימה או על המפה." }),
  component: Discover,
});

function Discover() {
  const { section = "all" } = Route.useSearch();
  const feed = useEventFeed();
  const [cats, setCats] = useCategoryFilter("discover");
  const [sort, setSort] = React.useState<SortMode>(section === "soon" ? "time" : section === "nearby" ? "distance" : "recommended");
  const [view, setView] = React.useState<"list" | "map">("list");

  const list = React.useMemo(() => {
    const base = feed.events.filter((e) => matchesCategories(e.category, cats));
    let pool = base;
    if (section !== "all") {
      // Full list of the section — same filters as its home carousel, without the per-carousel cap.
      const c = buildHomeCarousels(base, feed.ctx, 1000);
      pool = section === "recommended" ? c.recommended : section === "soon" ? c.startingSoon : section === "following" ? c.fromFollowing : c.nearby;
    }
    return rankEvents(pool, feed.ctx, sort).map((r) => r.event);
  }, [feed.events, feed.ctx, cats, section, sort]);

  return (
    <Page>
      <PageHeader
        title={TITLES[section]}
        back={section !== "all"}
        actions={
          <Button size="icon" variant="ghost" onClick={() => setView(view === "list" ? "map" : "list")} aria-label="החלפת תצוגה">
            {view === "list" ? <MapIcon /> : <List />}
          </Button>
        }
      />
      <div className="space-y-2">
        <SortRow value={sort} onChange={setSort} />
        <CategoryFilterRow selected={cats} onChange={setCats} />
      </div>
      <div className="mt-4">
        {view === "map" ? (
          <EventMap events={list} center={feed.location} />
        ) : list.length === 0 ? (
          <EmptyState emoji="🔭" title="אין כאן אירועים כרגע" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {list.map((e) => (
              <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={feed.isGuest} onHide={feed.hide} />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
