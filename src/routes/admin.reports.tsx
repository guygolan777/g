import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Eye, EyeOff, Trash2, X } from "lucide-react";
import { Chip } from "@/components/chip";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReasonSheet, SnapshotPreview, UserActions } from "@/components/moderation";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import { TARGET_LABEL, moderation, moderationError } from "@/lib/admin";
import type { Report, ReportGroup } from "@/lib/types";

export const Route = createFileRoute("/admin/reports")({
  head: () => seo({ title: "ניהול · דיווחים", description: "תור דיווחים: תוכן מדווח, הסרה, אזהרה והשהיה." }),
  component: Reports,
});

function targetLink(type: Report["target_type"], id: string): string | null {
  switch (type) {
    case "profile":
      return `/profile/${id}`;
    case "event":
      return `/e/${id}`;
    case "community":
      return `/community/${id}`;
    case "story":
      return `/story/${id}`;
    default:
      return null;
  }
}

function Reports() {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const q = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_report_queue", { _status: filter });
      if (error) throw error;
      return (data ?? []) as ReportGroup[];
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-reports"] });
    void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-user"] });
  };

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
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">{filter === "open" ? "אין דיווחים פתוחים 🎉" : "אין דיווחים"}</p>}
      <div className="space-y-3">
        {q.data?.map((g) => (
          <ReportCard key={`${g.target_type}:${g.target_id}`} g={g} onDone={refresh} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ g, onDone }: { g: ReportGroup; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const link = targetLink(g.target_type, g.target_id);
  const isOpen = g.status === "open";
  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (e) {
      toast.error(moderationError(e));
    }
  };
  const details = useQuery({
    queryKey: ["admin-report-details", g.target_type, g.target_id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*, reporter:profiles!reports_reporter_id_fkey(id, name)")
        .eq("target_type", g.target_type)
        .eq("target_id", g.target_id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Array<Report & { reporter: { id: string; name: string } | null }>;
    },
  });

  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft" data-testid="report-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="partner">{TARGET_LABEL[g.target_type]}</Badge>
        <span className="font-semibold">{g.reasons.join(" · ")}</span>
        {g.auto && <Badge variant="violet">סינון אוטומטי</Badge>}
        {g.hidden && <Badge variant="destructive">מוסתר</Badge>}
        <Badge variant={isOpen ? "destructive" : "muted"} className="ms-auto">
          {isOpen ? `${g.reporters || g.reports} מדווחים` : g.status === "resolved" ? "טופל" : "נדחה"}
        </Badge>
      </div>

      <div className="mt-3">
        <SnapshotPreview snapshot={g.snapshot} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        {g.target_user_id ? (
          <Link to="/admin/user/$id" params={{ id: g.target_user_id }} className="flex items-center gap-2 font-semibold text-foreground">
            <Avatar src={g.target_user_avatar} name={g.target_user_name ?? ""} size={24} />
            {g.target_user_name || "ללא שם"}
          </Link>
        ) : (
          <span>משתמש/ת נמחק/ה</span>
        )}
        <span>· {formatRelative(g.last_at)}</span>
        {link && (
          <Link to={link} className="font-semibold text-primary">
            · לתוכן
          </Link>
        )}
        <button type="button" className="ms-auto flex items-center gap-1 font-semibold text-primary" onClick={() => setOpen((o) => !o)}>
          פרטים <ChevronDown className={open ? "size-3.5 rotate-180" : "size-3.5"} />
        </button>
      </div>

      {open && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {details.data?.map((r) => (
            <li key={r.id}>
              <span className="font-semibold">{r.reporter?.name ?? "סינון אוטומטי"}</span>: {r.reason}
              {r.details && <span className="text-muted-foreground"> — {r.details}</span>}
              <span className="text-xs text-muted-foreground"> · {formatRelative(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={() => void act(() => moderation.resolve(g.target_type, g.target_id, "dismissed"), "הדיווח נדחה")}>
            <X /> תקין — דחייה
          </Button>
          <Button size="sm" variant="success" onClick={() => void act(() => moderation.resolve(g.target_type, g.target_id, "resolved"), "סומן כטופל")}>
            <Check /> טופל
          </Button>
          {(g.target_type === "story" || g.target_type === "event") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void act(() => moderation.setHidden(g.target_type, g.target_id, !g.hidden), g.hidden ? "התוכן הוחזר" : "התוכן הוסתר")}
            >
              {g.hidden ? <Eye /> : <EyeOff />} {g.hidden ? "החזרה" : "הסתרה"}
            </Button>
          )}
          {g.target_type !== "profile" && (
            <ReasonSheet
              title="הסרת התוכן"
              description="התוכן יימחק, והמשתמש/ת יקבל/תקבל הודעה עם הסיבה. עותק נשמר ביומן."
              confirm="הסרה"
              required={false}
              presets={["הפרת כללי הקהילה", "ספאם", "תוכן לא הולם", "הטרדה"]}
              trigger={
                <Button size="sm" variant="destructive">
                  <Trash2 /> הסרת תוכן
                </Button>
              }
              onConfirm={async (reason) => {
                await moderation.remove(g.target_type, g.target_id, reason);
                toast.success("התוכן הוסר");
                onDone();
              }}
            />
          )}
          {g.target_user_id && (
            <UserActions userId={g.target_user_id} name={g.target_user_name || "המשתמש/ת"} suspended={false} onDone={onDone} />
          )}
        </div>
      )}
    </div>
  );
}
