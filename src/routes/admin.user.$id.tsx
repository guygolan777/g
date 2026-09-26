import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SnapshotPreview, UserActions } from "@/components/moderation";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ageFromBirthYear, formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import { ACTION_LABEL, TARGET_LABEL, moderation, moderationError } from "@/lib/admin";
import { cn } from "@/lib/utils";
import type { Report } from "@/lib/types";

export const Route = createFileRoute("/admin/user/$id")({
  head: () => seo({ title: "ניהול · משתמש/ת", description: "פרטי משתמש/ת, דיווחים, היסטוריית טיפול ופעולות." }),
  component: AdminUser,
});

type Detail = {
  id: string;
  name: string;
  avatar_url: string | null;
  photos: string[];
  bio: string;
  city: string | null;
  birth_year: number | null;
  created_at: string;
  last_seen_at: string | null;
  is_private: boolean;
  dating_enabled: boolean;
  banned_at: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  email: string | null;
  phone: string | null;
  roles: Array<"admin" | "moderator">;
  reports_against: number;
  reports_against_open: number;
  reporters_against: number;
  reports_filed: number;
  blocked_by: number;
  warnings: number;
  events: number;
  dms_24h: number;
  chats_24h: number;
  followers: number;
};

type Action = { id: string; action: string; reason: string; target_type: string | null; created_at: string; actor: { name: string } | null; details: Record<string, unknown> };

function AdminUser() {
  const { id } = Route.useParams();
  const { settings } = useAuth();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-user", id] });

  const detail = useQuery({
    queryKey: ["admin-user", id, "detail"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_user_detail", { _user_id: id });
      if (error) throw error;
      return data as Detail | null;
    },
  });
  const reports = useQuery({
    queryKey: ["admin-user", id, "reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*, reporter:profiles!reports_reporter_id_fkey(name)")
        .eq("target_user_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as Array<Report & { reporter: { name: string } | null }>;
    },
  });
  const actions = useQuery({
    queryKey: ["admin-user", id, "actions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("moderation_actions")
        .select("id, action, reason, target_type, created_at, details, actor:profiles!moderation_actions_actor_id_fkey(name)")
        .eq("target_user_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as Action[];
    },
  });

  if (detail.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const u = detail.data;
  if (!u) return <p className="text-muted-foreground">המשתמש/ת לא נמצא/ה</p>;
  const age = ageFromBirthYear(u.birth_year);
  const suspended = !!u.banned_at && (!u.banned_until || new Date(u.banned_until) > new Date());
  const role = u.roles.includes("admin") ? "admin" : u.roles.includes("moderator") ? "moderator" : "user";

  const stats: Array<[string, number, boolean?]> = [
    ["דיווחים פתוחים", u.reports_against_open, u.reports_against_open > 0],
    ["מדווחים שונים", u.reporters_against, u.reporters_against >= 3],
    ["חסמו אותו/ה", u.blocked_by, u.blocked_by >= 3],
    ["אזהרות", u.warnings, u.warnings > 0],
    ["הודעות ב-24 שעות", u.dms_24h, u.dms_24h > 200],
    ["שיחות חדשות ב-24 שעות", u.chats_24h, u.chats_24h > 15],
    ["אירועים", u.events],
    ["עוקבים", u.followers],
    ["דיווחים ששלח/ה", u.reports_filed],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <Avatar src={u.avatar_url} name={u.name} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">
              {u.name || "ללא שם"}
              {age ? `, ${age}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {u.city ?? "—"} · הצטרף/ה {formatRelative(u.created_at)}
              {u.last_seen_at && ` · נראה/תה ${formatRelative(u.last_seen_at)}`}
            </p>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {[u.email, u.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link to="/profile/$id" params={{ id: u.id }} className="text-sm font-semibold text-primary">
            לפרופיל
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suspended && (
            <Badge variant="destructive">
              מושהה {u.banned_until ? `עד ${new Date(u.banned_until).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : "לצמיתות"}
            </Badge>
          )}
          {u.roles.map((r) => (
            <Badge key={r} variant="violet">
              {r === "admin" ? "מנהל/ת" : "מודרטור/ית"}
            </Badge>
          ))}
          {u.is_private && <Badge variant="muted">פרופיל פרטי</Badge>}
          {u.dating_enabled && <Badge variant="like">מצב היכרויות</Badge>}
        </div>
        {suspended && u.ban_reason && <p className="mt-2 text-sm">סיבת ההשהיה: {u.ban_reason}</p>}
        {u.bio && <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{u.bio}</p>}
        <div className="mt-3">
          <UserActions userId={u.id} name={u.name || "המשתמש/ת"} suspended={suspended} onDone={refresh} size="default" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map(([label, n, alert]) => (
          <div key={label} className={cn("rounded-2xl p-3 text-center", alert ? "bg-destructive-soft text-destructive" : "bg-card shadow-soft")}>
            <p className="text-2xl font-bold">{n}</p>
            <p className="text-[11px] leading-tight font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {settings?.is_admin && (
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          <p className="mb-2 font-semibold">תפקיד</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["user", "משתמש/ת"],
                ["moderator", "מודרטור/ית"],
                ["admin", "מנהל/ת"],
              ] as const
            ).map(([r, label]) => (
              <Button
                key={r}
                size="sm"
                variant={role === r ? "default" : "outline"}
                onClick={async () => {
                  if (role === r) return;
                  if (!confirm(`לשנות את התפקיד ל${label}?`)) return;
                  try {
                    await moderation.setRole(u.id, r);
                    toast.success("התפקיד עודכן");
                    refresh();
                  } catch (e) {
                    toast.error(moderationError(e));
                  }
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-bold">דיווחים עליו/ה ({u.reports_against})</h2>
        {reports.data?.length === 0 && <p className="text-sm text-muted-foreground">אין דיווחים</p>}
        <div className="space-y-2">
          {reports.data?.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="partner">{TARGET_LABEL[r.target_type]}</Badge>
                <span className="font-semibold">{r.reason}</span>
                <Badge variant={r.status === "open" ? "destructive" : "muted"} className="ms-auto">
                  {r.status === "open" ? "פתוח" : r.status === "resolved" ? "טופל" : "נדחה"}
                </Badge>
              </div>
              {r.snapshot && (
                <div className="mt-2">
                  <SnapshotPreview snapshot={r.snapshot} />
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {r.reporter?.name ?? "סינון אוטומטי"} · {formatRelative(r.created_at)}
                {r.details && ` · ${r.details}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">היסטוריית טיפול</h2>
        {actions.data?.length === 0 && <p className="text-sm text-muted-foreground">אין פעולות</p>}
        <ul className="space-y-1 text-sm">
          {actions.data?.map((a) => (
            <li key={a.id} className="rounded-xl bg-card p-2 shadow-soft">
              <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
              {a.reason && ` — ${a.reason}`}
              <span className="text-xs text-muted-foreground">
                {" "}
                · {a.actor?.name ?? "אוטומטי"} · {formatRelative(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
