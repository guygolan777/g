import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { formatPhone, isMobile, normalizePhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

const RESEND_SECONDS = 30;

export function phoneErrorMessage(msg: string | undefined): string {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("already") || m.includes("exists") || m.includes("registered")) return "המספר כבר רשום בחשבון אחר";
  if (m.includes("provider") || (m.includes("sms") && m.includes("disabled")) || m.includes("unsupported")) return "שליחת SMS עדיין לא מופעלת במערכת";
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) return "הקוד שגוי או שפג תוקפו";
  if (m.includes("rate") || m.includes("too many") || m.includes("seconds")) return "יותר מדי ניסיונות — נסו שוב בעוד דקה";
  if (m.includes("not found") || m.includes("signups not allowed")) return "לא מצאנו חשבון עם המספר הזה";
  return "משהו השתבש, נסו שוב";
}

/**
 * Two steps: phone number → 6-digit SMS code.
 * mode "verify": attach a phone to the signed-in account (Supabase phone_change).
 * mode "login": sign in with an existing account's phone (Supabase sms OTP, no new accounts).
 */
export function PhoneVerify({ mode, onDone, submitLabel }: { mode: "verify" | "login"; onDone: () => void; submitLabel?: string }) {
  const [raw, setRaw] = React.useState("");
  const [phone, setPhone] = React.useState<string | null>(null); // normalized digits once the code was sent
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [wait, setWait] = React.useState(0);

  React.useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(digits: string) {
    setBusy(true);
    const { error } =
      mode === "verify"
        ? await supabase.auth.updateUser({ phone: `+${digits}` })
        : await supabase.auth.signInWithOtp({ phone: `+${digits}`, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) return void toast.error(phoneErrorMessage(error.message));
    setPhone(digits);
    setWait(RESEND_SECONDS);
    toast.success(`שלחנו קוד ל-${formatPhone(digits)}`);
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    const digits = normalizePhone(raw);
    if (!digits) return void toast.error("מספר הטלפון לא תקין");
    if (!isMobile(digits)) return void toast.error("צריך מספר נייד כדי לקבל SMS");
    await send(digits);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.trim().length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token: code.trim(), type: mode === "verify" ? "phone_change" : "sms" });
    if (!error) await supabase.auth.refreshSession();
    setBusy(false);
    if (error) return void toast.error(phoneErrorMessage(error.message));
    toast.success(mode === "verify" ? "המספר אומת ✅" : "ברוכים השבים 👋");
    onDone();
  }

  if (!phone) {
    return (
      <form onSubmit={submitPhone} className="space-y-4">
        <Field label="מספר נייד">
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="050-123-4567"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>
          {busy ? "שולחים…" : "שליחת קוד ב-SMS"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        הקלידו את הקוד שנשלח ל-<b dir="ltr">{formatPhone(phone)}</b>
      </p>
      <Field label="קוד אימות">
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={6}
          className="text-center text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          required
        />
      </Field>
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy || code.length < 6}>
        {busy ? "מאמתים…" : (submitLabel ?? "אימות")}
      </Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="text-muted-foreground" onClick={() => (setPhone(null), setCode(""))}>
          שינוי מספר
        </button>
        <button type="button" className="font-semibold text-primary disabled:text-muted-foreground" disabled={wait > 0 || busy} onClick={() => void send(phone)}>
          {wait > 0 ? `שליחה חוזרת בעוד ${wait}` : "שליחת קוד חדש"}
        </button>
      </div>
    </form>
  );
}
