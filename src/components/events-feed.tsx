import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Carousel } from "@/components/carousel";
import { EventCard } from "@/components/event-card";
import { CategoryChipsRow, EventFilterSheet, applyEventFilters, useEventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEventFeed } from "@/hooks/use-event-feed";
import { buildHomeCarousels, rankEvents } from "@/lib/event-ranking";

/** Home events tab: filter button + colored categories, then 5 non-overlapping carousels. */
export function EventsFeed() {
  const feed = useEventFeed();
  const { profile } = useAuth();
  const [filters, setFilters] = useEventFilters("home");
  const [sheet, setSheet] = React.useState(false);

  const filtered = React.useMemo(
    () => applyEventFilters(feed.events, filters, { gender: profile?.gender, location: feed.location }),
    [feed.events, filters, profile?.gender, feed.location],
  );
  const carousels = React.useMemo(() => buildHomeCarousels(filtered, feed.ctx), [filtered, feed.ctx]);
  const ranked = React.useMemo(() => rankEvents(filtered, feed.ctx, filters.sort), [filtered, feed.ctx, filters.sort]);

  const card = (e: (typeof filtered)[number]) => (
    <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={feed.isGuest} onHide={feed.hide} />
  );

  return (
    <div>
      <CategoryChipsRow filters={filters} onChange={setFilters} onOpenFilters={() => setSheet(true)} />
      <EventFilterSheet open={sheet} onOpenChange={setSheet} value={filters} onApply={setFilters} />

      {feed.isLoading ? (
        <div className="mt-4 flex gap-3 overflow-hidden">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-96 w-[219px] shrink-0 rounded-3xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            emoji="🗓️"
            title="אין אירועים שמתאימים לסינון"
            text="נסו לשנות סינון — או פתחו אירוע משלכם"
            action={
              !feed.isGuest && (
                <Button asChild variant="brand">
                  <Link to="/event/new">פתיחת אירוע</Link>
                </Button>
              )
            }
          />
        </div>
      ) : filters.sort === "recommended" && !feed.isGuest ? (
        <>
          <Carousel title="מומלץ בשבילך" moreTo="/discover" moreSearch={{ section: "recommended" }}>
            {carousels.recommended.map(card)}
          </Carousel>
          <Carousel title="מתחילים בקרוב" moreTo="/discover" moreSearch={{ section: "soon" }}>
            {carousels.startingSoon.map(card)}
          </Carousel>
          <Carousel title="מאנשים במעקב" moreTo="/discover" moreSearch={{ section: "following" }}>
            {carousels.fromFollowing.map(card)}
          </Carousel>
          <Carousel title="קרוב אליך" moreTo="/discover" moreSearch={{ section: "nearby" }}>
            {carousels.nearby.map(card)}
          </Carousel>
          <Carousel title="האירועים שפתחת" moreTo="/me">
            {carousels.mine.map(card)}
          </Carousel>
        </>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">{ranked.map((r) => card(r.event))}</div>
      )}
    </div>
  );
}
