import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import { CenteredSpinner, Page, PageHeader } from "@/components/app-shell";
import { FollowButton } from "@/components/follow-button";
import { ProfileUnavailable, ProfileView } from "@/components/profile-view";
import { ReportDialog } from "@/components/report-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { BLOCKED_MESSAGE, fetchBlockedIds, invalidateBlocked } from "@/lib/blocks";
import { PROFILE_COLUMNS, PROFILE_GUEST_COLUMNS } from "@/lib/constants";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile/$id")({
  head: () => seo({ title: "פרופיל", description: "פרופיל ב-mibale: אירועים, קהילות, תחביבים ומאפיינים.", type: "profile" }),
  component: ProfilePage,
});

function ProfilePage() {
  const { id } = Route.useParams();
  const { ready, user, isGuest } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user?.id === id) void navigate({ to: "/me", replace: true });
  }, [user, id, navigate]);

  const q = useQuery({
    queryKey: ["profile", id, isGuest],
    enabled: ready,
    queryFn: async () => {
      const [{ data }, blocked] = await Promise.all([
        supabase.from("profiles").select(isGuest ? PROFILE_GUEST_COLUMNS : PROFILE_COLUMNS).eq("id", id).maybeSingle(),
        isGuest ? Promise.resolve(new Set<string>()) : fetchBlockedIds(true),
      ]);
      return { profile: data as unknown as Profile | null, blocked: blocked.has(id) };
    },
  });

  if (!ready || q.isLoading) return <CenteredSpinner />;
  const p = q.data?.profile;

  if (isGuest) {
    return (
      <Page>
        <PageHeader title="" back />
        <div className="flex flex-col items-center pt-10 text-center">
          <Avatar src={p?.avatar_url} name={p?.name} size={120} />
          <h1 className="mt-4 text-2xl font-bold">{p?.name}</h1>
          <p className="mt-2 text-muted-foreground">הרשמו כדי לראות את הפרופיל המלא</p>
          <Button asChild variant="brand" className="mt-4">
            <Link to="/signup">הרשמה</Link>
          </Button>
        </div>
      </Page>
    );
  }

  if (q.data?.blocked || !p) {
    return (
      <Page>
        <PageHeader title="" back />
        <ProfileUnavailable text={q.data?.blocked ? BLOCKED_MESSAGE : "ייתכן שהפרופיל נמחק"} />
      </Page>
    );
  }
  if (p.banned_at) {
    return (
      <Page>
        <PageHeader title="" back />
        <ProfileUnavailable text="החשבון הזה הושהה" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={p.name} back actions={<ProfileMenu profile={p} />} />
      <ProfileView
        profile={p}
        isMe={false}
        actions={
          <div className="flex gap-2">
            <FollowButton profileId={p.id} size="default" className="flex-1" />
            <Button asChild variant="outline" className="flex-1">
              <Link to="/chat/$id" params={{ id: p.id }}>
                <MessageCircle /> הודעה
              </Link>
            </Button>
            <DatingLike profile={p} />
          </div>
        }
      />
    </Page>
  );
}

/** Dating appears only on profiles and the dating screen: a quiet heart when both have dating on. */
function DatingLike({ profile }: { profile: Profile }) {
  const { user, profile: me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["romantic-like", profile.id, user?.id],
    enabled: !!user && !!me?.dating_enabled && !!profile.dating_enabled,
    queryFn: async () => {
      const { data } = await supabase.from("romantic_likes").select("action").eq("liker_id", user!.id).eq("liked_id", profile.id).maybeSingle();
      return data?.action === "like";
    },
  });
  if (!me?.dating_enabled || !profile.dating_enabled) return null;
  return (
    <Button
      size="icon"
      variant={q.data ? "like" : "outline"}
      className="size-11"
      aria-label="לייק היכרויות"
      onClick={async () => {
        const liked = q.data;
        const { error } = liked
          ? await supabase.from("romantic_likes").delete().eq("liker_id", user!.id).eq("liked_id", profile.id)
          : await supabase.from("romantic_likes").upsert({ liker_id: user!.id, liked_id: profile.id, action: "like" });
        if (error) return void toast.error("הפעולה נכשלה");
        if (!liked) void hapticTap("success");
        void qc.invalidateQueries({ queryKey: ["romantic-like", profile.id] });
      }}
    >
      <Heart className={cn(q.data && "fill-current")} />
    </Button>
  );
}

function ProfileMenu({ profile }: { profile: Profile }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="עוד">
          <MoreHorizontal />
        </Button>
      </DialogTrigger>
      <SheetContent title={profile.name}>
        <div className="space-y-2">
          <ReportDialog
            targetType="profile"
            targetId={profile.id}
            trigger={
              <Button variant="outline" className="w-full">
                דיווח על הפרופיל
              </Button>
            }
          />
          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              if (!confirm(`לחסום את ${profile.name}? החסימה תסיר עוקבים ולייקים הדדיים.`)) return;
              const { error } = await supabase.from("blocks").insert({ blocker_id: user!.id, blocked_id: profile.id });
              if (error) return void toast.error("החסימה נכשלה");
              invalidateBlocked();
              void qc.invalidateQueries();
              setOpen(false);
              toast.success("המשתמש/ת נחסם/ה");
            }}
          >
            <Ban /> חסימה
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
