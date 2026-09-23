import * as React from "react";
import { LocateFixed, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { EventMedia, priceLabel, type EventCardData } from "@/components/event-card";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { Chip } from "@/components/chip";
import { hobbyEmoji } from "@/lib/hobby-categories";
import { useUpdateLocation } from "@/lib/location";
import { cn } from "@/lib/utils";

type Leaflet = typeof import("react-leaflet");
type Mod = { rl: Leaflet; L: typeof import("leaflet") };

const NOW_BEFORE_MS = 2 * 60 * 60 * 1000; // starts within 2h
const NOW_AFTER_MS = 3 * 60 * 60 * 1000; // or started up to 3h ago (when no end time)

/** "Happening now": already running, or starting within the next two hours. */
export function isHappeningNow(e: { starts_at: string; ends_at: string | null }, now = Date.now()): boolean {
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : start + NOW_AFTER_MS;
  return start - now <= NOW_BEFORE_MS && end >= now;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pinHtml(emoji: string, avatar: string | null | undefined, now: boolean, selected: boolean): string {
  const ring = now ? "var(--like)" : selected ? "var(--primary)" : "var(--surface)";
  const avatarHtml = avatar
    ? `<img src="${esc(avatar)}" alt="" style="position:absolute;bottom:-4px;left:-4px;width:24px;height:24px;border-radius:9999px;object-fit:cover;border:2px solid var(--surface);background:var(--muted)" />`
    : "";
  const pulse = now
    ? `<span style="position:absolute;inset:-6px;border-radius:9999px;border:2px solid var(--like);animation:mibale-ping 1.6s cubic-bezier(0,0,.2,1) infinite"></span>`
    : "";
  return `<div style="position:relative;width:48px;height:48px;transform:${selected ? "scale(1.15)" : "none"};transition:transform .15s">
    ${pulse}
    <div style="width:48px;height:48px;border-radius:9999px;background:var(--surface);border:3px solid ${ring};box-shadow:var(--shadow-lift);display:grid;place-items:center;font-size:24px;line-height:1">${emoji}</div>
    ${avatarHtml}
  </div>`;
}

/**
 * Home "map" view: every upcoming event as an emoji pin (category) with the organizer's face,
 * events happening now pulse in pink, tapping a pin opens its card at the bottom.
 */
export function EventsMapView({
  cards,
  center,
  isGuest,
}: {
  cards: EventCardData[];
  center: { lat: number; lng: number } | null | undefined;
  isGuest: boolean;
}) {
  const [mod, setMod] = React.useState<Mod | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [nowOnly, setNowOnly] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [map, setMap] = React.useState<import("leaflet").Map | null>(null);
  const update = useUpdateLocation();
  const box = React.useRef<HTMLDivElement>(null);
  // Switching to the map scrolls it into view so it fills the screen (above the bottom nav).
  React.useEffect(() => {
    if (mod) box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mod]);

  React.useEffect(() => {
    void Promise.all([import("react-leaflet"), import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([rl, L]) =>
      setMod({ rl, L: (L as unknown as { default: typeof import("leaflet") }).default ?? L }),
    );
  }, []);

  const pins = React.useMemo(
    () =>
      cards
        .filter((c) => c.event.lat != null && c.event.lng != null && !c.event.is_online)
        .map((c) => ({ card: c, now: isHappeningNow(c.event) }))
        .filter((p) => !nowOnly || p.now),
    [cards, nowOnly],
  );
  const nowCount = React.useMemo(() => cards.filter((c) => !c.event.is_online && c.event.lat != null && isHappeningNow(c.event)).length, [cards]);
  const current = pins.find((p) => p.card.event.id === selected)?.card;

  async function locate() {
    setLocating(true);
    const ok = await update();
    setLocating(false);
    if (!ok) toast.error("לא הצלחנו לאתר מיקום — בדקו שהמיקום מופעל");
  }
  React.useEffect(() => {
    if (map && center) map.flyTo([center.lat, center.lng], 12, { duration: 0.6 });
  }, [map, center]);

  if (!mod) return <div className="mt-4 h-[calc(100dvh-7rem)] w-full animate-pulse rounded-3xl bg-muted" />;
  const { MapContainer, TileLayer, Marker, CircleMarker } = mod.rl;
  const c = center ?? (pins[0] ? { lat: pins[0].card.event.lat!, lng: pins[0].card.event.lng! } : { lat: 32.0853, lng: 34.7818 });

  return (
    <div
      ref={box}
      className="relative mt-4 h-[calc(100dvh-7rem)] min-h-[420px] w-full scroll-mt-3 overflow-hidden rounded-3xl shadow-soft lg:h-[calc(100dvh-6rem)]"
    >
      <div className="mibale-map size-full" dir="ltr">
        <MapContainer center={[c.lat, c.lng]} zoom={center ? 12 : 10} className="size-full" zoomControl={false} ref={setMap}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {center && (
            <CircleMarker center={[center.lat, center.lng]} radius={8} pathOptions={{ color: "white", weight: 3, fillColor: "var(--primary)", fillOpacity: 1 }} />
          )}
          {pins.map(({ card, now }) => {
            const e = card.event;
            const organizer = isGuest ? null : card.attendees?.find((a) => a.profile_id === e.organizer_id)?.profile?.avatar_url;
            const isSel = e.id === selected;
            return (
              <Marker
                key={e.id}
                position={[e.lat!, e.lng!]}
                zIndexOffset={isSel ? 1000 : now ? 500 : 0}
                icon={mod.L.divIcon({ className: "", html: pinHtml(hobbyEmoji(e.subcategory ?? e.category), organizer, now, isSel), iconSize: [48, 48], iconAnchor: [24, 24] })}
                eventHandlers={{ click: () => setSelected(e.id) }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Top: "happening now" filter */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-between gap-2">
        <Chip
          active={nowOnly}
          onClick={() => setNowOnly((v) => !v)}
          className="pointer-events-auto shadow-soft"
          aria-pressed={nowOnly}
        >
          <span className={cn("size-2 rounded-full bg-like", nowCount > 0 && "animate-pulse")} />
          קורה עכשיו{nowCount > 0 ? ` (${nowCount})` : ""}
        </Chip>
        <span className="pointer-events-auto rounded-full bg-surface/90 px-3 py-1.5 text-sm shadow-soft backdrop-blur">{pins.length} אירועים על המפה</span>
      </div>

      {/* Locate me */}
      {!isGuest && (
        <button
          type="button"
          onClick={() => void locate()}
          disabled={locating}
          className="absolute bottom-4 left-4 z-[500] grid size-12 place-items-center rounded-full bg-surface shadow-lift"
          aria-label="המיקום שלי"
          style={current ? { bottom: "calc(1rem + 8.5rem)" } : undefined}
        >
          <LocateFixed className={cn("size-5 text-primary", locating && "animate-spin")} />
        </button>
      )}

      {/* Selected event */}
      {current && (
        <div className="absolute inset-x-3 bottom-3 z-[600]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute -top-3 left-2 z-10 grid size-8 place-items-center rounded-full bg-surface shadow-soft"
              aria-label="סגירה"
            >
              <X className="size-4" />
            </button>
            <MapEventCard data={current} />
          </div>
        </div>
      )}
      {pins.length === 0 && (
        <div className="absolute inset-x-6 top-1/2 z-[500] -translate-y-1/2 rounded-2xl bg-surface/95 p-4 text-center shadow-soft">
          {nowOnly ? "אין כרגע אירועים שקורים עכשיו" : "אין אירועים עם מיקום לפי הסינון"}
        </div>
      )}
    </div>
  );
}

/** Compact card shown over the map for the tapped pin. */
function MapEventCard({ data }: { data: EventCardData }) {
  const e = data.event;
  const now = isHappeningNow(e);
  return (
    <Link to="/e/$id" params={{ id: e.id }} className="flex gap-3 rounded-3xl bg-surface p-3 shadow-lift">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl">
        <EventMedia event={e} className="size-full" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {now && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-like-soft px-2 py-0.5 text-xs font-bold text-like">
            <span className="size-1.5 animate-pulse rounded-full bg-like" /> קורה עכשיו
          </span>
        )}
        <p className="line-clamp-2 font-bold leading-snug">{whoComesTitle(e.title)}</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {formatEventWhen(e.starts_at)}
          {data.distanceKm != null && ` · ${formatDistance(data.distanceKm)}`}
        </p>
        <p className="mt-1 text-sm">
          <span className={e.price ? "font-semibold" : "font-semibold text-success"}>{priceLabel(e.price)}</span>
          {data.approvedCount != null && <span className="text-muted-foreground"> · {data.approvedCount} באים</span>}
        </p>
      </div>
    </Link>
  );
}
