/// <reference types="vite/client" />
import * as React from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import appCss from "@/styles.css?url";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopSidebar, useSidebarVisible } from "@/components/desktop-sidebar";
import { BannedGate, PhoneGate } from "@/components/gates";
import { NotificationToaster } from "@/components/notification-toaster";
import { GuestSignupBar } from "@/components/guest";
import { ThemeScript, useThemeSync } from "@/lib/theme";
import { seo } from "@/lib/seo";
import { listenAuthCallback } from "@/lib/native";
import { useAutoLocation } from "@/lib/location";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#3b82f6" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      ...seo({ title: "mibale? - מי בא ל..?", description: "מוצאים אנשים, אירועים וקהילות סביב מה שאוהבים." }).meta,
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useThemeSync();
  const router = useRouter();
  React.useEffect(() => {
    void listenAuthCallback(() => void router.navigate({ to: "/home" }));
  }, [router]);
  React.useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.VITE_DEMO !== "1") {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BannedGate>
          <ContentFrame>
            <PhoneGate>
              <Outlet />
            </PhoneGate>
          </ContentFrame>
          <DesktopSidebar />
          <GuestSignupBar />
          <BottomNav />
          <NotificationToaster />
        </BannedGate>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Leaves room for the desktop sidebar (web layout) on wide screens. */
function ContentFrame({ children }: { children: React.ReactNode }) {
  useAutoLocation(); // inside AuthProvider: silently refreshes location if already permitted
  const withSidebar = useSidebarVisible();
  const { isGuest } = useAuth();
  return <div className={[withSidebar ? "lg:ps-64" : "", isGuest ? "pb-20" : ""].join(" ")}>{children}</div>;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ThemeScript />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
