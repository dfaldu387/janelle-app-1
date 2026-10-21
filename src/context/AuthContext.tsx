import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, SessionExpiredError } from '../lib/api';
import { ENDPOINTS } from '../lib/endpoints';

interface Profile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string;
  seat: string | null;
}

interface SessionUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
  seat: string | null;
}

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  user: SessionUser | null;
  profileError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setProfileError(null);
    try {
      const me = await api<{
        profile: Profile | null;
        access?: Record<string, unknown>;
        google?: { status?: string };
      }>(ENDPOINTS.ME);
      if (me.profile?.org_id) {
        setProfile(me.profile);
        return;
      }
      const created = await api<Profile>(ENDPOINTS.AUTH_BOOTSTRAP, {
        method: 'POST',
        body: '{}',
      });
      setProfile(created);
    } catch (err) {
      setProfile(null);
      if (err instanceof SessionExpiredError) return;
      setProfileError((err as Error).message || 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Show the login screen as soon as we know there's no session.
    // Profile loading happens in the background after that.
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        // No session → show login immediately
        if (!data.session) {
          setLoading(false);
          return;
        }
        // Has session → show login screen is done, load profile in parallel
        setLoading(false);
        await loadProfile();
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, next) => {
        setSession(next);
        if (active) setLoading(false);
        if (next) {
          await loadProfile();
        } else {
          setProfile(null);
          setProfileError(null);
        }
      },
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setProfileError(null);
  };

  const user: SessionUser | null =
    session && profile
      ? {
          id: session.user.id,
          email: session.user.email ?? profile.email,
          name: profile.full_name ?? session.user.email ?? 'Team member',
          role: profile.role,
          seat: profile.seat ?? null,
        }
      : null;

  return (
    <Ctx.Provider
      value={{ loading, session, profile, user, profileError, refresh: loadProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
