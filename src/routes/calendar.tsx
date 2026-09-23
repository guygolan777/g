import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Ticket } from "lucide-react";
import { EmptyState, Page, PageHeader, Section } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMyParticipations } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS } from "@/lib/constants";
import { whoComesTitle } from "@/lib/event-title";
import { formatDate, formatTime } from "@/lib/format";
import type { EventRow, ParticipantStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/calendar")({
  head: () => seo({ title: "היומן שלי", description: "כל האירועים שלך במקום אחד: כמארגן/ת, כמשתתף/ת, ממתינים ושמורים." }),
  component: () => (
    <RequireAuth reason="היומן האישי זמין לחברי mibale.">
      <CalendarPage />
    </RequireAuth>
  ),
});


type Entry = { event: EventRow; role: "organizer" | ParticipantStatus | "saved" };
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function CalendarPage() {
  const { user } = useAuth();
  const { data: parts = [] } = useMyParticipations();
  const saved = useQuery({
    queryKey: ["saved-events", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("event_saves").select(`event:events(${EVENT_COLUMNS})`).eq("profile_id", user!.id);
      return ((data ?? []) as unknown as Array<{ event: EventRow | null }>).map((r) => r.event).filter(Boolean) as EventRow[];
    },
  });
  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = React.useState(() => dayKey(new Date()));

  const entries = React.useMemo(() => {
    const out: Entry[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      if (!p.event || p.status === "declined") continue;
      seen.add(p.event.id);
      out.push({ event: p.event, role: p.event.organizer_id === user?.id ? "organizer" : p.status });
    }
    for (const e of saved.data ?? []) if (!seen.has(e.id)) out.push({ event: e, role: "saved" });
    return out.sort((a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime());
  }, [parts, saved.data, user?.id]);

  const byDay = React.useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(new Date(e.event.starts_at));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entries]);

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const dayEntries = byDay.get(selected) ?? [];
  const upcoming = entries.filter((e) => new Date(e.event.starts_at) >= new Date()).slice(0, 10);

  return (
    <Page>
      <PageHeader
        title="היומן שלי"
        actions={
          <Button asChild variant="soft" size="sm">
            <Link to="/tickets">
              <Ticket /> כרטיסים
            </Link>
          </Button>
        }
      />
      <div className="rounded-3xl bg-surface p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="חודש קודם">
            <ChevronRight />
          </Button>
          <p className="font-bold">{formatDate(month.toISOString(), { month: "long", year: "numeric" })}</p>
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="חודש הבא">
            <ChevronLeft />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const k = dayKey(d);
            const has = byDay.get(k);
            const today = k === dayKey(new Date());
            return (
              <button
                key={i}
                onClick={() => setSelected(k)}
                className={cn(
                  "relative grid aspect-square place-items-center rounded-full text-sm",
                  selected === k ? "bg-primary font-bold text-primary-foreground" : today ? "bg-primary-soft font-bold text-primary" : "hover:bg-muted",
                )}
              >
                {d.getDate()}
                {has && <span className={cn("absolute bottom-1 size-1.5 rounded-full", selected === k ? "bg-primary-foreground" : "bg-like")} />}
              </button>
            );
          })}
        </div>
      </div>

      <Section title="באותו יום">
        {dayEntries.length === 0 ? <p className="text-sm text-muted-foreground">אין אירועים ביום הזה</p> : <EntryList entries={dayEntries} />}
      </Section>
      <Section title="בקרוב">
        {upcoming.length === 0 ? (
          <EmptyState
            emoji="📅"
            title="היומן ריק"
            action={
              <Button asChild variant="brand">
                <Link to="/discover">לגלות אירועים</Link>
              </Button>
            }
          />
        ) : (
          <EntryList entries={upcoming} />
        )}
      </Section>
    </Page>
  );
}

const ROLE: Record<Entry["role"], { label: string; variant: "partner" | "success" | "muted" | "violet" | "destructive" }> = {
  organizer: { label: "מארגן/ת", variant: "partner" },
  approved: { label: "משתתף/ת", variant: "success" },
  pending: { label: "ממתין", variant: "muted" },
  declined: { label: "לא אושר", variant: "destructive" },
  saved: { label: "שמור", variant: "violet" },
};

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <div className="space-y-2">
      {entries.map(({ event, role }) => (
        <Link key={event.id} to="/e/$id" params={{ id: event.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
          <div className="w-12 shrink-0 text-center">
            <p className="text-lg leading-none font-bold">{new Date(event.starts_at).getDate()}</p>
            <p className="text-xs text-muted-foreground">{formatTime(event.starts_at)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{whoComesTitle(event.title)}</p>
            <p className="truncate text-xs text-muted-foreground">{event.is_online ? "אונליין" : event.location_name}</p>
          </div>
          <Badge variant={ROLE[role].variant}>{ROLE[role].label}</Badge>
        </Link>
      ))}
    </div>
  );
}
