import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LocateFixed } from "lucide-react";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { getCurrentPosition } from "@/lib/native";
import { seo } from "@/lib/seo";
import { consumeRedirect } from "@/lib/guest";

export const Route = createFileRoute("/onboarding/location")({
  head: () => seo({ title: "איפה את/ה גר/ה?", description: "הוסיפו עיר ומיקום כדי לגלות אירועים ואנשים קרובים אליכם." }),
  component: () => (
    <RequireAuth>
      <Step3 />
    </RequireAuth>
  ),
});

function Step3() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [city, setCity] = React.useState("");
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setCity(profile?.city ?? ""), [profile]);

  async function locate() {
    setLocating(true);
    const pos = await getCurrentPosition();
    setLocating(false);
    if (!pos) return void toast.error("לא הצלחנו לקבל מיקום — אפשר להזין עיר ידנית");
    setCoords(pos);
    toast.success("המיקום נשמר 📍");
  }

  async function finish() {
    if (!city.trim()) return void toast.error("נא להזין עיר");
    setSaving(true);
    const uid = user!.id;
    const loc = coords
      ? await supabase
          .from("profile_locations")
          .upsert({ profile_id: uid, lat: coords.lat, lng: coords.lng, city: city.trim(), updated_at: new Date().toISOString() })
      : { error: null };
    const prof = await supabase.from("profiles").update({ city: city.trim(), onboarded: true }).eq("id", uid);
    setSaving(false);
    if (loc.error || prof.error) return void toast.error("השמירה נכשלה");
    await refreshProfile();
    toast.success("ברוכים הבאים ל-mibale 🎉");
    void navigate({ to: consumeRedirect("/home"), replace: true });
  }

  return (
    <OnboardingLayout
      step={3}
      title="איפה את/ה? 📍"
      subtitle="כדי להראות מה קורה קרוב אליך. המיקום המדויק לא מוצג לאף אחד."
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={() => void navigate({ to: "/onboarding/about" })}>
            חזרה
          </Button>
          <Button variant="brand" size="lg" className="flex-1" onClick={() => void finish()} disabled={saving}>
            סיום
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="עיר">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="למשל: תל אביב" />
        </Field>
        <Button variant={coords ? "success" : "soft"} size="lg" className="w-full" onClick={() => void locate()} disabled={locating}>
          <LocateFixed />
          {coords ? "המיקום התקבל" : locating ? "מאתרים…" : "שימוש במיקום הנוכחי"}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
