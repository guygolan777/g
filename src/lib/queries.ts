import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "./supabase";
import { EVENT_COLUMNS, EVENT_GUEST_COLUMNS, PROFILE_COLUMNS, PROFILE_MINI } from "./constants";
import { fetchBlockedIds, withoutBlocked } from "./blocks";
import { useAuth } from "@/hooks/use-auth";
import type { Community, EventRow, Participant, ParticipantStatus, Profile } from "./types";

export type ParticipantWithProfile = Participant & { profile: Pick<Profile, "id" | "name" | "avatar_url"> | null };

export const qk = {
  upcoming: (guest: boolean) => ["events", "upcoming", guest] as const,
  event: (id: string) => ["events", id] as const,
  participants: (ids: string[]) => ["participants", [...ids].sort().join(",")] as const,
  graph: (uid?: string) => ["graph", uid] as const,
  myParticipations: (uid?: string) => ["my-participations", uid] as const,
  blocked: (uid?: string) => ["blocked", uid] as const,
  communities: ["communities"] as const,
  myCommunities: (uid?: string) => ["my-communities", uid] as const,
  unread: (uid?: string) => ["unread", uid] as const,
  profile: (id: string) => ["profile", id] as const,
};

export function useBlockedIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.blocked(user?.id),
    queryFn: () => fetchBlockedIds(),
    enabled: !!user,
    staleTime: 60_000,
    initialData: new Set<string>(),
  });
}

export function useUpcomingEvents() {
  const { isGuest, ready } = useAuth();
  const { data: blocked } = useBlockedIds();
  const q = useQuery({
    queryKey: qk.upcoming(isGuest),
    enabled: ready,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
      const { data, error } = await supabase
        .from("events")
        .select(isGuest ? EVENT_GUEST_COLUMNS : EVENT_COLUMNS)
        .gte("starts_at", since)
        .order("starts_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });
  const events = React.useMemo(
    () => withoutBlocked(q.data ?? [], blocked ?? new Set(), (e) => e.organizer_id),
    [q.data, blocked],
  );
  return { ...q, events };
}

/** Approved participants + my own row for a set of events. */
export function useParticipants(eventIds: string[]) {
  const { user, isGuest } = useAuth();
  const q = useQuery({
    queryKey: qk.participants(eventIds),
    enabled: !isGuest && !!user && eventIds.length > 0,
    queryFn: async () => {
      const out: ParticipantWithProfile[] = [];
      for (let i = 0; i < eventIds.length; i += 100) {
        const chunk = eventIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("event_participants")
          .select(`event_id, profile_id, status, created_at, profile:profiles(${PROFILE_MINI})`)
          .in("event_id", chunk);
        if (error) throw error;
        out.push(...((data ?? []) as unknown as ParticipantWithProfile[]));
      }
      return out;
    },
  });
  const derived = React.useMemo(() => {
    const approvedCounts = new Map<string, number>();
    const pendingCounts = new Map<string, number>();
    const attendees = new Map<string, string[]>();
    const attendeeProfiles = new Map<string, ParticipantWithProfile[]>();
    const myStatus = new Map<string, ParticipantStatus>();
    for (const p of q.data ?? []) {
      if (p.profile_id === user?.id) myStatus.set(p.event_id, p.status);
      if (p.status === "approved") {
        approvedCounts.set(p.event_id, (approvedCounts.get(p.event_id) ?? 0) + 1);
        attendees.set(p.event_id, [...(attendees.get(p.event_id) ?? []), p.profile_id]);
        attendeeProfiles.set(p.event_id, [...(attendeeProfiles.get(p.event_id) ?? []), p]);
      } else if (p.status === "pending") {
        pendingCounts.set(p.event_id, (pendingCounts.get(p.event_id) ?? 0) + 1);
      }
    }
    return { approvedCounts, pendingCounts, attendees, attendeeProfiles, myStatus };
  }, [q.data, user?.id]);
  return { ...q, ...derived };
}

/** Who I follow and who follows me. */
export function useMyGraph() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: qk.graph(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const uid = user!.id;
      const [a, b] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", uid),
        supabase.from("follows").select("follower_id").eq("following_id", uid),
      ]);
      return {
        following: new Set((a.data ?? []).map((r) => r.following_id as string)),
        followers: new Set((b.data ?? []).map((r) => r.follower_id as string)),
      };
    },
  });
  return {
    ...q,
    following: q.data?.following ?? new Set<string>(),
    followers: q.data?.followers ?? new Set<string>(),
  };
}

export type MyParticipation = { event_id: string; status: ParticipantStatus; event: EventRow | null };

/** All my participation rows with their events (calendar, profile, taste). */
export function useMyParticipations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.myParticipations(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select(`event_id, status, event:events(${EVENT_COLUMNS})`)
        .eq("profile_id", user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as MyParticipation[];
    },
  });
}

export function useProfiles(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["profiles", key.join(",")],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", key);
      return new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]));
    },
  });
}

export function useCommunities() {
  return useQuery({
    queryKey: qk.communities,
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Community[];
    },
  });
}

export function useMyCommunities(profileId?: string) {
  return useQuery({
    queryKey: qk.myCommunities(profileId),
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("community_members")
        .select("role, community:communities(*)")
        .eq("profile_id", profileId!);
      return ((data ?? []) as unknown as Array<{ role: string; community: Community | null }>).filter((r) => r.community);
    },
  });
}

/** Unread direct messages + unread notifications, kept live via realtime. */
export function useUnreadCounts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.unread(user?.id),
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [m, n] = await Promise.all([
        supabase
          .from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", user!.id)
          .is("read_at", null),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", user!.id)
          .is("read_at", null),
      ]);
      return { messages: m.count ?? 0, notifications: n.count ?? 0 };
    },
  });
  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => void qc.invalidateQueries({ queryKey: qk.unread(user.id) }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [user, qc]);
  return q.data ?? { messages: 0, notifications: 0 };
}

export function useInvalidateEvents() {
  const qc = useQueryClient();
  return React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["participants"] });
    void qc.invalidateQueries({ queryKey: ["my-participations"] });
  }, [qc]);
}
