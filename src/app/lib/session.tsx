// ABOUTME: Session, profile and role context for the SPA, plus the dev role override.
// ABOUTME: The override changes what the UI offers, never what the database returns.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const ROLES = ['superuser', 'executive', 'coach', 'delegate'] as const;
export type Role = (typeof ROLES)[number];

/** Most privileged first. Used to pick a default view for someone holding several. */
const PRECEDENCE: Role[] = ['superuser', 'executive', 'coach', 'delegate'];

export type Profile = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  locale: 'en' | 'fr';
};

type SessionContextValue = {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Roles the account actually holds, straight from user_roles. */
  roles: Role[];
  /** What the UI should render as. Equals the highest real role unless overridden. */
  effectiveRole: Role;
  /** Dev-only. Null means "no override". */
  roleOverride: Role | null;
  setRoleOverride: (role: Role | null) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function highestRole(roles: Role[]): Role {
  return PRECEDENCE.find((r) => roles.includes(r)) ?? 'delegate';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleOverride, setRoleOverride] = useState<Role | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    let cancelled = false;

    async function load(next: Session | null) {
      if (cancelled) return;
      setSession(next);

      if (!next) {
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      // Both reads are RLS-checked. profiles_read lets you see yourself;
      // my_roles() returns only your own rows. Neither can be widened by asking.
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, preferred_name, email, locale')
          .eq('id', next.user.id)
          .maybeSingle(),
        supabase.rpc('my_roles'),
      ]);

      if (cancelled) return;
      setProfile((profileResult.data as Profile | null) ?? null);
      setRoles(((rolesResult.data as Role[] | null) ?? []).filter((r) => ROLES.includes(r)));
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => load(data.session));

    // Fires on sign-in, sign-out, and token refresh — including in another tab,
    // which matters because the magic link may well open in one.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void load(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const real = highestRole(roles);
    return {
      loading,
      configured: isSupabaseConfigured,
      session,
      profile,
      roles,
      effectiveRole: roleOverride ?? real,
      roleOverride,
      setRoleOverride,
      signOut: async () => {
        if (isSupabaseConfigured) await getSupabase().auth.signOut();
        window.location.href = '/';
      },
    };
  }, [loading, session, profile, roles, roleOverride]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Executive-or-above, for shaping the UI.
 *
 * Read this as "should the interface offer this", never as "is this allowed".
 * The dev override feeds it, so it can be true for an account that holds no such
 * role — in which case the screens behind it come back empty, because RLS is
 * evaluated against the real JWT and knows nothing about the switcher.
 */
export function useIsExecLike(): boolean {
  const { effectiveRole } = useSession();
  return effectiveRole === 'executive' || effectiveRole === 'superuser';
}
