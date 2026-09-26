import * as React from "react";
import { Link } from "@tanstack/react-router";
import { List, Map as MapIcon, MapPin } from "lucide-react";
import { EventsMapView } from "@/components/events-map-view";
import { cn } from "@/lib/utils";
import { Carousel } from "@/components/carousel";
import { EventCard } from "@/components/event-card";
import { CategoryChipsRow, EventFilterSheet, applyEventFilters, useEventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEventFeed } from "@/hooks/use-event-feed";
import { useUpdateLocation } from "@/lib/location";
import { toast } from "sonner";
import { buildHomeCarousels, rankEvents } from "@/lib/event-ranking";

/** Home events tab: filter button + colored categories, then 5 non-overlapping carousels. */
export function EventsFeed() {
  const feed = useEventFeed();
  const updateLocation = useUpdateLocation();
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

  const [view, setView] = useEventsView();
  const mapCards = React.useMemo(() => (view === "map" ? filtered.map(feed.toCard) : []), [view, filtered, feed.toCard]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <CategoryChipsRow filters={filters} onChange={setFilters} onOpenFilters={() => setSheet(true)} />
        </div>
        <div className="flex shrink-0 rounded-full bg-surface-soft p-1" role="group" aria-label="תצוגה">
          {(
            [
              ["list", "רשימה", List],
              ["map", "מפה", MapIcon],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={label}
              className={cn("grid size-9 place-items-center rounded-full transition", view === v ? "bg-surface text-primary shadow-soft" : "text-muted-foreground")}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
      <EventFilterSheet open={sheet} onOpenChange={setSheet} value={filters} onApply={setFilters} />

      {view === "map" && !feed.isLoading ? (
        <EventsMapView cards={mapCards} center={feed.location} isGuest={feed.isGuest} onExit={() => setView("list")} />
      ) : null}

      {view === "map" && !feed.isLoading ? null : feed.isLoading ? (
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
          {feed.location ? (
            <Carousel title="קרוב אליך" moreTo="/discover" moreSearch={{ section: "nearby" }}>
              {carousels.nearby.map(card)}
            </Carousel>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (!(await updateLocation())) toast.error("לא הצלחנו לאתר מיקום — בדקו שהמיקום מופעל ושאישרתם גישה");
              }}
              className="mt-6 flex w-full items-center gap-3 rounded-3xl bg-teal-soft p-4 text-start"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-teal">
                <MapPin className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">מה קורה קרוב אליך?</span>
                <span className="block text-sm text-muted-foreground">הפעילו מיקום וגלו אירועים בסביבה</span>
              </span>
              <span className="text-sm font-semibold text-teal">הפעלה</span>
            </button>
          )}
          <Carousel title="האירועים שפתחת" moreTo="/me">
            {carousels.mine.map(card)}
          </Carousel>
        </>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">{ranked.map((r) => card(r.event))}</div>
      )}
    </div>
  );
}

const VIEW_KEY = "mibale-events-view";

/** List or map, remembered per device. */
function useEventsView(): ["list" | "map", (v: "list" | "map") => void] {
  const [view, setViewState] = React.useState<"list" | "map">("list");
  React.useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "map") setViewState("map");
    } catch {
      /* ignore */
    }
  }, []);
  const setView = React.useCallback((v: "list" | "map") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);
  return [view, setView];
}
