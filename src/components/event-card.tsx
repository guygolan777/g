import { Link } from "@tanstack/react-router";
import { MapPin, Video } from "lucide-react";
import { AvatarStack } from "@/components/avatar";
import { JoinButton } from "@/components/join-button";
import { Button } from "@/components/ui/button";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { hobbyLabel } from "@/lib/hobby-categories";
import { formatDistance } from "@/lib/geo";
import type { EventRow, ParticipantStatus } from "@/lib/types";
import type { ParticipantWithProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type EventCardData = {
  event: EventRow;
  status?: ParticipantStatus;
  approvedCount?: number;
  attendees?: ParticipantWithProfile[];
  distanceKm?: number | null;
};

/**
 * Event card. No organizer block and no "your event"/"from your interests" tags:
 * the organizer's photo appears only inside the attendee row.
 */
export function EventCard({
  data,
  viewerId,
  isGuest,
  onHide,
  layout = "carousel",
}: {
  data: EventCardData;
  viewerId?: string | null;
  isGuest?: boolean;
  onHide?: (eventId: string) => void;
  layout?: "carousel" | "list";
}) {
  const { event, status, attendees = [], distanceKm } = data;
  const count = Math.max(1, data.approvedCount ?? 0);
  const isOrganizer = !!viewerId && event.organizer_id === viewerId;
  const people = attendees.map((a) => a.profile).filter(Boolean) as Array<{ id: string; name: string; avatar_url: string | null }>;
  // Organizer first in the attendee row.
  people.sort((a, b) => (a.id === event.organizer_id ? -1 : b.id === event.organizer_id ? 1 : 0));

  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-soft", layout === "list" && "sm:flex-row")}>
      <Link to="/e/$id" params={{ id: event.id }} className="block">
        <div className={cn("relative bg-muted", layout === "carousel" ? "aspect-[4/3]" : "aspect-[16/9]")}>
          {event.image_url && <img src={event.image_url} alt="" loading="lazy" className="size-full object-cover" />}
          <span className="absolute top-2 right-2 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold backdrop-blur">
            {hobbyLabel(event.subcategory ?? event.category)}
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link to="/e/$id" params={{ id: event.id }} className="block">
          <p className="text-xs font-semibold text-event">{formatEventWhen(event.starts_at)}</p>
          <h3 className="mt-0.5 line-clamp-2 font-bold leading-snug">{whoComesTitle(event.title)}</h3>
          {!isGuest && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              {event.is_online ? <Video className="size-3.5 shrink-0" /> : <MapPin className="size-3.5 shrink-0" />}
              <span className="truncate">
                {event.is_online ? "אונליין" : (event.location_name ?? event.city ?? "")}
                {distanceKm != null && ` · ${formatDistance(distanceKm)}`}
              </span>
            </p>
          )}
        </Link>
        {!isGuest && (
          <div className="flex items-center gap-2">
            <AvatarStack people={people} />
            <span className="text-xs text-muted-foreground">{count} משתתפים</span>
          </div>
        )}
        <div className="mt-auto space-y-1 pt-1">
          <JoinButton event={event} status={status} />
          {onHide && !isOrganizer && !isGuest && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => onHide(event.id)}
            >
              הסר
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
