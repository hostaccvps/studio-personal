import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; hasSession: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const PROFILE_COLUMNS = 'id, full_name, email, role, active, approval_status';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    // O callback só guarda a sessão; chamadas ao banco ficam no efeito abaixo
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
    setProfileError(error ? error.message : data ? null : 'Perfil não encontrado para este usuário.');
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    void loadProfile(userId);
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    return /invalid login credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!navigator.onLine) return { error: 'Sem conexão. Verifique sua internet e tente novamente.', hasSession: false };
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: mapSignUpError(error.message), hasSession: false };
      return { error: null, hasSession: Boolean(data.session) };
    } catch {
      return { error: 'Sem conexão. Verifique sua internet e tente novamente.', hasSession: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading: sessionLoading || (Boolean(userId) && profileLoading),
      profileError,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, sessionLoading, userId, profileLoading, profileError, signIn, signUp, signOut, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function mapSignUpError(message: string): string {
  if (/already registered|already exists|user already/i.test(message)) {
    return 'Este e-mail já está cadastrado. Tente entrar ou fale com a coordenação.';
  }
  if (/password/i.test(message)) return 'Senha fraca. Use pelo menos 8 caracteres.';
  if (/signup.*disabled|signups.*not allowed/i.test(message)) return 'Cadastro temporariamente indisponível. Fale com a coordenação.';
  if (/rate limit/i.test(message)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  return message;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}
