import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProfessorAgenda from '../components/ProfessorAgenda';
import { errMsg } from '../lib/api';
import { supabase } from '../lib/supabase';
import { displayName, type Profile } from '../lib/types';

export default function AdminProfessorSchedule() {
  const { id } = useParams<{ id: string }>();
  const [prof, setProf] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setProf(null);
    supabase
      .from('profiles')
      .select('id, full_name, email, role, active, approval_status')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        else if (!data) setError('Professor não encontrado.');
        else setProf(data as Profile);
      });
  }, [id]);

  return (
    <>
      <p className="small">
        <Link to="/admin/professores" className="back-link">
          <ArrowLeft size={14} aria-hidden="true" />
          Professores
        </Link>
      </p>
      {error && <p className="error">{error}</p>}
      {prof && (
        <>
          <h1>
            Agenda de {displayName(prof)} {!prof.active && <span className="badge">desativado</span>}
          </h1>
          {prof.approval_status === 'aprovado' ? (
            <ProfessorAgenda professorId={prof.id} />
          ) : (
            <p className="muted">
              {prof.approval_status === 'pendente'
                ? 'Este professor ainda não foi aprovado, então não tem agenda. Aprove o cadastro em Professores.'
                : 'Este cadastro foi recusado, então não tem agenda.'}
            </p>
          )}
        </>
      )}
    </>
  );
}
