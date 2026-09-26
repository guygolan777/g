import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { HobbyPicker, TraitPicker } from "@/components/pickers";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";
import { writeError } from "@/lib/write-error";

export const Route = createFileRoute("/onboarding/about")({
  head: () => seo({ title: "קצת עליי — תחביבים ומאפיינים", description: "ספרו על עצמכם, בחרו תחביבים ומאפייני אישיות כדי שנמצא לכם אירועים ואנשים מתאימים." }),
  component: () => (
    <RequireAuth>
      <Step2 />
    </RequireAuth>
  ),
});

function Step2() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [bio, setBio] = React.useState("");
  const [hobbies, setHobbies] = React.useState<string[]>([]);
  const [traits, setTraits] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!profile) return;
    setBio(profile.bio ?? "");
    setHobbies(profile.hobbies ?? []);
    setTraits(profile.traits ?? []);
  }, [profile]);

  async function next() {
    if (hobbies.length === 0) return void toast.error("בחרו לפחות תחביב אחד");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ bio: bio.trim(), hobbies, traits }).eq("id", user!.id);
    setSaving(false);
    if (error) return void toast.error(writeError(error, "השמירה נכשלה"));
    await refreshProfile();
    void navigate({ to: "/onboarding/location" });
  }

  return (
    <OnboardingLayout
      step={2}
      title="קצת עליך ✍️"
      subtitle="ככה נמצא לך אירועים ואנשים שבאמת מתאימים"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={() => void navigate({ to: "/onboarding/profile" })}>
            חזרה
          </Button>
          <Button variant="brand" size="lg" className="flex-1" onClick={() => void next()} disabled={saving}>
            המשך
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="קצת עליי">
          <Textarea value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} placeholder="מה את/ה אוהב/ת לעשות? מה מחפש/ת ב-mibale?" />
        </Field>
        <div>
          <p className="mb-2 font-semibold">תחביבים</p>
          <HobbyPicker value={hobbies} onChange={setHobbies} />
        </div>
        <div>
          <p className="mb-2 font-semibold">מאפיינים</p>
          <TraitPicker value={traits} onChange={setTraits} />
        </div>
      </div>
    </OnboardingLayout>
  );
}
