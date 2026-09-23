import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { CommunityForm } from "@/components/community-form";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/community/new")({
  head: () => seo({ title: "פתיחת קהילה", description: "פתחו קהילה ב-mibale סביב תחביב: קהל יעד, טווח גילאים ואישור חברים." }),
  component: () => (
    <RequireAuth reason="כדי לפתוח קהילה צריך חשבון mibale.">
      <Page>
        <PageHeader title="פתיחת קהילה חדשה" subtitle="בחרו תחביב ותנו לאנשים מקום להכיר ולעשות אותו יחד." back />
        <CommunityForm />
      </Page>
    </RequireAuth>
  ),
});
