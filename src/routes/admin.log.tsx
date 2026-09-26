import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import { ACTION_LABEL, TARGET_LABEL } from "@/lib/admin";
import type { Report } from "@/lib/types";

export const Route = createFileRoute("/admin/log")({
  head: () => seo({ title: "ניהול · יומן פעולות", description: "כל פעולות הצוות והפעולות האוטומטיות." }),
  component: Log,
});

type Row = {
  id: string;
  action: string;
  reason: string;
  target_type: string | null;
  target_user_id: string | null;
  created_at: string;
  details: { until?: string | null; action?: string };
  actor: { name: string } | null;
  target: { name: string } | null;
};

function Log() {
  const q = useQuery({
    queryKey: ["admin-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("moderation_actions")
        .select(
          "id, action, reason, target_type, target_user_id, created_at, details, actor:profiles!moderation_actions_actor_id_fkey(name), target:profiles!moderation_actions_target_user_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as Row[];
    },
  });
  return (
    <div>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">היומן ריק</p>}
      <ul className="space-y-2">
        {q.data?.map((a) => (
          <li key={a.id} className="rounded-2xl bg-card p-3 text-sm shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.action === "suspend" || a.action === "remove_content" || a.action === "auto_hide" ? "destructive" : "soft"}>
                {ACTION_LABEL[a.action] ?? a.action}
              </Badge>
              {a.target_type && a.target_type in TARGET_LABEL && <Badge variant="muted">{TARGET_LABEL[a.target_type as Report["target_type"]]}</Badge>}
              {a.target_user_id && (
                <Link to="/admin/user/$id" params={{ id: a.target_user_id }} className="font-semibold text-primary">
                  {a.target?.name || "משתמש/ת"}
                </Link>
              )}
              <span className="ms-auto text-xs text-muted-foreground">{formatRelative(a.created_at)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.actor?.name ?? "אוטומטי"}
              {a.reason && ` · ${a.reason}`}
              {a.action === "suspend" &&
                ` · ${a.details.until ? `עד ${new Date(a.details.until).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : "לצמיתות"}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
