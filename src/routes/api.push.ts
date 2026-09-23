import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/server/push";

/**
 * Supabase Database Webhook target (INSERT on public.notifications).
 * Configure the webhook with header `x-webhook-secret: $PUSH_WEBHOOK_SECRET`.
 * Reads the recipient's push_tokens with the service role and sends via FCM.
 */
const PREF_BY_TYPE: Record<string, "notify_messages" | "notify_events" | "notify_social"> = {
  event_join_request: "notify_events",
  event_joined: "notify_events",
  event_approved: "notify_events",
  event_invite: "notify_events",
  community_join_request: "notify_social",
  community_approved: "notify_social",
  follow: "notify_social",
  story_like: "notify_social",
  match: "notify_social",
  date_invite: "notify_messages",
  date_answer: "notify_messages",
};

export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PUSH_WEBHOOK_SECRET;
        if (!secret || request.headers.get("x-webhook-secret") !== secret) {
          return new Response("forbidden", { status: 403 });
        }
        const url = process.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) return new Response("not configured", { status: 500 });

        const payload = (await request.json()) as {
          type: string;
          record?: { recipient_id: string; type: string; title: string; body: string; link: string | null };
        };
        const n = payload.record;
        if (payload.type !== "INSERT" || !n) return Response.json({ skipped: true });

        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        const pref = PREF_BY_TYPE[n.type] ?? "notify_social";
        const { data: profile } = await admin.from("profiles").select(pref).eq("id", n.recipient_id).maybeSingle();
        if (profile && (profile as Record<string, boolean>)[pref] === false) return Response.json({ skipped: "pref" });

        const { data: tokens } = await admin.from("push_tokens").select("token").eq("profile_id", n.recipient_id);
        const dead = await sendPush(
          (tokens ?? []).map((t) => t.token as string),
          { title: n.title, body: n.body, link: n.link },
        );
        if (dead.length) await admin.from("push_tokens").delete().in("token", dead);
        return Response.json({ sent: (tokens?.length ?? 0) - dead.length });
      },
    },
  },
});
