import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Play, X } from "lucide-react";
import { SafeImg } from "@/components/safe-img";
import { useAuth } from "@/hooks/use-auth";
import { uploadMedia } from "@/lib/storage";
import { VIDEO_POSTER, cn, videoFrameSrc } from "@/lib/utils";

/** Event videos: short clips only (and the storage bucket's 50 MB per file). */
export const EVENT_VIDEO_MAX_SECONDS = 30;
const EVENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type EventMediaValue = { image_url: string | null; video_url: string | null };

/** Reads a local video's duration and grabs a still frame (JPEG) to use as the picture everywhere a video can't play. */
async function inspectVideo(file: File): Promise<{ seconds: number; frame: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((ok, fail) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => fail(new Error("unreadable video"));
    });
    let seconds = v.duration;
    if (!Number.isFinite(seconds)) {
      // Some recorders (e.g. webm from a browser) leave out the duration: seeking far past the end reveals it.
      v.currentTime = 1e101;
      await new Promise<void>((ok) => {
        v.ondurationchange = () => Number.isFinite(v.duration) && ok();
        setTimeout(ok, 5000);
      });
      seconds = Number.isFinite(v.duration) ? v.duration : 0;
    }
    let frame: Blob | null = null;
    try {
      v.currentTime = Math.min(0.5, seconds / 2);
      await new Promise<void>((ok, fail) => {
        v.onseeked = () => ok();
        v.onerror = () => fail(new Error("seek failed"));
        setTimeout(() => fail(new Error("seek timeout")), 5000);
      });
      const scale = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      if (canvas.width && canvas.height) {
        canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
        frame = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
      }
    } catch {
      frame = null; // some formats (e.g. HEVC on older Android) can't be decoded here — the video still uploads
    }
    return { seconds, frame };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The event's picture or short video (≤30 s), with a preview of how it looks in the feed (4:3 crop)
 * and in the story (full screen, blurred fill instead of black bars).
 */
export function EventMediaPicker({ value, onChange, className }: { value: EventMediaValue; onChange: (v: EventMediaValue) => void; className?: string }) {
  const { user } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const has = !!(value.image_url || value.video_url);

  async function pick(file: File) {
    if (!user) return;
    try {
      if (file.type.startsWith("video/")) {
        if (file.size > EVENT_VIDEO_MAX_BYTES) return void toast.error("הסרטון גדול מדי (עד 50MB) — נסו סרטון קצר יותר או באיכות נמוכה יותר");
        setBusy("בודקים את הסרטון…");
        const { seconds, frame } = await inspectVideo(file);
        if (seconds > EVENT_VIDEO_MAX_SECONDS + 0.5) return void toast.error(`הסרטון ארוך מ-${EVENT_VIDEO_MAX_SECONDS} שניות — קצרו אותו ונסו שוב`);
        setBusy("מעלים את הסרטון…");
        const [video_url, image_url] = await Promise.all([
          uploadMedia(user.id, file, "events"),
          frame ? uploadMedia(user.id, frame, "events", "jpg") : Promise.resolve(null),
        ]);
        onChange({ video_url, image_url });
      } else {
        setBusy("מעלים את התמונה…");
        onChange({ image_url: await uploadMedia(user.id, file, "events"), video_url: null });
      }
    } catch {
      toast.error("ההעלאה נכשלה, נסו שוב");
    } finally {
      setBusy(null);
    }
  }

  const media = (fit: "cover" | "contain", extra?: string) =>
    value.video_url ? (
      <video
        src={videoFrameSrc(value.video_url)}
        poster={value.image_url ?? VIDEO_POSTER}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain", extra)}
      />
    ) : (
      <SafeImg src={value.image_url ?? undefined} alt="" className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain", extra)} />
    );

  return (
    <div className={className}>
      {!has ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="grid aspect-[16/9] w-full place-items-center rounded-3xl border-2 border-dashed border-border bg-surface-soft text-muted-foreground"
        >
          <span className="flex flex-col items-center gap-1.5 text-center">
            <ImagePlus className="size-7" />
            <span className="font-semibold">{busy ?? "הוספת תמונה או סרטון"}</span>
            {!busy && <span className="text-xs">סרטון עד {EVENT_VIDEO_MAX_SECONDS} שניות</span>}
          </span>
        </button>
      ) : (
        <div className="flex items-end gap-3">
          <figure className="min-w-0 flex-[3]">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
              {media("cover")}
              {value.video_url && (
                <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-foreground/60 text-background" aria-hidden>
                  <Play className="size-3.5 fill-current" />
                </span>
              )}
            </div>
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">בפיד</figcaption>
          </figure>
          <figure className="min-w-0 flex-[1.4]">
            <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-foreground">
              {value.image_url && <SafeImg src={value.image_url} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />}
              {media("contain")}
            </div>
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">בסטורי</figcaption>
          </figure>
        </div>
      )}
      {has && (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="h-9 rounded-full bg-surface-soft px-4 text-sm font-semibold">
            {busy ?? "החלפה"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onChange({ image_url: null, video_url: null })}
            className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground"
          >
            <X className="size-4" /> הסרה
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
    </div>
  );
}
