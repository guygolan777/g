import * as React from "react";
import { Link } from "@tanstack/react-router";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import type { EventRow } from "@/lib/types";

type Leaflet = typeof import("react-leaflet");

/** Map with event pins (client-only; Leaflet touches window). */
export function EventMap({ events, center }: { events: EventRow[]; center?: { lat: number; lng: number } | null }) {
  const [mod, setMod] = React.useState<{ rl: Leaflet; L: typeof import("leaflet") } | null>(null);
  React.useEffect(() => {
    void Promise.all([import("react-leaflet"), import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([rl, L]) =>
      setMod({ rl, L: (L as unknown as { default: typeof import("leaflet") }).default ?? L }),
    );
  }, []);
  const pins = events.filter((e) => e.lat != null && e.lng != null && !e.is_online);
  if (!mod) return <div className="aspect-square w-full animate-pulse rounded-3xl bg-muted" />;
  const { MapContainer, TileLayer, Marker, Popup } = mod.rl;
  const icon = mod.L.divIcon({
    className: "",
    html: '<div style="width:18px;height:18px;border-radius:9999px;background:var(--primary);border:3px solid var(--surface);box-shadow:var(--shadow-soft)"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  const c = center ?? (pins[0] ? { lat: pins[0].lat!, lng: pins[0].lng! } : { lat: 32.0853, lng: 34.7818 });
  return (
    <div className="aspect-square w-full overflow-hidden rounded-3xl shadow-soft" dir="ltr">
      <MapContainer center={[c.lat, c.lng]} zoom={12} className="size-full" scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
