import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CenteredSpinner, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { EventForm, eventToForm, formToPayload, type EventFormValues } from "@/components/event-form";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EVENT_COLUMNS } from "@/lib/constants";
import { useInvalidateEvents } from "@/lib/queries";
import { seo } from "@/lib/seo";
import type { EventRow } from "@/lib/types";

export const Route = createFileRoute("/e/$id/edit")({
  head: () => seo({ title: "עריכת אירוע", description: "עדכון פרטי האירוע שלך ב-mibale." }),
  component: () => (
    <RequireAuth>
      <EditEvent />
    </RequireAuth>
  ),
});

function EditEvent() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateEvents();
  const [form, setForm] = React.useState<EventFormValues | null>(null);
  const [saving, setSaving] = React.useState(false);

  const q = useQuery({
    queryKey: ["event-edit", id],
    queryFn: async () => {
      const [{ data }, { data: meeting }, { data: payLink }] = await Promise.all([
        supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle(),
        supabase.rpc("event_meeting_url", { _event_id: id }),
        supabase.rpc("event_payment_link", { _event_id: id }),
      ]);
      return { event: data as unknown as EventRow | null, meeting: (meeting as string | null) ?? null, payLink: (payLink as string | null) ?? "" };
    },
  });

  React.useEffect(() => {
    if (q.data?.event && !form) setForm({ ...eventToForm(q.data.event, q.data.meeting), payment_link: q.data.payLink });
  }, [q.data, form]);

  if (q.isLoading || !form) return <CenteredSpinner />;
  if (q.data?.event?.organizer_id !== user?.id) {
    return (
      <Page size="narrow">
        <PageHeader title="עריכת אירוע" back />
        <p className="text-muted-foreground">רק המארגן/ת יכול/ה לערוך את האירוע.</p>
      </Page>
    );
  }

  return (
    <Page size="narrow">
      <PageHeader title="עריכת אירוע" back />
      <EventForm value={form} onChange={setForm} mode="edit" />
      <Button
        variant="brand"
        size="lg"
        className="mt-6 w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const payload = await formToPayload(form);
            const { error } = await supabase.from("events").update(payload).eq("id", id);
            if (error) throw error;
            toast.success("האירוע עודכן");
            invalidate();
            void navigate({ to: "/e/$id", params: { id }, replace: true });
          } catch (e) {
            toast.error((e as Error).message || "השמירה נכשלה");
          } finally {
            setSaving(false);
          }
        }}
      >
        שמירת שינויים
      </Button>
    </Page>
  );
}
