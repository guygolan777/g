import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signInWithProvider } from "@/lib/native";
import { toast } from "sonner";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-10">
      <Link to="/" className="mt-10 font-display text-3xl font-bold text-gradient-brand">
        mibale
      </Link>
      <h1 className="mt-8 text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      <div className="mt-6 flex-1">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}

const GOOGLE_ICON = (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
    <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.8 12 2.8 6.93 2.8 2.83 6.9 2.83 12s4.1 9.2 9.17 9.2c5.3 0 8.8-3.72 8.8-8.96 0-.6-.07-1.06-.15-1.54z" />
  </svg>
);

const APPLE_ICON = (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
    <path fill="currentColor" d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.17-1.54 2.66-.39 6.6 1.1 8.76.74 1.06 1.61 2.25 2.75 2.2 1.11-.04 1.52-.71 2.86-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.03-.01-2.3-.88-2.33-3.49zM14.2 6.13c.6-.74 1.02-1.76.91-2.78-.87.04-1.94.59-2.56 1.32-.56.64-1.05 1.69-.92 2.68.98.08 1.97-.49 2.57-1.22z" />
  </svg>
);

function ProviderButton({ provider, label, icon }: { provider: "google" | "apple"; label: string; icon: React.ReactNode }) {
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const error = await signInWithProvider(provider);
        if (error) toast.error(`ההתחברות עם ${provider === "google" ? "Google" : "Apple"} נכשלה`);
        // Native: the browser opens and control returns via the auth callback.
        setTimeout(() => setLoading(false), error ? 0 : 4000);
      }}
    >
      {icon}
      {label}
    </Button>
  );
}

/** Providers enabled in Supabase, e.g. VITE_AUTH_PROVIDERS="google,apple". Unset → email only. */
const ENABLED_PROVIDERS = new Set(
  ((import.meta.env.VITE_AUTH_PROVIDERS as string | undefined) ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean),
);

/** Google + Sign in with Apple (the App Store requires Apple whenever another social login is offered). */
export function SocialButtons() {
  if (ENABLED_PROVIDERS.size === 0) return null;
  return (
    <>
      <div className="grid gap-3">
        {ENABLED_PROVIDERS.has("apple") && <ProviderButton provider="apple" label="המשך עם Apple" icon={APPLE_ICON} />}
        {ENABLED_PROVIDERS.has("google") && <ProviderButton provider="google" label="המשך עם Google" icon={GOOGLE_ICON} />}
      </div>
      <Divider />
    </>
  );
}

export function Divider({ label = "או" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function authErrorMessage(msg: string | undefined): string {
  if (!msg) return "משהו השתבש, נסו שוב";
  if (msg.includes("Invalid login")) return "אימייל או סיסמה שגויים";
  if (msg.includes("already registered")) return "האימייל כבר רשום — נסו להתחבר";
  if (msg.includes("Password should")) return "הסיסמה צריכה להכיל לפחות 8 תווים";
  if (msg.includes("Email not confirmed")) return "יש לאשר את האימייל לפני התחברות";
  return msg;
}
