// Records Supabase responses for the backend-less demo (demo/public/demo-fixtures.json).
// Run against a local stack with the seed loaded and `npm run dev` on :3000:
//   SUPABASE_ANON_KEY=... node scripts/record-demo.mjs
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "http://localhost:3000";
const ANON = process.env.SUPABASE_ANON_KEY; // anon key of the local stack
const CHROME = process.env.CHROME_PATH; // optional custom Chromium
const OUT = new URL("../demo/public/demo-fixtures.json", import.meta.url);
const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;
function fixtureKey(method, url, accept, role, body) {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].map(([k, v]) => `${k}=${v.replace(TS, "<ts>")}`).sort();
  const single = accept?.includes("vnd.pgrst.object") ? "1" : "n";
  const rpcBody = u.pathname.includes("/rpc/") && body ? `#${body.replace(TS, "<ts>")}` : "";
  return `${role} ${method} ${u.pathname}?${params.join("&")} ${single}${rpcBody}`;
}
const fixtures = {};
let misses = 0;
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

async function session(who, viewport, maxPages) {
  const ctx = await b.newContext({ viewport, locale: "he-IL", geolocation: { latitude: 32.0853, longitude: 34.7818 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  page.on("response", async (r) => {
    const req = r.request();
    const url = r.url();
    if (!url.includes(":54321/rest/v1")) return;
    const method = req.method();
    if (!["GET", "HEAD"].includes(method) && !url.includes("/rpc/")) return;
    const h = req.headers();
    const role = (h.authorization ?? "").includes(ANON) || !h.authorization ? "anon" : "user";
    let body = "";
    try { body = method === "HEAD" ? "" : await r.text(); } catch { misses++; return; }
    const key = fixtureKey(method, url, h.accept, role, req.postData());
    const f = { s: r.status(), b: body };
    const cr = r.headers()["content-range"];
    if (cr) f.r = cr;
    fixtures[key] = f;
  });
  if (who !== "guest") {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.fill("input[type=email]", who);
    await page.fill("input[type=password]", "mibale1234");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/home/, { timeout: 15000 });
  }
  const queue = ["/", "/home", "/discover", "/communities", "/likes", "/calendar", "/chat", "/notifications", "/me", "/me/activity", "/me/edit", "/tickets", "/search", "/contacts", "/settings", "/blocked", "/event/new", "/story/new", "/community/new", "/login", "/signup"];
  const seen = new Set();
  let n = 0;
  while (queue.length && n < maxPages) {
    const path = queue.shift();
    const norm = path.split("?")[0];
    if (seen.has(norm)) continue;
    seen.add(norm);
    n++;
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(400);
    for (const tab of await page.locator('[role=tab]').all()) {
      await tab.click({ timeout: 1500 }).catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
    for (const l of links) if (l && !/^\/(admin|api|reset-password|forgot-password)/.test(l) && !seen.has(l.split("?")[0])) queue.push(l);
  }
  console.log(who, viewport.width, "pages", n, "fixtures", Object.keys(fixtures).length);
  await ctx.close();
}
await session("noa@mibale.dev", { width: 390, height: 844 }, 260);
await session("noa@mibale.dev", { width: 1440, height: 900 }, 40);
await session("guest", { width: 390, height: 844 }, 120);
await session("guest", { width: 1440, height: 900 }, 25);
await b.close();
fs.writeFileSync(OUT, JSON.stringify({ recordedAt: new Date().toISOString(), fixtures }));
console.log("misses", misses, "bytes", fs.statSync(OUT).size);
