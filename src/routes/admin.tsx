import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireStaff } from "@/components/gates";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => seo({ title: "ניהול המערכת", description: "פאנל ניהול mibale: משתמשים, אירועים, קהילות ודיווחים." }),
  component: () => (
    <RequireStaff>
      <AdminLayout />
    </RequireStaff>
  ),
});

const TABS = [
  { to: "/admin", label: "סקירה" },
  { to: "/admin/users", label: "משתמשים" },
  { to: "/admin/events", label: "אירועים" },
  { to: "/admin/communities", label: "קהילות" },
  { to: "/admin/reports", label: "דיווחים" },
] as const;

function AdminLayout() {
  const { pathname } = useLocation();
  const active = (to: string) => (to === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(to));
  return (
    <Page withNav={false}>
      <PageHeader title="ניהול המערכת" back />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold",
              active(t.to) ? "bg-primary text-primary-foreground" : "bg-surface shadow-soft",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </Page>
  );
}
