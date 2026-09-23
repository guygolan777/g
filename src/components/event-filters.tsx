import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DualSlider, Slider } from "@/components/ui/range";
import { cn } from "@/lib/utils";
import { HOBBY_CATEGORIES, hobbyToneClass } from "@/lib/hobby-categories";
import { eventDistance, type SortMode } from "@/lib/event-ranking";
import type { LatLng } from "@/lib/geo";
import type { EventRow, Gender } from "@/lib/types";

export type EventFilters = {
  categories: string[];
  when: "all" | "today" | "week" | "month";
  maxKm: number; // DISTANCE_MAX = no limit
  audience: "all" | "mine";
  ages: [number, number]; // AGE_MAX = 70+
  price: "all" | "free" | "paid";
  sort: SortMode;
};

export const DISTANCE_MAX = 100;
export const AGE_MIN = 18;
export const AGE_MAX = 70;

export const DEFAULT_FILTERS: EventFilters = {
  categories: [],
  when: "all",
  maxKm: DISTANCE_MAX,
  audience: "all",
  ages: [AGE_MIN, AGE_MAX],
  price: "all",
  sort: "recommended",
};

const KEY = "mibale-event-filters";

/** Event filters remembered per device. */
export function useEventFilters(scope = "home") {
  const key = `${KEY}:${scope}`;
  const [filters, setFilters] = React.useState<EventFilters>(DEFAULT_FILTERS);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<EventFilters> | null;
      if (saved) setFilters({ ...DEFAULT_FILTERS, ...saved });
    } catch {
      /* ignore */
    }
  }, [key]);
  const update = React.useCallback(
    (next: EventFilters) => {
      setFilters(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [filters, update] as const;
}

export function activeFilterCount(f: EventFilters): number {
  return (
    (f.when !== "all" ? 1 : 0) +
    (f.maxKm < DISTANCE_MAX ? 1 : 0) +
    (f.audience !== "all" ? 1 : 0) +
    (f.ages[0] > AGE_MIN || f.ages[1] < AGE_MAX ? 1 : 0) +
    (f.price !== "all" ? 1 : 0) +
    (f.sort !== "recommended" ? 1 : 0)
  );
}

export function applyEventFilters<T extends EventRow>(
  events: T[],
  f: EventFilters,
  ctx: { gender?: Gender | null; location?: LatLng | null; now?: number },
): T[] {
  const now = ctx.now ?? Date.now();
  const end =
    f.when === "today"
      ? new Date(new Date(now).setHours(23, 59, 59, 999)).getTime()
      : f.when === "week"
        ? now + 7 * 86_400_000
        : f.when === "month"
          ? now + 31 * 86_400_000
          : Infinity;
  return events.filter((e) => {
    if (f.categories.length && !f.categories.includes(e.category)) return false;
    if (new Date(e.starts_at).getTime() > end) return false;
    if (f.maxKm < DISTANCE_MAX) {
      const d = eventDistance(e, ctx.location);
      if (d != null && d > f.maxKm) return false;
    }
    if (f.audience === "mine" && (e.gender_target ?? "all") !== ctx.gender) return false;
    if (f.ages[0] > AGE_MIN || f.ages[1] < AGE_MAX) {
      const lo = e.min_age ?? AGE_MIN;
      const hi = e.max_age ?? 99;
      const selHi = f.ages[1] >= AGE_MAX ? 999 : f.ages[1];
      if (hi < f.ages[0] || lo > selHi) return false;
    }
    if (f.price === "free" && (e.price ?? 0) > 0) return false;
    if (f.price === "paid" && !(e.price ?? 0)) return false;
    return true;
  });
}

/** Filter button + one-line colored category chips (text only). */
export function CategoryChipsRow({
  filters,
  onChange,
  onOpenFilters,
}: {
  filters: EventFilters;
  onChange: (f: EventFilters) => void;
  onOpenFilters?: () => void;
}) {
  const n = activeFilterCount(filters);
  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative grid size-11 shrink-0 place-items-center rounded-full bg-surface-soft"
          aria-label="סינון"
        >
          <SlidersHorizontal className="size-5" />
          {n > 0 && (
            <span className="absolute -top-0.5 -left-0.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
        </button>
      )}
      {HOBBY_CATEGORIES.map((c) => {
        const active = filters.categories.includes(c.id);
        return (
          <button
            key={c.id}
            onClick={() =>
              onChange({ ...filters, categories: active ? filters.categories.filter((x) => x !== c.id) : [...filters.categories, c.id] })
            }
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95",
              active ? "bg-primary text-primary-foreground" : hobbyToneClass(c.id),
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="flex gap-2">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "h-11 flex-1 rounded-full text-sm font-semibold transition",
            value === v ? "bg-primary text-primary-foreground" : "bg-surface-soft text-muted-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** "סינון אירועים" bottom sheet. Edits a draft and commits on "החלה". */
export function EventFilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: EventFilters;
  onApply: (f: EventFilters) => void;
}) {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    if (open) setD(value);
  }, [open, value]);
  const title = (t: string, right?: React.ReactNode) => (
    <div className="mb-2 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{t}</p>
      {right && <p className="font-bold">{right}</p>}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent title="סינון אירועים" description="קטגוריות, מרחק, מגדר, גילאים ומחיר">
        <div className="space-y-6">
          <div>
            {title("קטגוריות")}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setD({ ...d, categories: [] })}
                className={cn("rounded-full px-5 py-2.5 text-sm font-semibold shadow-soft", !d.categories.length ? "bg-primary text-primary-foreground" : "bg-surface")}
              >
                הכל
              </button>
              {HOBBY_CATEGORIES.map((c) => {
                const on = d.categories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setD({ ...d, categories: on ? d.categories.filter((x) => x !== c.id) : [...d.categories, c.id] })}
                    className={cn("rounded-full px-4 py-2.5 text-sm font-semibold shadow-soft", on ? "bg-primary text-primary-foreground" : "bg-surface")}
                  >
                    {c.emoji} {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            {title("מיון")}
            <Seg value={d.sort} onChange={(v) => setD({ ...d, sort: v })} options={[["recommended", "מומלץ"], ["time", "הכי קרוב בזמן"], ["distance", "הכי קרוב אליי"]]} />
          </div>
          <div>
            {title("מתי")}
            <Seg value={d.when} onChange={(v) => setD({ ...d, when: v })} options={[["all", "הכל"], ["today", "היום"], ["week", "השבוע"], ["month", "החודש"]]} />
          </div>
          <div>
            {title("מרחק ממני", d.maxKm >= DISTANCE_MAX ? "ללא הגבלה" : `עד ${d.maxKm} ק״מ`)}
            <Slider label="מרחק ממני" min={1} max={DISTANCE_MAX} value={d.maxKm} onChange={(v) => setD({ ...d, maxKm: v })} />
          </div>
          <div>
            {title("מגדר קהל היעד")}
            <Seg value={d.audience} onChange={(v) => setD({ ...d, audience: v })} options={[["all", "כולם"], ["mine", "מיועד למגדר שלי"]]} />
          </div>
          <div>
            {title("מיועד לגילאים", `${d.ages[0]}–${d.ages[1] >= AGE_MAX ? `${AGE_MAX}+` : d.ages[1]}`)}
            <DualSlider label="גילאים" min={AGE_MIN} max={AGE_MAX} value={d.ages} onChange={(v) => setD({ ...d, ages: v })} />
          </div>
          <div>
            {title("מחיר")}
            <Seg value={d.price} onChange={(v) => setD({ ...d, price: v })} options={[["all", "הכל"], ["free", "חינם"], ["paid", "בתשלום"]]} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setD({ ...DEFAULT_FILTERS })}>
              איפוס
            </Button>
            <Button
              variant="brand"
              size="lg"
              className="flex-1"
              onClick={() => {
                onApply(d);
                onOpenChange(false);
              }}
            >
              החלה
            </Button>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}
