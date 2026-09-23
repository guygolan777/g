import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useInvalidateEvents } from "@/lib/queries";
import { hapticTap } from "@/lib/native";
import type { EventRow, ParticipantStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rememberRedirect } from "@/lib/guest";

const ERRORS: Record<string, string> = {
  "event full": "האירוע מלא",
  "audience mismatch": "האירוע מיועד לקהל אחר",
  "age mismatch": "האירוע מיועד לטווח גילאים אחר",
  "event ended": "האירוע כבר הסתיים",
  blocked: "לא ניתן להצטרף לאירוע הזה",
  "not allowed": "אין אפשרות להצטרף כרגע",
};

export function joinErrorMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
  return Object.entries(ERRORS).find(([k]) => msg.includes(k))?.[1] ?? "לא הצלחנו לצרף אותך, נסו שוב";
}

export function useJoinEvent() {
  const invalidate = useInvalidateEvents();
  const [loading, setLoading] = React.useState(false);
  const join = React.useCallback(
    async (eventId: string): Promise<ParticipantStatus | null> => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("join_event", { _event_id: eventId });
        if (error) throw error;
        const status = data as ParticipantStatus;
        void hapticTap(status === "approved" ? "success" : "light");
        toast.success(status === "approved" ? "🎉 נרשמת לאירוע!" : "הבקשה נשלחה למארגן");
        invalidate();
        return status;
      } catch (e) {
        toast.error(joinErrorMessage(e));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [invalidate],
  );
  return { join, loading };
}

/**
 * The real, status-aware event button:
 * הצטרפות / ממתין לאישור המארגן / אתם בפנים — לפרטי האירוע / האירוע שלך — לניהול
 */
export function JoinButton({
  event,
  status,
  className,
  size = "sm",
}: {
  event: Pick<EventRow, "id" | "organizer_id">;
  status: ParticipantStatus | undefined;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { join, loading } = useJoinEvent();
  const [local, setLocal] = React.useState<ParticipantStatus | undefined>(status);
  React.useEffect(() => setLocal(status), [status]);

  const cls = cn("w-full", className);
  if (user && event.organizer_id === user.id) {
    return (
      <Button asChild size={size} variant="partner" className={cls}>
        <Link to="/e/$id" params={{ id: event.id }}>האירוע שלך — לניהול</Link>
      </Button>
    );
  }
  if (local === "approved") {
    return (
      <Button asChild size={size} variant="secondary" className={cn(cls, "h-auto min-h-8 whitespace-normal py-1.5 leading-tight")}>
        <Link to="/e/$id" params={{ id: event.id }}>אתם בפנים — לפרטי האירוע</Link>
      </Button>
    );
  }
  if (local === "pending") {
    return (
      <Button size={size} variant="secondary" className={cls} disabled>
        ממתין לאישור המארגן
      </Button>
    );
  }
  return (
    <Button
      size={size}
      variant="brand"
      className={cls}
      disabled={loading}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          rememberRedirect(`/e/${event.id}`);
          return void navigate({ to: "/signup" });
        }
        const s = await join(event.id);
        if (s) setLocal(s);
      }}
    >
      {loading ? "רגע…" : "הצטרפות"}
    </Button>
  );
}
