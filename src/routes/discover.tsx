import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { List, Map as MapIcon } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { EventCard } from "@/components/event-card";
import { EventMap } from "@/components/event-map";
import { CategoryChipsRow, EventFilterSheet, applyEventFilters, useEventFilters } from "@/components/event-filters";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useEventFeed } from "@/hooks/use-event-feed";
import { buildHomeCarousels, rankEvents } from "@/lib/event-ranking";
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
  const { profile } = useAuth();
  const [filters, setFilters] = useEventFilters("discover");
  const [sheet, setSheet] = React.useState(false);
  const sort = section === "soon" ? "time" : section === "nearby" ? "distance" : filters.sort;
  const [view, setView] = React.useState<"list" | "map">("list");

  const list = React.useMemo(() => {
    const base = applyEventFilters(feed.events, filters, { gender: profile?.gender, location: feed.location });
    let pool = base;
    if (section !== "all") {
      // Full list of the section — same filters as its home carousel, without the per-carousel cap.
      const c = buildHomeCarousels(base, feed.ctx, 1000);
      pool = section === "recommended" ? c.recommended : section === "soon" ? c.startingSoon : section === "following" ? c.fromFollowing : c.nearby;
    }
    return rankEvents(pool, feed.ctx, sort).map((r) => r.event);
  }, [feed.events, feed.ctx, filters, section, sort, profile?.gender, feed.location]);

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
      <CategoryChipsRow filters={filters} onChange={setFilters} onOpenFilters={() => setSheet(true)} />
      <EventFilterSheet open={sheet} onOpenChange={setSheet} value={filters} onApply={setFilters} />
      <div className="mt-4">
        {view === "map" ? (
          <EventMap events={list} center={feed.location} />
        ) : list.length === 0 ? (
          <EmptyState emoji="🔭" title="אין כאן אירועים כרגע" />
        ) : (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={feed.isGuest} onHide={feed.hide} />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
