import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/gates";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/me")({
  head: () => seo({ title: "הפרופיל שלי", description: "הפרופיל האישי שלך ב-mibale.", type: "profile" }),
  component: () => (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  ),
});
