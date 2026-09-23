import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/chip";
import { HOBBY_CATEGORIES } from "@/lib/hobby-categories";
import { TRAIT_GROUPS, toggleTrait } from "@/lib/traits";
import { MAX_PROFILE_PHOTOS } from "@/lib/constants";
import { uploadMedia } from "@/lib/storage";
import { cn, isVideoUrl } from "@/lib/utils";

/** Hobbies: pick categories, then refine by subcategory. */
export function HobbyPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {HOBBY_CATEGORIES.map((c) => {
          const count = value.filter((v) => v === c.id || v.startsWith(`${c.id}.`)).length;
          return (
            <Chip key={c.id} active={count > 0 || open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
              {c.emoji} {c.label}
              {count > 0 && <span className="rounded-full bg-primary-foreground/25 px-1.5 text-xs">{count}</span>}
            </Chip>
          );
        })}
      </div>
      {open && (
        <div className="rounded-2xl bg-surface-soft p-3">
          <div className="flex flex-wrap gap-2">
            {HOBBY_CATEGORIES.find((c) => c.id === open)!.subs.map((s) => (
              <Chip key={s.id} active={value.includes(s.id)} onClick={() => toggle(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TraitPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-4">
      {TRAIT_GROUPS.map((g) => (
        <div key={g.id}>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            {g.label}
            {g.single && <span className="font-normal"> · בחירה אחת</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {g.traits.map((t) => (
              <Chip key={t.id} active={value.includes(t.id)} onClick={() => onChange(toggleTrait(value, t.id))}>
                {t.emoji} {t.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Up to 6 profile photos; first is the main photo. */
export function PhotoGridPicker({ userId, value, onChange }: { userId: string; value: string[]; onChange: (v: string[]) => void }) {
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const room = MAX_PROFILE_PHOTOS - value.length;
      const urls = await Promise.all([...files].slice(0, room).map((f) => uploadMedia(userId, f, "photos")));
      onChange([...value, ...urls]);
    } catch {
      toast.error("העלאת התמונה נכשלה");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: MAX_PROFILE_PHOTOS }).map((_, i) => {
        const url = value[i];
        return (
          <div key={i} className={cn("relative aspect-[3/4] overflow-hidden rounded-2xl", url ? "" : "border-2 border-dashed border-border bg-surface-soft")}>
            {url ? (
              <>
                {isVideoUrl(url) ? (
                  <video src={url} muted playsInline className="size-full object-cover" />
                ) : (
                  <SafeImg src={url} alt="" className="size-full object-cover" />
                )}
                {i === 0 && <span className="absolute right-1.5 bottom-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-bold">ראשית</span>}
                <button
                  type="button"
                  className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-surface/90"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label="הסרת תמונה"
                >
                  <X className="size-3.5" />
                </button>
              </>
            ) : (
              i === value.length && (
                <button type="button" disabled={busy} onClick={() => input.current?.click()} className="grid size-full place-items-center text-muted-foreground">
                  {busy ? <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <Camera className="size-6" />}
                </button>
              )
            )}
          </div>
        );
      })}
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void add(e.target.files)} />
    </div>
  );
}

/** Swipeable photo carousel (scroll-snap) with dots. */
export function PhotoCarousel({ photos, className, children }: { photos: string[]; className?: string; children?: React.ReactNode }) {
  const [idx, setIdx] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const list = photos.length ? photos : [""];
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-muted", className)}>
      <div
        ref={ref}
        className="flex size-full snap-x snap-mandatory overflow-x-auto scrollbar-none"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
        }}
      >
        {list.map((p, i) => (
          <div key={i} className="size-full shrink-0 snap-center">
            {p ? <SafeImg src={p} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-5xl">🙂</div>}
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="absolute inset-x-0 top-2 flex justify-center gap-1 px-4">
          {list.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i === idx ? "bg-surface" : "bg-surface/40")} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
