/**
 * "הסר" on an event card: a quiet, per-user preference (not a report).
 * Stored in localStorage under mibale-hidden-events:{profileId}.
 */
const key = (profileId: string) => `mibale-hidden-events:${profileId}`;

export function getHiddenEvents(profileId: string | null | undefined): Set<string> {
  if (!profileId || typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key(profileId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function hideEvent(profileId: string, eventId: string): Set<string> {
  const set = getHiddenEvents(profileId);
  set.add(eventId);
  try {
    localStorage.setItem(key(profileId), JSON.stringify([...set]));
  } catch {
    /* storage unavailable — hidden for this session only */
  }
  return set;
}

export function unhideEvent(profileId: string, eventId: string): Set<string> {
  const set = getHiddenEvents(profileId);
  set.delete(eventId);
  try {
    localStorage.setItem(key(profileId), JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
  return set;
}
