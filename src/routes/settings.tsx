import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronLeft, LocateFixed, LogOut, Moon, Shield, ShieldBan, Sun, SunMoon } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { getCurrentPosition } from "@/lib/native";
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
  const { user, settings, isStaff, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = React.useState<ThemeMode>("system");
  React.useEffect(() => setTheme(getThemeMode()), []);

  async function setPref(patch: Partial<ProfileSettings>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
    if (error) return void toast.error("השמירה נכשלה");
    await refreshProfile();
  }

  return (
    <Page>
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
                toast.success("המיקום עודכן 📍");
              }}
            >
              <LocateFixed /> עדכון
            </Button>
          </Row>
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
      <p className="mt-6 text-center text-xs text-muted-foreground">mibale · גרסה 0.1</p>
    </Page>
  );
}
