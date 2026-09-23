/**
 * Demo mode (VITE_DEMO=1): a fully clickable, backend-less preview.
 * Supabase requests are answered from recorded fixtures (real seed data captured
 * from a local stack); writes are acknowledged but not persisted.
 */
export const isDemo = import.meta.env.VITE_DEMO === "1";
export const DEMO_URL = "https://demo.mibale.local";
export const DEMO_ANON_KEY = "demo-anon-key";
export const DEMO_USER_ID = "00000000-0000-4000-a000-000000000001";

type Fixture = { s: number; b: string; r?: string };
let fixtures: Record<string, Fixture> | null = null;
/** Recorded dates are moved forward by (now − recordedAt) so events stay upcoming. */
let shiftMs = 0;
let loading: Promise<void> | null = null;
let warned = false;
const debug = typeof localStorage !== "undefined" && (() => {
  try {
    return localStorage.getItem("mibale-demo-debug") === "1";
  } catch {
    return false;
  }
})();

function load(): Promise<void> {
  loading ??= fetch(new URL("demo-fixtures.json", document.baseURI).toString())
    .then((r) => r.json())
    .then((j: { recordedAt: string; fixtures: Record<string, Fixture> }) => {
      fixtures = j.fixtures;
      shiftMs = Math.max(0, Date.now() - Date.parse(j.recordedAt));
    })
    .catch(() => {
      fixtures = {};
    });
  return loading;
}

const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;

/** Same normalization the recorder uses: sorted params, timestamps masked, role and shape in the key. */
export function fixtureKey(method: string, url: string, accept: string | null, role: "anon" | "user", body?: string | null): string {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].map(([k, v]) => `${k}=${v.replace(TS, "<ts>")}`).sort();
  const single = accept?.includes("vnd.pgrst.object") ? "1" : "n";
  const rpcBody = u.pathname.includes("/rpc/") && body ? `#${body.replace(TS, "<ts>")}` : "";
  return `${role} ${method} ${u.pathname}?${params.join("&")} ${single}${rpcBody}`;
}

function shiftDates(body: string): string {
  if (!shiftMs) return body;
  return body.replace(TS, (m) => new Date(Date.parse(m) + shiftMs).toISOString());
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(data === undefined ? null : JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function demoNotice() {
  if (warned) return;
  warned = true;
  window.dispatchEvent(new CustomEvent("mibale-demo-write"));
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = req.url;
  if (!url.startsWith(DEMO_URL)) return fetch(input, init);
  await load();
  const path = new URL(url).pathname;
  const auth = req.headers.get("authorization") ?? "";
  const role = auth.includes(DEMO_ANON_KEY) || !auth ? "anon" : "user";
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? null : await req.clone().text();

  // --- auth ---
  if (path.startsWith("/auth/v1")) {
    if (path.endsWith("/token")) return json(demoSession());
    if (path.endsWith("/user")) return json(demoSession().user);
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    return json({});
  }

  const key = fixtureKey(method, url, req.headers.get("accept"), role, body);
  const hit = fixtures?.[key];
  if (debug) console.debug("[demo]", hit ? "hit " : "MISS", key);
  if (hit) return new Response(method === "HEAD" ? null : shiftDates(hit.b), { status: hit.s, headers: { "content-type": "application/json", ...(hit.r ? { "content-range": hit.r } : {}) } });

  // --- unrecorded reads: empty results ---
  if (method === "GET" || method === "HEAD") {
    const single = req.headers.get("accept")?.includes("vnd.pgrst.object");
    return single ? json(null, 406) : json([], 200, { "content-range": "*/0" });
  }

  // --- writes: acknowledged, not persisted ---
  demoNotice();
  if (path.includes("/rpc/")) {
    const fn = path.split("/rpc/")[1];
    if (fn === "join_event") return json("approved");
    if (fn === "request_community_join") return json("member");
    return json(null);
  }
  if (method === "POST") {
    const parsed = body ? (JSON.parse(body) as Record<string, unknown> | Array<Record<string, unknown>>) : {};
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
    return req.headers.get("accept")?.includes("vnd.pgrst.object") ? json(rows[0], 201) : json(rows, 201);
  }
  return new Response(null, { status: 204 });
}

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.demo`;
}

export function demoSession() {
  const user = {
    id: DEMO_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "noa@mibale.dev",
    user_metadata: { name: "נועה לוי" },
    app_metadata: { provider: "email" },
    created_at: "2026-09-01T00:00:00Z",
  };
  return {
    access_token: fakeJwt({ sub: DEMO_USER_ID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 }),
    refresh_token: "demo-refresh",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user,
  };
}

/** Start the demo signed in as Noa (can sign out to see guest mode). */
export function seedDemoSession() {
  try {
    if (localStorage.getItem("mibale-demo-booted")) return;
    localStorage.setItem("mibale-demo-booted", "1");
    localStorage.setItem("mibale-auth", JSON.stringify(demoSession()));
  } catch {
    /* ignore */
  }
}

/** Realtime transport that never connects (the demo has no server to push changes). */
export class DemoSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = "arraybuffer";
  protocol = "";
  onopen: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  onmessage: unknown = null;
  constructor(public url: string) {}
  send() {}
  close() {
    this.readyState = 3;
  }
  addEventListener() {}
  removeEventListener() {}
}
