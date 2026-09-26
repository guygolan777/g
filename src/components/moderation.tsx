import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, ShieldCheck } from "lucide-react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Chip } from "@/components/chip";
import { SafeImg } from "@/components/safe-img";
import { SUSPEND_OPTIONS, moderation, moderationError } from "@/lib/admin";
import { VIDEO_POSTER, isVideoUrl, videoFrameSrc } from "@/lib/utils";
import type { ReportSnapshot } from "@/lib/types";

/** A sheet asking for a reason (and optionally a length) before a staff action. */
export function ReasonSheet({
  trigger,
  title,
  description,
  confirm,
  durations,
  presets = [],
  required = true,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirm: string;
  durations?: boolean;
  presets?: string[];
  required?: boolean;
  onConfirm: (reason: string, hours: number | null) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [hours, setHours] = React.useState<number | null>(24);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <SheetContent title={title} description={description}>
        {durations && (
          <div className="mb-3 flex flex-wrap gap-2">
            {SUSPEND_OPTIONS.map((o) => (
              <Chip key={o.label} active={hours === o.hours} onClick={() => setHours(o.hours)}>
                {o.label}
              </Chip>
            ))}
          </div>
        )}
        {presets.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {presets.map((p) => (
              <Chip key={p} active={reason === p} onClick={() => setReason(p)}>
                {p}
              </Chip>
            ))}
          </div>
        )}
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (תוצג למשתמש/ת)" aria-label="סיבה" />
        <Button
          className="mt-4 w-full"
          variant="destructive"
          disabled={busy || (required && !reason.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(reason.trim(), hours);
              setOpen(false);
              setReason("");
            } catch (e) {
              toast.error(moderationError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirm}
        </Button>
      </SheetContent>
    </Dialog>
  );
}

export const REASON_PRESETS = ["הטרדה", "ספאם", "תוכן מיני / לא הולם", "התחזות", "הונאה", "אלימות או איומים", "גיל מתחת למותר"];

/** Warn / suspend / lift for one user. */
export function UserActions({
  userId,
  name,
  suspended,
  onDone,
  size = "sm",
}: {
  userId: string;
  name: string;
  suspended: boolean;
  onDone: () => void;
  size?: "sm" | "default";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonSheet
        title={`אזהרה ל${name}`}
        description="המשתמש/ת יקבל/תקבל התראה עם הסיבה."
        confirm="שליחת אזהרה"
        presets={REASON_PRESETS}
        trigger={
          <Button size={size} variant="outline">
            <AlertTriangle /> אזהרה
          </Button>
        }
        onConfirm={async (reason) => {
          await moderation.warn(userId, reason);
          toast.success("האזהרה נשלחה");
          onDone();
        }}
      />
      {suspended ? (
        <Button
          size={size}
          variant="success"
          onClick={async () => {
            try {
              await moderation.unsuspend(userId);
              toast.success("הגישה הוחזרה");
              onDone();
            } catch (e) {
              toast.error(moderationError(e));
            }
          }}
        >
          <ShieldCheck /> החזרת גישה
        </Button>
      ) : (
        <ReasonSheet
          title={`השהיית ${name}`}
          description="בזמן ההשהיה אי אפשר לפרסם, לשלוח הודעות או להצטרף. הסיבה ומשך ההשהיה יוצגו למשתמש/ת."
          confirm="השהיה"
          durations
          presets={REASON_PRESETS}
          trigger={
            <Button size={size} variant="destructive">
              <Ban /> השהיה
            </Button>
          }
          onConfirm={async (reason, hours) => {
            await moderation.suspend(userId, hours, reason);
            toast.success("המשתמש/ת הושהה");
            onDone();
          }}
        />
      )}
    </div>
  );
}

/** Shows what a reported item said/looked like when it was reported. */
export function SnapshotPreview({ snapshot }: { snapshot: ReportSnapshot }) {
  const media =
    snapshot.media_url ?? snapshot.video_url ?? snapshot.image_url ?? snapshot.avatar_url ?? snapshot.photos?.[0] ?? null;
  const video = !!media && (snapshot.media_type === "video" || isVideoUrl(media));
  const text = [snapshot.name, snapshot.title, snapshot.caption, snapshot.body, snapshot.bio, snapshot.description]
    .filter((t) => t && t.trim())
    .join(" · ");
  const messages = snapshot.messages_to_reporter ?? [];
  if (!media && !text && !messages.length) return <p className="text-xs text-muted-foreground">אין תצוגה מקדימה</p>;
  return (
    <div className="space-y-2">
    <div className="flex gap-3 rounded-xl bg-muted/60 p-2">
      {media &&
        (video ? (
          <video src={videoFrameSrc(media)} poster={VIDEO_POSTER} muted playsInline preload="metadata" className="size-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <SafeImg src={media} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        ))}
      {text && <p className="line-clamp-4 min-w-0 flex-1 text-sm whitespace-pre-wrap">{text}</p>}
    </div>
      {messages.length > 0 && (
        <div className="rounded-xl border border-border p-2">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">הודעות אחרונות שנשלחו למדווח/ת</p>
          <ul className="space-y-1 text-sm">
            {messages.map((m, i) => (
              <li key={i} className="rounded-lg bg-muted/60 px-2 py-1">
                {m.kind === "text" ? m.body : m.kind === "image" ? "📷 תמונה" : m.kind === "voice" ? "🎤 הקלטה" : m.body || m.kind}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
