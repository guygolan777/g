import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Heart, Info, MessageSquare, SlidersHorizontal, Undo2, X } from "lucide-react";
import { EmptyState, Page } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { RequireAuth } from "@/components/gates";
import { PhotoCarousel } from "@/components/pickers";
import { StoryRail } from "@/components/story-rail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { DualSlider, Slider } from "@/components/ui/range";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { PROFILE_COLUMNS } from "@/lib/constants";
import { useBlockedIds } from "@/lib/queries";
import { withoutBlocked } from "@/lib/blocks";
import { ageFromBirthYear } from "@/lib/format";
import { hobbyLabel, hobbyToneClass } from "@/lib/hobby-categories";
import { getTrait, traitToneClass } from "@/lib/traits";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { AudienceGender, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/likes")({
  head: () => seo({ title: "לייקים והתאמות", description: "הצד הרומנטי של mibale: סווינג, מי שחיבבתם והתאמות הדדיות." }),
  component: () => (
    <RequireAuth reason="ההיכרויות זמינות לחברי mibale בלבד.">
      <Dating />
    </RequireAuth>
  ),
});

const DISTANCE_UNLIMITED = 200;
const AGE_TOP = 99;
type Candidate = Profile & { distance: number | null };
type Tab = "matches" | "swing" | "liked";

function useMatches(uid?: string) {
  return useQuery({
    queryKey: ["dates", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("dates").select("profile_a, profile_b, created_at").order("created_at", { ascending: false });
      const ids = (data ?? []).map((d) => (d.profile_a === uid ? d.profile_b : d.profile_a) as string);
      if (!ids.length) return [];
      const { data: ps } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
      return (ps ?? []) as Profile[];
    },
  });
}

function useLiked(uid?: string) {
  return useQuery({
    queryKey: ["liked", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("romantic_likes")
        .select(`liked_id, created_at, liked:profiles!romantic_likes_liked_id_fkey(${PROFILE_COLUMNS})`)
        .eq("liker_id", uid!)
        .eq("action", "like")
        .order("created_at", { ascending: false });
      return ((data ?? []) as unknown as Array<{ liked: Profile | null }>).map((r) => r.liked).filter(Boolean) as Profile[];
    },
  });
}

function PersonLine({ person, action }: { person: Profile; action: React.ReactNode }) {
  const age = ageFromBirthYear(person.birth_year);
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
      <Link to="/profile/$id" params={{ id: person.id }}>
        <Avatar src={person.avatar_url} name={person.name} size={64} />
      </Link>
      <Link to="/profile/$id" params={{ id: person.id }} className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold">{person.name}</p>
        <p className="truncate text-muted-foreground">{[age, person.city].filter(Boolean).join(", ")}</p>
      </Link>
      {action}
    </div>
  );
}

