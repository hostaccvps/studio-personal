import { UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import WeekView, { type CellSpec } from '../components/WeekView';
import { errMsg, fetchAllEntries, fetchProfessors } from '../lib/api';
import { usePendingCount } from '../lib/pendingCount';
import { slotLabel } from '../lib/time';
import { cellKey, displayName, type Day, type Entry, type Profile, type Slot } from '../lib/types';
import { useConfig } from '../lib/useConfig';

type LiteEntry = Pick<Entry, 'professor_id' | 'weekday' | 'time_slot_id' | 'status'>;

function heatStyle(count: number, max: number): CSSProperties {
  if (count === 0) return { background: 'rgba(255, 92, 92, .14)', color: '#ff9b9b' };
  const ratio = max <= 1 ? 1 : (count - 1) / (max - 1);
  const light = 16 + ratio * 32; // 16% (poucos) -> 48% (muitos, verde vivo da marca)
  const sat = 55 + ratio * 45;
  const dark = light >= 38; // fundo claro o bastante -> texto escuro (nunca branco em botão/fundo verde)
  return { background: `hsl(131 ${sat}% ${light}%)`, color: dark ? '#07130a' : '#8fffaf', fontWeight: dark ? 700 : 600 };
}

export default function AdminDashboard() {
  const cfg = useConfig();
  const { count: pendingCount } = usePendingCount();
  const [professors, setProfessors] = useState<Profile[]>([]);
  const [entries, setEntries] = useState<LiteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ day: Day; slot: Slot } | null>(null);

  useEffect(() => {
    Promise.all([fetchProfessors(), fetchAllEntries()])
      .then(([p, e]) => {
        setProfessors(p);
        setEntries(e);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => {
    const active = professors.filter((p) => p.active && p.approval_status === 'aprovado');
    const activeIds = new Set(active.map((p) => p.id));
    const dayIds = new Set(cfg.days.map((d) => d.weekday));
    const slotIds = new Set(cfg.slots.map((s) => s.id));

    const free = new Map<string, Profile[]>();
    const perProf = new Map<string, { livre: number; ocupado: number; indisponivel: number }>();
    for (const p of active) perProf.set(p.id, { livre: 0, ocupado: 0, indisponivel: 0 });
    const byId = new Map(active.map((p) => [p.id, p]));

    let totalFree = 0;
    for (const e of entries) {
      if (!activeIds.has(e.professor_id) || !dayIds.has(e.weekday) || !slotIds.has(e.time_slot_id)) continue;
      perProf.get(e.professor_id)![e.status] += 1;
      if (e.status === 'livre') {
        totalFree += 1;
        const k = cellKey(e.weekday, e.time_slot_id);
        free.set(k, [...(free.get(k) ?? []), byId.get(e.professor_id)!]);
      }
    }
    let max = 0;
    for (const list of free.values()) max = Math.max(max, list.length);
    return { active, free, perProf, totalFree, max };
  }, [professors, entries, cfg.days, cfg.slots]);

  function renderCell(day: Day, slot: Slot): CellSpec {
    const count = data.free.get(cellKey(day.weekday, slot.id))?.length ?? 0;
    return {
      className: 'heat',
      style: heatStyle(count, data.max),
      content: <span className="cell-main">{count}</span>,
      onClick: () => setSelected({ day, slot }),
      ariaLabel: `${day.label} ${slotLabel(slot)}: ${count} professores livres`,
    };
  }

  if (cfg.loading || loading) return <p className="muted">Carregando painel…</p>;
  if (error || cfg.error) return <p className="error">{error ?? cfg.error}</p>;

  const selectedList = selected ? [...(data.free.get(cellKey(selected.day.weekday, selected.slot.id)) ?? [])] : [];
  selectedList.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));

  return (
    <>
      <h1>Painel</h1>
      {pendingCount > 0 && (
        <Link to="/admin/professores" className="notice">
          <UserCheck size={16} aria-hidden="true" />
          {pendingCount} {pendingCount === 1 ? 'professor aguardando' : 'professores aguardando'} aprovação — revisar
        </Link>
      )}
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-num">{data.totalFree}</span>
          <span className="muted">horários livres na semana</span>
        </div>
        <div className="kpi">
          <span className="kpi-num">{data.active.length}</span>
          <span className="muted">professores ativos</span>
        </div>
      </div>

      <section className="card">
        <h2>Professores livres por horário</h2>
        <p className="muted small">
          Cada célula mostra quantos professores estão livres. Toque para ver quem são.{' '}
          <span className="legend-heat">
            <i style={{ background: '#fecaca' }} /> 0 <i style={heatStyle(1, data.max)} /> poucos{' '}
            <i style={heatStyle(Math.max(data.max, 2), Math.max(data.max, 2))} /> muitos
          </span>
        </p>
        <WeekView days={cfg.days} slots={cfg.slots} renderCell={renderCell} />
      </section>

      <section className="card">
        <h2>Horários livres por professor</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Professor</th>
                <th className="num">Livres</th>
                <th className="num">Ocupados</th>
                <th className="num">Indisp.</th>
              </tr>
            </thead>
            <tbody>
              {data.active.map((p) => {
                const t = data.perProf.get(p.id)!;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/professores/${p.id}`}>{displayName(p)}</Link>
                    </td>
                    <td className="num">
                      <strong>{t.livre}</strong>
                    </td>
                    <td className="num">{t.ocupado}</td>
                    <td className="num">{t.indisponivel}</td>
                  </tr>
                );
              })}
              {data.active.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Nenhum professor ativo ainda.
                  </td>
                </tr>
              )}
            </tbody>
            {data.active.length > 0 && (
              <tfoot>
                <tr>
                  <th>Total geral</th>
                  <th className="num">{data.totalFree}</th>
                  <th className="num">{[...data.perProf.values()].reduce((a, t) => a + t.ocupado, 0)}</th>
                  <th className="num">{[...data.perProf.values()].reduce((a, t) => a + t.indisponivel, 0)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {selected && (
        <Modal
          title={`${selected.day.label} · ${slotLabel(selected.slot)}`}
          onClose={() => setSelected(null)}
        >
          {selectedList.length === 0 ? (
            <p className="muted">Nenhum professor livre neste horário.</p>
          ) : (
            <>
              <p>
                <strong>{selectedList.length}</strong> {selectedList.length === 1 ? 'professor livre' : 'professores livres'}:
              </p>
              <ul className="plain-list">
                {selectedList.map((p) => (
                  <li key={p.id}>
                    <Link to={`/admin/professores/${p.id}`}>{displayName(p)}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
