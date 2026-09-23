import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout, Divider, SocialButtons, authErrorMessage } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/signup")({
  head: () => seo({ title: "הרשמה", description: "הצטרפו ל-mibale בחינם ומצאו אנשים, אירועים וקהילות סביב מה שאתם אוהבים." }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return void toast.error("הסיסמה צריכה להכיל לפחות 8 תווים");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/onboarding/profile` },
    });
    setLoading(false);
    if (error) return void toast.error(authErrorMessage(error.message));
    if (!data.session) {
      toast.success("שלחנו לך מייל לאישור החשבון 📬");
      return void navigate({ to: "/login" });
    }
    void navigate({ to: "/onboarding/profile", replace: true });
  }

  return (
    <AuthLayout
      title="יוצרים חשבון ✨"
      subtitle="עוד רגע אתם בפנים"
      footer={
        <>
          כבר רשומים?{" "}
          <Link to="/login" className="font-semibold text-primary">
            התחברות
          </Link>
        </>
      }
    >
      <SocialButtons />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="שם">
          <Input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="אימייל">
          <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="סיסמה" hint="לפחות 8 תווים">
          <Input type="password" dir="ltr" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
          {loading ? "יוצרים חשבון…" : "הרשמה"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          בהרשמה את/ה מאשר/ת שמלאו לך 18 ואת{" "}
          <Link to="/terms" className="underline">
            תנאי השימוש
          </Link>{" "}
          ו
          <Link to="/privacy" className="underline">
            מדיניות הפרטיות
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
