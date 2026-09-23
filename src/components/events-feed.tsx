import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Carousel } from "@/components/carousel";
import { EventCard } from "@/components/event-card";
import { CategoryFilterRow, matchesCategories, useCategoryFilter } from "@/components/category-filter";
import { Chip, ChipRow } from "@/components/chip";
import { EmptyState } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useEventFeed } from "@/hooks/use-event-feed";
import { buildHomeCarousels, rankEvents, type SortMode } from "@/lib/event-ranking";

export const SORT_LABELS: Record<SortMode, string> = {
  recommended: "מומלץ בשבילך",
  time: "הכי קרוב בזמן",
  distance: "הכי קרוב אליי",
};

export function SortRow({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <ChipRow>
      {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
        <Chip key={m} active={value === m} onClick={() => onChange(m)}>
          {SORT_LABELS[m]}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** Home events tab: sort row, category filter, and 5 non-overlapping carousels. */
export function EventsFeed() {
  const feed = useEventFeed();
  const [sort, setSort] = React.useState<SortMode>("recommended");
  const [cats, setCats] = useCategoryFilter("home");

  const filtered = React.useMemo(
    () => feed.events.filter((e) => matchesCategories(e.category, cats)),
    [feed.events, cats],
  );
  const carousels = React.useMemo(() => buildHomeCarousels(filtered, feed.ctx), [filtered, feed.ctx]);
  const ranked = React.useMemo(() => rankEvents(filtered, feed.ctx, sort), [filtered, feed.ctx, sort]);

  const card = (e: (typeof filtered)[number]) => (
    <EventCard key={e.id} data={feed.toCard(e)} viewerId={feed.viewerId} isGuest={feed.isGuest} onHide={feed.hide} />
  );

  if (feed.isLoading) {
    return (
      <div className="mt-4 flex gap-3 overflow-hidden">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-72 w-[219px] shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <SortRow value={sort} onChange={setSort} />
        <CategoryFilterRow selected={cats} onChange={setCats} />
      </div>

      {filtered.length === 0 && (
        <div className="mt-6">
          <EmptyState
            emoji="🗓️"
            title="אין אירועים כרגע"
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
      )}

      {sort === "recommended" && !feed.isGuest ? (
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
        <div className="mt-4 grid grid-cols-2 gap-3">
          {ranked.map((r) => card(r.event))}
        </div>
      )}
    </div>
  );
}
