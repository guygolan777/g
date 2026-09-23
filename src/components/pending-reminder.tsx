import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

/** "יש לך N בקשות שממתינות לאישור" — join requests on events I organize. */
export function usePendingRequestsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pending-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: evs } = await supabase
        .from("events")
        .select("id")
        .eq("organizer_id", user!.id)
        .gte("ends_at", new Date().toISOString());
      const ids = (evs ?? []).map((e) => e.id as string);
      if (!ids.length) return 0;
      const { count } = await supabase
        .from("event_participants")
        .select("event_id", { count: "exact", head: true })
        .in("event_id", ids)
        .eq("status", "pending");
      return count ?? 0;
    },
  });
}

export function PendingReminder() {
  const { data: count = 0 } = usePendingRequestsCount();
  if (!count) return null;
  return (
    <Link to="/me" search={{ filter: "pending" }} className="mb-2 flex items-center gap-3 rounded-2xl bg-partner-soft px-4 py-3 text-sm font-semibold text-partner-foreground">
      <Hourglass className="size-5 shrink-0" />
      <span className="flex-1">יש לך {count} בקשות שממתינות לאישור</span>
      <span className="text-xs underline">לפרופיל</span>
    </Link>
  );
}
