import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import CompleteNameGate from '../components/CompleteNameGate';
import { nameNeedsCompletion } from '../lib/nameUtils';
import type { Role } from '../lib/types';
import { useAuth } from './AuthContext';

export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : '/minha-agenda');

function InfoScreen({ title, message }: { title: string; message: string }) {
  const { signOut } = useAuth();
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h2>{title}</h2>
        <p className="muted">{message}</p>
        <button className="btn" onClick={() => void signOut()}>
          <LogOut size={15} aria-hidden="true" />
          Sair
        </button>
      </div>
    </div>
  );
}

/**
 * Ponto único de acesso das telas de professor e admin. A ordem importa:
 * 1) sessão/perfil carregando ou ausente
 * 2) nome incompleto -> "Complete seu cadastro" (antes de qualquer outra tela,
 *    vale pra pendente/recusado/aprovado, professor ou admin)
 * 3) pendente / recusado -> tela de aviso, sem acesso a nada
 * 4) conta desativada
 * 5) papel errado -> manda pra home do papel certo
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session, profile, loading, profileError } = useAuth();

  if (loading) return <div className="center-screen muted">Carregando…</div>;
  if (!session) return <Navigate to="/login" replace />;

  if (!profile) {
    return <InfoScreen title="Acesso indisponível" message={profileError ?? 'Não foi possível carregar seu perfil.'} />;
  }

  if (nameNeedsCompletion(profile)) return <CompleteNameGate />;

  if (profile.approval_status === 'pendente') {
    return (
      <InfoScreen
        title="Cadastro enviado!"
        message="Aguarde a liberação do administrador para acessar sua agenda."
      />
    );
  }
  if (profile.approval_status === 'recusado') {
    return <InfoScreen title="Cadastro não aprovado" message="Seu cadastro não foi aprovado. Fale com a coordenação." />;
  }
  if (!profile.active) {
    return <InfoScreen title="Acesso indisponível" message="Sua conta está desativada. Fale com o administrador do studio." />;
  }

  if (profile.role !== role) return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}
