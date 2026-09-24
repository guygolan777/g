import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useMyGraph } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** עקוב / עקוב בחזרה / הפסק לעקוב — and for private profiles: בקשת מעקב / הבקשה נשלחה */
export function FollowButton({
  profileId,
  className,
  size = "sm",
  followingLabel = "הפסק לעקוב",
  isPrivate = false,
}: {
  profileId: string;
  /** Private profile: following is a request the owner approves. */
  isPrivate?: boolean;
  className?: string;
  size?: "sm" | "default";
  followingLabel?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { following, followers, requested } = useMyGraph();
  const [busy, setBusy] = React.useState(false);
  if (user?.id === profileId) return null;
  const isFollowing = following.has(profileId);
  const isRequested = requested.has(profileId);
  const followsMe = followers.has(profileId);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return void navigate({ to: "/signup" });
    setBusy(true);
    // Clicking a sent request cancels it, like unfollowing.
    const { error } =
      isFollowing || isRequested
        ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profileId)
        : await supabase.from("follows").insert({ follower_id: user.id, following_id: profileId });
    setBusy(false);
    if (error) return void toast.error("הפעולה נכשלה");
    if (!isFollowing && !isRequested && isPrivate) toast.success("נשלחה בקשת מעקב 🔒");
    void qc.invalidateQueries({ queryKey: ["graph"] });
    void qc.invalidateQueries({ queryKey: ["profile-graph"] });
    void qc.invalidateQueries({ queryKey: ["follow-counts"] });
  }

  return (
    <Button
      size={size}
      variant={isFollowing || isRequested ? "secondary" : "brand"}
      className={cn("min-w-24", className)}
      disabled={busy}
      onClick={(e) => void toggle(e)}
    >
      {isFollowing ? followingLabel : isRequested ? "הבקשה נשלחה" : isPrivate ? "בקשת מעקב" : followsMe ? "עקוב בחזרה" : "עקוב"}
    </Button>
  );
}
