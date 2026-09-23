import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminSearch, likeTerm } from "@/components/admin-search";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";
import { setBanned } from "@/lib/admin";

export const Route = createFileRoute("/admin/users")({
  head: () => seo({ title: "ניהול · משתמשים", description: "חיפוש משתמשים, השהיה והחזרת גישה." }),
  component: Users,
});

type Row = { id: string; name: string; avatar_url: string | null; city: string | null; banned_at: string | null; created_at: string };

function Users() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const users = useQuery({
    queryKey: ["admin-users", q],
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, name, avatar_url, city, banned_at, created_at").order("created_at", { ascending: false }).limit(100);
      if (q.trim()) query = query.or(`name.ilike.${likeTerm(q)},city.ilike.${likeTerm(q)}`);
      const { data } = await query;
      return (data ?? []) as Row[];
    },
  });
  return (
    <div>
      <AdminSearch value={q} onChange={setQ} placeholder="חיפוש לפי שם או עיר" />
      <div className="space-y-2">
        {users.data?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <Link to="/profile/$id" params={{ id: u.id }}>
              <Avatar src={u.avatar_url} name={u.name} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{u.name || "ללא שם"}</p>
              <p className="text-xs text-muted-foreground">
                {u.city ?? "—"} · הצטרף/ה {formatRelative(u.created_at)}
              </p>
            </div>
            {u.banned_at && <Badge variant="destructive">מושהה</Badge>}
            <Button
              size="sm"
              variant={u.banned_at ? "success" : "outline"}
              onClick={async () => {
                if (!u.banned_at && !confirm(`להשהות את ${u.name}?`)) return;
                try {
                  await setBanned(u.id, !u.banned_at);
                  toast.success(u.banned_at ? "הגישה הוחזרה" : "המשתמש/ת הושהה");
                  void qc.invalidateQueries({ queryKey: ["admin-users"] });
                } catch {
                  toast.error("הפעולה נכשלה");
                }
              }}
            >
              {u.banned_at ? "החזרת גישה" : "השהיה"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
