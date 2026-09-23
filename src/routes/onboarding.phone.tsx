import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth-form";
import { RequireAuth } from "@/components/gates";
import { PhoneVerify } from "@/components/phone-verify";
import { useAuth } from "@/hooks/use-auth";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/onboarding/phone")({
  head: () => seo({ title: "אימות מספר טלפון", description: "אימות מספר נייד לחשבון mibale." }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  component: () => (
    <RequireAuth>
      <PhoneStep />
    </RequireAuth>
  ),
});

function PhoneStep() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  return (
    <AuthLayout
      title="מה המספר שלך? 📱"
      subtitle="ככה חברים מאנשי הקשר ימצאו אותך, ונשמור על קהילה של אנשים אמיתיים. המספר לא מוצג לאף אחד."
      footer={
        <button type="button" className="text-muted-foreground underline" onClick={() => void signOut()}>
          התנתקות
        </button>
      }
    >
      <PhoneVerify
        mode="verify"
        submitLabel="אימות והמשך"
        onDone={async () => {
          await refreshProfile();
          void navigate({ to: next ?? (profile?.onboarded ? "/home" : "/onboarding/profile"), replace: true });
        }}
      />
    </AuthLayout>
  );
}
