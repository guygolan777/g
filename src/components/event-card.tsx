import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Play } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { JoinButton } from "@/components/join-button";
import { SafeImg } from "@/components/safe-img";
import { whoComesTitle } from "@/lib/event-title";
import { formatDate, formatTime } from "@/lib/format";
import { getCategory, getSubcategory, hobbyEmoji } from "@/lib/hobby-categories";
import { formatDistance } from "@/lib/geo";
import { UNLIMITED_SEATS } from "@/lib/constants";
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

export function priceLabel(price: number | null | undefined): string {
  return !price ? "חינם" : `₪${Number(price).toLocaleString("he-IL")}`;
}

/** Date badge on the event image: pink DD.MM with the time underneath. */
export function DateBadge({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn("flex flex-col items-center rounded-2xl bg-surface/90 px-3 py-1.5 leading-tight shadow-soft backdrop-blur", className)}>
      <span className="text-lg font-extrabold text-like">{formatDate(iso, { day: "2-digit", month: "2-digit" }).replace("/", ".")}</span>
      <span className="text-xs text-muted-foreground">{formatTime(iso)}</span>
    </span>
  );
}

/** Image of an event (a video event shows its still frame + ▶), or its subcategory emoji when there is none. */
export function EventMedia({
  event,
  className,
  children,
}: {
  event: Pick<EventRow, "image_url" | "subcategory" | "category"> & { video_url?: string | null };
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-surface-soft", className)}>
      <span className="text-7xl" aria-hidden>
        {hobbyEmoji(event.subcategory ?? event.category)}
      </span>
      <SafeImg src={event.image_url ?? undefined} className="absolute inset-0 size-full object-cover" />
      {event.video_url && (
        <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-foreground/60 text-background" aria-label="סרטון">
          <Play className="size-4 fill-current" />
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Event card. No organizer block and no "your event"/"from your interests" tags:
 * the organizer's photo appears only in the attendee row.
 */
export function EventCard({
  data,
  viewerId,
  isGuest,
  onHide,
}: {
  data: EventCardData;
  viewerId?: string | null;
  isGuest?: boolean;
  onHide?: (eventId: string) => void;
  layout?: "carousel" | "list";
}) {
  const { event, status, attendees = [], distanceKm } = data;
  const count = Math.max(1, data.approvedCount ?? 0);
  const seats = event.seats ?? UNLIMITED_SEATS;
  const isOrganizer = !!viewerId && event.organizer_id === viewerId;
  const organizer = attendees.find((a) => a.profile_id === event.organizer_id)?.profile ?? attendees[0]?.profile;
  const cat = getCategory(event.category);
  const sub = getSubcategory(event.subcategory);
  const place = event.is_online ? "אונליין" : [event.city, event.location_name].filter(Boolean).join(" · ") || "מיקום יתפרסם בקרוב";

  return (
    <article className="flex h-full flex-col rounded-3xl bg-card p-3 shadow-soft">
      <Link to="/e/$id" params={{ id: event.id }} className="block">
        <EventMedia event={event} className="aspect-[4/3] rounded-2xl">
          <DateBadge iso={event.starts_at} className="absolute top-2 right-2" />
          <span
            className={cn(
              "absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold",
              event.price ? "bg-surface/90 text-foreground" : "bg-success text-success-foreground",
            )}
          >
            {priceLabel(event.price)}
          </span>
        </EventMedia>
      </Link>

      <div className="mt-1 flex flex-1 flex-col gap-1.5 px-1">
        <Link to="/e/$id" params={{ id: event.id }} className="block">
          <h3 className="truncate text-lg font-bold">{whoComesTitle(event.title)}</h3>
          {isGuest ? (
            <>
              <p className="mt-0.5 flex items-center gap-1 truncate text-sm">
                <MapPin className="size-4 shrink-0 text-primary" />
                <span className="truncate">{[cat?.label, sub?.label].filter(Boolean).join(" · ")}</span>
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {event.is_online ? "אונליין" : event.city ?? "המיקום לחברים בלבד"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 flex items-center gap-1 truncate text-sm">
                <MapPin className="size-4 shrink-0 text-primary" />
                <span className="truncate">{[cat?.label, sub?.label].filter(Boolean).join(" · ")}</span>
              </p>
              <p className="truncate pe-5 text-sm text-muted-foreground">
                {place}
                {distanceKm != null && ` · ${formatDistance(distanceKm)}`}
              </p>
            </>
          )}
        </Link>
        {isGuest ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex -space-x-2 space-x-reverse blur-[1.5px]" aria-hidden>
              <span className="size-6 rounded-full bg-event-soft ring-2 ring-surface" />
              <span className="size-6 rounded-full bg-like-soft ring-2 ring-surface" />
              <span className="size-6 rounded-full bg-partner-soft ring-2 ring-surface" />
            </span>
            <span className="font-bold">{count} נרשמו</span>
            <span className="text-muted-foreground">· מי? לחברים 🔒</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Avatar src={organizer?.avatar_url} name={organizer?.name} size={30} />
            <span className="text-sm font-bold" dir="ltr">
              {seats < UNLIMITED_SEATS ? `${count}/${seats}` : count}
            </span>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              גיל: {event.min_age ?? 18}-{event.max_age ?? 99}
            </span>
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <JoinButton event={event} status={status} size="default" className="flex-1" />
          {onHide && !isOrganizer && !isGuest && (
            <button className="shrink-0 px-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => onHide(event.id)}>
              הסר
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
