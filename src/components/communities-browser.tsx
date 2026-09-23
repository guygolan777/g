import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { CategoryFilterRow, matchesCategories, useCategoryFilter } from "@/components/category-filter";
import { EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useCommunities } from "@/lib/queries";
import { hobbyLabel } from "@/lib/hobby-categories";
import type { Community } from "@/lib/types";

/** Upcoming event count per community ("N אירועים זמינים"). */
export function useCommunityEventCounts() {
  return useQuery({
    queryKey: ["community-event-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("community_id")
        .not("community_id", "is", null)
        .gte("starts_at", new Date().toISOString());
      const m = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ community_id: string }>) m.set(r.community_id, (m.get(r.community_id) ?? 0) + 1);
      return m;
    },
  });
}

export function CommunityCard({ community, eventCount }: { community: Community; eventCount: number }) {
  return (
    <Link to="/community/$id" params={{ id: community.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
      <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-teal-soft">
        {community.image_url ? (
          <SafeImg src={community.image_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-2xl">{hobbyLabel(community.hobby).split(" ")[0]}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{community.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {hobbyLabel(community.hobby, false)}
          {community.city ? ` · ${community.city}` : ""}
        </p>
        <p className="mt-1 text-xs font-semibold text-teal">{eventCount} אירועים זמינים</p>
      </div>
    </Link>
  );
}

function matchesQuery(c: Community, q: string): boolean {
  if (!q) return true;
  const hay = [c.name, c.description, c.city ?? "", hobbyLabel(c.hobby, false)].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Communities: live search next to "פתיחת קהילה +", combined with the category filter. */
export function CommunitiesBrowser() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: communities = [], isLoading } = useCommunities();
  const { data: counts = new Map<string, number>() } = useCommunityEventCounts();
  const [query, setQuery] = React.useState("");
  const [cats, setCats] = useCategoryFilter("communities");

  const list = communities.filter((c) => matchesCategories(c.hobby, cats) && matchesQuery(c, query.trim()));

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-full border border-input bg-surface px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש קהילה"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button variant="brand" className="h-11" onClick={() => void navigate({ to: user ? "/community/new" : "/signup" })}>
          פתיחת קהילה
          <Plus />
        </Button>
      </div>
      <div className="mt-3">
        <CategoryFilterRow selected={cats} onChange={setCats} />
      </div>
      <div className="mt-4 space-y-2">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-22 w-full rounded-2xl" />)}
        {!isLoading && list.length === 0 && <EmptyState emoji="🔎" title="לא מצאנו קהילות" text="נסו חיפוש אחר או פתחו קהילה חדשה" />}
        {list.map((c) => (
          <CommunityCard key={c.id} community={c} eventCount={counts.get(c.id) ?? 0} />
        ))}
      </div>
    </div>
  );
}
