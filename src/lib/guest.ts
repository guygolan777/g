import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

const KEY = "mibale-after-auth";

/** Remember where a guest was, so signup/login brings them right back. */
export function rememberRedirect(path: string | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeRedirect(fallback = "/home"): string {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
  } catch {
    return fallback;
  }
}

export type GuestStats = { members: number; events_week: number; communities: number; dating_open: number };

/** Aggregate numbers only — social proof without exposing anyone. */
export function useGuestStats() {
  return useQuery({
    queryKey: ["guest-stats"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.rpc("guest_stats")).data as GuestStats | null) ?? null,
  });
}

export function useGuestEventCounts(ids: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["guest-event-counts", [...ids].sort().join(",")],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.rpc("guest_event_counts", { ids });
      return new Map(((data ?? []) as Array<{ event_id: string; approved: number }>).map((r) => [r.event_id, r.approved]));
    },
  });
}

export function useGuestCommunityCounts(enabled: boolean) {
  return useQuery({
    queryKey: ["guest-community-counts"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.rpc("guest_community_counts");
      return new Map(((data ?? []) as Array<{ community_id: string; members: number }>).map((r) => [r.community_id, r.members]));
    },
  });
}
