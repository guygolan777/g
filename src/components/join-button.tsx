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
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

const shekel = (price: number) => `₪${Number(price).toLocaleString("he-IL")}`;

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
    async (eventId: string, price?: number | null): Promise<ParticipantStatus | null> => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("join_event", { _event_id: eventId });
        if (error) throw error;
        const status = data as ParticipantStatus;
        void hapticTap(status === "approved" ? "success" : "light");
        toast.success(
          status === "approved" ? "🎉 נרשמת לאירוע!" : price ? "שמרנו לך מקום — אחרי התשלום המארגן/ת יאשר/תאשר" : "הבקשה נשלחה למארגן",
        );
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
  event: Pick<EventRow, "id" | "organizer_id"> & { price?: number | null };
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
    if (event.price) return <PayNow eventId={event.id} price={event.price} size={size} className={cls} />;
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
        const s = await join(event.id, event.price);
        if (s) setLocal(s);
      }}
    >
      {loading ? "רגע…" : event.price ? `הצטרפות · ${shekel(event.price)}` : "הצטרפות"}
    </Button>
  );
}

/** Paid event, seat held: pay the organizer (their link), then they confirm and the ticket is issued. */
function PayNow({ eventId, price, size, className }: { eventId: string; price: number; size: "sm" | "default" | "lg"; className?: string }) {
  const link = useQuery({
    queryKey: ["payment-link", eventId],
    queryFn: async () => ((await supabase.rpc("event_payment_link", { _event_id: eventId })).data as string | null) ?? null,
  });
  if (link.data) {
    return (
      <Button asChild size={size} variant="brand" className={className}>
        <a href={link.data} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <CreditCard /> לתשלום {shekel(price)} · ממתין לאישור
        </a>
      </Button>
    );
  }
  return (
    <Button size={size} variant="secondary" className={cn(className, "h-auto min-h-8 whitespace-normal py-1.5 leading-tight")} disabled>
      ממתין לתשלום ואישור המארגן
    </Button>
  );
}
