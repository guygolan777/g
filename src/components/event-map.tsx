import * as React from "react";
import { Link } from "@tanstack/react-router";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import type { EventRow } from "@/lib/types";

type Leaflet = typeof import("react-leaflet");

/** Map with event pins (client-only; Leaflet touches window). */
export function EventMap({
  events,
  center,
  radiusKm,
}: {
  events: EventRow[];
  center?: { lat: number; lng: number } | null;
  /** When set (with a center): shows "you are here" and the search radius. */
  radiusKm?: number;
}) {
  const [mod, setMod] = React.useState<{ rl: Leaflet; L: typeof import("leaflet") } | null>(null);
  React.useEffect(() => {
    void Promise.all([import("react-leaflet"), import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([rl, L]) =>
      setMod({ rl, L: (L as unknown as { default: typeof import("leaflet") }).default ?? L }),
    );
  }, []);
  const pins = events.filter((e) => e.lat != null && e.lng != null && !e.is_online);
  if (!mod) return <div className="aspect-square w-full animate-pulse rounded-3xl bg-muted" />;
  const { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker } = mod.rl;
  const icon = mod.L.divIcon({
    className: "",
    html: '<div style="width:18px;height:18px;border-radius:9999px;background:var(--primary);border:3px solid var(--surface);box-shadow:var(--shadow-soft)"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  const c = center ?? (pins[0] ? { lat: pins[0].lat!, lng: pins[0].lng! } : { lat: 32.0853, lng: 34.7818 });
  return (
    <div className="aspect-square w-full overflow-hidden rounded-3xl shadow-soft" dir="ltr">
      <MapContainer center={[c.lat, c.lng]} zoom={radiusKm ? zoomFor(radiusKm) : 12} className="size-full" scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {radiusKm && center && (
          <>
            <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "var(--primary)", weight: 1, fillOpacity: 0.06 }} />
            <CircleMarker center={[center.lat, center.lng]} radius={8} pathOptions={{ color: "white", weight: 3, fillColor: "var(--like)", fillOpacity: 1 }}>
              <Popup>
                <div dir="rtl" className="font-sans">את/ה כאן</div>
              </Popup>
            </CircleMarker>
          </>
        )}
        {pins.map((e) => (
          <Marker key={e.id} position={[e.lat!, e.lng!]} icon={icon}>
            <Popup>
              <div dir="rtl" className="font-sans">
                <Link to="/e/$id" params={{ id: e.id }} className="font-bold">
                  {whoComesTitle(e.title)}
                </Link>
                <div className="text-xs">{formatEventWhen(e.starts_at)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/** Zoom that roughly fits a radius (km) on a phone-width square map. */
function zoomFor(km: number): number {
  if (km <= 3) return 13;
  if (km <= 7) return 12;
  if (km <= 15) return 11;
  if (km <= 35) return 10;
  return 9;
}
