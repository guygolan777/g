import * as React from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Hold-free voice recorder: tap to start, tap to stop and send. */
export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (blob: Blob) => void; disabled?: boolean }) {
  const [rec, setRec] = React.useState<MediaRecorder | null>(null);
  const [secs, setSecs] = React.useState(0);
  const chunks = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [rec]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        if (blob.size > 0) onRecorded(blob);
      };
      r.start();
      setSecs(0);
      setRec(r);
    } catch {
      toast.error("אין גישה למיקרופון");
    }
  }

  function stop() {
    rec?.stop();
    setRec(null);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (rec ? stop() : void start())}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full transition",
        rec ? "animate-pulse bg-like text-like-foreground" : "bg-gradient-brand text-brand-foreground",
      )}
      aria-label={rec ? "עצירה ושליחה" : "הקלטת הודעה קולית"}
    >
      {rec ? (
        <span className="flex items-center gap-1 text-xs font-bold">
          <Square className="size-3.5 fill-current" />
          {secs}
        </span>
      ) : (
        <Mic className="size-5" />
      )}
    </button>
  );
}
