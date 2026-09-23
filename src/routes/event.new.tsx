import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { EventForm, emptyEventForm, formToPayload } from "@/components/event-form";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useInvalidateEvents } from "@/lib/queries";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/event/new")({
  head: () => seo({ title: "אירוע חדש", description: "פתחו אירוע ב-mibale וגלו מי בא: קטגוריה, מועד, מיקום, מקומות ואישור משתתפים." }),
  component: () => (
    <RequireAuth reason="כדי לפתוח אירוע צריך חשבון mibale.">
      <NewEvent />
    </RequireAuth>
  ),
});

function NewEvent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateEvents();
  const [form, setForm] = React.useState(emptyEventForm);
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setSaving(true);
    try {
      const payload = await formToPayload(form);
      const { data, error } = await supabase
        .from("events")
        .insert({ ...payload, organizer_id: user!.id, recurrence: form.recurrence })
        .select("id")
        .single();
      if (error) throw error;
      if (form.also_story && payload.image_url) {
        await supabase.from("stories").insert({
          author_id: user!.id,
          event_id: data.id,
          media_url: payload.image_url,
          media_type: "image",
          caption: payload.title,
        });
      }
      void hapticTap("success");
      toast.success("🎉 האירוע נפתח!");
      invalidate();
      void navigate({ to: "/e/$id", params: { id: data.id as string }, replace: true });
    } catch (e) {
      toast.error((e as Error).message || "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader title="אירוע חדש" back />
      <EventForm value={form} onChange={setForm} mode="create" />
      <Button variant="brand" size="lg" className="mt-6 w-full" disabled={saving} onClick={() => void submit()}>
        {saving ? "פותחים…" : "פתיחת האירוע"}
      </Button>
      {form.also_story && !form.image_url && <p className="mt-2 text-center text-xs text-muted-foreground">לסטורי צריך תמונה לאירוע</p>}
    </Page>
  );
}
