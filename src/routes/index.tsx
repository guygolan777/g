import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarHeart, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { seo } from "@/lib/seo";
import { consumeRedirect } from "@/lib/guest";
import { GuestStatsRow } from "@/components/guest";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "mibale? - מי בא ל..?",
      description: "האפליקציה החברתית שמחברת אנשים דרך אירועים, קהילות ותחביבים משותפים. מצאו מי בא איתכם.",
    }),
  component: Landing,
});

function Landing() {
  const { ready, user, profile } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (!ready || !user) return;
    if (!profile) return;
    // Guests who signed up from an event/community land back there.
    void navigate({ to: !profile.onboarded ? "/onboarding/profile" : consumeRedirect("/home"), replace: true });
  }, [ready, user, profile, navigate]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-safe pb-10">
      <div className="flex-1 pt-16">
        <p className="font-display text-5xl font-bold text-gradient-brand"><span dir="ltr">mibale?</span></p>
        <h1 className="mt-4 text-3xl leading-tight font-bold">מי בא ל..? <br />כל מה שאתם אוהבים, עם אנשים שאוהבים את זה גם.</h1>
        <div className="mt-8 grid gap-3">
          {[
            { Icon: CalendarHeart, t: "אירועים סביבכם", d: "ריצות, סדנאות, מסיבות וערבי משחקים — לפי התחביבים שלכם.", c: "bg-event-soft text-event" },
            { Icon: Users, t: "קהילות", d: "מצטרפים לקבוצות קבועות ופוגשים את אותם אנשים שוב.", c: "bg-teal-soft text-teal" },
            { Icon: Sparkles, t: "היכרויות", d: "ואם מתחבר — אפשר גם יותר מזה.", c: "bg-like-soft text-like" },
          ].map(({ Icon, t, d, c }) => (
            <div key={t} className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-soft">
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${c}`}>
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-bold">{t}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <GuestStatsRow className="mt-8" />
      <div className="mt-8 grid gap-2">
        <Button asChild variant="brand" size="lg">
          <Link to="/signup">בואו נתחיל</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/login">התחברות</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/home">להציץ כאורח/ת</Link>
        </Button>
      </div>
      <footer className="mt-10 flex justify-center gap-4 text-xs text-muted-foreground">
        <Link to="/terms">תנאי שימוש</Link>
        <Link to="/privacy">פרטיות</Link>
        <Link to="/delete-account">מחיקת חשבון</Link>
      </footer>
    </main>
  );
}
