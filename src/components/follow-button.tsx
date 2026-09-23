import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useMyGraph } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** עקוב / עקוב בחזרה / הפסק לעקוב */
export function FollowButton({
  profileId,
  className,
  size = "sm",
  followingLabel = "הפסק לעקוב",
}: {
  profileId: string;
  className?: string;
  size?: "sm" | "default";
  followingLabel?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { following, followers } = useMyGraph();
  const [busy, setBusy] = React.useState(false);
  if (user?.id === profileId) return null;
  const isFollowing = following.has(profileId);
  const followsMe = followers.has(profileId);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return void navigate({ to: "/signup" });
    setBusy(true);
    const { error } = isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profileId)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: profileId });
    setBusy(false);
    if (error) return void toast.error("הפעולה נכשלה");
    void qc.invalidateQueries({ queryKey: ["graph"] });
    void qc.invalidateQueries({ queryKey: ["profile-graph"] });
  }

  return (
    <Button
      size={size}
      variant={isFollowing ? "secondary" : "brand"}
      className={cn("min-w-24", className)}
      disabled={busy}
      onClick={(e) => void toggle(e)}
    >
      {isFollowing ? followingLabel : followsMe ? "עקוב בחזרה" : "עקוב"}
    </Button>
  );
}
