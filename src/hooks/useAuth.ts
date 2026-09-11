import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';

export interface UseAuthState {
  configured: boolean;
  session: Session | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => {
      if (mounted) {
        setSession(s);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) {
      throw new Error('Supabase non configurato');
    }
    setError(null);
    const { error: e } = await sb.auth.signInWithPassword({ email, password });
    if (e) {
      setError(e.message);
      throw new Error(e.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      return;
    }
    await sb.auth.signOut();
  }, []);

  return {
    configured: isSupabaseConfigured,
    session,
    email: session?.user.email ?? null,
    loading,
    error,
    signIn,
    signOut,
  };
}
