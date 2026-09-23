import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { PersonRow } from "@/components/person-row";
import { useProfileGraph } from "@/components/profile-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { seo } from "@/lib/seo";
import type { Profile } from "@/lib/types";

export const Route = createFileRoute("/contacts")({
  head: () => seo({ title: "אנשי קשר", description: "העוקבים שלך והאנשים שאת/ה עוקב/ת אחריהם ב-mibale." }),
  component: () => (
    <RequireAuth>
      <Contacts />
    </RequireAuth>
  ),
});

function Contacts() {
  const { user } = useAuth();
  const { followers, following } = useProfileGraph(user!.id);
  const all = React.useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of [...following, ...followers]) m.set(p.id, p);
    return [...m.values()];
  }, [followers, following]);
  const followingIds = new Set(following.map((p) => p.id));
  const followerIds = new Set(followers.map((p) => p.id));
  const note = (p: Profile) =>
    followingIds.has(p.id) && followerIds.has(p.id) ? "עוקבים הדדית" : followingIds.has(p.id) ? "במעקב" : "עוקב/ת אחריך";

  const list = (items: Profile[]) =>
    items.length === 0 ? (
      <EmptyState emoji="👥" title="עוד אין כאן אף אחד" />
    ) : (
      <div className="space-y-2">
        {items.map((p) => (
          <PersonRow key={p.id} person={p} note={note(p)} />
        ))}
      </div>
    );

  return (
    <Page>
      <PageHeader title="אנשי קשר" back />
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">הכל ({all.length})</TabsTrigger>
          <TabsTrigger value="followers">עוקבים ({followers.length})</TabsTrigger>
          <TabsTrigger value="following">נעקבים ({following.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{list(all)}</TabsContent>
        <TabsContent value="followers">{list(followers)}</TabsContent>
        <TabsContent value="following">{list(following)}</TabsContent>
      </Tabs>
    </Page>
  );
}
