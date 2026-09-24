/** Address → coordinates via OpenStreetMap Nominatim (no key required). */
export async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!query.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=he&countrycodes=il&q=${encodeURIComponent(query)}`,
    );
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data[0]) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name };
  } catch {
    return null;
  }
}

/** Nearest-city fallback when the reverse-geocoding service is unreachable. */
const IL_CITIES: Array<[string, number, number]> = [
  ["תל אביב", 32.0853, 34.7818], ["ירושלים", 31.7683, 35.2137], ["חיפה", 32.794, 34.9896], ["באר שבע", 31.252, 34.7915],
  ["ראשון לציון", 31.973, 34.7925], ["פתח תקווה", 32.084, 34.8878], ["אשדוד", 31.8044, 34.6553], ["נתניה", 32.3215, 34.8532],
  ["חולון", 32.0158, 34.7874], ["בני ברק", 32.0807, 34.8338], ["רמת גן", 32.0823, 34.8106], ["אשקלון", 31.6688, 34.5743],
  ["רחובות", 31.8928, 34.8113], ["בת ים", 32.0171, 34.7515], ["בית שמש", 31.7497, 34.9886], ["כפר סבא", 32.175, 34.907],
  ["הרצליה", 32.1663, 34.8436], ["חדרה", 32.434, 34.9196], ["מודיעין", 31.898, 35.0104], ["לוד", 31.951, 34.8881],
  ["רעננה", 32.1848, 34.8713], ["רמלה", 31.9275, 34.8625], ["גבעתיים", 32.0722, 34.8125], ["נצרת", 32.6996, 35.3035],
  ["עפולה", 32.6078, 35.2897], ["הוד השרון", 32.155, 34.8888], ["ראש העין", 32.0956, 34.9566], ["קריית גת", 31.61, 34.7642],
  ["נהריה", 33.0059, 35.0947], ["טבריה", 32.7922, 35.5312], ["אילת", 29.5577, 34.9519], ["כרמיאל", 32.9171, 35.3052],
  ["קריית שמונה", 33.2073, 35.5695], ["אריאל", 32.1065, 35.1843], ["יבנה", 31.8781, 34.7394], ["אור יהודה", 32.0303, 34.8506],
];

function nearestCity(lat: number, lng: number): string {
  let best = IL_CITIES[0];
  let bestD = Infinity;
  for (const c of IL_CITIES) {
    const d = (c[1] - lat) ** 2 + ((c[2] - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) (bestD = d), (best = c);
  }
  return best[0];
}

/** City name (Hebrew) for a position: OpenStreetMap reverse lookup, else the nearest known city. */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=he&lat=${lat}&lon=${lng}`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    const name = a.city || a.town || a.village || a.municipality || a.suburb || a.county;
    if (name) return name.replace(/^עיריית\s+/, "");
  } catch {
    /* fall through */
  }
  return nearestCity(lat, lng);
}
