import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AdminSearch, likeTerm } from "@/components/admin-search";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { hobbyLabel } from "@/lib/hobby-categories";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/admin/communities")({
  head: () => seo({ title: "ניהול · קהילות", description: "חיפוש ומחיקת קהילות." }),
  component: AdminCommunities,
});

function AdminCommunities() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const list = useQuery({
    queryKey: ["admin-communities", q],
    queryFn: async () => {
      let query = supabase.from("communities").select("id, name, hobby, city").order("created_at", { ascending: false }).limit(100);
      if (q.trim()) query = query.or(`name.ilike.${likeTerm(q)},city.ilike.${likeTerm(q)},description.ilike.${likeTerm(q)}`);
      const { data } = await query;
      return (data ?? []) as Array<{ id: string; name: string; hobby: string; city: string | null }>;
    },
  });
  return (
    <div>
      <AdminSearch value={q} onChange={setQ} placeholder="חיפוש קהילה" />
      <div className="space-y-2">
        {list.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <Link to="/community/$id" params={{ id: c.id }} className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {hobbyLabel(c.hobby, false)} {c.city ? `· ${c.city}` : ""}
              </p>
            </Link>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label="מחיקה"
              onClick={async () => {
                if (!confirm(`למחוק את ${c.name}?`)) return;
                const { error } = await supabase.from("communities").delete().eq("id", c.id);
                if (error) return void toast.error("המחיקה נכשלה");
                toast.success("הקהילה נמחקה");
                void qc.invalidateQueries({ queryKey: ["admin-communities"] });
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
