import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PHONE_REQUIRED } from "@/lib/phone";
import { CONTACT_EMAIL } from "@/lib/constants";
import { Lock, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CenteredSpinner, Page } from "@/components/app-shell";

/** Blocks guests from members-only screens and sends them to sign up. */
export function RequireAuth({ children, reason }: { children: React.ReactNode; reason?: string }) {
  const { ready, user } = useAuth();
  if (!ready) return <CenteredSpinner />;
  if (!user) return <GuestWall reason={reason} />;
  return <>{children}</>;
}

export function GuestWall({ reason }: { reason?: string }) {
  return (
    <Page>
      <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <div className="grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
          <Lock className="size-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">זה רק לחברי mibale</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">{reason ?? "הירשמו בחינם כדי להמשיך — זה לוקח פחות מדקה."}</p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <Button asChild variant="brand" size="lg">
            <Link to="/signup">הרשמה</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/login">כבר יש לי חשבון</Link>
          </Button>
        </div>
      </div>
    </Page>
  );
}

/** Root-level gate: suspended accounts see only this screen. */
export function BannedGate({ children }: { children: React.ReactNode }) {
  const { isBanned, moderation, signOut } = useAuth();
  if (!isBanned) return <>{children}</>;
  const until = moderation?.banned_until ? new Date(moderation.banned_until) : null;
  return (
    <Page withNav={false}>
      <div className="flex min-h-dvh flex-col items-center justify-center text-center">
        <div className="grid size-16 place-items-center rounded-full bg-destructive-soft text-destructive">
          <ShieldOff className="size-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">הגישה לחשבון הושהתה</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">החשבון שלך הושהה בעקבות הפרה של כללי הקהילה.</p>
        {moderation?.ban_reason && <p className="mt-3 max-w-xs rounded-xl bg-muted px-4 py-2 text-sm">סיבה: {moderation.ban_reason}</p>}
        <p className="mt-3 text-sm font-semibold">
          {until
            ? `ההשהיה תסתיים ב-${until.toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })}`
            : moderation
              ? "ההשהיה לצמיתות"
              : ""}
        </p>
        <p className="mt-3 max-w-xs text-xs text-muted-foreground">
          חושבים שזו טעות? אפשר לערער במייל:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary" dir="ltr">
            {CONTACT_EMAIL}
          </a>
        </p>
        <Button className="mt-6" variant="outline" onClick={() => void signOut()}>
          התנתקות
        </Button>
      </div>
    </Page>
  );
}

/** Staff-only guard for /admin. */
export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { ready, user, settings, isStaff } = useAuth();
  if (!ready || (user && !settings)) return <CenteredSpinner />;
  if (!user) return <GuestWall />;
  if (!isStaff) {
    return (
      <Page>
        <div className="grid min-h-[60dvh] place-items-center text-center">
          <div>
            <p className="text-xl font-bold">אין לך הרשאה לדף הזה</p>
            <Button asChild className="mt-4" variant="soft">
              <Link to="/home">חזרה לבית</Link>
            </Button>
          </div>
        </div>
      </Page>
    );
  }
  return <>{children}</>;
}

/** Screens reachable without a verified phone (auth, legal, settings for logout/delete). */
const PHONE_EXEMPT = ["/onboarding/phone", "/login", "/login-sms", "/signup", "/forgot-password", "/reset-password", "/privacy", "/terms", "/delete-account", "/settings", "/"];

/** When phone verification is required, signed-in users without a verified number are sent to add one. */
export function PhoneGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const needs = PHONE_REQUIRED && ready && !!user && !user.phone_confirmed_at && !PHONE_EXEMPT.includes(path);
  React.useEffect(() => {
    if (needs) void navigate({ to: "/onboarding/phone", search: { next: path }, replace: true });
  }, [needs, navigate, path]);
  if (needs) return <CenteredSpinner />;
  return <>{children}</>;
}
