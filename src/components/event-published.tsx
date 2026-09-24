import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Mail, Share2, Sparkles, X } from "lucide-react";
import { InviteSheet } from "@/components/invite-sheet";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { eventShareUrl, whatsappShareUrl } from "@/lib/native";

const pill = "flex h-14 w-full items-center justify-center gap-2 rounded-full border-2 text-lg font-bold transition active:scale-[0.98]";

/** Shown right after publishing an event: invite friends, share on WhatsApp, (promote — soon). */
export function EventPublishedDialog({
  event,
  onDone,
}: {
  event: { id: string; title: string; starts_at: string } | null;
  onDone: () => void;
}) {
  const [inviting, setInviting] = React.useState(false);
  if (!event) return null;
  const share = whatsappShareUrl(`${whoComesTitle(event.title)} · ${formatEventWhen(event.starts_at)}`, eventShareUrl(event.id));

  return (
    <>
      <DialogPrimitive.Root open={!inviting} onOpenChange={(o) => !o && onDone()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            dir="rtl"
            className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-popover p-6 pt-8 text-center text-popover-foreground shadow-lift data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
          >
            <DialogPrimitive.Close className="absolute top-4 left-4 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="סגירה">
              <X className="size-5" />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="text-2xl font-bold">האירוע פורסם בהצלחה!</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-3 text-lg">מומלץ להזמין חברים ולשתף</DialogPrimitive.Description>
            <div className="mt-6 space-y-3">
              <button type="button" onClick={() => setInviting(true)} className={`${pill} border-amber-400 text-amber-500`}>
                <Mail className="size-6" /> הזמנת חברים
              </button>
              <a href={share} target="_blank" rel="noreferrer" className={`${pill} border-success text-success`}>
                <Share2 className="size-6" /> שיתוף
              </a>
              <button type="button" disabled className={`${pill} relative border-sky-300 text-sky-400 disabled:cursor-not-allowed`}>
                <Sparkles className="size-6" /> קידום
                <span className="absolute -top-2 left-5 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-200">בקרוב</span>
              </button>
            </div>
            <button type="button" onClick={onDone} className="mt-4 text-lg font-semibold text-muted-foreground">
              לא תודה
            </button>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <InviteSheet event={event} participantIds={new Set()} open={inviting} onOpenChange={setInviting} />
    </>
  );
}
