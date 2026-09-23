import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { ageFromBirthYear } from "@/lib/format";
import type { Profile } from "@/lib/types";

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

/** Compact vertical card for horizontal RTL carousels. */
export function PersonCard({ person }: { person: Profile }) {
  return (
    <Link to="/profile/$id" params={{ id: person.id }} className="flex w-32 flex-col items-center gap-2 rounded-2xl bg-card p-3 text-center shadow-soft">
      <Avatar src={person.avatar_url} name={person.name} size={64} />
      <p className="w-full truncate text-sm font-bold">{person.name}</p>
      <FollowButton profileId={person.id} className="w-full min-w-0 px-2" />
    </Link>
  );
}
