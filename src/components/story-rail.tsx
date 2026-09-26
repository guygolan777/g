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

export type StoryWithAuthor = Story & {
  author: Pick<Profile, "id" | "name" | "avatar_url"> | null;
  /** Event stories: the event's still picture (a video story's first frame) for the blurred backdrop. */
  event?: { image_url: string | null; story_image_url: string | null; story_video_url: string | null } | null;
};

export function useActiveStories(romantic = false) {
  const { user } = useAuth();
  const { data: blocked } = useBlockedIds();
  const q = useQuery({
    queryKey: ["stories", "active", user?.id, romantic],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: stories }, { data: views }] = await Promise.all([
        supabase
          .from("stories")
          .select(`*, author:profiles!stories_author_id_fkey(${PROFILE_MINI}), event:events(image_url, story_image_url, story_video_url)`)
          .gt("expires_at", new Date().toISOString())
          .eq("is_romantic", romantic)
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
export function StoryRail({ romantic = false }: { romantic?: boolean }) {
  const { user, profile } = useAuth();
  const { groups, viewed } = useActiveStories(romantic);
  if (!user) {
    return (
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-2 scrollbar-none">
        <Link to="/signup" className="flex w-20 shrink-0 flex-col items-center gap-1">
          <span className="grid size-[76px] place-items-center rounded-full bg-gradient-ring-event p-[3px]">
            <span className="grid size-full place-items-center rounded-full bg-surface text-2xl">✨</span>
          </span>
          <span className="w-full truncate text-center text-xs text-muted-foreground">הצטרפו</span>
        </Link>
        {["bg-event-soft", "bg-like-soft", "bg-partner-soft", "bg-teal-soft"].map((c) => (
          <Link key={c} to="/signup" className="flex w-20 shrink-0 flex-col items-center gap-1" aria-label="סטוריז לחברים">
            <span className="grid size-[76px] place-items-center rounded-full bg-gradient-ring-event p-[3px]">
              <span className={`size-full rounded-full blur-[2px] ${c}`} />
            </span>
            <span className="text-xs text-muted-foreground">🔒</span>
          </Link>
        ))}
      </div>
    );
  }
  const hasMine = groups.some((g) => g[0].author_id === user.id);
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-2 scrollbar-none">
      {!hasMine && (
        <Link
          to={romantic ? "/story/new" : "/event/new"}
          search={romantic ? { romantic: "1" } : {}}
          className="flex w-20 shrink-0 flex-col items-center gap-1"
          aria-label={romantic ? "סטורי רומנטי חדש" : "אירוע חדש"}
        >
          <div className="relative">
            <Avatar src={profile?.avatar_url} name={profile?.name} size={76} />
            <span className="absolute -bottom-0.5 -left-0.5 grid size-7 place-items-center rounded-full bg-gradient-brand text-brand-foreground ring-2 ring-surface">
              <Plus className="size-4" />
            </span>
          </div>
          <span className="w-full truncate text-center text-xs text-muted-foreground">את/ה</span>
        </Link>
      )}
      {groups.map((g) => {
        const first = g.find((s) => !viewed.has(s.id)) ?? g[0];
        const unseen = g.some((s) => !viewed.has(s.id));
        const a = g[0].author;
        return (
          <Link key={g[0].author_id} to="/story/$id" params={{ id: first.id }} search={romantic ? { romantic: "1" } : {}} className="flex w-20 shrink-0 flex-col items-center gap-1">
            <Avatar src={a?.avatar_url} name={a?.name} size={76} ring={unseen ? (romantic ? "romantic" : "event") : false} className={unseen ? "" : "opacity-80"} />
            <span className="w-full truncate text-center text-xs">
              {g[0].author_id === user.id ? "את/ה" : (a?.name?.split(" ")[0] ?? "")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
