import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, ChevronUp, Clock, DollarSign, ImagePlus, MapPin, Ticket, Users } from "lucide-react";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { emptyEventForm, formToPayload, type EventFormValues, PaymentLinkField } from "@/components/event-form";
import { AddressInput } from "@/components/address-input";
import { EventPublishedDialog } from "@/components/event-published";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/range";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useInvalidateEvents, useMyCommunities } from "@/lib/queries";
import { CUSTOM_CATEGORY, HOBBY_CATEGORIES, getSubcategory } from "@/lib/hobby-categories";
import { EVENT_MIN_AGE, PAID_EVENTS_ENABLED, UNLIMITED_SEATS } from "@/lib/constants";
import { uploadMedia } from "@/lib/storage";
import { toLocalInput } from "@/lib/format";
import { whoComesTitle } from "@/lib/event-title";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { Recurrence } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/event/new")({
  validateSearch: (s: Record<string, unknown>): { community?: string } => ({
    community: typeof s.community === "string" ? s.community : undefined,
  }),
  head: () => seo({ title: "יצירת הזמנה חדשה", description: "פותחים אירוע ב-mibale בשניות: מה, מתי ואיפה — ומגלים מי בא." }),
  component: () => (
    <RequireAuth reason="כדי לפתוח אירוע צריך חשבון mibale.">
      <NewEvent />
    </RequireAuth>
  ),
});

type When = "now" | "hour" | "custom";
const DISTANCE_OFF = 100;

function SectionTitle({ Icon, children, className }: { Icon: typeof Clock; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-event-soft text-primary">
        <Icon className="size-5" />
      </span>
      <p className="text-lg font-bold">{children}</p>
    </div>
  );
}

