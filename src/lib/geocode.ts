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
