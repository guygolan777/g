import { LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Chip } from "@/components/chip";
import { useAuth } from "@/hooks/use-auth";
import { useMyCommunities } from "@/lib/queries";
import { HOBBY_CATEGORIES } from "@/lib/hobby-categories";
import { EVENT_MIN_AGE, PAID_EVENTS_ENABLED, UNLIMITED_SEATS } from "@/lib/constants";
import { getCurrentPosition } from "@/lib/native";
import { AddressInput } from "@/components/address-input";
import { EventMediaPicker } from "@/components/event-media-picker";
import { geocode } from "@/lib/geocode";
import { toLocalInput } from "@/lib/format";
import { whoComesTitle } from "@/lib/event-title";
import type { AudienceGender, EventRow, Recurrence } from "@/lib/types";

export type EventFormValues = {
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  /** Short clip (≤30 s); image_url then holds its first frame. */
  video_url: string | null;
  story_image_url: string | null;
  story_video_url: string | null;
  media_position: string | null;
  starts_at: string;
  ends_at: string;
  is_online: boolean;
  meeting_url: string;
  location_name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  seats: number;
  auto_approve: boolean;
  recurrence: Recurrence;
  community_id: string | null;
  min_age: number | null;
  max_age: number | null;
  gender_target: AudienceGender;
  price: number;
  /** Bit / PayBox / payment page (https) — shown only to people who asked to join. */
  payment_link: string;
  max_distance_km: number | null;
};

export function emptyEventForm(): EventFormValues {
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setMinutes(0, 0, 0);
  start.setHours(19);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return {
    title: "",
    description: "",
    category: "",
    subcategory: null,
    image_url: null,
    video_url: null,
    story_image_url: null,
    story_video_url: null,
    media_position: null,
    starts_at: toLocalInput(start.toISOString()),
    ends_at: toLocalInput(end.toISOString()),
    is_online: false,
    meeting_url: "",
    location_name: "",
    city: "",
    lat: null,
    lng: null,
    seats: UNLIMITED_SEATS,
    auto_approve: true,
    recurrence: "none",
    community_id: null,
    min_age: null,
    max_age: null,
    gender_target: "all",
    price: 0,
    payment_link: "",
    max_distance_km: null,
  };
}

export function eventToForm(e: EventRow, meetingUrl: string | null): EventFormValues {
  return {
    ...emptyEventForm(),
    title: e.title,
    description: e.description ?? "",
    category: e.category,
    subcategory: e.subcategory,
    image_url: e.image_url,
    video_url: e.video_url ?? null,
    story_image_url: e.story_image_url ?? null,
    story_video_url: e.story_video_url ?? null,
    media_position: e.media_position ?? null,
    starts_at: toLocalInput(e.starts_at),
    ends_at: toLocalInput(e.ends_at),
    is_online: !!e.is_online,
    meeting_url: meetingUrl ?? "",
    location_name: e.location_name ?? "",
    city: e.city ?? "",
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    seats: e.seats ?? UNLIMITED_SEATS,
    auto_approve: e.auto_approve ?? true,
    recurrence: e.recurrence ?? "none",
    community_id: e.community_id ?? null,
    min_age: e.min_age ?? null,
    max_age: e.max_age ?? null,
    gender_target: e.gender_target ?? "all",
    price: Number(e.price ?? 0),
    payment_link: "",
    max_distance_km: e.max_distance_km ?? null,
  };
}

