import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout, SocialButtons, authErrorMessage } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/login")({
  head: () => seo({ title: "התחברות", description: "התחברו ל-mibale כדי לראות מי בא לאירועים שלכם." }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return void toast.error(authErrorMessage(error.message));
    void navigate({ to: "/", replace: true });
  }

  return (
    <AuthLayout
      title="ברוכים השבים 👋"
      subtitle="התחברו כדי להמשיך"
      footer={
        <>
          אין לכם חשבון?{" "}
          <Link to="/signup" className="font-semibold text-primary">
            הרשמה
          </Link>
        </>
      }
    >
      <SocialButtons />
      <form onSubmit={submit} className="space-y-4">
        <Field label="אימייל">
          <Input type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="סיסמה">
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Link to="/forgot-password" className="block text-sm font-semibold text-primary">
          שכחתי סיסמה
        </Link>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
          {loading ? "מתחברים…" : "התחברות"}
        </Button>
      </form>
    </AuthLayout>
  );
}
