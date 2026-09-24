import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { OTP_CHANNELS, formatPhone, isMobile, normalizePhone, type OtpChannel } from "@/lib/phone";
import type { UserAttributes } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const RESEND_SECONDS = 30;

export function phoneErrorMessage(msg: string | undefined): string {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("whatsapp")) return "שליחה בוואטסאפ לא זמינה כרגע — נסו ב-SMS";
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
  const [channel, setChannel] = React.useState<OtpChannel>(OTP_CHANNELS[0]);

  React.useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(digits: string, via: OtpChannel) {
    setBusy(true);
    const { error } =
      mode === "verify"
        ? // GoTrue accepts `channel` on user update too (phone change); the JS type just doesn't list it.
          await supabase.auth.updateUser({ phone: `+${digits}`, channel: via } as UserAttributes)
        : await supabase.auth.signInWithOtp({ phone: `+${digits}`, options: { shouldCreateUser: false, channel: via } });
    setBusy(false);
    if (error) return void toast.error(phoneErrorMessage(error.message));
    setChannel(via);
    setPhone(digits);
    setWait(RESEND_SECONDS);
    toast.success(`שלחנו קוד ${via === "whatsapp" ? "בוואטסאפ" : "ב-SMS"} ל-${formatPhone(digits)}`);
  }

  async function submitPhone(e: React.FormEvent, via: OtpChannel = OTP_CHANNELS[0]) {
    e.preventDefault();
    const digits = normalizePhone(raw);
    if (!digits) return void toast.error("מספר הטלפון לא תקין");
    if (!isMobile(digits)) return void toast.error("צריך מספר נייד כדי לקבל קוד");
    await send(digits, via);
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
          {busy ? "שולחים…" : channelLabel(OTP_CHANNELS[0])}
        </Button>
        {OTP_CHANNELS.slice(1).map((c) => (
          <Button key={c} type="button" variant="ghost" className="w-full" disabled={busy} onClick={(e) => void submitPhone(e, c)}>
            או {channelLabel(c).replace("שליחת קוד ", "")}
          </Button>
        ))}
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        הקלידו את הקוד שנשלח {channel === "whatsapp" ? "בוואטסאפ" : "ב-SMS"} ל-<b dir="ltr">{formatPhone(phone)}</b>
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
        <span className="flex gap-3">
          {OTP_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              className="font-semibold text-primary disabled:text-muted-foreground"
              disabled={wait > 0 || busy}
              onClick={() => void send(phone, c)}
            >
              {wait > 0 && c === channel ? `שליחה חוזרת בעוד ${wait}` : c === channel ? "שליחה חוזרת" : c === "whatsapp" ? "בוואטסאפ" : "ב-SMS"}
            </button>
          ))}
        </span>
      </div>
    </form>
  );
}

function channelLabel(c: OtpChannel): string {
  return c === "whatsapp" ? "שליחת קוד בוואטסאפ" : "שליחת קוד ב-SMS";
}
