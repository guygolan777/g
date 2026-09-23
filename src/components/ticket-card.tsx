import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import { Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { whoComesTitle } from "@/lib/event-title";
import { formatDate, formatTime } from "@/lib/format";
import type { EventRow } from "@/lib/types";

export function ticketPayload(eventId: string, code: string) {
  return `mibale:ticket:${eventId}:${code}`;
}

/** Deterministic 1-D barcode drawn from the ticket code. */
function Barcode({ code }: { code: string }) {
  const bars = React.useMemo(() => {
    const out: number[] = [];
    for (const ch of code) {
      const n = parseInt(ch, 16);
      out.push((n % 3) + 1, ((n >> 2) % 2) + 1);
    }
    return out;
  }, [code]);
  return (
    <div className="flex h-14 items-stretch justify-center gap-[2px]" dir="ltr" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className={i % 2 === 0 ? "bg-foreground" : "bg-transparent"} style={{ width: w * 2 }} />
      ))}
    </div>
  );
}

export function TicketCard({ event, code, holder }: { event: EventRow; code: string; holder: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [qrOpen, setQrOpen] = React.useState(false);

  async function download() {
    if (!ref.current) return;
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `mibale-ticket-${event.id.slice(0, 8)}.png`;
      a.click();
    } catch {
      toast.error("לא הצלחנו לשמור את התמונה");
    }
  }

  const details: Array<[string, string]> = [
    ["שם", holder],
    ["תאריך", formatDate(event.starts_at, { weekday: "short", day: "numeric", month: "short" })],
    ["שעה", formatTime(event.starts_at)],
    ["מיקום", event.is_online ? "אונליין" : (event.location_name ?? event.city ?? "—")],
  ];

  return (
    <div>
      <div ref={ref} className="rounded-[1.75rem] bg-gradient-brand p-[3px] shadow-lift">
        <div className="overflow-hidden rounded-[1.6rem] bg-card">
          <div className="relative aspect-[16/9] bg-muted">
            {event.image_url && <SafeImg src={event.image_url} alt="" crossOrigin="anonymous" className="size-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-scrim" />
            <p className="absolute right-4 bottom-3 left-4 text-lg leading-tight font-bold text-scrim-foreground">{whoComesTitle(event.title)}</p>
          </div>
          <div className="grid grid-cols-2">
            {details.map(([k, v], i) => (
              <div
                key={k}
                className={`p-4 ${i % 2 === 0 ? "border-l border-dashed border-border" : ""} ${i < 2 ? "border-b border-dashed border-border" : ""}`}
              >
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="truncate font-bold">{v}</p>
              </div>
            ))}
          </div>
          <div className="relative border-t-2 border-dashed border-border px-6 pt-4 pb-5">
            <span className="absolute -top-3 -right-3 size-6 rounded-full bg-background" />
            <span className="absolute -top-3 -left-3 size-6 rounded-full bg-background" />
            <Barcode code={code} />
            <p className="mt-1 text-center font-mono text-xs tracking-widest text-muted-foreground" dir="ltr">
              {code.toUpperCase().match(/.{1,4}/g)?.join(" ")}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => void download()}>
          <Download /> Download Image
        </Button>
        <Button variant="brand" onClick={() => setQrOpen(true)}>
          <QrCode /> Show QR Code
        </Button>
      </div>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent title="הציגו למארגן/ת בכניסה">
          <div className="grid place-items-center rounded-2xl bg-surface p-4">
            <QRCodeSVG value={ticketPayload(event.id, code)} size={240} level="M" className="h-auto w-full max-w-60" />
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">{whoComesTitle(event.title)}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
