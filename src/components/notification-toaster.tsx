import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { hapticTap, listenDeepLinks, registerPush } from "@/lib/native";
import type { Notification } from "@/lib/types";

/**
 * Realtime notification popups + native push/deep-link wiring.
 * Mounted once at the root.
 */
export function NotificationToaster() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  React.useEffect(() => {
    void listenDeepLinks((path) => void navigate({ to: path }));
  }, [navigate]);

  React.useEffect(() => {
    if (!user) return;
    void registerPush((link) => void navigate({ to: link }));
    const ch = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          void qc.invalidateQueries({ queryKey: ["unread"] });
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          if (n.type === "event_approved") {
            void hapticTap("success");
            void qc.invalidateQueries({ queryKey: ["participants"] });
            void qc.invalidateQueries({ queryKey: ["my-participations"] });
          }
          toast(n.title, {
            description: n.body || undefined,
            action: n.link
              ? { label: n.type === "event_approved" ? "לאירוע" : "פתיחה", onClick: () => void navigate({ to: n.link! }) }
              : undefined,
            duration: 6000,
          });
        },
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [user, navigate, qc]);

  return null;
}
