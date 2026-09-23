import { Link, createFileRoute } from "@tanstack/react-router";
import { SafeImg } from "@/components/safe-img";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Eye, Star } from "lucide-react";
import { EmptyState, Page, PageHeader, Section } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen, formatRelative } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/me/activity")({
  head: () => seo({ title: "הפעילות שלי", description: "אירועים ששמרת, צפית בהם ודירגת ב-mibale." }),
  component: MyActivity,
});

type Ev = { id: string; title: string; starts_at: string; image_url: string | null };

function MyActivity() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-activity", user?.id],
    queryFn: async () => {
      const [saves, views, reviews] = await Promise.all([
        supabase.from("event_saves").select("created_at, event:events(id, title, starts_at, image_url)").eq("profile_id", user!.id).order("created_at", { ascending: false }),
        supabase.from("event_views").select("viewed_at, event:events(id, title, starts_at, image_url)").eq("viewer_id", user!.id).order("viewed_at", { ascending: false }).limit(30),
        supabase.from("event_reviews").select("created_at, rating, event:events(id, title, starts_at, image_url)").eq("profile_id", user!.id).order("created_at", { ascending: false }),
      ]);
      type R = { event: Ev | null; created_at?: string; viewed_at?: string; rating?: number };
      return {
        saves: (saves.data ?? []) as unknown as R[],
        views: (views.data ?? []) as unknown as R[],
        reviews: (reviews.data ?? []) as unknown as R[],
      };
    },
  });

  const list = (rows: Array<{ event: Ev | null; created_at?: string; viewed_at?: string; rating?: number }>, extra: (r: { created_at?: string; viewed_at?: string; rating?: number }) => string) =>
    rows.filter((r) => r.event).map((r) => (
      <Link key={r.event!.id + (r.viewed_at ?? r.created_at)} to="/e/$id" params={{ id: r.event!.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
        <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">{r.event!.image_url && <SafeImg src={r.event!.image_url} alt="" className="size-full object-cover" />}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{whoComesTitle(r.event!.title)}</p>
          <p className="text-xs text-muted-foreground">
            {formatEventWhen(r.event!.starts_at)} · {extra(r)}
          </p>
        </div>
      </Link>
    ));

  const d = q.data;
  return (
    <Page>
      <PageHeader title="הפעילות שלי" back />
      {d && !d.saves.length && !d.views.length && !d.reviews.length && <EmptyState emoji="✨" title="עוד אין פעילות" />}
      {!!d?.saves.length && (
        <Section title={<span className="flex items-center gap-2"><Bookmark className="size-5 text-primary" /> שמורים</span>}>
          <div className="space-y-2">{list(d.saves, (r) => `נשמר ${formatRelative(r.created_at!)}`)}</div>
        </Section>
      )}
      {!!d?.reviews.length && (
        <Section title={<span className="flex items-center gap-2"><Star className="size-5 text-partner" /> ביקורות שכתבתי</span>}>
          <div className="space-y-2">{list(d.reviews, (r) => "⭐".repeat(r.rating ?? 0))}</div>
        </Section>
      )}
      {!!d?.views.length && (
        <Section title={<span className="flex items-center gap-2"><Eye className="size-5 text-muted-foreground" /> צפיתי לאחרונה</span>}>
          <div className="space-y-2">{list(d.views, (r) => formatRelative(r.viewed_at!))}</div>
        </Section>
      )}
    </Page>
  );
}
