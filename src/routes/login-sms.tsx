import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth-form";
import { PhoneVerify } from "@/components/phone-verify";
import { consumeRedirect } from "@/lib/guest";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/login-sms")({
  head: () => seo({ title: "כניסה עם SMS", description: "כניסה ל-mibale עם קוד שנשלח לנייד." }),
  component: LoginSms,
});

function LoginSms() {
  const navigate = useNavigate();
  return (
    <AuthLayout
      title="כניסה עם קוד SMS"
      subtitle="נשלח קוד חד-פעמי לנייד שמחובר לחשבון שלך"
      footer={
        <Link to="/login" className="font-semibold text-primary">
          כניסה עם אימייל וסיסמה
        </Link>
      }
    >
      <PhoneVerify mode="login" submitLabel="כניסה" onDone={() => void navigate({ to: consumeRedirect("/home"), replace: true })} />
    </AuthLayout>
  );
}
