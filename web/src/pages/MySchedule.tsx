import { useAuth } from '../auth/AuthContext';
import ProfessorAgenda from '../components/ProfessorAgenda';

export default function MySchedule() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <h1>Minha agenda</h1>
      <p className="muted">Toque em um horário para marcar livre, ocupado ou indisponível. A grade é a mesma toda semana.</p>
      <ProfessorAgenda professorId={profile.id} />
    </>
  );
}
