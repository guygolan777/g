import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookUser, ChevronLeft, FileText, Smartphone, LocateFixed, LogOut, Moon, Shield, ShieldBan, Sun, SunMoon, Trash2 } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { deleteMyAccount } from "@/lib/account";
import { PHONE_REQUIRED, formatPhone } from "@/lib/phone";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { getCurrentPosition } from "@/lib/native";
import { reverseGeocodeCity } from "@/lib/geocode";
import { applyTheme, getThemeMode, type ThemeMode } from "@/lib/theme";
import { seo } from "@/lib/seo";
import type { ProfileSettings } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => seo({ title: "הגדרות", description: "התראות, פרטיות, מצב לילה, מיקום וחסימות בחשבון ה-mibale שלך." }),
  component: () => (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  ),
});

function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="font-semibold">{title}</p>
        {text && <p className="text-xs text-muted-foreground">{text}</p>}
      </div>
      {children}
    </div>
  );
}

function Settings() {
  const { user, profile, settings, isStaff, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = React.useState<ThemeMode>("system");
  React.useEffect(() => setTheme(getThemeMode()), []);

  async function setPref(patch: Partial<ProfileSettings>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
    if (error) return void toast.error("השמירה נכשלה");
    await refreshProfile();
  }

  return (
    <Page size="narrow">
      <PageHeader title="הגדרות" back />

      <Section title="תצוגה">
        <div className="flex gap-2">
          {(
            [
              ["light", "בהיר", Sun],
              ["dark", "מצב לילה", Moon],
              ["system", "לפי המכשיר", SunMoon],
            ] as const
          ).map(([m, l, Icon]) => (
            <Chip
              key={m}
              active={theme === m}
              onClick={() => {
                setTheme(m);
                applyTheme(m);
              }}
            >
              <Icon className="size-4" /> {l}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="התראות">
        <div className="divide-y divide-border rounded-2xl bg-surface shadow-soft">
          <Row title="הודעות" text="הודעות חדשות בצ׳אט">
            <Switch checked={settings?.notify_messages ?? true} onCheckedChange={(c) => void setPref({ notify_messages: c })} />
          </Row>
          <Row title="אירועים" text="בקשות, אישורים ותזכורות">
            <Switch checked={settings?.notify_events ?? true} onCheckedChange={(c) => void setPref({ notify_events: c })} />
          </Row>
          <Row title="חברתי" text="עוקבים חדשים ולייקים">
            <Switch checked={settings?.notify_social ?? true} onCheckedChange={(c) => void setPref({ notify_social: c })} />
          </Row>
        </div>
      </Section>

      <Section title="פרטיות">
        <div className="divide-y divide-border rounded-2xl bg-surface shadow-soft">
          <Row title="🔒 פרופיל פרטי" text="מי שלא אישרת יראה רק שם ותמונה ראשית. מעקב אחריך יהיה בבקשה ובאישור שלך">
            <Switch
              checked={!!profile?.is_private}
              aria-label="פרופיל פרטי"
              onCheckedChange={async (c) => {
                const { error } = await supabase.from("profiles").update({ is_private: c }).eq("id", user!.id);
                if (error) return void toast.error("השמירה נכשלה");
                await refreshProfile();
                toast.success(c ? "הפרופיל פרטי עכשיו 🔒" : "הפרופיל ציבורי — בקשות ממתינות אושרו");
              }}
            />
          </Row>
          {(
            [
              ["hide_age", "הסתרת גיל", "הגיל שלך לא יוצג לאף אחד (ההתאמות בהיכרויות עדיין לפי הגיל)"],
              ["hide_city", "הסתרת עיר", "העיר שלך לא תוצג בפרופיל"],
            ] as const
          ).map(([key, title, text]) => (
            <Row key={key} title={title} text={text}>
              <Switch
                checked={!!profile?.[key]}
                aria-label={title}
                onCheckedChange={async (c) => {
                  const { error } = await supabase.from("profiles").update({ [key]: c }).eq("id", user!.id);
                  if (error) return void toast.error("השמירה נכשלה");
                  await refreshProfile();
                }}
              />
            </Row>
          ))}
          <Row title="הצגת סטטוס מחובר/ת" text="אחרים יראו מתי את/ה באונליין">
            <Switch checked={settings?.show_online ?? true} onCheckedChange={(c) => void setPref({ show_online: c })} />
          </Row>
          <Row title="עדכון מיקום" text="למיון ״קרוב אליך״. המיקום המדויק לא מוצג לאף אחד">
            <Button
              size="sm"
              variant="soft"
              onClick={async () => {
                const p = await getCurrentPosition();
                if (!p) return void toast.error("לא הצלחנו לאתר מיקום");
                const { error } = await supabase
                  .from("profile_locations")
                  .upsert({ profile_id: user!.id, lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() });
                if (error) return void toast.error("השמירה נכשלה");
                const name = await reverseGeocodeCity(p.lat, p.lng);
                toast.success(`המיקום עודכן: ${name} 📍`);
              }}
            >
              <LocateFixed /> עדכון
            </Button>
          </Row>
          {PHONE_REQUIRED && (
            <Link to="/onboarding/phone" search={{ next: "/settings" }} className="flex items-center justify-between p-4">
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  <Smartphone className="size-5" /> מספר טלפון
                </span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {user?.phone ? formatPhone(user.phone) : "לא אומת"}
                </span>
              </span>
              <span className="text-sm font-semibold text-primary">{user?.phone ? "שינוי" : "אימות"}</span>
            </Link>
          )}
          <Link to="/contacts" search={{ tab: "phone" }} className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold">
              <BookUser className="size-5" /> אנשי קשר מהטלפון
            </span>
            <ChevronLeft className="size-5 text-muted-foreground" />
          </Link>
          <Link to="/blocked" className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold">
              <ShieldBan className="size-5" /> משתמשים חסומים
            </span>
            <ChevronLeft className="size-5 text-muted-foreground" />
          </Link>
        </div>
      </Section>

      {isStaff && (
        <Section title="ניהול">
          <Link to="/admin" className="flex items-center justify-between rounded-2xl bg-violet-soft p-4 font-semibold text-violet">
            <span className="flex items-center gap-2">
              <Shield className="size-5" /> ניהול המערכת
            </span>
            <ChevronLeft className="size-5" />
          </Link>
        </Section>
      )}

      <Button
        variant="outline"
        size="lg"
        className="mt-8 w-full"
        onClick={async () => {
          await signOut();
          void navigate({ to: "/", replace: true });
        }}
      >
        <LogOut /> התנתקות
      </Button>
      <Section title="מידע">
        <div className="divide-y divide-border rounded-2xl bg-surface shadow-soft">
          <Link to="/privacy" className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold">
              <FileText className="size-5" /> מדיניות פרטיות
            </span>
            <ChevronLeft className="size-5 text-muted-foreground" />
          </Link>
          <Link to="/terms" className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold">
              <FileText className="size-5" /> תנאי שימוש
            </span>
            <ChevronLeft className="size-5 text-muted-foreground" />
          </Link>
        </div>
      </Section>

      <DeleteAccount />
      <p className="mt-6 text-center text-xs text-muted-foreground">mibale · גרסה 0.1</p>
    </Page>
  );
}

const CONFIRM_WORD = "מחיקה";

/** Permanent in-app account deletion (store requirement). Asks to type a word to confirm. */
function DeleteAccount() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="lg" className="mt-3 w-full text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 /> מחיקת החשבון
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <DialogContent title="מחיקת החשבון לצמיתות" description="הפרופיל, התמונות, הסטוריז, ההודעות, האירועים שפתחת וההתאמות יימחקו ולא ניתן יהיה לשחזר אותם.">
          <label htmlFor="confirm-delete" className="text-sm">
            כדי לאשר, הקלידו <b>{CONFIRM_WORD}</b>
          </label>
          <input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-surface-soft px-4 outline-none"
            autoComplete="off"
          />
          <Button
            variant="destructive"
            size="lg"
            className="mt-4 w-full"
            disabled={typed.trim() !== CONFIRM_WORD || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await deleteMyAccount(user!.id);
              setBusy(false);
              if (!ok) return void toast.error("המחיקה נכשלה, נסו שוב");
              toast.success("החשבון נמחק. להתראות 👋");
              void navigate({ to: "/", replace: true });
            }}
          >
            {busy ? "מוחק…" : "מחיקה לצמיתות"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
