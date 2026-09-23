import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page, PageHeader, Section } from "@/components/app-shell";
import { HobbyPicker, PhotoGridPicker, TraitPicker } from "@/components/pickers";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ageFromBirthDate } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { Gender } from "@/lib/types";

export const Route = createFileRoute("/me/edit")({
  head: () => seo({ title: "עריכת פרופיל", description: "עדכון תמונות, פרטים, תחביבים ומאפיינים בפרופיל ה-mibale שלך." }),
  component: EditProfile,
});

function EditProfile() {
  const { user, profile, settings, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [city, setCity] = React.useState("");
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<Gender | null>(null);
  const [hobbies, setHobbies] = React.useState<string[]>([]);
  const [traits, setTraits] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!profile) return;
    setPhotos(profile.photos ?? []);
    setName(profile.name);
    setBio(profile.bio ?? "");
    setCity(profile.city ?? "");
    setGender(profile.gender ?? null);
    setHobbies(profile.hobbies ?? []);
    setTraits(profile.traits ?? []);
  }, [profile]);
  React.useEffect(() => setBirth(settings?.birth_date ?? ""), [settings]);

  async function save() {
    if (!name.trim()) return void toast.error("נא להזין שם");
    const age = ageFromBirthDate(birth);
    if (birth && (age == null || age < 18)) return void toast.error("תאריך לידה לא תקין");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), bio: bio.trim(), city: city.trim() || null, birth_date: birth || null, gender, hobbies, traits, photos, avatar_url: photos[0] ?? null })
      .eq("id", user!.id);
    setSaving(false);
    if (error) return void toast.error("השמירה נכשלה");
    await refreshProfile();
    toast.success("הפרופיל עודכן");
    void navigate({ to: "/me" });
  }

  return (
    <Page size="narrow">
      <PageHeader title="עריכת פרופיל" back />
      {user && <PhotoGridPicker userId={user.id} value={photos} onChange={setPhotos} />}
      <div className="mt-5 space-y-4">
        <Field label="שם">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="קצת עליי">
          <Textarea value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label="עיר">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="תאריך לידה" hint="פרטי — רק הגיל מוצג">
          <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
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
      <Section title="תחביבים">
        <HobbyPicker value={hobbies} onChange={setHobbies} />
      </Section>
      <Section title="מאפיינים">
        <TraitPicker value={traits} onChange={setTraits} />
      </Section>
      <Button variant="brand" size="lg" className="mt-8 w-full" disabled={saving} onClick={() => void save()}>
        שמירה
      </Button>
    </Page>
  );
}
