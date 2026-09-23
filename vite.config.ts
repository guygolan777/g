import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// `CAP_BUILD=1 vite build` → static SPA shell for Capacitor (android/ios).
// Regular builds keep SSR so /e/{id} serves dynamic OG tags.
const isCapacitor = process.env.CAP_BUILD === "1";

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: false },
      spa: isCapacitor ? { enabled: true, prerender: { outputPath: "/index.html", crawlLinks: false } } : undefined,
    }),
    viteReact(),
  ],
});
