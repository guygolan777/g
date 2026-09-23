import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Backend-less demo: `npm run build:demo` → dist-demo/ (static SPA, hash routing,
// Supabase answered from demo/demo-fixtures.json). Also used for the demo APK.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./demo"),
  base: "./",
  publicDir: r("./demo/public"),
  define: { "import.meta.env.VITE_DEMO": JSON.stringify("1") },
  resolve: {
    alias: [
      { find: "@/lib/server/og", replacement: r("./demo/stubs/og.ts") },
      { find: "@/lib/server/push", replacement: r("./demo/stubs/push.ts") },
    ],
  },
  build: { outDir: r("./dist-demo"), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  plugins: [
    tsconfigPaths({ projects: [r("./tsconfig.json")] }),
    tanstackRouter({
      target: "react",
      routesDirectory: r("./src/routes"),
      generatedRouteTree: r("./demo/routeTree.gen.ts"),
      routeFileIgnorePattern: "^api\\.",
      autoCodeSplitting: false,
    }),
    tailwindcss(),
    viteReact(),
  ],
});
