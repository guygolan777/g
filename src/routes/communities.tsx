import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/app-shell";
import { CommunitiesBrowser } from "@/components/communities-browser";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/communities")({
  head: () => seo({ title: "קהילות", description: "מצאו קהילות סביב התחביבים שלכם — ריצה, משחקי קופסה, בישול ועוד." }),
  component: () => (
    <Page>
      <PageHeader title="קהילות" back />
      <CommunitiesBrowser />
    </Page>
  ),
});
