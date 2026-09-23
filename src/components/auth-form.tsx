import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
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

export function GoogleButton() {
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
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/` },
        });
        if (error) {
          toast.error("ההתחברות עם Google נכשלה");
          setLoading(false);
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.8 12 2.8 6.93 2.8 2.83 6.9 2.83 12s4.1 9.2 9.17 9.2c5.3 0 8.8-3.72 8.8-8.96 0-.6-.07-1.06-.15-1.54z" />
      </svg>
      המשך עם Google
    </Button>
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
