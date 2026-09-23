import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Section, EmptyState } from "@/components/app-shell";
import { PersonCard } from "@/components/person-row";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { PROFILE_COLUMNS } from "@/lib/constants";
import { useBlockedIds, useMyGraph } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { categoryOf } from "@/lib/hobby-categories";
import type { Profile } from "@/lib/types";

/** People: my contacts first, then similar interests, nearby, my age — each person once. */
export function PeopleTab() {
  const { user, profile, isGuest } = useAuth();
  const { following, followers } = useMyGraph();
  const { data: blocked } = useBlockedIds();
  const [query, setQuery] = React.useState("");

  const q = useQuery({
    queryKey: ["people", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: people }, { data: near }] = await Promise.all([
        supabase.from("profiles").select(PROFILE_COLUMNS).eq("onboarded", true).is("banned_at", null).neq("id", user!.id).limit(300),
        supabase.rpc("nearby_profiles", { radius_km: 30 }),
      ]);
      return {
        people: (people ?? []) as Profile[],
        near: new Map(((near ?? []) as Array<{ profile_id: string; distance_km: number }>).map((n) => [n.profile_id, n.distance_km])),
      };
    },
  });

  const sections = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const people = withoutBlocked(q.data?.people ?? [], blocked ?? new Set(), (p) => p.id).filter(
      (p) => !term || [p.name, p.city ?? ""].join(" ").toLowerCase().includes(term),
    );
    const used = new Set<string>();
    const take = (list: Profile[]) => list.filter((p) => !used.has(p.id) && (used.add(p.id), true));

    const contacts = take(people.filter((p) => following.has(p.id) || followers.has(p.id)));

    const mine = new Set(profile?.hobbies ?? []);
    const myCats = new Set([...mine].map(categoryOf));
    const shared = (p: Profile) =>
      (p.hobbies ?? []).reduce((n, h) => n + (mine.has(h) ? 2 : myCats.has(categoryOf(h)) ? 1 : 0), 0);
    const similar = take(
      people
        .filter((p) => shared(p) > 0)
        .sort((a, b) => shared(b) - shared(a))
        .slice(0, 15),
    );

    const near = q.data?.near ?? new Map<string, number>();
    const nearby = take(
      people
        .filter((p) => near.has(p.id))
        .sort((a, b) => near.get(a.id)! - near.get(b.id)!)
        .slice(0, 15),
    );

    const myYear = profile?.birth_year;
    const sameAge = myYear
      ? take(people.filter((p) => p.birth_year && Math.abs(p.birth_year - myYear) <= 3).slice(0, 15))
      : [];
    return { contacts, similar, nearby, sameAge, near };
  }, [q.data, blocked, following, followers, profile, query]);

  if (isGuest) {
    return (
      <EmptyState
        emoji="👋"
        title="הכירו אנשים חדשים"
        text="הרשמו כדי לראות מי אוהב את מה שאתם אוהבים"
        action={
          <Button asChild variant="brand">
            <Link to="/signup">הרשמה</Link>
          </Button>
        }
      />
    );
  }
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;

  const block = (title: string, list: Profile[]) =>
    list.length > 0 && (
      <Section title={title}>
        <div className="grid grid-cols-3 gap-2">
          {list.map((p) => (
            <PersonCard key={p.id} person={p} followingLabel="עוקב/ת" className="w-auto min-w-0 px-2" />
          ))}
        </div>
      </Section>
    );

  return (
    <div>
      <label className="flex h-12 items-center gap-2 rounded-full bg-surface-soft px-4">
        <Search className="size-5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש אנשים"
          className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      {block("אנשי הקשר שלך", sections.contacts)}
      {block("תחומי עניין דומים", sections.similar)}
      {block("קרובים אליך", sections.nearby)}
      {block("בגיל שלך", sections.sameAge)}
      {!sections.contacts.length && !sections.similar.length && !sections.nearby.length && !sections.sameAge.length && (
        <div className="mt-4">
          <EmptyState emoji="🌱" title="עוד אין כאן אנשים" text="הוסיפו תחביבים ומיקום בפרופיל כדי לקבל הצעות" />
        </div>
      )}
    </div>
  );
}
