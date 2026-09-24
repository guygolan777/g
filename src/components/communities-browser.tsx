import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Plus, Search, Users } from "lucide-react";
import { CategoryFilterRow, matchesCategories, useCategoryFilter } from "@/components/category-filter";
import { CommunityForm } from "@/components/community-form";
import { EmptyState } from "@/components/app-shell";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useCommunities } from "@/lib/queries";
import { hobbyEmoji, hobbyLabel } from "@/lib/hobby-categories";
import type { Community } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rememberRedirect, useGuestCommunityCounts } from "@/lib/guest";

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

/** Member counts, my memberships and my pending requests. */
export function useCommunityMembership() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community-membership", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: members }, { data: requests }] = await Promise.all([
        supabase.from("community_members").select("community_id, profile_id, role"),
        supabase.from("community_join_requests").select("community_id").eq("profile_id", user!.id).eq("status", "pending"),
      ]);
      const counts = new Map<string, number>();
      const mine = new Map<string, string>();
      for (const m of (members ?? []) as Array<{ community_id: string; profile_id: string; role: string }>) {
        counts.set(m.community_id, (counts.get(m.community_id) ?? 0) + 1);
        if (m.profile_id === user!.id) mine.set(m.community_id, m.role);
      }
      return { counts, mine, pending: new Set((requests ?? []).map((r) => r.community_id as string)) };
    },
  });
}

export async function joinCommunity(id: string): Promise<"member" | "pending" | null> {
  const { data, error } = await supabase.rpc("request_community_join", { _community_id: id, _message: null });
  if (error) {
    const m = error.message;
    toast.error(m.includes("audience") ? "הקהילה מיועדת לקהל אחר" : m.includes("age") ? "הקהילה מיועדת לטווח גילאים אחר" : "ההצטרפות נכשלה");
    return null;
  }
  toast.success(data === "member" ? "🎉 הצטרפת לקהילה" : "הבקשה נשלחה למנהלי הקהילה");
  return data as "member" | "pending";
}

export function CommunityThumb({ community, className }: { community: Pick<Community, "image_url" | "hobby">; className?: string }) {
  return (
    <div className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-event-soft", className)}>
      <span className="text-5xl" aria-hidden>
        {hobbyEmoji(community.hobby)}
      </span>
      <SafeImg src={community.image_url ?? undefined} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

/** Compact card (profile carousels): letter badge, category · city, role and "N אירועים זמינים". */
export function CommunityCard({ community, eventCount, role, members }: { community: Community; eventCount: number; role?: string; members?: number }) {
  return (
    <Link to="/community/$id" params={{ id: community.id }} className="flex h-full flex-col gap-2 rounded-3xl bg-card p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-partner-soft text-xl font-bold text-partner-strong">
          {community.name.trim().charAt(0)}
        </span>
        <p className="truncate text-lg font-bold">{community.name}</p>
      </div>
      <p className="truncate text-sm text-muted-foreground">
        {hobbyLabel(community.hobby, false)}
        {community.city ? ` · ${community.city}` : ""}
      </p>
      <div className="flex items-center justify-between gap-2">
        {role && (
          <span className={cn("rounded-full px-3 py-1 text-sm", role === "member" ? "bg-muted text-foreground" : "bg-event-soft text-event")}>
            {role === "founder" ? "מייסד/ת" : role === "admin" ? "מנהל/ת" : "חבר/ה"}
          </span>
        )}
        {members != null && <span className="text-sm text-muted-foreground">{members} חברים</span>}
      </div>
      <p className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary">
        <CalendarPlus className="size-4" />
        {eventCount === 1 ? "אירוע זמין" : `${eventCount} אירועים זמינים`}
      </p>
    </Link>
  );
}

/** Full card for the communities tab: thumb, info, join state and "פתיחת אירוע לקהילה". */
function CommunityListCard({
  community,
  members,
  role,
  pending,
  onJoined,
}: {
  community: Community;
  members?: number;
  role?: string;
  pending: boolean;
  onJoined: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="min-w-0 rounded-3xl bg-card p-4 shadow-soft">
      <div className="flex min-w-0 gap-3">
        <Link to="/community/$id" params={{ id: community.id }}>
          <CommunityThumb community={community} className="size-16 sm:size-20" />
        </Link>
        <Link to="/community/$id" params={{ id: community.id }} className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base leading-snug font-bold sm:text-lg">{community.name}</p>
          <p className="truncate text-sm font-semibold text-primary">{hobbyLabel(community.hobby, false)}</p>
          {community.description && <p className="line-clamp-1 text-sm text-muted-foreground">{community.description}</p>}
          <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <Users className="size-4 shrink-0" />
            {members != null ? `${members} חברים` : ""}
            {community.city ? ` · ${community.city}` : ""}
          </p>
        </Link>
        <div className="shrink-0">
          {role ? (
            <span className="inline-flex h-9 items-center rounded-full bg-secondary px-3 text-sm shadow-soft">הצטרפתי</span>
          ) : pending ? (
            <span className="inline-flex h-9 items-center rounded-full bg-secondary px-4 text-sm">ממתין</span>
          ) : (
            <Button
              size="sm"
              className="h-9 px-3"
              disabled={busy}
              onClick={async () => {
                if (!user) {
                  rememberRedirect(`/community/${community.id}`);
                  return void navigate({ to: "/signup" });
                }
                setBusy(true);
                const r = await joinCommunity(community.id);
                setBusy(false);
                if (r) onJoined();
              }}
            >
              הצטרפות
            </Button>
          )}
        </div>
      </div>
      {role && (
        <Button asChild variant="brand" size="lg" className="mt-4 w-full min-w-0">
          <Link to="/event/new" search={{ community: community.id }}>
            <CalendarPlus /> פתיחת אירוע לקהילה
          </Link>
        </Button>
      )}
    </div>
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
  const qc = useQueryClient();
  const { data: communities = [], isLoading } = useCommunities();
  const membership = useCommunityMembership();
  const guestCounts = useGuestCommunityCounts(!user);
  const [query, setQuery] = React.useState("");
  const [cats, setCats] = useCategoryFilter("communities");
  const [creating, setCreating] = React.useState(false);

  const list = communities.filter((c) => matchesCategories(c.hobby, cats) && matchesQuery(c, query.trim()));

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-soft px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            id="community-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש קהילה"
            className="h-full w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button className="h-12 shrink-0 px-4" onClick={() => (user ? setCreating(true) : void navigate({ to: "/signup" }))}>
          <Plus /> פתיחת קהילה
        </Button>
      </div>
      <div className="mt-3">
        <CategoryFilterRow selected={cats} onChange={setCats} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-3xl" />)}
        {!isLoading && list.length === 0 && <EmptyState emoji="🔎" title="לא מצאנו קהילות" text="נסו חיפוש אחר או פתחו קהילה חדשה" />}
        {list.map((c) => (
          <CommunityListCard
            key={c.id}
            community={c}
            members={membership.data?.counts.get(c.id) ?? guestCounts.data?.get(c.id)}
            role={membership.data?.mine.get(c.id)}
            pending={!!membership.data?.pending.has(c.id)}
            onJoined={() => {
              void qc.invalidateQueries({ queryKey: ["community-membership"] });
              void qc.invalidateQueries({ queryKey: ["my-communities"] });
            }}
          />
        ))}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="פתיחת קהילה חדשה" description="בחרו תחביב ותנו לאנשים מקום להכיר ולעשות אותו יחד.">
          <CommunityForm onCreated={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
