import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Move, Play, X } from "lucide-react";
import { SafeImg } from "@/components/safe-img";
import { useAuth } from "@/hooks/use-auth";
import { uploadMedia } from "@/lib/storage";
import { VIDEO_POSTER, cn, videoFrameSrc } from "@/lib/utils";

/** Event videos: short clips only (and the storage bucket's 50 MB per file). */
export const EVENT_VIDEO_MAX_SECONDS = 30;
const EVENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type EventMediaValue = {
  image_url: string | null;
  video_url: string | null;
  /** Optional media just for the story (9:16); a story video's first frame goes in story_image_url. */
  story_image_url: string | null;
  story_video_url: string | null;
  /** Which part of the picture the 4:3 feed crop shows ("50% 30%"). */
  media_position: string | null;
};

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

const parsePos = (p: string | null): [number, number] => {
  const m = /^(\d+)% (\d+)%$/.exec(p ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
};
const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

/**
 * The event's picture or short video (≤30 s), shown as it will look in the feed (4:3 — drag to choose
 * the crop) and in the story (9:16, blurred fill). The story can get its own picture or video.
 */
export function EventMediaPicker({
  value,
  onChange,
  className,
}: {
  value: EventMediaValue;
  onChange: (v: Partial<EventMediaValue>) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const mainRef = React.useRef<HTMLInputElement>(null);
  const storyRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const has = !!(value.image_url || value.video_url);
  const ownStory = !!(value.story_image_url || value.story_video_url);

  /** Uploads a picture, or a checked video plus its first frame. */
  async function upload(file: File): Promise<{ image: string | null; video: string | null } | null> {
    if (!user) return null;
    if (file.type.startsWith("video/")) {
      if (file.size > EVENT_VIDEO_MAX_BYTES) {
        toast.error("הסרטון גדול מדי (עד 50MB) — נסו סרטון קצר יותר או באיכות נמוכה יותר");
        return null;
      }
      setBusy("בודקים את הסרטון…");
      const { seconds, frame } = await inspectVideo(file);
      if (seconds > EVENT_VIDEO_MAX_SECONDS + 0.5) {
        toast.error(`הסרטון ארוך מ-${EVENT_VIDEO_MAX_SECONDS} שניות — קצרו אותו ונסו שוב`);
        return null;
      }
      setBusy("מעלים את הסרטון…");
      const [video, image] = await Promise.all([
        uploadMedia(user.id, file, "events"),
        frame ? uploadMedia(user.id, frame, "events", "jpg") : Promise.resolve(null),
      ]);
      return { video, image };
    }
    setBusy("מעלים את התמונה…");
    return { image: await uploadMedia(user.id, file, "events"), video: null };
  }

  async function pick(file: File, target: "main" | "story") {
    try {
      const up = await upload(file);
      if (!up) return;
      if (target === "main") onChange({ image_url: up.image, video_url: up.video, media_position: null });
      else onChange({ story_image_url: up.image, story_video_url: up.video });
    } catch {
      toast.error("ההעלאה נכשלה, נסו שוב");
    } finally {
      setBusy(null);
    }
  }

  // Drag the feed preview to choose which part of the picture the crop shows.
  const drag = React.useRef<{ x: number; y: number; pos: [number, number]; w: number; h: number } | null>(null);
  const [pos, setPos] = React.useState<[number, number]>(() => parsePos(value.media_position));
  React.useEffect(() => setPos(parsePos(value.media_position)), [value.media_position]);
  const latest = React.useRef(pos);
  const objectPosition = `${pos[0]}% ${pos[1]}%`;

  const media = (src: { image: string | null; video: string | null }, fit: "cover" | "contain", style?: React.CSSProperties) =>
    src.video ? (
      <video
        src={videoFrameSrc(src.video)}
        poster={src.image ?? VIDEO_POSTER}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        style={style}
        className={cn("pointer-events-none absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")}
      />
    ) : (
      <SafeImg
        src={src.image ?? undefined}
        alt=""
        style={style}
        draggable={false}
        className={cn("pointer-events-none absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")}
      />
    );
  const main = { image: value.image_url, video: value.video_url };
  const story = ownStory ? { image: value.story_image_url, video: value.story_video_url } : main;

  return (
    <div className={className}>
      {!has ? (
        <button
          type="button"
          onClick={() => mainRef.current?.click()}
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
        <>
          <div className="flex items-start gap-3">
            <figure className="min-w-0 flex-[3]">
              <div
                className="relative aspect-[4/3] cursor-grab touch-none overflow-hidden rounded-2xl bg-muted active:cursor-grabbing"
                aria-label="גררו כדי לבחור מה רואים בפיד"
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  drag.current = { x: e.clientX, y: e.clientY, pos, w: r.width, h: r.height };
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    /* not all pointers can be captured — the drag still works inside the box */
                  }
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  // dragging the picture down reveals more of its top → the position moves toward 0%
                  const next: [number, number] = [clamp(d.pos[0] - ((e.clientX - d.x) / d.w) * 100), clamp(d.pos[1] - ((e.clientY - d.y) / d.h) * 100)];
                  latest.current = next;
                  setPos(next);
                }}
                onPointerUp={() => {
                  if (!drag.current) return;
                  drag.current = null;
                  onChange({ media_position: `${latest.current[0]}% ${latest.current[1]}%` });
                }}
                onPointerCancel={() => (drag.current = null)}
              >
                {media(main, "cover", { objectPosition })}
                {value.video_url && (
                  <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-foreground/60 text-background" aria-hidden>
                    <Play className="size-3.5 fill-current" />
                  </span>
                )}
                <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-foreground/60 px-2 py-0.5 text-[11px] text-background">
                  <Move className="size-3" /> גררו
                </span>
              </div>
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">בפיד</figcaption>
            </figure>
            <figure className="min-w-0 flex-[1.4]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-foreground">
                {story.image && <SafeImg src={story.image} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />}
                {media(story, "contain")}
              </div>
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">בסטורי</figcaption>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => (ownStory ? onChange({ story_image_url: null, story_video_url: null }) : storyRef.current?.click())}
                className="mt-1 w-full text-center text-xs font-semibold text-primary"
              >
                {ownStory ? "כמו בפיד" : "החלפה לסטורי"}
              </button>
            </figure>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={!!busy} onClick={() => mainRef.current?.click()} className="h-9 rounded-full bg-surface-soft px-4 text-sm font-semibold">
              {busy ?? "החלפה"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onChange({ image_url: null, video_url: null, story_image_url: null, story_video_url: null, media_position: null })}
              className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground"
            >
              <X className="size-4" /> הסרה
            </button>
          </div>
        </>
      )}
      {(
        [
          [mainRef, "main"],
          [storyRef, "story"],
        ] as const
      ).map(([ref, target]) => (
        <input
          key={target}
          ref={ref}
          type="file"
          accept="image/*,video/*"
          // Chrome on Android shows only photos in the single-file picker; with "multiple" it offers
          // photos and videos. Only the first chosen file is used.
          multiple
          hidden
          aria-label={target === "main" ? "תמונה או סרטון לאירוע" : "תמונה או סרטון לסטורי"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(f, target);
          }}
        />
      ))}
    </div>
  );
}
