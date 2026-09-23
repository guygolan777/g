import { Link, createFileRoute } from "@tanstack/react-router";
import { SafeImg } from "@/components/safe-img";
import { Ticket } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { useMyParticipations } from "@/lib/queries";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/tickets")({
  head: () => seo({ title: "הכרטיסים שלי", description: "כל כרטיסי הכניסה לאירועים שאושרת אליהם ב-mibale." }),
  component: () => (
    <RequireAuth>
      <Tickets />
    </RequireAuth>
  ),
});

function Tickets() {
  const { data = [] } = useMyParticipations();
  const upcoming = data
    .filter((p) => p.status === "approved" && p.event && new Date(p.event.ends_at ?? p.event.starts_at) > new Date())
    .sort((a, b) => new Date(a.event!.starts_at).getTime() - new Date(b.event!.starts_at).getTime());
  return (
    <Page size="narrow">
      <PageHeader title="הכרטיסים שלי" back />
      {upcoming.length === 0 ? (
        <EmptyState emoji="🎟️" title="אין כרטיסים פעילים" text="כשתאושרו לאירוע, הכרטיס יופיע כאן" />
      ) : (
        <div className="space-y-3">
          {upcoming.map(({ event }) => (
            <Link key={event!.id} to="/ticket/$id" params={{ id: event!.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {event!.image_url && <SafeImg src={event!.image_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{whoComesTitle(event!.title)}</p>
                <p className="text-xs text-event">{formatEventWhen(event!.starts_at)}</p>
              </div>
              <Ticket className="size-5 text-primary" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
