import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useMyGraph, useMyParticipations, useParticipants, useUpcomingEvents } from "@/lib/queries";
import { getHiddenEvents, hideEvent } from "@/lib/hidden-events";
import { ageFromBirthDate } from "@/lib/format";
import { eventDistance, type RankContext } from "@/lib/event-ranking";
import type { EventCardData } from "@/components/event-card";
import type { EventRow } from "@/lib/types";

export function useMyLocation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-location", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profile_locations").select("lat, lng").eq("profile_id", user!.id).maybeSingle();
      return (data as { lat: number; lng: number } | null) ?? null;
    },
  });
}

/** Everything the event feeds need: events, participants, graph, ranking context and hidden events. */
export function useEventFeed() {
  const { user, profile, settings, isGuest } = useAuth();
  const { events, isLoading } = useUpcomingEvents();
  const ids = React.useMemo(() => events.map((e) => e.id), [events]);
  const parts = useParticipants(ids);
  const graph = useMyGraph();
  const mine = useMyParticipations();
  const { data: location } = useMyLocation();

  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setHidden(getHiddenEvents(user?.id)), [user?.id]);
  const hide = React.useCallback(
    (eventId: string) => {
      if (user) setHidden(new Set(hideEvent(user.id, eventId)));
    },
    [user],
  );

  const ctx = React.useMemo<RankContext>(() => {
    const pastCategories = new Map<string, number>();
    for (const p of mine.data ?? []) {
      if (p.status === "approved" && p.event && new Date(p.event.starts_at).getTime() < Date.now()) {
        pastCategories.set(p.event.category, (pastCategories.get(p.event.category) ?? 0) + 1);
      }
    }
    return {
      me: user
        ? {
            id: user.id,
            hobbies: profile?.hobbies ?? [],
            gender: profile?.gender,
            age: ageFromBirthDate(settings?.birth_date),
            location: location ?? null,
          }
        : null,
      following: graph.following,
      followers: graph.followers,
      myStatus: parts.myStatus,
      pastCategories,
      approvedCounts: parts.approvedCounts,
      attendees: parts.attendees,
    };
  }, [user, profile, settings, location, graph.following, graph.followers, parts.myStatus, parts.approvedCounts, parts.attendees, mine.data]);

  const visible = React.useMemo(() => events.filter((e) => !hidden.has(e.id)), [events, hidden]);

  const toCard = React.useCallback(
    (event: EventRow): EventCardData => ({
      event,
      status: parts.myStatus.get(event.id),
      approvedCount: parts.approvedCounts.get(event.id),
      attendees: parts.attendeeProfiles.get(event.id),
      distanceKm: eventDistance(event, location),
    }),
    [parts.myStatus, parts.approvedCounts, parts.attendeeProfiles, location],
  );

  return {
    isGuest,
    viewerId: user?.id ?? null,
    isLoading,
    events: visible,
    ctx,
    hide,
    toCard,
    pendingCounts: parts.pendingCounts,
    location,
  };
}
