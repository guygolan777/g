import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Chip } from "@/components/chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { Report } from "@/lib/types";
import { setBanned } from "@/lib/admin";

export const Route = createFileRoute("/admin/reports")({
  head: () => seo({ title: "ניהול · דיווחים", description: "טיפול בדיווחים: טופל, דחייה או השהיית משתמש." }),
  component: Reports,
});

const TYPE_LABEL: Record<Report["target_type"], string> = {
  profile: "פרופיל",
  event: "אירוע",
  community: "קהילה",
  story: "סטורי",
  message: "הודעה",
  post: "פוסט",
};

function targetLink(r: Report): string | null {
  switch (r.target_type) {
    case "profile":
      return `/profile/${r.target_id}`;
    case "event":
      return `/e/${r.target_id}`;
    case "community":
      return `/community/${r.target_id}`;
    case "story":
      return `/story/${r.target_id}`;
    default:
      return null;
  }
}

function Reports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const q = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: async () => {
      let query = supabase.from("reports").select("*, reporter:profiles!reports_reporter_id_fkey(name)").order("created_at", { ascending: false }).limit(200);
      if (filter === "open") query = query.eq("status", "open");
      const { data } = await query;
      return (data ?? []) as unknown as Array<Report & { reporter: { name: string } | null }>;
    },
  });

  async function resolve(r: Report, status: "resolved" | "dismissed") {
    const { error } = await supabase
      .from("reports")
      .update({ status, resolved_by: user!.id, resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return void toast.error("הפעולה נכשלה");
    void qc.invalidateQueries({ queryKey: ["admin-reports"] });
    void qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  async function suspendTarget(r: Report) {
    if (!confirm("להשהות את המשתמש המדווח?")) return;
    let userId = r.target_type === "profile" ? r.target_id : null;
    if (r.target_type === "event") userId = (await supabase.from("events").select("organizer_id").eq("id", r.target_id).maybeSingle()).data?.organizer_id ?? null;
    if (r.target_type === "community") userId = (await supabase.from("communities").select("founder_id").eq("id", r.target_id).maybeSingle()).data?.founder_id ?? null;
    if (r.target_type === "story") userId = (await supabase.from("stories").select("author_id").eq("id", r.target_id).maybeSingle()).data?.author_id ?? null;
    if (!userId) return void toast.error("לא נמצא משתמש לקשר לדיווח");
    try {
      await setBanned(userId, true);
      await resolve(r, "resolved");
      toast.success("המשתמש/ת הושהה והדיווח טופל");
    } catch {
      toast.error("ההשהיה נכשלה");
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Chip active={filter === "open"} onClick={() => setFilter("open")}>
          פתוחים
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          הכול
        </Chip>
      </div>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">אין דיווחים</p>}
      <div className="space-y-2">
        {q.data?.map((r) => {
          const link = targetLink(r);
          return (
            <div key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <Badge variant="partner">{TYPE_LABEL[r.target_type]}</Badge>
                <span className="font-semibold">{r.reason}</span>
                <Badge variant={r.status === "open" ? "destructive" : "muted"} className="ms-auto">
                  {r.status === "open" ? "פתוח" : r.status === "resolved" ? "טופל" : "נדחה"}
                </Badge>
              </div>
              {r.details && <p className="mt-2 text-sm">{r.details}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                דווח ע״י {r.reporter?.name ?? "—"} · {formatRelative(r.created_at)}
                {link && (
                  <>
                    {" · "}
                    <Link to={link} className="font-semibold text-primary">
                      לתוכן
                    </Link>
                  </>
                )}
              </p>
              {r.status === "open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="success" onClick={() => void resolve(r, "resolved")}>
                    טופל
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void resolve(r, "dismissed")}>
                    דחייה
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void suspendTarget(r)}>
                    השהיית משתמש
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
