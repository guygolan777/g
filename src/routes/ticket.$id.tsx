import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CenteredSpinner, EmptyState, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS } from "@/lib/constants";
import { seo } from "@/lib/seo";
import type { EventRow } from "@/lib/types";

export const Route = createFileRoute("/ticket/$id")({
  head: () => seo({ title: "הכרטיס שלי", description: "כרטיס QR אישי לכניסה לאירוע ב-mibale." }),
  component: () => (
    <RequireAuth>
      <TicketPage />
    </RequireAuth>
  ),
});

function TicketPage() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const q = useQuery({
    queryKey: ["ticket", id, user?.id],
    queryFn: async () => {
      const [{ data: event }, { data: ticket }] = await Promise.all([
        supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle(),
        supabase.from("event_tickets").select("code").eq("event_id", id).eq("profile_id", user!.id).maybeSingle(),
      ]);
      return { event: event as unknown as EventRow | null, code: (ticket?.code as string | undefined) ?? null };
    },
  });
  if (q.isLoading) return <CenteredSpinner />;
  return (
    <Page>
      <PageHeader title="הכרטיס שלי" back />
      {q.data?.event && q.data.code ? (
        <TicketCard event={q.data.event} code={q.data.code} holder={profile?.name ?? ""} />
      ) : (
        <EmptyState
          emoji="🎟️"
          title="אין כרטיס לאירוע הזה"
          text="כרטיס נוצר אוטומטית אחרי אישור ההשתתפות"
          action={
            <Button asChild variant="soft">
              <Link to="/e/$id" params={{ id }}>לעמוד האירוע</Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}
