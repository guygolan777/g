import * as React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import "@/styles.css";
import { routeTree } from "./routeTree.gen";

// The app's root route renders the full <html> document for SSR; the demo mounts into #app instead.
(routeTree.options as { shellComponent?: unknown }).shellComponent = undefined;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: false } },
});

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
  scrollRestoration: true,
  defaultPreload: "intent",
});

window.addEventListener("mibale-demo-write", () =>
  toast.info("מצב הדגמה — הפעולה הוצגה, אבל שום דבר לא נשמר", { duration: 5000 }),
);

function DemoRibbon() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <div className="relative z-[60] flex items-center justify-center gap-2 bg-foreground px-3 py-1.5 text-center text-xs text-background lg:ps-64">
      <span>גרסת הדגמה · נתוני דוגמה · מחובר/ת כ״נועה״ (התנתקות בהגדרות = מצב אורח)</span>
      <button className="font-bold" aria-label="סגירה" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <DemoRibbon />
    <RouterProvider router={router} />
  </React.StrictMode>,
);
