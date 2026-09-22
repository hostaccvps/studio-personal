import { Check, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { errMsg } from '../lib/api';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não são iguais.');
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(/password/i.test(updateError.message) ? 'Senha fraca. Use pelo menos 8 caracteres.' : errMsg(updateError));
    setDone(true);
  }

  if (done) {
    return (
      <Modal title="Senha alterada" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Fechar</button>}>
        <p>Sua senha foi trocada com sucesso.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Trocar minha senha"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>
            <Check size={14} aria-hidden="true" />
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </>
      }
    >
      <form
        className="fields"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Nova senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            minLength={8}
            required
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
      <p className="muted small">
        <KeyRound size={13} aria-hidden="true" /> Mínimo de 8 caracteres. Você continua com a mesma senha até salvar.
      </p>
    </Modal>
  );
}
