import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookUser, Lock, MessageCircle, Search, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/app-shell";
import { FollowButton } from "@/components/follow-button";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/constants";
import { contactsSupport, inviteText, readDeviceContacts, syncContacts, type ContactMatch, type DeviceContact } from "@/lib/contacts";
import { formatPhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

/**
 * "From your phone": disclosure → read contacts → hashed match → who's on mibale + invites.
 * Only number hashes leave the device; names stay on the phone.
 */
export function ContactsSync() {
  const qc = useQueryClient();
  const support = contactsSupport();
  const stored = useQuery({ queryKey: ["contacts-count"], queryFn: async () => (await supabase.rpc("my_contacts_count")).data as number });
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ matches: ContactMatch[]; others: DeviceContact[] } | null>(null);
  const [q, setQ] = React.useState("");

  async function run() {
    setBusy(true);
    try {
      const contacts = await readDeviceContacts();
      if (!contacts) return void toast.error("לא קיבלנו גישה לאנשי הקשר");
      if (!contacts.length) return void toast("לא נמצאו מספרי טלפון באנשי הקשר");
      const matches = await syncContacts(contacts);
      const onApp = new Set(matches.map((m) => m.phone));
      setResult({ matches, others: contacts.filter((c) => !onApp.has(c.phone)).sort((a, b) => a.name.localeCompare(b.name, "he")) });
      void qc.invalidateQueries({ queryKey: ["contacts-count"] });
      toast.success(matches.length ? `🎉 ${matches.length} מאנשי הקשר שלך כבר ב-mibale` : "סנכרנו! נודיע לך כשמישהו מהם יצטרף");
    } catch {
      toast.error("הסנכרון נכשל, נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    const { data } = await supabase.rpc("clear_my_contacts");
    setResult(null);
    void qc.invalidateQueries({ queryKey: ["contacts-count"] });
    toast.success(`נמחקו ${data ?? 0} אנשי קשר מסונכרנים`);
  }

  if (!result) {
    return (
      <div className="rounded-3xl bg-surface p-5 shadow-soft">
        <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
          <BookUser className="size-7" />
        </span>
        <h2 className="mt-3 text-xl font-bold">מצאו חברים מאנשי הקשר</h2>
        <p className="mt-2 text-muted-foreground">נראה לך מי מאנשי הקשר שלך כבר ב-mibale, ונודיע לך כשמישהו מהם מצטרף.</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-success" /> נשלחים רק מספרים מוצפנים (hash) — לא שמות ולא מספרים גלויים.
          </li>
          <li className="flex gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-success" /> אף אחד לא רואה את אנשי הקשר שלך, ולא מתקשרים או שולחים הודעות בשמך.
          </li>
          <li className="flex gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-success" /> אפשר למחוק את הסנכרון בכל רגע.{" "}
            <Link to="/privacy" className="underline">
              מדיניות הפרטיות
            </Link>
          </li>
        </ul>
        {support === "none" ? (
          <p className="mt-5 rounded-2xl bg-surface-soft p-3 text-sm">הדפדפן הזה לא מאפשר גישה לאנשי קשר. פתחו את אפליקציית mibale בטלפון (או Chrome באנדרואיד).</p>
        ) : (
          <Button variant="brand" size="lg" className="mt-5 w-full" disabled={busy} onClick={() => void run()}>
            {busy ? "מחפשים…" : support === "picker" ? "בחירת אנשי קשר" : "מאשר/ת — חיפוש חברים"}
          </Button>
        )}
        {!!stored.data && (
          <button type="button" onClick={() => void clear()} className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Trash2 className="size-4" /> מחיקת {stored.data} אנשי קשר מסונכרנים
          </button>
        )}
      </div>
    );
  }

  const term = q.trim();
  const others = result.others.filter((c) => !term || c.name.includes(term) || c.phone.includes(term.replace(/\D/g, "") || "~")).slice(0, 200);
  const invite = inviteText(SITE_URL);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-bold">כבר ב-mibale ({result.matches.length})</h2>
        {result.matches.length === 0 ? (
          <EmptyState emoji="🌱" title="עוד אף אחד" text="הזמינו אותם — נודיע לך כשהם מצטרפים" />
        ) : (
          <div className="space-y-2">
            {result.matches.map((m) => (
              <div key={m.profile_id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                <Link to="/profile/$id" params={{ id: m.profile_id }} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={m.avatar_url} name={m.name} size={48} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{m.name}</span>
                    {m.contactName && m.contactName !== m.name && (
                      <span className="block truncate text-xs text-muted-foreground">שמור/ה אצלך כ״{m.contactName}״</span>
                    )}
                  </span>
                </Link>
                <FollowButton profileId={m.profile_id} className="h-9 px-4" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">הזמנת חברים ({result.others.length})</h2>
        <label className="mb-3 flex h-11 items-center gap-2 rounded-full bg-surface-soft px-4">
          <Search className="size-4 text-muted-foreground" />
          <input id="contact-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש באנשי הקשר" className="h-full w-full bg-transparent outline-none" />
        </label>
        <div className="divide-y divide-border rounded-2xl bg-card shadow-soft">
          {others.map((c) => (
            <div key={c.phone} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block text-xs text-muted-foreground" dir="ltr">
                  {formatPhone(c.phone)}
                </span>
              </span>
              <a
                href={`https://wa.me/${c.phone}?text=${encodeURIComponent(invite)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-success-soft px-3 text-sm font-semibold text-success"
              >
                <MessageCircle className="size-4" /> הזמנה
              </a>
            </div>
          ))}
        </div>
      </section>

      <button type="button" onClick={() => void clear()} className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Trash2 className="size-4" /> מחיקת הסנכרון
      </button>
    </div>
  );
}
