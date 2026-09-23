import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { invalidateBlocked } from "@/lib/blocks";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/blocked")({
  head: () => seo({ title: "משתמשים חסומים", description: "ניהול החסימות שלך ב-mibale." }),
  component: () => (
    <RequireAuth>
      <Blocked />
    </RequireAuth>
  ),
});

function Blocked() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-blocks", user?.id],
    queryFn: async () => {
      const { data: rows } = await supabase.from("blocks").select("blocked_id, created_at").eq("blocker_id", user!.id);
      const ids = (rows ?? []).map((r) => r.blocked_id as string);
      if (!ids.length) return [];
      // Blocked profiles are hidden by RLS, so names come from the blocks list only when visible.
      const { data: ps } = await supabase.from("profiles").select("id, name, avatar_url").in("id", ids);
      const map = new Map((ps ?? []).map((p) => [p.id as string, p as { id: string; name: string; avatar_url: string | null }]));
      return ids.map((id) => map.get(id) ?? { id, name: "משתמש/ת חסום/ה", avatar_url: null });
    },
  });

  return (
    <Page>
      <PageHeader title="משתמשים חסומים" back />
      {q.data?.length === 0 && <EmptyState emoji="🕊️" title="לא חסמת אף אחד" />}
      <div className="space-y-2">
        {q.data?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <Avatar src={p.avatar_url} name={p.name} size={44} />
            <p className="flex-1 font-semibold">{p.name}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const { error } = await supabase.from("blocks").delete().eq("blocker_id", user!.id).eq("blocked_id", p.id);
                if (error) return void toast.error("הפעולה נכשלה");
                invalidateBlocked();
                void qc.invalidateQueries();
                toast.success("החסימה הוסרה");
              }}
            >
              ביטול חסימה
            </Button>
          </div>
        ))}
      </div>
    </Page>
  );
}