/** Converts form values into an events row payload (validated). */
export async function formToPayload(v: EventFormValues) {
  if (v.title.trim().length < 2) throw new Error("נא להזין כותרת");
  if (!v.category) throw new Error("נא לבחור קטגוריה");
  if (!v.starts_at) throw new Error("נא לבחור מועד");
  const starts = new Date(v.starts_at);
  const ends = v.ends_at ? new Date(v.ends_at) : null;
  if (ends && ends < starts) throw new Error("שעת הסיום לפני ההתחלה");
  if (v.is_online && !/^https?:\/\//.test(v.meeting_url.trim())) throw new Error("נא להזין קישור מפגש תקין");
  if (!v.is_online && !v.location_name.trim()) throw new Error("נא להזין מיקום");
  const payLink = v.payment_link.trim();
  if (payLink && !/^https:\/\/\S+$/.test(payLink)) throw new Error("קישור התשלום צריך להתחיל ב-https://");
  let { lat, lng } = v;
  if (!v.is_online && (lat == null || lng == null)) {
    const g = await geocode([v.location_name, v.city].filter(Boolean).join(", "));
    if (g) ({ lat, lng } = g);
  }
  return {
    title: v.title.trim().replace(/^מי בא ל/, "").replace(/\?+$/, "").trim(),
    description: v.description.trim(),
    category: v.category,
    subcategory: v.subcategory,
    image_url: v.image_url,
    video_url: v.video_url,
    story_image_url: v.story_image_url,
    story_video_url: v.story_video_url,
    media_position: v.media_position,
    starts_at: starts.toISOString(),
    ends_at: ends?.toISOString() ?? null,
    is_online: v.is_online,
    meeting_url: v.is_online ? v.meeting_url.trim() : null,
    location_name: v.is_online ? null : v.location_name.trim(),
    city: v.is_online ? null : v.city.trim() || null,
    lat: v.is_online ? null : lat,
    lng: v.is_online ? null : lng,
    seats: v.seats,
    auto_approve: v.auto_approve,
    community_id: v.community_id,
    min_age: v.min_age,
    max_age: v.max_age,
    gender_target: v.gender_target,
    price: Math.max(0, Number(v.price) || 0),
    // Free → no link. Paid with an empty field → leave whatever is stored (the edit form can't read it back blindly).
    ...(Number(v.price) > 0 ? (payLink ? { payment_link: payLink } : {}) : { payment_link: null }),
    max_distance_km: v.max_distance_km,
  };
}

export function EventForm({
  value,
  onChange,
  mode,
}: {
  value: EventFormValues;
  onChange: (v: EventFormValues) => void;
  mode: "create" | "edit";
}) {
  const { user, profile } = useAuth();
  const { data: myCommunities = [] } = useMyCommunities(user?.id);
  const set = <K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) => onChange({ ...value, [k]: v });
  const cat = HOBBY_CATEGORIES.find((c) => c.id === value.category);
  const unlimited = value.seats >= UNLIMITED_SEATS;

  return (
    <div className="space-y-5">
      <EventMediaPicker value={value} onChange={(m) => onChange({ ...value, ...m })} />

      <Field label="כותרת" hint={value.title ? `יוצג כ: ${whoComesTitle(value.title)}` : "למשל: ריצת בוקר בפארק"}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-semibold text-muted-foreground">מי בא ל</span>
          <Input value={value.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
        </div>
      </Field>

      <div>
        <p className="mb-2 text-sm font-semibold">קטגוריה</p>
        <div className="flex flex-wrap gap-2">
          {HOBBY_CATEGORIES.map((c) => (
            <Chip key={c.id} active={value.category === c.id} onClick={() => onChange({ ...value, category: c.id, subcategory: null })}>
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
        {cat && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-2xl bg-surface-soft p-3">
            {cat.subs.map((s) => (
              <Chip key={s.id} active={value.subcategory === s.id} onClick={() => set("subcategory", value.subcategory === s.id ? null : s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <Field label="תיאור">
        <Textarea value={value.description} onChange={(e) => set("description", e.target.value)} placeholder="מה עושים, מה להביא, למי זה מתאים…" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="התחלה">
          <Input type="datetime-local" value={value.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
        </Field>
        <Field label="סיום">
          <Input type="datetime-local" value={value.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-soft">
        <div>
          <p className="font-semibold">אירוע אונליין</p>
          <p className="text-xs text-muted-foreground">הקישור יוצג רק למשתתפים מאושרים</p>
        </div>
        <Switch checked={value.is_online} onCheckedChange={(c) => set("is_online", c)} />
      </div>

      {value.is_online ? (
        <Field label="קישור למפגש">
          <Input dir="ltr" value={value.meeting_url} onChange={(e) => set("meeting_url", e.target.value)} placeholder="https://" />
        </Field>
      ) : (
        <div className="space-y-3">
          <Field label="מיקום">
            <AddressInput
              value={value.location_name}
              verified={value.lat != null}
              onChange={(t) => onChange({ ...value, location_name: t, lat: null, lng: null })}
              onPick={(pl) => onChange({ ...value, location_name: pl.label, city: pl.city ?? value.city, lat: pl.lat, lng: pl.lng })}
              placeholder="שם המקום או כתובת"
            />
          </Field>
          <Field label="עיר">
            <Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value, lat: null, lng: null })} />
          </Field>
          <Button
            type="button"
            variant={value.lat != null ? "success" : "soft"}
            size="sm"
            onClick={async () => {
              const p = await getCurrentPosition();
              if (!p) return void toast.error("לא הצלחנו לאתר מיקום");
              onChange({ ...value, lat: p.lat, lng: p.lng });
              toast.success("המיקום עודכן לסיכה במפה");
            }}
          >
            <LocateFixed />
            {value.lat != null ? "יש סיכה במפה" : "המיקום הנוכחי שלי"}
          </Button>
        </div>
      )}

      <div className="rounded-2xl bg-surface p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <p className="font-semibold">ללא הגבלת מקומות</p>
          <Switch checked={unlimited} onCheckedChange={(c) => set("seats", c ? UNLIMITED_SEATS : 10)} />
        </div>
        {!unlimited && (
          <Field label="מספר מקומות" className="mt-3">
            <Input type="number" min={2} max={5000} value={value.seats} onChange={(e) => set("seats", Math.max(2, Number(e.target.value) || 2))} />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-soft">
        <div>
          <p className="font-semibold">אישור אוטומטי</p>
          <p className="text-xs text-muted-foreground">כבוי = כל בקשה ממתינה לאישור שלך</p>
        </div>
        <Switch checked={value.auto_approve} onCheckedChange={(c) => set("auto_approve", c)} />
      </div>

      <Field label="מחיר (₪, 0 = חינם)">
        <Input
          type="number"
          min={0}
          value={value.price}
          disabled={!PAID_EVENTS_ENABLED}
          onChange={(e) => set("price", Math.max(0, Number(e.target.value) || 0))}
        />
      </Field>
      {!PAID_EVENTS_ENABLED && <p className="-mt-2 text-xs text-muted-foreground">בשלב זה אפשר לפתוח רק אירועים חינמיים.</p>}
      {value.price > 0 && <PaymentLinkField value={value.payment_link} onChange={(v) => set("payment_link", v)} />}

      {mode === "create" && (
        <Field label="חזרתיות">
          <Select value={value.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
            <option value="none">חד פעמי</option>
            <option value="daily">כל יום</option>
            <option value="weekly">כל שבוע</option>
            <option value="biweekly">כל שבועיים</option>
            <option value="monthly">כל חודש</option>
          </Select>
        </Field>
      )}

      {myCommunities.length > 0 && (
        <Field label="שייך לקהילה (לא חובה)">
          <Select value={value.community_id ?? ""} onChange={(e) => set("community_id", e.target.value || null)}>
            <option value="">ללא</option>
            {myCommunities.map((m) => (
              <option key={m.community!.id} value={m.community!.id}>
                {m.community!.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <details className="rounded-2xl bg-surface p-4 shadow-soft">
        <summary className="cursor-pointer font-semibold">קהל יעד (לא חובה)</summary>
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            {(
              [
                ["all", "כולם"],
                ["female", "נשים"],
                ["male", "גברים"],
              ] as const
            )
              // a women-only event is opened by a woman, a men-only one by a man
              .filter(([g]) => g === "all" || g === profile?.gender || g === value.gender_target)
              .map(([g, l]) => (
              <Chip key={g} active={value.gender_target === g} onClick={() => set("gender_target", g)}>
                {l}
              </Chip>
            ))}
          </div>
          <Field label="מרחק מקסימלי (ק״מ, ריק = ללא הגבלה)">
            <Input
              type="number"
              min={1}
              value={value.max_distance_km ?? ""}
              onChange={(e) => set("max_distance_km", e.target.value ? Math.max(1, Number(e.target.value)) : null)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="גיל מינימלי">
              <Input type="number" min={EVENT_MIN_AGE} placeholder={String(EVENT_MIN_AGE)} value={value.min_age ?? ""} onChange={(e) => set("min_age", e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="גיל מקסימלי">
              <Input type="number" min={EVENT_MIN_AGE} value={value.max_age ?? ""} onChange={(e) => set("max_age", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
        </div>
      </details>

    </div>
  );
}

/** Where participants pay. Paid events are never auto-approved: the organizer confirms payment. */
export function PaymentLinkField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Field label="קישור לתשלום (Bit / PayBox / דף תשלום)">
        <Input dir="ltr" type="url" inputMode="url" placeholder="https://" value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <p className="mt-1 text-xs text-muted-foreground">
        באירוע בתשלום כל הצטרפות ממתינה לאישור שלך — אשרו אחרי שהתשלום התקבל, והכרטיס יישלח אוטומטית. הקישור מוצג רק למי שביקש להצטרף.
      </p>
    </div>
  );
}

