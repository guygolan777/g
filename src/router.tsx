import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: NotFound,
  });
}

function NotFound() {
  return (
    <div dir="rtl" className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-5xl">🧭</p>
        <h1 className="mt-3 text-2xl font-bold">הדף לא נמצא</h1>
        <a href="/home" className="mt-4 inline-block font-semibold text-primary">
          חזרה לבית
        </a>
      </div>
    </div>
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
