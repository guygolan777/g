import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () => seo({ title: "איפוס סיסמה", description: "בחרו סיסמה חדשה לחשבון mibale שלכם." }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  return (
    <AuthLayout title="סיסמה חדשה" subtitle="בחרו סיסמה של 8 תווים לפחות">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return void toast.error("הסיסמה קצרה מדי");
          if (password !== confirm) return void toast.error("הסיסמאות אינן תואמות");
          setLoading(true);
          const { error } = await supabase.auth.updateUser({ password });
          setLoading(false);
          if (error) return void toast.error("הקישור פג תוקף — בקשו קישור חדש");
          toast.success("הסיסמה עודכנה");
          void navigate({ to: "/home", replace: true });
        }}
      >
        <Field label="סיסמה חדשה">
          <Input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="אימות סיסמה">
          <Input type="password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
          שמירה
        </Button>
      </form>
    </AuthLayout>
  );
}
