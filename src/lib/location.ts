import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getCurrentPosition, isNative } from "@/lib/native";
import { supabase } from "@/lib/supabase";
import { geocode, reverseGeocodeCity } from "@/lib/geocode";

const LAST_KEY = "mibale-location-at";
const REFRESH_MS = 30 * 60 * 1000;

/** True only when location access was already granted — never shows a permission prompt. */
export async function locationPermissionGranted(): Promise<boolean> {
  try {
    if (isNative()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      return (await Geolocation.checkPermissions()).location === "granted";
    }
    if (typeof navigator === "undefined" || !navigator.permissions) return false;
    return (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state === "granted";
  } catch {
    return false;
  }
}

/** Stores the position privately (only distances are ever shown to others). */
export async function saveMyLocation(userId: string, pos: { lat: number; lng: number }, knownCity?: string, holdMs = 0): Promise<boolean> {
  const city = knownCity ?? (await reverseGeocodeCity(pos.lat, pos.lng));
  const { error } = await supabase
    .from("profile_locations")
    .upsert({ profile_id: userId, lat: pos.lat, lng: pos.lng, city, updated_at: new Date().toISOString() });
  if (error) return false;
  try {
    // holdMs pushes the next silent GPS refresh back, so a hand-picked city isn't overwritten right away.
    localStorage.setItem(LAST_KEY, String(Date.now() + holdMs));
  } catch {
    /* ignore */
  }
  return true;
}

const LOCATION_QUERIES = [["my-location"], ["people"], ["nearby"], ["dating-candidates"]];

/** Asks for location (may prompt), saves it and refreshes everything distance-based. */
export function useUpdateLocation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return React.useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const pos = await getCurrentPosition();
    if (!pos || !(await saveMyLocation(user.id, pos))) return false;
    for (const queryKey of LOCATION_QUERIES) void qc.invalidateQueries({ queryKey });
    return true;
  }, [user, qc]);
}

const MANUAL_HOLD_MS = 12 * 60 * 60 * 1000;

/** Sets the location to a typed place ("חיפה", "רחוב הרצל 1 ראשון לציון"). Returns the city, or null if not found. */
export function useSetLocationByName() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return React.useCallback(
    async (query: string): Promise<string | null> => {
      if (!user) return null;
      const hit = await geocode(query);
      if (!hit) return null;
      const city = await reverseGeocodeCity(hit.lat, hit.lng);
      if (!(await saveMyLocation(user.id, hit, city, MANUAL_HOLD_MS))) return null;
      for (const queryKey of LOCATION_QUERIES) void qc.invalidateQueries({ queryKey });
      return city;
    },
    [user, qc],
  );
}

/** Keeps "near me" fresh: silently re-reads the location on app open (every 30 min at most),
 *  only if the user already allowed it. */
export function useAutoLocation() {
  const { user } = useAuth();
  const update = useUpdateLocation();
  React.useEffect(() => {
    if (!user) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    } catch {
      /* ignore */
    }
    if (Date.now() - last < REFRESH_MS) return;
    void locationPermissionGranted().then((ok) => ok && update());
  }, [user, update]);
}
