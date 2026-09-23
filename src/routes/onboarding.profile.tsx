import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { PhotoGridPicker } from "@/components/pickers";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Chip } from "@/components/chip";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ageFromBirthDate } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { Gender } from "@/lib/types";

export const Route = createFileRoute("/onboarding/profile")({
  head: () => seo({ title: "בואו נכיר — תמונות ופרטים", description: "הוסיפו תמונות, שם, תאריך לידה ומגדר לפרופיל ה-mibale שלכם." }),
  component: () => (
    <RequireAuth>
      <Step1 />
    </RequireAuth>
  ),
});

function Step1() {
  const { user, profile, settings, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<Gender | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!profile) return;
    setPhotos(profile.photos?.length ? profile.photos : profile.avatar_url ? [profile.avatar_url] : []);
    setName(profile.name ?? "");
    setGender(profile.gender ?? null);
  }, [profile]);
  React.useEffect(() => setBirth(settings?.birth_date ?? ""), [settings]);

  async function next() {
    const age = ageFromBirthDate(birth);
    if (!name.trim()) return void toast.error("איך קוראים לך?");
    if (!birth || age == null) return void toast.error("נא להזין תאריך לידה");
    if (age < 18) return void toast.error("mibale מיועדת לבני 18 ומעלה");
    if (!gender) return void toast.error("נא לבחור מגדר");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), birth_date: birth, gender, photos, avatar_url: photos[0] ?? null })
      .eq("id", user!.id);
    setSaving(false);
    if (error) return void toast.error("השמירה נכשלה");
    await refreshProfile();
    void navigate({ to: "/onboarding/about" });
  }

  return (
    <OnboardingLayout
      step={1}
      title="בואו נכיר 👋"
      subtitle="תמונות טובות = יותר חיבורים. אפשר עד 6."
      footer={
        <Button variant="brand" size="lg" className="w-full" onClick={() => void next()} disabled={saving}>
          המשך
        </Button>
      }
    >
      <div className="space-y-5">
        {user && <PhotoGridPicker userId={user.id} value={photos} onChange={setPhotos} />}
        <Field label="שם">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="תאריך לידה" hint="הגיל יוצג, התאריך עצמו נשאר פרטי">
          <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">מגדר</p>
          <div className="flex gap-2">
            {(
              [
                ["female", "אישה"],
                ["male", "גבר"],
                ["other", "אחר"],
              ] as const
            ).map(([v, l]) => (
              <Chip key={v} active={gender === v} onClick={() => setGender(v)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
