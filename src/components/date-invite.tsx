import * as React from "react";
import { toast } from "sonner";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { formatDate, formatTime } from "@/lib/format";
import { hapticTap } from "@/lib/native";
import type { DateInvite } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "הזמנה לדייט" — what, where, date, time and a personal note. */
export function DateInviteDialog({
  open,
  onOpenChange,
  senderId,
  recipientId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  senderId: string;
  recipientId: string;
  onSent: () => void;
}) {
  const now = new Date();
  const [title, setTitle] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [date, setDate] = React.useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = React.useState(`${pad((now.getHours() + 1) % 24)}:00`);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("date_invites").insert({
      sender_id: senderId,
      recipient_id: recipientId,
      title: title.trim(),
      location: location.trim() || null,
      starts_at: new Date(`${date}T${time}`).toISOString(),
      note: note.trim(),
    });
    setBusy(false);
    if (error) return void toast.error("ההזמנה לא נשלחה");
    void hapticTap("success");
    toast.success("ההזמנה נשלחה 💌");
    setTitle("");
    setLocation("");
    setNote("");
    onOpenChange(false);
    onSent();
  }

  const field = "rounded-full border-0 bg-surface-soft";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="הזמנה לדייט">
        <div className="space-y-3">
          <Input className={field} placeholder="למשל: קפה בערב" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <Input className={field} placeholder="מיקום" value={location} onChange={(e) => setLocation(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input className={field} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <Textarea className="rounded-3xl border-0 bg-surface-soft" placeholder="הערה אישית (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="like" size="lg" className="w-full" disabled={!title.trim() || busy} onClick={() => void send()}>
            שליחת הזמנה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS: Record<DateInvite["status"], string> = {
  pending: "ממתינים לאישור הצד השני",
  approved: "✅ הדייט אושר!",
  declined: "הפעם זה לא הסתדר",
};

/** Pink invite card inside the chat; the recipient can accept or decline. */
export function DateInviteCard({ invite, viewerId, onAnswered }: { invite: DateInvite; viewerId: string; onAnswered: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const isRecipient = invite.recipient_id === viewerId;
  async function answer(status: "approved" | "declined") {
    setBusy(true);
    const { error } = await supabase.from("date_invites").update({ status }).eq("id", invite.id);
    setBusy(false);
    if (error) return void toast.error("הפעולה נכשלה");
    if (status === "approved") void hapticTap("success");
    onAnswered();
  }
  return (
    <div className="w-[85%] space-y-2 rounded-3xl border border-like/30 bg-like-soft p-4">
      <p className="text-lg font-bold">{invite.title}</p>
      {invite.location && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" /> {invite.location}
        </p>
      )}
      <p className="flex items-center gap-3 text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-4" /> {formatDate(invite.starts_at, { day: "numeric", month: "numeric", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" /> {formatTime(invite.starts_at)}
        </span>
      </p>
      {invite.note && <p>{invite.note}</p>}
      {isRecipient && invite.status === "pending" ? (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="like" disabled={busy} onClick={() => void answer("approved")}>
            אישור
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer("declined")}>
            לא הפעם
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{STATUS[invite.status]}</p>
      )}
    </div>
  );
}
