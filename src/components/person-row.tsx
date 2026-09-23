import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { ageFromBirthYear } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PersonRow({ person, note }: { person: Profile; note?: string }) {
  const age = ageFromBirthYear(person.birth_year);
  return (
    <Link to="/profile/$id" params={{ id: person.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
      <Avatar src={person.avatar_url} name={person.name} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{person.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[age ? `${age}` : null, person.city, note].filter(Boolean).join(" · ")}
        </p>
      </div>
      <FollowButton profileId={person.id} />
    </Link>
  );
}

/** Vertical person card (grid / RTL carousels): big round photo, name, follow button. */
export function PersonCard({ person, followingLabel, className }: { person: Profile; followingLabel?: string; className?: string }) {
  return (
    <Link
      to="/profile/$id"
      params={{ id: person.id }}
      className={cn("flex flex-col items-center gap-2 rounded-3xl bg-card p-3 text-center shadow-soft", className ?? "w-36 shrink-0")}
    >
      <Avatar src={person.avatar_url} name={person.name} size={84} />
      <p className="w-full truncate font-bold">{person.name}</p>
      <FollowButton profileId={person.id} followingLabel={followingLabel} className="h-9 w-full min-w-0 px-2" />
    </Link>
  );
}
