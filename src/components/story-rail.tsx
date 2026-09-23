import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { PROFILE_MINI } from "@/lib/constants";
import { useBlockedIds } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import type { Profile, Story } from "@/lib/types";

export type StoryWithAuthor = Story & { author: Pick<Profile, "id" | "name" | "avatar_url"> | null };

export function useActiveStories() {
  const { user } = useAuth();
  const { data: blocked } = useBlockedIds();
  const q = useQuery({
    queryKey: ["stories", "active", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: stories }, { data: views }] = await Promise.all([
        supabase
          .from("stories")
          .select(`*, author:profiles(${PROFILE_MINI})`)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("story_views").select("story_id").eq("viewer_id", user!.id),
      ]);
      return {
        stories: (stories ?? []) as unknown as StoryWithAuthor[],
        viewed: new Set((views ?? []).map((v) => v.story_id as string)),
      };
    },
  });
  return React.useMemo(() => {
    const stories = withoutBlocked(q.data?.stories ?? [], blocked ?? new Set(), (s) => s.author_id);
    const groups = new Map<string, StoryWithAuthor[]>();
    for (const s of stories) groups.set(s.author_id, [...(groups.get(s.author_id) ?? []), s]);
    const ordered = [...groups.values()].sort((a, b) => {
      const mineA = a[0].author_id === user?.id ? -1 : 0;
      const mineB = b[0].author_id === user?.id ? -1 : 0;
      if (mineA !== mineB) return mineA - mineB;
      const unseenA = a.some((s) => !q.data?.viewed.has(s.id)) ? -1 : 0;
      const unseenB = b.some((s) => !q.data?.viewed.has(s.id)) ? -1 : 0;
      return unseenA - unseenB;
    });
    return { groups: ordered, flat: ordered.flat(), viewed: q.data?.viewed ?? new Set<string>(), isLoading: q.isLoading };
  }, [q.data, q.isLoading, blocked, user?.id]);
}

/** Round story rail with a gradient ring for unseen stories. */
export function StoryRail() {
  const { user, profile } = useAuth();
  const { groups, viewed } = useActiveStories();
  if (!user) return null;
  const hasMine = groups.some((g) => g[0].author_id === user.id);
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-2 scrollbar-none">
      {!hasMine && (
        <Link to="/story/new" className="flex w-16 shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <Avatar src={profile?.avatar_url} name={profile?.name} size={64} />
            <span className="absolute -bottom-0.5 -left-0.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-surface">
              <Plus className="size-4" />
            </span>
          </div>
          <span className="w-full truncate text-center text-xs">הסטורי שלך</span>
        </Link>
      )}
      {groups.map((g) => {
        const first = g.find((s) => !viewed.has(s.id)) ?? g[0];
        const unseen = g.some((s) => !viewed.has(s.id));
        const a = g[0].author;
        return (
          <Link key={g[0].author_id} to="/story/$id" params={{ id: first.id }} className="flex w-16 shrink-0 flex-col items-center gap-1">
            <Avatar src={a?.avatar_url} name={a?.name} size={64} ring={unseen} className={unseen ? "" : "opacity-80"} />
            <span className="w-full truncate text-center text-xs">
              {g[0].author_id === user.id ? "הסטורי שלך" : (a?.name?.split(" ")[0] ?? "")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
