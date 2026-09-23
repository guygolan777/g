import { createSign } from "node:crypto";

/**
 * Server-only FCM HTTP v1 sender. Credentials come from a Firebase service
 * account (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY).
 */
let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  const email = process.env.FCM_CLIENT_EMAIL;
  const key = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export type PushMessage = { title: string; body: string; link?: string | null };

/** Sends to each token; returns tokens FCM reports as unregistered (to delete). */
export async function sendPush(tokens: string[], msg: PushMessage): Promise<string[]> {
  const project = process.env.FCM_PROJECT_ID;
  const token = await accessToken();
  if (!project || !token || !tokens.length) return [];
  const dead: string[] = [];
  await Promise.all(
    tokens.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t,
            notification: { title: msg.title, body: msg.body },
            data: msg.link ? { link: msg.link } : {},
            android: { priority: "high", notification: { channel_id: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (res.status === 404 || res.status === 400) dead.push(t);
    }),
  );
  return dead;
}
