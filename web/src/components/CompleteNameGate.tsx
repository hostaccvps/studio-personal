import { Check, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errMsg } from '../lib/api';
import { validateNamePart } from '../lib/nameUtils';
import { supabase } from '../lib/supabase';
import Logo from './Logo';

/**
 * Tela obrigatória para QUALQUER usuário logado (pendente, recusado ou aprovado,
 * professor ou admin) cujo full_name esteja vazio, incompleto ou igual ao e-mail.
 * Vem antes de qualquer outra tela — inclusive antes da de "aguardando aprovação".
 */
export default function CompleteNameGate() {
  const { refreshProfile, signOut } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ first?: string; last?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const first = validateNamePart(firstName, 'Nome') ?? undefined;
    const last = validateNamePart(lastName, 'Sobrenome') ?? undefined;
    if (first || last) return setFieldErrors({ first, last });
    setFieldErrors({});
    setError(null);
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('set_my_name', { p_first_name: firstName.trim(), p_last_name: lastName.trim() });
    if (rpcError) {
      setBusy(false);
      return setError(errMsg(rpcError));
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <div className="center-screen">
      <div className="login-brand">
        <Logo size={64} />
      </div>
      <form className="card narrow" onSubmit={(e) => void submit(e)}>
        <h2>Complete seu cadastro</h2>
        <p className="muted">Antes de continuar, precisamos do seu nome completo.</p>
        <label>
          Nome
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
            autoComplete="given-name"
            required
          />
        </label>
        {fieldErrors.first && <p className="error small">{fieldErrors.first}</p>}
        <label>
          Sobrenome
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
        </label>
        {fieldErrors.last && <p className="error small">{fieldErrors.last}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          <Check size={16} aria-hidden="true" />
          {busy ? 'Salvando…' : 'Salvar e continuar'}
        </button>
        <button type="button" className="btn ghost block" onClick={() => void signOut()} disabled={busy}>
          <LogOut size={15} aria-hidden="true" />
          Sair
        </button>
      </form>
    </div>
  );
}
