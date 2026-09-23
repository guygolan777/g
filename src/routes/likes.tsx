import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, SlidersHorizontal, X } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { RequireAuth } from "@/components/gates";
import { PhotoCarousel } from "@/components/pickers";
import { Chip, Tag } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { PROFILE_COLUMNS, PROFILE_MINI } from "@/lib/constants";
import { useBlockedIds } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { ageFromBirthYear } from "@/lib/format";
import { hobbyLabel } from "@/lib/hobby-categories";
import { getTrait } from "@/lib/traits";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { AudienceGender, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/likes")({
  head: () => seo({ title: "היכרויות", description: "היכרויות ב-mibale: מחליקים, עושים לייק, ובהתאמה הדדית נפתח צ׳אט." }),
  component: () => (
    <RequireAuth reason="ההיכרויות זמינות לחברי mibale בלבד.">
      <Dating />
    </RequireAuth>
  ),
});

function Dating() {
  const { user, profile, settings, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const { data: blocked } = useBlockedIds();
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const [match, setMatch] = React.useState<Profile | null>(null);
  const [drag, setDrag] = React.useState({ x: 0, active: false });
  const startX = React.useRef(0);

  const candidatesKey = ["dating-candidates", user?.id, settings?.pref_gender, settings?.pref_min_age, settings?.pref_max_age, settings?.pref_distance_km];
  const candidates = useQuery({
    queryKey: candidatesKey,
    enabled: !!profile?.dating_enabled && !!settings,
    queryFn: async () => {
      const year = new Date().getFullYear();
      let q = supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("dating_enabled", true)
        .eq("onboarded", true)
        .is("banned_at", null)
        .neq("id", user!.id)
        .gte("birth_year", year - settings!.pref_max_age)
        .lte("birth_year", year - settings!.pref_min_age)
        .limit(100);
      if (settings!.pref_gender !== "all") q = q.eq("gender", settings!.pref_gender);
      const [{ data: people }, { data: swiped }, { data: near }, { data: loc }] = await Promise.all([
        q,
        supabase.from("romantic_likes").select("liked_id").eq("liker_id", user!.id),
        supabase.rpc("nearby_profiles", { radius_km: settings!.pref_distance_km }),
        supabase.from("profile_locations").select("profile_id").eq("profile_id", user!.id).maybeSingle(),
      ]);
      const done = new Set((swiped ?? []).map((s) => s.liked_id as string));
      const nearMap = new Map(((near ?? []) as Array<{ profile_id: string; distance_km: number }>).map((n) => [n.profile_id, n.distance_km]));
      const hasLocation = !!loc;
      return ((people ?? []) as Profile[])
        .filter((p) => !done.has(p.id) && (!hasLocation || nearMap.has(p.id)))
        .map((p) => ({ ...p, distance: nearMap.get(p.id) ?? null }));
    },
  });

  const matches = useQuery({
    queryKey: ["dates", user?.id],
    enabled: !!profile?.dating_enabled,
    queryFn: async () => {
      const { data } = await supabase.from("dates").select("profile_a, profile_b, created_at").order("created_at", { ascending: false });
      const ids = (data ?? []).map((d) => (d.profile_a === user!.id ? d.profile_b : d.profile_a) as string);
      if (!ids.length) return [];
      const { data: ps } = await supabase.from("profiles").select(PROFILE_MINI).in("id", ids);
      return (ps ?? []) as Profile[];
    },
  });

  const list = withoutBlocked(candidates.data ?? [], blocked ?? new Set(), (p) => p.id);
  const current = list[0];

  async function swipe(action: "like" | "pass") {
    if (!current) return;
    const target = current;
    qc.setQueryData(candidatesKey, (old: typeof candidates.data) => old?.filter((p) => p.id !== target.id));
    setDrag({ x: 0, active: false });
    const { error } = await supabase.from("romantic_likes").upsert({ liker_id: user!.id, liked_id: target.id, action });
    if (error) return void toast.error("הפעולה נכשלה");
    if (action === "like") {
      void hapticTap("success");
      const [a, b] = [user!.id, target.id].sort();
      const { data } = await supabase.from("dates").select("id").eq("profile_a", a).eq("profile_b", b).maybeSingle();
      if (data) {
        setMatch(target);
        void qc.invalidateQueries({ queryKey: ["dates"] });
      }
    }
  }

  if (!profile?.dating_enabled) {
    return (
      <Page>
        <PageHeader title="היכרויות" back />
        <div className="rounded-3xl bg-like-soft p-6 text-center">
          <p className="text-5xl">💘</p>
          <h2 className="mt-3 text-xl font-bold">להכיר מישהו מיוחד?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ההיכרויות מופיעות רק כאן ובפרופילים. אף אחד לא רואה מי עשה לו לייק — רק התאמה הדדית פותחת צ׳אט.
          </p>
          <Button
            variant="like"
            size="lg"
            className="mt-5 w-full"
            onClick={async () => {
              await supabase.from("profiles").update({ dating_enabled: true }).eq("id", user!.id);
              await refreshProfile();
            }}
          >
            הפעלת היכרויות
          </Button>
        </div>
      </Page>
    );
  }

  const age = current ? ageFromBirthYear(current.birth_year) : null;
  const rot = drag.x / 18;

  return (
    <Page>
      <PageHeader
        title="היכרויות"
        back
        actions={
          <Button size="icon" variant="ghost" onClick={() => setPrefsOpen(true)} aria-label="העדפות">
            <SlidersHorizontal />
          </Button>
        }
      />

      {(matches.data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">התאמות</p>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 scrollbar-none">
            {matches.data!.map((m) => (
              <Link key={m.id} to="/chat/$id" params={{ id: m.id }} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <Avatar src={m.avatar_url} name={m.name} size={60} ring />
                <span className="w-full truncate text-center text-xs">{m.name.split(" ")[0]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!current ? (
        <EmptyState emoji="🌙" title="אין כרגע פרופילים חדשים" text="נסו להרחיב את טווח הגילאים או המרחק" action={<Button variant="soft" onClick={() => setPrefsOpen(true)}>העדפות</Button>} />
      ) : (
        <div>
          <div
            className="relative touch-pan-y select-none"
            style={{ transform: `translateX(${drag.x}px) rotate(${rot}deg)`, transition: drag.active ? "none" : "transform 200ms" }}
            onPointerDown={(e) => {
              startX.current = e.clientX;
              setDrag({ x: 0, active: true });
            }}
            onPointerMove={(e) => drag.active && setDrag({ x: e.clientX - startX.current, active: true })}
            onPointerUp={() => {
              if (drag.x < -110) void swipe("like");
              else if (drag.x > 110) void swipe("pass");
              else setDrag({ x: 0, active: false });
            }}
            onPointerCancel={() => setDrag({ x: 0, active: false })}
          >
            <PhotoCarousel photos={current.photos?.length ? current.photos : current.avatar_url ? [current.avatar_url] : []} className="aspect-[3/4] shadow-lift">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-scrim" />
              <div className="pointer-events-none absolute right-4 bottom-4 left-4 text-scrim-foreground">
                <p className="text-2xl font-bold">
                  {current.name}
                  {age ? `, ${age}` : ""}
                </p>
                <p className="text-sm opacity-90">
                  {current.city}
                  {current.distance != null && ` · ${current.distance} ק״מ`}
                </p>
              </div>
              {drag.x < -40 && <span className="absolute top-6 left-6 rotate-[-12deg] rounded-xl border-4 border-like px-3 py-1 text-2xl font-black text-like">LIKE</span>}
              {drag.x > 40 && <span className="absolute top-6 right-6 rotate-12 rounded-xl border-4 border-muted-foreground px-3 py-1 text-2xl font-black text-muted-foreground">NOPE</span>}
            </PhotoCarousel>
          </div>
          <div className="mt-4 flex justify-center gap-6">
            <button onClick={() => void swipe("pass")} className="grid size-16 place-items-center rounded-full bg-surface text-muted-foreground shadow-lift" aria-label="דילוג">
              <X className="size-8" />
            </button>
            <button onClick={() => void swipe("like")} className="grid size-16 place-items-center rounded-full bg-like text-like-foreground shadow-lift" aria-label="לייק">
              <Heart className="size-8 fill-current" />
            </button>
          </div>
          {current.bio && <p className="mt-5 leading-relaxed">{current.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {current.hobbies?.slice(0, 6).map((h) => (
              <Tag key={h} className="bg-primary-soft text-primary">
                {hobbyLabel(h)}
              </Tag>
            ))}
            {current.traits?.slice(0, 6).map((t) => {
              const tr = getTrait(t);
              return tr ? <Tag key={t}>{tr.emoji} {tr.label}</Tag> : null;
            })}
          </div>
          <Link to="/profile/$id" params={{ id: current.id }} className="mt-4 block text-center text-sm font-semibold text-primary">
            לפרופיל המלא
          </Link>
        </div>
      )}

      <PrefsSheet open={prefsOpen} onOpenChange={setPrefsOpen} />

      <Dialog open={!!match} onOpenChange={(o) => !o && setMatch(null)}>
        <DialogContent title="💘 יש התאמה!" description={match ? `את/ה ו${match.name} אהבתם אחד את השני` : undefined}>
          <div className="flex justify-center gap-4">
            <Avatar src={profile.avatar_url} name={profile.name} size={80} ring />
            <Avatar src={match?.avatar_url} name={match?.name} size={80} ring />
          </div>
          {match && (
            <Button asChild variant="brand" size="lg" className="mt-5 w-full">
              <Link to="/chat/$id" params={{ id: match.id }}>שליחת הודעה</Link>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

/** Dating preferences — private (pref_* columns are never visible to others). */
function PrefsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, settings, refreshProfile } = useAuth();
  const [gender, setGender] = React.useState<AudienceGender>("all");
  const [min, setMin] = React.useState(18);
  const [max, setMax] = React.useState(99);
  const [dist, setDist] = React.useState(50);
  React.useEffect(() => {
    if (!settings) return;
    setGender(settings.pref_gender);
    setMin(settings.pref_min_age);
    setMax(settings.pref_max_age);
    setDist(settings.pref_distance_km);
  }, [settings, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent title="העדפות היכרות" description="ההעדפות פרטיות ולא מוצגות לאף אחד">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold">מעוניין/ת להכיר</p>
            <div className="flex gap-2">
              {(
                [
                  ["all", "כולם"],
                  ["female", "נשים"],
                  ["male", "גברים"],
                ] as const
              ).map(([g, l]) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="מגיל">
              <Input type="number" min={18} max={99} value={min} onChange={(e) => setMin(Number(e.target.value) || 18)} />
            </Field>
            <Field label="עד גיל">
              <Input type="number" min={18} max={99} value={max} onChange={(e) => setMax(Number(e.target.value) || 99)} />
            </Field>
          </div>
          <Field label={`מרחק מקסימלי: ${dist} ק״מ`}>
            <input type="range" min={1} max={200} value={dist} onChange={(e) => setDist(Number(e.target.value))} className={cn("w-full accent-primary")} />
          </Field>
          <Button
            className="w-full"
            variant="brand"
            onClick={async () => {
              if (max < min) return void toast.error("טווח הגילאים לא תקין");
              const { error } = await supabase
                .from("profiles")
                .update({ pref_gender: gender, pref_min_age: Math.max(18, min), pref_max_age: max, pref_distance_km: dist })
                .eq("id", user!.id);
              if (error) return void toast.error("השמירה נכשלה");
              await refreshProfile();
              onOpenChange(false);
            }}
          >
            שמירה
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            onClick={async () => {
              await supabase.from("profiles").update({ dating_enabled: false }).eq("id", user!.id);
              await refreshProfile();
              onOpenChange(false);
            }}
          >
            כיבוי היכרויות
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
