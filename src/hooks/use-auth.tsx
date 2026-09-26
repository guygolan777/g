import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { PROFILE_COLUMNS, PROFILE_VIEW } from "@/lib/constants";
import type { Profile, ProfileSettings, ModerationStatus } from "@/lib/types";
import { invalidateBlocked } from "@/lib/blocks";

type AuthState = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: ProfileSettings | null;
  isGuest: boolean;
  isStaff: boolean;
  isBanned: boolean;
  /** Why and until when I'm suspended (null before the server supports it). */
  moderation: ModerationStatus | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [settings, setSettings] = React.useState<ProfileSettings | null>(null);
  const [moderation, setModeration] = React.useState<ModerationStatus | null>(null);

  const loadProfile = React.useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setSettings(null);
      return;
    }
    // First: lifts my suspension if it has run out, and says why/until when if not.
    const { data: m } = await supabase.rpc("my_moderation_status");
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from(PROFILE_VIEW).select(PROFILE_COLUMNS).eq("id", uid).maybeSingle(),
      supabase.rpc("my_profile_settings"),
    ]);
    setModeration((m as ModerationStatus | null) ?? null);
    setProfile((p as Profile | null) ?? null);
    setSettings((s as ProfileSettings | null) ?? null);
  }, []);

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      invalidateBlocked();
      // Defer DB calls out of the auth callback.
      setTimeout(() => void loadProfile(s?.user.id), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Presence heartbeat (last_seen_at is only exposed through online_status()).
  const uid = session?.user.id;
  React.useEffect(() => {
    if (!uid) return;
    const beat = () => void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid);
    beat();
    const t = window.setInterval(beat, 120_000);
    return () => window.clearInterval(t);
  }, [uid]);

  const value = React.useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile,
      settings,
      isGuest: ready && !session,
      isStaff: !!settings && (settings.is_admin || settings.is_moderator),
      isBanned: !!profile?.banned_at,
      moderation,
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setSettings(null);
      },
    }),
    [ready, session, profile, settings, moderation, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
