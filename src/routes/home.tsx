import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, CalendarDays, Search } from "lucide-react";
import { Page } from "@/components/app-shell";
import { StoryRail } from "@/components/story-rail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventsFeed } from "@/components/events-feed";
import { CommunitiesBrowser } from "@/components/communities-browser";
import { PeopleTab } from "@/components/people-tab";
import { PendingReminder } from "@/components/pending-reminder";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCounts } from "@/lib/queries";
import { seo } from "@/lib/seo";
import { LocationButton } from "@/components/location-button";

type HomeSearch = { tab?: "events" | "communities" | "people" };

export const Route = createFileRoute("/home")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    tab: s.tab === "communities" || s.tab === "people" ? s.tab : undefined,
  }),
  head: () => seo({ title: "בית", description: "אירועים מומלצים בשבילך, קהילות ואנשים עם תחביבים דומים — הכל במקום אחד." }),
  component: Home,
});

function Home() {
  const { user, isGuest } = useAuth();
  const unread = useUnreadCounts();
  const { tab = "events" } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Page>
      <header className="flex items-center justify-between py-3">
        <p className="font-display text-4xl font-extrabold text-gradient-brand lg:invisible"><span dir="ltr">mibale?</span></p>
        <div className="flex items-center gap-2">
          {!isGuest && <LocationButton />}
          {!isGuest && (
            <Link to="/calendar" className="grid size-12 place-items-center rounded-full bg-surface-soft" aria-label="יומן">
              <CalendarDays className="size-5" />
            </Link>
          )}
          <Link to="/search" className="grid size-12 place-items-center rounded-full bg-surface-soft" aria-label="חיפוש">
            <Search className="size-5" />
          </Link>
          {!isGuest && (
            <Link to="/notifications" className="relative grid size-12 place-items-center rounded-full bg-surface-soft" aria-label="התראות">
              <Bell className="size-5" />
              {unread.notifications > 0 && <span className="absolute top-2.5 left-3 size-2.5 rounded-full bg-like ring-2 ring-surface-soft" />}
            </Link>
          )}
        </div>
      </header>

      {user && <PendingReminder />}
      <StoryRail />

      <Tabs value={tab} onValueChange={(v) => void navigate({ search: { tab: v === "events" ? undefined : (v as HomeSearch["tab"]) }, replace: true })} className="mt-3">
        <TabsList className="h-14">
          <TabsTrigger value="events">אירועים</TabsTrigger>
          <TabsTrigger value="people">אנשים</TabsTrigger>
          <TabsTrigger value="communities">קהילות</TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <EventsFeed />
        </TabsContent>
        <TabsContent value="communities">
          <CommunitiesBrowser />
        </TabsContent>
        <TabsContent value="people">
          <PeopleTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
