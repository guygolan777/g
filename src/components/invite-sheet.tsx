import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useProfileGraph } from "@/components/profile-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

/** Invite my contacts (followers + following) to an event → event_invites (+ server-side notification). */
export function InviteSheet({ eventId, participantIds }: { eventId: string; participantIds: Set<string> }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const { followers, following } = useProfileGraph(user!.id);
  const invited = useQuery({
    queryKey: ["event-invites", eventId, user?.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("event_invites").select("invitee_id").eq("event_id", eventId).eq("inviter_id", user!.id);
      return new Set((data ?? []).map((r) => r.invitee_id as string));
    },
  });
  const contacts = React.useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of [...following, ...followers]) if (!participantIds.has(p.id)) m.set(p.id, p);
    return [...m.values()];
  }, [followers, following, participantIds]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserPlus /> הזמנת חברים
        </Button>
      </DialogTrigger>
      <SheetContent title="הזמנת חברים" description="הם יקבלו התראה עם קישור לאירוע">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין אנשי קשר שעוד לא נרשמו</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((p) => {
              const done = invited.data?.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar src={p.avatar_url} name={p.name} size={40} />
                  <p className="flex-1 truncate font-semibold">{p.name}</p>
                  <Button
                    size="sm"
                    variant={done ? "success" : "default"}
                    disabled={done}
                    onClick={async () => {
                      const { error } = await supabase.from("event_invites").insert({ event_id: eventId, inviter_id: user!.id, invitee_id: p.id });
                      if (error) return void toast.error("ההזמנה נכשלה");
                      void invited.refetch();
                    }}
                  >
                    {done ? "הוזמן/ה" : "הזמנה"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}
