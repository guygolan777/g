import { isNative } from "@/lib/native";
import { hashPhone, normalizePhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

export type DeviceContact = { name: string; phone: string /* normalized digits */ };
export type ContactMatch = { profile_id: string; name: string; avatar_url: string | null; contactName: string; phone: string };

type WebContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };

/** Where contacts can be read: the phone app (full list) or Chrome on Android (picker). */
export function contactsSupport(): "native" | "picker" | "none" {
  if (typeof window === "undefined") return "none";
  if (isNative()) return "native";
  return "contacts" in navigator && "ContactsManager" in window ? "picker" : "none";
}

/** Reads contacts after the user agreed on our disclosure screen. Null = permission denied / unsupported. */
export async function readDeviceContacts(): Promise<DeviceContact[] | null> {
  const raw: Array<{ name: string; numbers: string[] }> = [];
  const support = contactsSupport();
  try {
    if (support === "native") {
      const { Contacts } = await import("@capacitor-community/contacts");
      const perm = await Contacts.requestPermissions();
      if (perm.contacts !== "granted" && perm.contacts !== "limited") return null;
      const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
      for (const c of contacts) raw.push({ name: c.name?.display ?? "", numbers: (c.phones ?? []).map((p) => p.number ?? "") });
    } else if (support === "picker") {
      const picked = await (navigator as unknown as { contacts: WebContactsManager }).contacts.select(["name", "tel"], { multiple: true });
      for (const c of picked) raw.push({ name: c.name?.[0] ?? "", numbers: c.tel ?? [] });
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const seen = new Map<string, DeviceContact>();
  for (const c of raw)
    for (const n of c.numbers) {
      const phone = normalizePhone(n);
      if (phone && !seen.has(phone)) seen.set(phone, { name: c.name.trim() || n, phone });
    }
  return [...seen.values()];
}

/** Sends only SHA-256 hashes of the numbers (never names) and returns who is on mibale. */
export async function syncContacts(contacts: DeviceContact[]): Promise<ContactMatch[]> {
  const byHash = new Map<string, DeviceContact>();
  for (const c of contacts) byHash.set(await hashPhone(c.phone), c);
  const hashes = [...byHash.keys()];
  const matches: ContactMatch[] = [];
  for (let i = 0; i < hashes.length; i += 1000) {
    const { data, error } = await supabase.rpc("sync_contacts", { _hashes: hashes.slice(i, i + 1000) });
    if (error) throw error;
    for (const m of (data ?? []) as Array<{ profile_id: string; phone_hash: string; name: string; avatar_url: string | null }>)
      matches.push({ profile_id: m.profile_id, name: m.name, avatar_url: m.avatar_url, contactName: byHash.get(m.phone_hash)?.name ?? "", phone: byHash.get(m.phone_hash)?.phone ?? "" });
  }
  return matches;
}

export function inviteText(url: string) {
  return `היי! אני ב-mibale — מוצאים שם אנשים ואירועים סביב מה שאוהבים 🙌 בוא/י להצטרף: ${url}`;
}
