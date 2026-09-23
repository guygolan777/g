import { supabase } from "./supabase";

let cache: { ids: Set<string>; at: number } | null = null;
const TTL = 60_000;

/** Everyone I blocked and everyone who blocked me (via blocked_profile_ids RPC), cached. */
export async function fetchBlockedIds(force = false): Promise<Set<string>> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.ids;
  const { data, error } = await supabase.rpc("blocked_profile_ids");
  if (error) return cache?.ids ?? new Set();
  const ids = new Set<string>((data as unknown as string[] | null) ?? []);
  cache = { ids, at: Date.now() };
  return ids;
}

export function invalidateBlocked() {
  cache = null;
}

/** Filter any list by a profile-id accessor so blocked people never render. */
export function withoutBlocked<T>(items: T[], blocked: Set<string>, getId: (item: T) => string | null | undefined): T[] {
  if (!blocked.size) return items;
  return items.filter((i) => {
    const id = getId(i);
    return !id || !blocked.has(id);
  });
}

export const BLOCKED_MESSAGE = "הפרופיל אינו זמין — קיימת חסימה בינך ובין המשתמש הזה";
