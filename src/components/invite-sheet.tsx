import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookUser, Lock, MessageCircle, Search, UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useProfileGraph } from "@/components/profile-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { contactsSupport, readDeviceContacts, syncContacts, type DeviceContact } from "@/lib/contacts";
import { whoComesTitle } from "@/lib/event-title";
import { formatEventWhen } from "@/lib/format";
import { eventShareUrl } from "@/lib/native";
import { formatPhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

type InvitePerson = { id: string; name: string; avatar_url: string | null; note?: string };
type SheetEvent = { id: string; title: string; starts_at: string };

/**
 * Invite friends to an event: people I follow / who follow me, and phone contacts —
 * those on mibale get an in-app invite (event_invites + notification), the rest a WhatsApp message.
 * Uncontrolled (with its own "הזמנת חברים" button) unless `open`/`onOpenChange` are passed.
 */
export function InviteSheet({
  event,
  participantIds,
  open: openProp,
  onOpenChange,
}: {
  event: SheetEvent;
  participantIds: Set<string>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [openState, setOpenState] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOpenState(v));

  const { followers, following } = useProfileGraph(user!.id);
  const invited = useQuery({
    queryKey: ["event-invites", event.id, user?.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("event_invites").select("invitee_id").eq("event_id", event.id).eq("inviter_id", user!.id);
      return new Set((data ?? []).map((r) => r.invitee_id as string));
    },
  });
  const graph = React.useMemo(() => {
    const m = new Map<string, InvitePerson>();
    for (const p of [...following, ...followers]) if (!participantIds.has(p.id) && p.id !== user?.id) m.set(p.id, p);
    return [...m.values()];
  }, [followers, following, participantIds, user?.id]);

  const [phone, setPhone] = React.useState<{ onApp: InvitePerson[]; others: DeviceContact[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const support = contactsSupport();

  async function loadContacts() {
    setBusy(true);
    try {
      const contacts = await readDeviceContacts();
      if (!contacts) return void toast.error("לא קיבלנו גישה לאנשי הקשר");
      const matches = await syncContacts(contacts);
      const onAppPhones = new Set(matches.map((m) => m.phone));
      const inGraph = new Set(graph.map((p) => p.id));
      setPhone({
        onApp: matches
          .filter((m) => !inGraph.has(m.profile_id) && !participantIds.has(m.profile_id) && m.profile_id !== user?.id)
          .map((m) => ({ id: m.profile_id, name: m.name, avatar_url: m.avatar_url, note: m.contactName && m.contactName !== m.name ? m.contactName : undefined })),
        others: contacts.filter((c) => !onAppPhones.has(c.phone)).sort((a, b) => a.name.localeCompare(b.name, "he")),
      });
    } catch {
      toast.error("לא הצלחנו לקרוא את אנשי הקשר, נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  async function invite(p: InvitePerson) {
    const { error } = await supabase.from("event_invites").insert({ event_id: event.id, inviter_id: user!.id, invitee_id: p.id });
    if (error && error.code !== "23505") return void toast.error("ההזמנה נכשלה");
    void invited.refetch();
  }

  const waText = `${whoComesTitle(event.title)} · ${formatEventWhen(event.starts_at)}\n${eventShareUrl(event.id)}`;
  const term = q.trim();
  const others = (phone?.others ?? []).filter((c) => !term || c.name.includes(term) || c.phone.includes(term.replace(/\D/g, "") || "~")).slice(0, 200);
  const row = (p: InvitePerson) => {
    const done = invited.data?.has(p.id);
    return (
      <div key={p.id} className="flex items-center gap-3">
        <Avatar src={p.avatar_url} name={p.name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          {p.note && <span className="block truncate text-xs text-muted-foreground">שמור/ה אצלך כ״{p.note}״</span>}
        </span>
        <Button size="sm" variant={done ? "success" : "default"} disabled={done} onClick={() => void invite(p)}>
          {done ? "הוזמן/ה" : "הזמנה"}
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <UserPlus /> הזמנת חברים
          </Button>
        </DialogTrigger>
      )}
      <SheetContent title="הזמנת חברים" description="מי שב-mibale יקבל התראה עם קישור לאירוע; לשאר נשלח הודעה בוואטסאפ">
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 font-bold">עוקבים ואנשים שאני עוקב/ת אחריהם</h3>
            {graph.length === 0 ? <p className="text-sm text-muted-foreground">אין עדיין — או שכולם כבר רשומים</p> : <div className="space-y-2">{graph.map(row)}</div>}
          </section>

          <section>
            <h3 className="mb-2 font-bold">מאנשי הקשר בטלפון</h3>
            {!phone ? (
              support === "none" ? (
                <p className="rounded-2xl bg-surface-soft p-3 text-sm">הדפדפן הזה לא מאפשר גישה לאנשי קשר. פתחו את אפליקציית mibale בטלפון (או Chrome באנדרואיד).</p>
              ) : (
                <>
                  <Button variant="outline" className="w-full" disabled={busy} onClick={() => void loadContacts()}>
                    <BookUser /> {busy ? "מחפשים…" : "הזמנה מאנשי הקשר"}
                  </Button>
                  <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
                    <Lock className="mt-0.5 size-3.5 shrink-0 text-success" /> נשלחים רק מספרים מוצפנים (hash) כדי למצוא מי כבר ב-mibale — לא שמות.
                  </p>
                </>
              )
            ) : (
              <div className="space-y-4">
                {phone.onApp.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">כבר ב-mibale ({phone.onApp.length})</p>
                    <div className="space-y-2">{phone.onApp.map(row)}</div>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">עוד לא ב-mibale ({phone.others.length})</p>
                  <label className="mb-2 flex h-10 items-center gap-2 rounded-full bg-surface-soft px-4">
                    <Search className="size-4 text-muted-foreground" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש באנשי הקשר" className="h-full w-full min-w-0 bg-transparent outline-none" />
                  </label>
                  <div className="divide-y divide-border">
                    {others.map((c) => (
                      <div key={c.phone} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.name}</span>
                          <span className="block text-xs text-muted-foreground" dir="ltr">
                            {formatPhone(c.phone)}
                          </span>
                        </span>
                        <a
                          href={`https://wa.me/${c.phone}?text=${encodeURIComponent(waText)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-success-soft px-3 text-sm font-semibold text-success"
                        >
                          <MessageCircle className="size-4" /> הזמנה
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Dialog>
  );
}
