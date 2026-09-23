import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/forgot-password")({
  head: () => seo({ title: "שחזור סיסמה", description: "קבלו קישור לאיפוס הסיסמה לחשבון mibale שלכם." }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  return (
    <AuthLayout
      title="שכחת סיסמה?"
      subtitle="נשלח לך קישור לאיפוס"
      footer={
        <Link to="/login" className="font-semibold text-primary">
          חזרה להתחברות
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-2xl bg-success-soft p-5 text-center font-semibold text-success">
          📬 אם האימייל רשום אצלנו — הקישור כבר בדרך.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            setLoading(false);
            if (error) return void toast.error("לא הצלחנו לשלוח, נסו שוב");
            setSent(true);
          }}
        >
          <Field label="אימייל">
            <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
            שליחת קישור
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
