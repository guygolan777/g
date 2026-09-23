import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { HOBBY_CATEGORIES } from "@/lib/hobby-categories";
import { seo } from "@/lib/seo";
import type { AudienceGender } from "@/lib/types";

export const Route = createFileRoute("/community/new")({
  head: () => seo({ title: "פתיחת קהילה", description: "פתחו קהילה ב-mibale סביב תחביב: קהל יעד, טווח גילאים ואישור חברים." }),
  component: () => (
    <RequireAuth reason="כדי לפתוח קהילה צריך חשבון mibale.">
      <NewCommunity />
    </RequireAuth>
  ),
});

function NewCommunity() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [hobby, setHobby] = React.useState("");
  const [city, setCity] = React.useState(profile?.city ?? "");
  const [image, setImage] = React.useState<string | null>(null);
  const [audience, setAudience] = React.useState<AudienceGender>("all");
  const [minAge, setMinAge] = React.useState(18);
  const [maxAge, setMaxAge] = React.useState(99);
  const [auto, setAuto] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const cat = HOBBY_CATEGORIES.find((c) => c.id === category);

  async function submit() {
    if (name.trim().length < 2) return void toast.error("נא להזין שם לקהילה");
    if (!category) return void toast.error("נא לבחור תחביב");
    if (maxAge < minAge) return void toast.error("טווח הגילאים לא תקין");
    setSaving(true);
    const { data, error } = await supabase
      .from("communities")
      .insert({
        founder_id: user!.id,
        name: name.trim(),
        description: description.trim(),
        hobby: hobby || category,
        city: city.trim() || null,
        image_url: image,
        audience_gender: audience,
        min_age: minAge,
        max_age: maxAge,
        auto_approve: auto,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) return void toast.error("יצירת הקהילה נכשלה");
    toast.success("🎉 הקהילה נפתחה");
    void qc.invalidateQueries({ queryKey: ["communities"] });
    void qc.invalidateQueries({ queryKey: ["my-communities"] });
    void navigate({ to: "/community/$id", params: { id: data.id as string }, replace: true });
  }

  return (
    <Page>
      <PageHeader title="פתיחת קהילה" back />
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-soft"
        >
          {image ? (
            <SafeImg src={image} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImagePlus className="size-7" /> תמונת קהילה
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setImage(await uploadMedia(user!.id, f, "communities"));
            } catch {
              toast.error("העלאת התמונה נכשלה");
            }
          }}
        />
        <Field label="שם הקהילה">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="תיאור">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="על מה הקהילה, למי היא מתאימה, כמה פעמים נפגשים…" />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">תחביב</p>
          <div className="flex flex-wrap gap-2">
            {HOBBY_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                active={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  setHobby("");
                }}
              >
                {c.emoji} {c.label}
              </Chip>
            ))}
          </div>
          {cat && (
            <div className="mt-3 flex flex-wrap gap-2 rounded-2xl bg-surface-soft p-3">
              {cat.subs.map((s) => (
                <Chip key={s.id} active={hobby === s.id} onClick={() => setHobby(hobby === s.id ? "" : s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <Field label="עיר">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">קהל יעד</p>
          <div className="flex gap-2">
            {(
              [
                ["all", "כולם"],
                ["female", "נשים"],
                ["male", "גברים"],
              ] as const
            ).map(([v, l]) => (
              <Chip key={v} active={audience === v} onClick={() => setAudience(v)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מגיל">
            <Input type="number" min={18} max={99} value={minAge} onChange={(e) => setMinAge(Number(e.target.value) || 18)} />
          </Field>
          <Field label="עד גיל">
            <Input type="number" min={18} max={99} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value) || 99)} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-soft">
          <div>
            <p className="font-semibold">אישור אוטומטי</p>
            <p className="text-xs text-muted-foreground">כבוי = כל בקשה ממתינה לאישור מנהלים</p>
          </div>
          <Switch checked={auto} onCheckedChange={setAuto} />
        </div>
      </div>
      <Button variant="brand" size="lg" className="mt-6 w-full" disabled={saving} onClick={() => void submit()}>
        פתיחת הקהילה
      </Button>
    </Page>
  );
}