function Dating() {
  const { user, profile, settings } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: blocked } = useBlockedIds();
  const dating = !!profile?.dating_enabled;
  const [tab, setTab] = React.useState<Tab>(dating ? "swing" : "matches");
  React.useEffect(() => setTab((t) => (!dating && t === "swing" ? "matches" : t)), [dating]);
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const [match, setMatch] = React.useState<Profile | null>(null);
  const [last, setLast] = React.useState<Candidate | null>(null);
  const [drag, setDrag] = React.useState({ x: 0, active: false });
  const startX = React.useRef(0);
  const bl = blocked ?? new Set<string>();

  const matches = useMatches(user?.id);
  const liked = useLiked(user?.id);

  const candidatesKey = ["dating-candidates", user?.id, settings?.pref_gender, settings?.pref_min_age, settings?.pref_max_age, settings?.pref_distance_km];
  const candidates = useQuery({
    queryKey: candidatesKey,
    enabled: dating && !!settings,
    queryFn: async (): Promise<Candidate[]> => {
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
      const unlimited = settings!.pref_distance_km >= DISTANCE_UNLIMITED;
      const [{ data: people }, { data: swiped }, { data: near }] = await Promise.all([
        q,
        supabase.from("romantic_likes").select("liked_id").eq("liker_id", user!.id),
        supabase.rpc("nearby_profiles", { radius_km: unlimited ? 20000 : settings!.pref_distance_km }),
      ]);
      const done = new Set((swiped ?? []).map((s) => s.liked_id as string));
      const nearMap = new Map(((near ?? []) as Array<{ profile_id: string; distance_km: number }>).map((n) => [n.profile_id, n.distance_km]));
      const hasLocation = (near ?? []).length > 0;
      return ((people ?? []) as Profile[])
        .filter((p) => !done.has(p.id) && (unlimited || !hasLocation || nearMap.has(p.id)))
        .map((p) => ({ ...p, distance: nearMap.get(p.id) ?? null }));
    },
  });

  const list = withoutBlocked(candidates.data ?? [], bl, (p) => p.id);
  const current = list[0];

  async function swipe(action: "like" | "pass") {
    if (!current) return;
    const target = current;
    qc.setQueryData(candidatesKey, (old: Candidate[] | undefined) => old?.filter((p) => p.id !== target.id));
    setDrag({ x: 0, active: false });
    setLast(target);
    const { error } = await supabase.from("romantic_likes").upsert({ liker_id: user!.id, liked_id: target.id, action });
    if (error) return void toast.error("הפעולה נכשלה");
    if (action === "like") {
      void hapticTap("success");
      void qc.invalidateQueries({ queryKey: ["liked"] });
      const [a, b] = [user!.id, target.id].sort();
      const { data } = await supabase.from("dates").select("id").eq("profile_a", a).eq("profile_b", b).maybeSingle();
      if (data) {
        setMatch(target);
        void qc.invalidateQueries({ queryKey: ["dates"] });
      }
    }
  }

  async function undo() {
    if (!last) return;
    const { error } = await supabase.from("romantic_likes").delete().eq("liker_id", user!.id).eq("liked_id", last.id);
    if (error) return void toast.error("לא הצלחנו לבטל");
    qc.setQueryData(candidatesKey, (old: Candidate[] | undefined) => [last, ...(old ?? []).filter((p) => p.id !== last.id)]);
    void qc.invalidateQueries({ queryKey: ["liked"] });
    setLast(null);
  }

  async function unlike(id: string) {
    await supabase.from("romantic_likes").delete().eq("liker_id", user!.id).eq("liked_id", id);
    void qc.invalidateQueries({ queryKey: ["liked"] });
  }

  const s = settings;
  const prefSummary = s
    ? [
        s.pref_gender === "all" ? "כולם" : s.pref_gender === "female" ? "נשים" : "גברים",
        `${s.pref_min_age}–${s.pref_max_age >= AGE_TOP ? `${AGE_TOP}+` : s.pref_max_age}`,
        s.pref_distance_km >= DISTANCE_UNLIMITED ? "ללא הגבלה" : `עד ${s.pref_distance_km} ק״מ`,
      ].join(" · ")
    : "";

  const tabs: Array<[Tab, string]> = dating
    ? [
        ["matches", `התאמות (${matches.data?.length ?? 0})`],
        ["swing", "סווינג"],
        ["liked", `חיבבת (${liked.data?.length ?? 0})`],
      ]
    : [
        ["matches", `התאמות (${matches.data?.length ?? 0})`],
        ["liked", `חיבבת (${liked.data?.length ?? 0})`],
      ];
  const age = current ? ageFromBirthYear(current.birth_year) : null;

  return (
    <Page>
      <header className="flex items-center gap-3 py-3">
        <button onClick={() => window.history.back()} className="grid size-12 place-items-center rounded-full bg-surface-soft" aria-label="חזרה">
          <ChevronRight className="size-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">לייקים והתאמות</h1>
          <p className="text-sm text-muted-foreground">הצד הרומנטי שלכם</p>
        </div>
        <Link to="/me">
          <Avatar src={profile?.avatar_url} name={profile?.name} size={52} />
        </Link>
      </header>

      {!dating ? (
        <div className="rounded-3xl bg-surface-soft p-4 text-muted-foreground">
          מצב היכרויות סגור — אתם לא מופיעים לאחרים והסווינג נעול. אפשר לראות רק את מי שחיבבתם ואת ההתאמות שנשארו. הפעילו את הלב
          בפרופיל שלי כדי לחזור לסווינג.
          <Button variant="like" size="sm" className="mt-3" onClick={() => void navigate({ to: "/me" })}>
            <Heart /> לפרופיל שלי
          </Button>
        </div>
      ) : (
        <>
          <button onClick={() => setPrefsOpen(true)} className="flex w-full items-center gap-3 py-2">
            <SlidersHorizontal className="size-6 text-like" />
            <span className="shrink-0 font-bold whitespace-nowrap">העדפות רומנטיות</span>
            <span className="ms-auto truncate text-xs text-muted-foreground">{prefSummary}</span>
          </button>
          <p className="mt-2 font-bold">סטוריז רומנטיים · גלוי רק למצב היכרויות פתוח</p>
          <StoryRail romantic />
        </>
      )}

      <div className="mt-4 flex rounded-full bg-muted p-1">
        {tabs.map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("h-11 flex-1 rounded-full text-sm font-bold transition", tab === t ? "bg-surface text-like shadow-soft" : "text-muted-foreground")}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "matches" &&
          (matches.data?.length ? (
            <div className="space-y-3">
              {withoutBlocked(matches.data, bl, (p) => p.id).map((m) => (
                <PersonLine
                  key={m.id}
                  person={m}
                  action={
                    <Link to="/chat/$id" params={{ id: m.id }} className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-brand text-primary-foreground" aria-label="צ׳אט">
                      <MessageSquare className="size-6" />
                    </Link>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState emoji="💘" title="עוד אין התאמות" text="כשמישהו שחיבבת יחבב אותך בחזרה — תראו את זה כאן" />
          ))}

        {tab === "liked" &&
          (liked.data?.length ? (
            <div className="space-y-3">
              {withoutBlocked(liked.data, bl, (p) => p.id).map((p) => (
                <PersonLine
                  key={p.id}
                  person={p}
                  action={
                    <button onClick={() => void unlike(p.id)} className="grid size-14 shrink-0 place-items-center rounded-full bg-like text-like-foreground" aria-label="ביטול לייק">
                      <Heart className="size-6 fill-current" />
                    </button>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState emoji="🤍" title="עוד לא חיבבת אף אחד" />
          ))}

        {tab === "swing" &&
          (!current ? (
            <EmptyState
              emoji="🌙"
              title="אין כרגע פרופילים חדשים"
              text="נסו להרחיב את טווח הגילאים או המרחק"
              action={
                <div className="flex gap-2">
                  <Button variant="soft" onClick={() => setPrefsOpen(true)}>
                    העדפות
                  </Button>
                  {last && (
                    <Button variant="outline" onClick={() => void undo()}>
                      <Undo2 /> ביטול אחרון
                    </Button>
                  )}
                </div>
              }
            />
          ) : (
            <div>
              <div
                className="relative touch-pan-y select-none"
                style={{ transform: `translateX(${drag.x}px) rotate(${drag.x / 18}deg)`, transition: drag.active ? "none" : "transform 200ms" }}
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
                <PhotoCarousel
                  photos={current.photos?.length ? current.photos : current.avatar_url ? [current.avatar_url] : []}
                  className="aspect-[3/4] rounded-[2rem] shadow-lift"
                >
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-scrim" />
                  <div className="pointer-events-none absolute right-5 bottom-12 flex items-center gap-3 text-scrim-foreground">
                    <Avatar src={current.avatar_url} name={current.name} size={64} className="ring-4 ring-surface" />
                    <div>
                      <p className="text-2xl font-bold">{current.name}</p>
                      <p className="opacity-90">
                        {[age, current.city].filter(Boolean).join(", ")}
                        {current.distance != null && ` · ${current.distance} ק״מ`}
                      </p>
                    </div>
                  </div>
                  {drag.x < -40 && <span className="absolute top-6 left-6 -rotate-12 rounded-xl border-4 border-like px-3 py-1 text-2xl font-black text-like">LIKE</span>}
                  {drag.x > 40 && <span className="absolute top-6 right-6 rotate-12 rounded-xl border-4 border-muted-foreground px-3 py-1 text-2xl font-black text-muted-foreground">NOPE</span>}
                </PhotoCarousel>
              </div>
              <div className="relative z-10 -mt-9 flex items-center justify-center gap-5">
                <button onClick={() => void swipe("pass")} className="grid size-16 place-items-center rounded-full bg-surface text-muted-foreground shadow-lift" aria-label="דילוג">
                  <X className="size-8" />
                </button>
                <Link to="/profile/$id" params={{ id: current.id }} className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift" aria-label="פרטים">
                  <Info className="size-7" />
                </Link>
                <button onClick={() => void swipe("like")} className="grid size-20 place-items-center rounded-full bg-like text-like-foreground shadow-lift" aria-label="לייק">
                  <Heart className="size-10 fill-current" />
                </button>
                <button
                  onClick={() => void undo()}
                  disabled={!last}
                  className="grid size-14 place-items-center rounded-full bg-partner-soft text-partner-strong shadow-lift disabled:opacity-40"
                  aria-label="ביטול הפעולה האחרונה"
                >
                  <Undo2 className="size-6" />
                </button>
              </div>

              {current.bio && (
                <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
                  <p className="font-bold">אודות</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{current.bio}</p>
                </div>
              )}
              {(current.hobbies?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-3xl bg-card p-5 shadow-soft">
                  <p className="mb-3 font-bold">תחומי עניין</p>
                  <div className="flex flex-wrap gap-2">
                    {current.hobbies!.map((h) => (
                      <span key={h} className={cn("rounded-full px-4 py-2 text-sm font-semibold", hobbyToneClass(h))}>
                        {hobbyLabel(h, false)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(current.traits?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-3xl bg-card p-5 shadow-soft">
                  <p className="mb-3 font-bold">מאפיינים</p>
                  <div className="flex flex-wrap gap-2">
                    {current.traits!.map((t) => {
                      const tr = getTrait(t);
                      return tr ? (
                        <span key={t} className={cn("rounded-full px-4 py-2 text-sm font-semibold", traitToneClass(t))}>
                          {tr.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>

      <PrefsSheet open={prefsOpen} onOpenChange={setPrefsOpen} />

      <Dialog open={!!match} onOpenChange={(o) => !o && setMatch(null)}>
        <DialogContent title="💘 יש התאמה!" description={match ? `את/ה ו${match.name} אהבתם אחד את השני` : undefined}>
          <div className="flex justify-center gap-4">
            <Avatar src={profile?.avatar_url} name={profile?.name} size={80} ring />
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

/** "העדפות רומנטיות" — private (pref_* columns are never visible to others). */
function PrefsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, settings, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [gender, setGender] = React.useState<AudienceGender>("all");
  const [ages, setAges] = React.useState<[number, number]>([18, AGE_TOP]);
  const [dist, setDist] = React.useState(DISTANCE_UNLIMITED);
  React.useEffect(() => {
    if (!settings || !open) return;
    setGender(settings.pref_gender);
    setAges([settings.pref_min_age, Math.min(AGE_TOP, settings.pref_max_age)]);
    setDist(Math.min(DISTANCE_UNLIMITED, settings.pref_distance_km));
  }, [settings, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent title="העדפות רומנטיות" description="ההעדפות פרטיות ולא מוצגות לאף אחד">
        <div className="space-y-6">
          <div>
            <p className="mb-2 font-bold">מגדר</p>
            <div className="flex gap-2">
              {(
                [
                  ["all", "כולם"],
                  ["female", "נשים"],
                  ["male", "גברים"],
                ] as const
              ).map(([g, l]) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn("h-11 rounded-full px-6 font-semibold", gender === g ? "bg-like text-like-foreground" : "bg-surface-soft text-muted-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex justify-between">
              <p className="font-bold">גילאים</p>
              <p className="text-muted-foreground">
                {ages[0]}–{ages[1] >= AGE_TOP ? `${AGE_TOP}+` : ages[1]}
              </p>
            </div>
            <DualSlider label="גילאים" min={18} max={AGE_TOP} value={ages} onChange={setAges} />
          </div>
          <div>
            <div className="mb-2 flex justify-between">
              <p className="font-bold">מרחק ממני</p>
              <p className="text-muted-foreground">{dist >= DISTANCE_UNLIMITED ? "ללא הגבלה" : `עד ${dist} ק״מ`}</p>
            </div>
            <Slider label="מרחק ממני" min={1} max={DISTANCE_UNLIMITED} value={dist} onChange={setDist} />
          </div>
          <Button
            className="w-full"
            variant="brand"
            size="lg"
            onClick={async () => {
              const { error } = await supabase
                .from("profiles")
                .update({ pref_gender: gender, pref_min_age: ages[0], pref_max_age: ages[1], pref_distance_km: dist })
                .eq("id", user!.id);
              if (error) return void toast.error("השמירה נכשלה");
              await refreshProfile();
              void qc.invalidateQueries({ queryKey: ["dating-candidates"] });
              onOpenChange(false);
            }}
          >
            שמירת העדפות
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