function Pill({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition active:scale-95",
        active ? "bg-gradient-brand text-brand-foreground shadow-soft" : "bg-surface-soft text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Quick "יצירת הזמנה חדשה": what → when → where → publish, with "עוד פרטים" for the rest. */
function NewEvent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateEvents();
  const { community } = Route.useSearch();
  const { data: myCommunities = [] } = useMyCommunities(user?.id);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [form, setForm] = React.useState<EventFormValues>(() => ({
    ...emptyEventForm(),
    category: HOBBY_CATEGORIES[0].id,
    community_id: community ?? null,
    // End time is optional here: no hidden default (it came from the full form's 19:00 start).
    ends_at: "",
  }));
  const [when, setWhen] = React.useState<When>("now");
  const [more, setMore] = React.useState(false);
  const [paid, setPaid] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [published, setPublished] = React.useState<{ id: string; title: string; starts_at: string } | null>(null);
  const set = <K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));

  const cat = HOBBY_CATEGORIES.find((c) => c.id === form.category) ?? HOBBY_CATEGORIES[0];
  const chosen = getSubcategory(form.subcategory);
  // The heading is the editable title: picking an activity fills "מי בא ל<activity>"; editing it
  // away from that clears the pick, so "מי בא לאכול פלאפל?" is an event with no activity card.
  const [heading, setHeading] = React.useState(TITLE_PREFIX);
  // Stored without the prefix and the question mark; whoComesTitle() adds both when displaying.
  const customTitle = (heading.startsWith(TITLE_PREFIX) ? heading.slice(TITLE_PREFIX.length) : heading).trim().replace(/\?+$/, "").trim();
  const unlimited = form.seats >= UNLIMITED_SEATS;
  const ready = (!!form.subcategory || customTitle.length > 1) && (form.is_online ? /^https?:\/\//.test(form.meeting_url.trim()) : form.location_name.trim().length > 1);

  function startsAt(): string {
    if (when === "custom") return form.starts_at;
    const d = new Date(Date.now() + (when === "hour" ? 3_600_000 : 5 * 60_000));
    return toLocalInput(d.toISOString());
  }

  const summary = [
    form.auto_approve ? "הרשמה אוטומטית" : "הרשמה באישור",
    unlimited ? "ללא הגבלת משתתפים" : `עד ${form.seats} משתתפים`,
    form.gender_target === "all" && form.min_age == null && form.max_age == null && form.max_distance_km == null ? "פתוח לכולם" : "לקהל יעד מוגדר",
    paid && form.price > 0 ? `₪${form.price}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  async function publish() {
    setSaving(true);
    try {
      const sub = getSubcategory(form.subcategory);
      const start = startsAt();
      const values: EventFormValues = {
        ...form,
        title: customTitle || sub?.label || cat.label,
        // A free-text title without a picked activity isn't filed under the open tab's category.
        category: sub ? form.category : CUSTOM_CATEGORY,
        starts_at: start,
        ends_at: form.ends_at && form.ends_at > start ? form.ends_at : "",
        price: paid ? form.price : 0,
        payment_link: paid ? form.payment_link : "",
      };
      const payload = await formToPayload(values);
      const { data, error } = await supabase
        .from("events")
        .insert({ ...payload, organizer_id: user!.id, recurrence: form.recurrence })
        .select("id")
        .single();
      if (error) throw error;
      void hapticTap("success");
      toast.success(`האירוע פורסם — ${whoComesTitle(values.title)}`);
      invalidate();
      setPublished({ id: data.id as string, title: values.title, starts_at: new Date(start).toISOString() });
    } catch (e) {
      toast.error((e as Error).message || "הפרסום נכשל");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page withNav={false} size="narrow">
      <PageHeader title="יצירת הזמנה חדשה" back />

      <TitleInput
        value={heading}
        onChange={(v) => {
          setHeading(v);
          if (chosen && v !== pickedTitle(chosen.label)) set("subcategory", null);
        }}
      />
      <div className="-mx-4 mt-3 flex gap-5 overflow-x-auto border-b border-border px-4 scrollbar-none">
        {HOBBY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (chosen && heading === pickedTitle(chosen.label)) setHeading(TITLE_PREFIX);
              setForm((f) => ({ ...f, category: c.id, subcategory: null }));
            }}
            className={cn(
              "shrink-0 border-b-[3px] pb-2 text-lg whitespace-nowrap transition",
              form.category === c.id ? "border-primary font-bold text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* Carousel: three and a half cards in view, so it's clear there's more to swipe. */}
      <div key={cat.id} className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
        {cat.subs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              set("subcategory", s.id);
              setHeading(pickedTitle(s.label));
            }}
            style={{ width: "calc((100% - 3 * 0.75rem) / 3.5)" }}
            className={cn(
              "flex aspect-[4/5] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-3xl bg-card shadow-soft transition active:scale-95",
              form.subcategory === s.id ? "ring-[3px] ring-primary" : "ring-1 ring-border",
            )}
          >
            <span className="text-5xl">{s.emoji}</span>
            <span className="text-base font-bold">{s.label}</span>
          </button>
        ))}
      </div>

      {/* מתי? */}
      <div className="-mx-4 mt-8 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none">
        <span className="flex shrink-0 items-center gap-2 text-lg font-bold">
          <Clock className="size-6 text-primary" /> מתי?
        </span>
        <Pill active={when === "now"} onClick={() => setWhen("now")}>
          עכשיו
        </Pill>
        <Pill active={when === "hour"} onClick={() => setWhen("hour")}>
          עוד שעה
        </Pill>
        <Pill active={when === "custom"} onClick={() => setWhen("custom")}>
          בחירת זמן ותאריך
        </Pill>
      </div>
      {when === "custom" && <Input className="mt-3" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />}

      {/* איפה? */}
      <SectionTitle Icon={MapPin} className="mt-8">
        איפה?
      </SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => set("is_online", false)}
          className={cn("h-12 rounded-full font-semibold", !form.is_online ? "bg-primary text-primary-foreground" : "bg-surface-soft")}
        >
          מיקום פיזי
        </button>
        <button
          type="button"
          onClick={() => set("is_online", true)}
          className={cn("h-12 rounded-full font-semibold", form.is_online ? "bg-primary text-primary-foreground" : "bg-surface-soft")}
        >
          אונליין
        </button>
      </div>
      {form.is_online ? (
        <Input className="mt-3 rounded-full border-0 bg-surface-soft" dir="ltr" placeholder="https://" value={form.meeting_url} onChange={(e) => set("meeting_url", e.target.value)} />
      ) : (
        <div className="mt-3">
          <AddressInput
            className="rounded-full border-0 bg-surface-soft"
            placeholder="לדוגמה: פארק הירקון"
            value={form.location_name}
            verified={form.lat != null}
            onChange={(t) => setForm((f) => ({ ...f, location_name: t, lat: null, lng: null }))}
            onPick={(pl) => setForm((f) => ({ ...f, location_name: pl.label, city: pl.city ?? f.city, lat: pl.lat, lng: pl.lng }))}
          />
        </div>
      )}

      {/* עוד פרטים */}
      <button type="button" onClick={() => setMore(!more)} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-surface-soft font-bold">
        {more ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        {more ? "פחות פרטים" : "עוד פרטים"}
      </button>

      {more && (
        <div className="mt-6 space-y-8">
          <div className="space-y-3">
            <Textarea className="rounded-3xl border-0 bg-surface-soft" placeholder="הוספת תיאור" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div>
            <SectionTitle Icon={ImagePlus}>מדיה</SectionTitle>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative mt-3 grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-border text-4xl text-muted-foreground"
            >
              {uploading ? "…" : "+"}
              <SafeImg src={form.image_url ?? undefined} className="absolute inset-0 size-full object-cover" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !user) return;
                setUploading(true);
                try {
                  set("image_url", await uploadMedia(user.id, f, "events"));
                } catch {
                  toast.error("העלאת התמונה נכשלה");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </div>

          <div>
            <SectionTitle Icon={CalendarDays}>שעת סיום (לא חובה)</SectionTitle>
            <Input className="mt-3 rounded-full border-0 bg-surface-soft" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
          </div>

          <div>
            <SectionTitle Icon={CalendarDays}>חזרה</SectionTitle>
            <label className="mt-3 block rounded-3xl bg-card p-4 shadow-soft">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-6 accent-primary"
                  checked={form.recurrence !== "none"}
                  onChange={(e) => set("recurrence", e.target.checked ? "weekly" : "none")}
                />
                <span className="text-lg font-bold">אירוע חוזר</span>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">כל מופע הוא אירוע נפרד עם משתתפים, צ׳אט וקבוצה משלו.</span>
              {form.recurrence !== "none" && (
                <Select className="mt-3" value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
                  <option value="daily">כל יום</option>
                  <option value="weekly">כל שבוע</option>
                  <option value="biweekly">כל שבועיים</option>
                  <option value="monthly">כל חודש</option>
                </Select>
              )}
            </label>
          </div>

          <div>
            <SectionTitle Icon={Ticket}>כמות מקומות</SectionTitle>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="grid size-12 place-items-center rounded-full bg-surface-soft text-2xl"
                onClick={() => set("seats", unlimited ? 10 : Math.max(2, form.seats - 1))}
                aria-label="פחות מקומות"
              >
                −
              </button>
              <span className="grid h-14 min-w-24 place-items-center rounded-2xl bg-surface-soft px-4 text-2xl font-bold">
                {unlimited ? "∞" : form.seats}
              </span>
              <button
                type="button"
                className="grid size-12 place-items-center rounded-full bg-primary text-2xl text-primary-foreground"
                onClick={() => set("seats", unlimited ? 10 : Math.min(5000, form.seats + 1))}
                aria-label="עוד מקומות"
              >
                +
              </button>
              <p className="flex-1 text-sm text-muted-foreground">
                {unlimited ? "ללא הגבלת משתתפים" : "ההרשמה תיסגר אוטומטית כשכל המקומות יתפסו."}
              </p>
            </div>
            {!unlimited && (
              <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => set("seats", UNLIMITED_SEATS)}>
                ללא הגבלה
              </button>
            )}
          </div>

          <div>
            <SectionTitle Icon={Users}>קהל יעד</SectionTitle>
            <p className="mt-2 text-sm text-muted-foreground">רק אנשים שתואמים לסינונים האלה יראו את ההזמנה.</p>
            <p className="mt-4 mb-2 text-sm font-semibold">מגדר</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["all", "הכול"],
                  ["male", "גברים"],
                  ["female", "נשים"],
                ] as const
              ).map(([g, l]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set("gender_target", g)}
                  className={cn("h-12 rounded-full font-semibold", form.gender_target === g ? "bg-primary text-primary-foreground" : "bg-surface-soft")}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-4 mb-2 text-sm font-semibold">טווח גילאים</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={EVENT_MIN_AGE}
                placeholder={String(EVENT_MIN_AGE)}
                className="rounded-full border-0 bg-surface-soft"
                value={form.min_age ?? ""}
                onChange={(e) => set("min_age", e.target.value ? Number(e.target.value) : null)}
              />
              <Input
                type="number"
                min={EVENT_MIN_AGE}
                placeholder="99"
                className="rounded-full border-0 bg-surface-soft"
                value={form.max_age ?? ""}
                onChange={(e) => set("max_age", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <p className="mt-4 mb-2 text-sm font-semibold">
              מרחק מקסימלי: {form.max_distance_km == null ? "ללא הגבלה" : `${form.max_distance_km} ק״מ`}
            </p>
            <Slider
              label="מרחק מקסימלי"
              min={1}
              max={DISTANCE_OFF}
              value={form.max_distance_km ?? DISTANCE_OFF}
              onChange={(v) => set("max_distance_km", v >= DISTANCE_OFF ? null : v)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <SectionTitle Icon={DollarSign}>מחיר</SectionTitle>
              <Switch checked={paid} onCheckedChange={setPaid} disabled={!PAID_EVENTS_ENABLED} aria-label="אירוע בתשלום" />
            </div>
            {paid ? (
              <>
                <Input
                  className="mt-3 rounded-full border-0 bg-surface-soft"
                  type="number"
                  min={1}
                  placeholder="מחיר בש״ח"
                  value={form.price || ""}
                  onChange={(e) => set("price", Math.max(0, Number(e.target.value) || 0))}
                />
                <PaymentLinkField className="mt-3" value={form.payment_link} onChange={(v) => set("payment_link", v)} />
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {PAID_EVENTS_ENABLED ? "ההזמנה הזו חינמית להצטרפות." : "ההזמנה הזו חינמית להצטרפות. בשלב זה אפשר לפתוח רק אירועים חינמיים."}
              </p>
            )}
          </div>

          {myCommunities.length > 0 && (
            <div>
              <SectionTitle Icon={Users}>שייך לקהילה</SectionTitle>
              <Select className="mt-3" value={form.community_id ?? ""} onChange={(e) => set("community_id", e.target.value || null)}>
                <option value="">ללא</option>
                {myCommunities.map((m) => (
                  <option key={m.community!.id} value={m.community!.id}>
                    {m.community!.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <label className="flex items-center justify-between gap-3 rounded-3xl bg-card p-4 shadow-soft">
            <span>
              <span className="block text-lg font-bold">הרשמה אוטומטית של משתתפים</span>
              <span className="text-sm text-muted-foreground">
                {form.auto_approve
                  ? `כל מי שתואם לסינונים נרשם מיידית${unlimited ? "" : `, עד ${form.seats} משתתפים`}.`
                  : "כל בקשה ממתינה לאישור שלך."}
              </span>
            </span>
            <Switch checked={form.auto_approve} onCheckedChange={(c) => set("auto_approve", c)} />
          </label>
        </div>
      )}

      <Button variant="brand" size="lg" className="mt-8 h-14 w-full text-lg" disabled={!ready || saving} onClick={() => void publish()}>
        {saving ? "מפרסמים…" : "פרסום"}
      </Button>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        {!form.subcategory && !customTitle ? "בחרו מה עושים (או כתבו בכותרת) ואיפה — וזהו." : `${summary}.`}
      </p>
      <EventPublishedDialog
        event={published}
        onDone={() => published && void navigate({ to: "/e/$id", params: { id: published.id }, replace: true })}
      />
    </Page>
  );
}

const TITLE_PREFIX = "מי בא ל";
/** Picking an activity fills the title as a question: "מי בא לכדורגל?". */
const pickedTitle = (label: string) => `${TITLE_PREFIX}${label}?`;

/**
 * The event title as a big editable heading. A blinking caret sits at the end of the text while it
 * isn't focused, so it reads as "you can type here"; focusing puts the real caret at the end.
 */
function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mirror = React.useRef<HTMLSpanElement>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [end, setEnd] = React.useState(0);
  React.useLayoutEffect(() => {
    const w = mirror.current?.offsetWidth ?? 0;
    setEnd(Math.min(w, (box.current?.offsetWidth ?? w) - 2));
  }, [value]);
  return (
    <div ref={box} className="relative mt-2">
      <input
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
        onBlur={() => setFocused(false)}
        placeholder="מי בא ל..."
        aria-label="כותרת האירוע"
        enterKeyHint="done"
        className="w-full bg-transparent text-2xl font-bold caret-primary outline-none placeholder:text-muted-foreground"
      />
      <span ref={mirror} aria-hidden className="invisible absolute top-0 right-0 text-2xl font-bold whitespace-pre">
        {value}
      </span>
      {!focused && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-7 w-0.5 -translate-y-1/2 animate-caret bg-foreground"
          style={{ right: end + 2 }}
        />
      )}
    </div>
  );
}
