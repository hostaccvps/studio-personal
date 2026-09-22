import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/guards';
import Logo from '../components/Logo';
import { supabaseConfigured } from '../lib/supabase';

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session && profile) return <Navigate to={homeFor(profile.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="center-screen">
      <div className="login-brand">
        <Logo size={72} />
      </div>
      <form className="card narrow" onSubmit={(e) => void submit(e)}>
        <p className="muted login-sub">Entre para ver e editar sua agenda.</p>
        {!supabaseConfigured && (
          <p className="error">
            Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas (veja o README).
          </p>
        )}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          <LogIn size={16} aria-hidden="true" />
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="auth-links">
          Ainda não tem conta? <Link to="/criar-conta">Criar conta</Link>
        </p>
      </form>
    </div>
  );
}
