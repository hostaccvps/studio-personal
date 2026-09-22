import { Ban, CalendarDays, Check, Pencil, Save, UserCheck, UserX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import { errMsg, fetchProfessors } from '../lib/api';
import { usePendingCount } from '../lib/pendingCount';
import { supabase } from '../lib/supabase';
import { displayName, type Profile } from '../lib/types';

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

type Decision = { kind: 'aprovar' | 'recusar'; professor: Profile };

export default function AdminProfessors() {
  const { setCount: setPendingCount } = usePendingCount();
  const [list, setList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [toDeactivate, setToDeactivate] = useState<Profile | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  async function reload() {
    try {
      const data = await fetchProfessors();
      setList(data);
      setPendingCount(data.filter((p) => p.approval_status === 'pendente').length);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { pendentes, recusados, aprovados } = useMemo(() => {
    const pendentes = list.filter((p) => p.approval_status === 'pendente').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const recusados = list
      .filter((p) => p.approval_status === 'recusado')
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    const aprovados = list
      .filter((p) => p.approval_status === 'aprovado')
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
    return { pendentes, recusados, aprovados };
  }, [list]);

  async function patch(p: Profile, values: Partial<Pick<Profile, 'full_name' | 'active' | 'approval_status'>>) {
    setBusyId(p.id);
    setError(null);
    const { data, error } = await supabase.from('profiles').update(values).eq('id', p.id).select('id').maybeSingle();
    setBusyId(null);
    if (error) return setError(errMsg(error));
    if (!data) return setError('Não foi possível salvar (sem permissão).');
    await reload();
  }

  async function saveName() {
    if (!editing || !name.trim()) return;
    await patch(editing, { full_name: name.trim() });
    setEditing(null);
  }

  async function confirmDecision() {
    if (!decision) return;
    setBusyId(decision.professor.id);
    setDecisionError(null);
    const { data, error } = await supabase
      .from('profiles')
      .update({ approval_status: decision.kind === 'aprovar' ? 'aprovado' : 'recusado' })
      .eq('id', decision.professor.id)
      .select('id')
      .maybeSingle();
    setBusyId(null);
    if (error) return setDecisionError(errMsg(error));
    if (!data) return setDecisionError('Não foi possível salvar (sem permissão).');
    setDecision(null);
    await reload();
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <>
      <h1>Professores</h1>
      {error && <p className="error">{error}</p>}

      {pendentes.length > 0 && (
        <section className="card">
          <h2>Pendentes</h2>
          <p className="muted small">Cadastros feitos pelos próprios professores, aguardando sua liberação.</p>
          <ul className="prof-list">
            {pendentes.map((p) => (
              <li key={p.id}>
                <div className="prof-info">
                  <strong>{displayName(p)}</strong>
                  <div className="muted small">
                    {p.email} · cadastrado em {fmtDate(p.created_at)}
                  </div>
                </div>
                <div className="actions">
                  <button className="btn small" disabled={busyId === p.id} onClick={() => { setEditing(p); setName(p.full_name ?? ''); }}>
                    <Pencil size={14} aria-hidden="true" />
                    Editar nome
                  </button>
                  <button className="btn small primary" disabled={busyId === p.id} onClick={() => setDecision({ kind: 'aprovar', professor: p })}>
                    <Check size={14} aria-hidden="true" />
                    Aprovar
                  </button>
                  <button className="btn small danger-outline" disabled={busyId === p.id} onClick={() => setDecision({ kind: 'recusar', professor: p })}>
                    <Ban size={14} aria-hidden="true" />
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Aprovados</h2>
        <ul className="prof-list">
          {aprovados.map((p) => (
            <li key={p.id} className={p.active ? '' : 'inactive'}>
              <div className="prof-info">
                <strong>{displayName(p)}</strong>
                {!p.active && <span className="badge">desativado</span>}
                <div className="muted small">{p.email}</div>
              </div>
              <div className="actions">
                <Link className="btn small" to={`/admin/professores/${p.id}`}>
                  <CalendarDays size={14} aria-hidden="true" />
                  Agenda
                </Link>
                <button
                  className="btn small"
                  disabled={busyId === p.id}
                  onClick={() => {
                    setEditing(p);
                    setName(p.full_name ?? '');
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Editar nome
                </button>
                {p.active ? (
                  <button className="btn small danger-outline" disabled={busyId === p.id} onClick={() => setToDeactivate(p)}>
                    <UserX size={14} aria-hidden="true" />
                    Desativar
                  </button>
                ) : (
                  <button className="btn small" disabled={busyId === p.id} onClick={() => void patch(p, { active: true })}>
                    <UserCheck size={14} aria-hidden="true" />
                    Reativar
                  </button>
                )}
              </div>
            </li>
          ))}
          {aprovados.length === 0 && <li className="muted">Nenhum professor aprovado ainda.</li>}
        </ul>
      </section>

      {recusados.length > 0 && (
        <details className="card details-card">
          <summary>Recusados ({recusados.length})</summary>
          <ul className="prof-list">
            {recusados.map((p) => (
              <li key={p.id}>
                <div className="prof-info">
                  <strong>{displayName(p)}</strong>
                  <div className="muted small">
                    {p.email} · cadastrado em {fmtDate(p.created_at)}
                  </div>
                </div>
                <div className="actions">
                  <button className="btn small" disabled={busyId === p.id} onClick={() => { setEditing(p); setName(p.full_name ?? ''); }}>
                    <Pencil size={14} aria-hidden="true" />
                    Editar nome
                  </button>
                  <button className="btn small primary" disabled={busyId === p.id} onClick={() => setDecision({ kind: 'aprovar', professor: p })}>
                    <Check size={14} aria-hidden="true" />
                    Aprovar mesmo assim
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="card">
        <h2>Como um professor entra</h2>
        <p className="muted">
          O próprio professor cria a conta na tela de login (<em>Criar conta</em>) informando nome completo, e-mail e
          senha. A conta fica <strong>pendente</strong> até você aprovar aqui — só depois ela ganha acesso e a grade é
          criada. Alternativa: criar a conta direto no Supabase (<em>Authentication → Users → Add user</em>); ela também
          nasce pendente e aparece aqui para aprovação.
        </p>
      </section>

      {editing && (
        <Modal
          title="Editar nome"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditing(null)}>
                <X size={14} aria-hidden="true" />
                Cancelar
              </button>
              <button className="btn primary" onClick={() => void saveName()} disabled={!name.trim()}>
                <Save size={14} aria-hidden="true" />
                Salvar
              </button>
            </>
          }
        >
          <form
            className="fields"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
          </form>
        </Modal>
      )}

      {toDeactivate && (
        <Modal
          title={`Desativar ${displayName(toDeactivate)}?`}
          onClose={() => setToDeactivate(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setToDeactivate(null)}>
                <X size={14} aria-hidden="true" />
                Cancelar
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const p = toDeactivate;
                  setToDeactivate(null);
                  void patch(p, { active: false });
                }}
              >
                <UserX size={14} aria-hidden="true" />
                Desativar
              </button>
            </>
          }
        >
          <p>
            {displayName(toDeactivate)} perde o acesso e sai dos totais e do mapa de horários livres. A agenda e os
            alunos
            <strong> não são apagados</strong>; ao reativar, tudo volta.
          </p>
        </Modal>
      )}

      {decision && (
        <Modal
          title={decision.kind === 'aprovar' ? `Aprovar ${displayName(decision.professor)}?` : `Recusar ${displayName(decision.professor)}?`}
          onClose={() => setDecision(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setDecision(null)} disabled={busyId === decision.professor.id}>
                <X size={14} aria-hidden="true" />
                Cancelar
              </button>
              <button
                className={decision.kind === 'aprovar' ? 'btn primary' : 'btn danger'}
                onClick={() => void confirmDecision()}
                disabled={busyId === decision.professor.id}
              >
                {decision.kind === 'aprovar' ? <Check size={14} aria-hidden="true" /> : <Ban size={14} aria-hidden="true" />}
                {decision.kind === 'aprovar' ? 'Aprovar' : 'Recusar'}
              </button>
            </>
          }
        >
          <p>
            {decision.kind === 'aprovar' ? (
              <>
                {displayName(decision.professor)} passa a ter acesso e a grade dele é criada (tudo indisponível, para ele
                preencher).
              </>
            ) : (
              <>
                {displayName(decision.professor)} continua sem acesso à agenda. Nada é apagado — dá para aprovar mais
                tarde, se mudar de ideia.
              </>
            )}
          </p>
          {decisionError && <p className="error">{decisionError}</p>}
        </Modal>
      )}
    </>
  );
}
