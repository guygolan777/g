import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AdminSearch, likeTerm } from "@/components/admin-search";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/admin/events")({
  head: () => seo({ title: "ניהול · אירועים", description: "חיפוש ומחיקת אירועים." }),
  component: AdminEvents,
});

function AdminEvents() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const events = useQuery({
    queryKey: ["admin-events", q],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("id, title, starts_at, city, organizer:profiles!events_organizer_id_fkey(name)")
        .order("starts_at", { ascending: false })
        .limit(100);
      if (q.trim()) query = query.or(`title.ilike.${likeTerm(q)},city.ilike.${likeTerm(q)}`);
      const { data } = await query;
      return (data ?? []) as unknown as Array<{ id: string; title: string; starts_at: string; city: string | null; organizer: { name: string } | null }>;
    },
  });
  return (
    <div>
      <AdminSearch value={q} onChange={setQ} placeholder="חיפוש אירוע" />
      <div className="space-y-2">
        {events.data?.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <Link to="/e/$id" params={{ id: e.id }} className="min-w-0 flex-1">
              <p className="truncate font-semibold">{whoComesTitle(e.title)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatEventWhen(e.starts_at)} · {e.organizer?.name} {e.city ? `· ${e.city}` : ""}
              </p>
            </Link>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label="מחיקה"
              onClick={async () => {
                if (!confirm("למחוק את האירוע?")) return;
                const { error } = await supabase.from("events").delete().eq("id", e.id);
                if (error) return void toast.error("המחיקה נכשלה");
                toast.success("האירוע נמחק");
                void qc.invalidateQueries({ queryKey: ["admin-events"] });
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
