/**
 * Address / place autocomplete for events.
 * Google Places (New) when VITE_GOOGLE_MAPS_KEY is set — best coverage of Israeli streets and venues;
 * otherwise Photon (OpenStreetMap), which is free and allows type-ahead use.
 */

export type PlaceSuggestion = { id: string; main: string; secondary: string };
export type PlacePick = { label: string; address: string; lat: number; lng: number; city: string | null };

const GOOGLE_KEY = ((import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? "").trim();
export const PLACES_PROVIDER: "google" | "osm" = GOOGLE_KEY ? "google" : "osm";

// Google bills autocomplete + details per "session": one token from the first keystroke to the pick.
let session: string | null = null;
const sessionToken = () => (session ??= crypto.randomUUID());

type Near = { lat: number; lng: number } | null | undefined;

export async function suggestPlaces(input: string, near: Near, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  return PLACES_PROVIDER === "google" ? googleSuggest(q, near, signal) : photonSuggest(q, near, signal);
}

/** Coordinates (and city) for a chosen suggestion. */
export async function resolvePlace(s: PlaceSuggestion): Promise<PlacePick | null> {
  if (PLACES_PROVIDER === "google") return googleDetails(s);
  const hit = photonCache.get(s.id);
  return hit ?? null;
}

// ---------- Google Places (New) ----------

type GoogleAutocomplete = {
  suggestions?: Array<{
    placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } };
  }>;
};

async function googleSuggest(q: string, near: Near, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY },
    body: JSON.stringify({
      input: q,
      languageCode: "he",
      includedRegionCodes: ["il"],
      sessionToken: sessionToken(),
      ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = (await res.json()) as GoogleAutocomplete;
  return (data.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [{ id: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }];
  });
}

type GoogleDetails = {
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; types: string[] }>;
};

async function googleDetails(s: PlaceSuggestion): Promise<PlacePick | null> {
  const token = session;
  session = null; // the pick ends the billing session
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(s.id)}?languageCode=he${token ? `&sessionToken=${token}` : ""}`, {
    headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,location,addressComponents" },
  });
  if (!res.ok) return null;
  const d = (await res.json()) as GoogleDetails;
  if (!d.location) return null;
  const city = d.addressComponents?.find((c) => c.types.includes("locality"))?.longText ?? null;
  return {
    label: s.main || d.displayName?.text || d.formattedAddress || "",
    address: d.formattedAddress ?? s.secondary,
    lat: d.location.latitude,
    lng: d.location.longitude,
    city,
  };
}

// ---------- Photon (OpenStreetMap) fallback ----------

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { osm_id: number; osm_type: string; name?: string; street?: string; housenumber?: string; city?: string; town?: string; village?: string };
};
const photonCache = new Map<string, PlacePick>();

async function photonSuggest(q: string, near: Near, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q, limit: "6", bbox: "34.2,29.4,35.9,33.4" }); // Israel
  if (near) params.set("lat", String(near.lat)), params.set("lon", String(near.lng));
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).map((f) => {
    const p = f.properties;
    const city = p.city ?? p.town ?? p.village ?? null;
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const main = p.name || street || city || q;
    const secondary = [p.name ? street : "", city].filter(Boolean).join(", ");
    const id = `${p.osm_type}${p.osm_id}`;
    const [lng, lat] = f.geometry.coordinates;
    photonCache.set(id, { label: main, address: [main, secondary].filter(Boolean).join(", "), lat, lng, city });
    return { id, main, secondary };
  });
}
