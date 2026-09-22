import { ArrowUpDown, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import ImpactModal from '../components/ImpactModal';
import Modal from '../components/Modal';
import { errMsg, fetchOccupied, fetchRemovedSlots, isUniqueViolation, type OccupiedRow } from '../lib/api';
import { supabase } from '../lib/supabase';
import { fmtTime, slotLabel, toInputTime, toMinutes } from '../lib/time';
import type { Slot } from '../lib/types';
import { useConfig } from '../lib/useConfig';

type Pending = {
  title: string;
  message: React.ReactNode;
  rows: OccupiedRow[];
  confirmLabel: string;
  run: () => Promise<string | null>; // devolve mensagem de erro ou null
};

const dupMsg = (start: string) => `Já existe um horário ativo começando às ${fmtTime(start)}.`;

export default function AdminSlots() {
  const cfg = useConfig();
  const [removed, setRemoved] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editDur, setEditDur] = useState('60');
  const [editError, setEditError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState('');
  const [newDur, setNewDur] = useState('60');

  async function reloadAll() {
    await cfg.reload();
    try {
      setRemoved(await fetchRemovedSlots());
    } catch (e) {
      setError(errMsg(e));
    }
  }
  useEffect(() => {
    fetchRemovedSlots().then(setRemoved, (e) => setError(errMsg(e)));
  }, []);

  /** Executa a mudança; se houver alunos afetados (ou pedir confirmação), abre o modal antes. */
  async function guarded(p: Omit<Pending, 'rows'>, load: () => Promise<OccupiedRow[]>, alwaysConfirm: boolean) {
    setError(null);
    setBusy(true);
    try {
      const rows = await load();
      if (rows.length > 0 || alwaysConfirm) {
        setPendingError(null);
        setPending({ ...p, rows });
      } else {
        const err = await p.run();
        if (err) setError(err);
        await reloadAll();
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    setPendingError(null);
    const err = await pending.run();
    setBusy(false);
    if (err) return setPendingError(err);
    setPending(null);
    await reloadAll();
  }

  // ---- dias ----
  function toggleDay(weekday: number, label: string, active: boolean) {
    const run = async () => {
      const { error } = await supabase.from('schedule_days').update({ active }).eq('weekday', weekday);
      return error ? errMsg(error) : null;
    };
    if (active) return void guarded({ title: '', message: null, confirmLabel: '', run }, async () => [], false);
    void guarded(
      {
        title: `Desativar ${label}?`,
        message: (
          <p>
            A coluna some das agendas e do painel. Os dados <strong>não são apagados</strong>: se você reativar o dia,
            tudo volta como estava.
          </p>
        ),
        confirmLabel: 'Desativar dia',
        run,
      },
      async () => {
        const rows = await fetchOccupied({ weekday });
        const visible = new Set(cfg.slots.map((s) => s.id));
        return rows.filter((r) => visible.has(r.time_slot_id));
      },
      false,
    );
  }

  // ---- horários ----
  async function addSlot() {
    const dur = Number(newDur);
    if (!newStart || !Number.isFinite(dur) || dur < 5) return setError('Informe o horário de início e uma duração de pelo menos 5 minutos.');
    setBusy(true);
    setError(null);
    const maxOrder = cfg.slots.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const { data, error } = await supabase
      .from('time_slots')
      .insert({ start_time: newStart, duration_minutes: dur, sort_order: maxOrder + 1 })
      .select()
      .single();
    if (error) {
      setBusy(false);
      return setError(isUniqueViolation(error) ? dupMsg(newStart) : errMsg(error));
    }
    setNewStart('');
    // Se a grade estava em ordem cronológica, o novo horário entra no lugar certo
    const wasSorted = cfg.slots.every((s, i, a) => i === 0 || toMinutes(a[i - 1].start_time) <= toMinutes(s.start_time));
    if (wasSorted) {
      await persistOrder([...cfg.slots, data as Slot].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)));
    } else {
      setBusy(false);
      await reloadAll();
    }
  }

  function openEdit(s: Slot) {
    setEditing(s);
    setEditStart(toInputTime(s.start_time));
    setEditDur(String(s.duration_minutes));
    setEditError(null);
  }

  async function submitEdit() {
    if (!editing) return;
    const dur = Number(editDur);
    if (!editStart || !Number.isFinite(dur) || dur < 5) return setEditError('Informe início e uma duração de pelo menos 5 minutos.');
    const slot = editing;
    const changed = toInputTime(slot.start_time) !== editStart || slot.duration_minutes !== dur;
    if (!changed) return setEditing(null);
    const run = async () => {
      const { error } = await supabase
        .from('time_slots')
        .update({ start_time: editStart, duration_minutes: dur })
        .eq('id', slot.id);
      if (!error) return null;
      return isUniqueViolation(error) ? dupMsg(editStart) : errMsg(error);
    };
    setBusy(true);
    setEditError(null);
    try {
      const rows = await fetchOccupied({ slotId: slot.id });
      if (rows.length === 0) {
        const err = await run();
        if (err) return setEditError(err);
        setEditing(null);
        await reloadAll();
      } else {
        setEditing(null);
        setPendingError(null);
        setPending({
          title: `Alterar horário ${slotLabel(slot)}?`,
          message: (
            <p>
              O horário passará a ser <strong>{slotLabel({ start_time: editStart, duration_minutes: dur })}</strong>. Os
              alunos abaixo continuam nele, mas mudam de hora — avise-os.
            </p>
          ),
          rows,
          confirmLabel: 'Alterar horário',
          run,
        });
      }
    } catch (e) {
      setEditError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function removeSlot(s: Slot) {
    void guarded(
      {
        title: `Remover horário ${slotLabel(s)}?`,
        message: (
          <p>
            O horário some das agendas e do painel. Os dados <strong>não são apagados</strong>: você pode restaurá-lo em
            “Horários removidos”.
          </p>
        ),
        confirmLabel: 'Remover horário',
        run: async () => {
          const { error } = await supabase.from('time_slots').update({ active: false }).eq('id', s.id);
          return error ? errMsg(error) : null;
        },
      },
      () => fetchOccupied({ slotId: s.id }),
      true,
    );
  }

  async function restoreSlot(s: Slot) {
    setBusy(true);
    setError(null);
    const maxOrder = cfg.slots.reduce((m, x) => Math.max(m, x.sort_order), 0);
    const { error } = await supabase.from('time_slots').update({ active: true, sort_order: maxOrder + 1 }).eq('id', s.id);
    setBusy(false);
    if (error) return setError(isUniqueViolation(error) ? dupMsg(s.start_time) + ' Remova-o antes de restaurar este.' : errMsg(error));
    await reloadAll();
  }

  async function persistOrder(list: Slot[]) {
    setBusy(true);
    setError(null);
    const results = await Promise.all(
      list.map((s, i) =>
        s.sort_order === i + 1 ? null : supabase.from('time_slots').update({ sort_order: i + 1 }).eq('id', s.id),
      ),
    );
    setBusy(false);
    const failed = results.find((r) => r && r.error);
    if (failed?.error) setError(errMsg(failed.error));
    await reloadAll();
  }

  function move(i: number, dir: -1 | 1) {
    const list = [...cfg.slots];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void persistOrder(list);
  }

  const sortByTime = () =>
    void persistOrder([...cfg.slots].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)));

  if (cfg.loading) return <p className="muted">Carregando…</p>;

  return (
    <>
      <h1>Configuração de horários</h1>
      {(error || cfg.error) && <p className="error">{error ?? cfg.error}</p>}

      <section className="card">
        <h2>Dias da semana</h2>
        <div className="day-toggles">
          {cfg.allDays.map((d) => (
            <label key={d.weekday} className={`toggle${d.active ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={d.active}
                disabled={busy}
                onChange={(e) => toggleDay(d.weekday, d.label, e.target.checked)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>Horários da grade</h2>
          <button className="btn small" onClick={sortByTime} disabled={busy || cfg.slots.length < 2}>
            <ArrowUpDown size={14} aria-hidden="true" />
            Ordenar por horário
          </button>
        </div>
        <ul className="slot-config">
          {cfg.slots.map((s, i) => (
            <li key={s.id}>
              <span className="slot-config-label">
                <strong>{fmtTime(s.start_time)}</strong>
                <span className="muted"> · {s.duration_minutes} min · termina {slotLabel(s).split('–')[1]}</span>
              </span>
              <span className="actions">
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="Subir">
                  <ChevronUp size={16} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === cfg.slots.length - 1}
                  aria-label="Descer"
                >
                  <ChevronDown size={16} />
                </button>
                <button className="btn small" onClick={() => openEdit(s)} disabled={busy}>
                  <Pencil size={14} aria-hidden="true" />
                  Editar
                </button>
                <button className="btn small danger-outline" onClick={() => removeSlot(s)} disabled={busy}>
                  <Trash2 size={14} aria-hidden="true" />
                  Remover
                </button>
              </span>
            </li>
          ))}
          {cfg.slots.length === 0 && <li className="muted">Nenhum horário ativo.</li>}
        </ul>

        <form
          className="add-slot"
          onSubmit={(e) => {
            e.preventDefault();
            void addSlot();
          }}
        >
          <label>
            Início
            <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} required />
          </label>
          <label>
            Duração (min)
            <input type="number" min={5} max={600} step={5} value={newDur} onChange={(e) => setNewDur(e.target.value)} required />
          </label>
          <button className="btn primary" disabled={busy}>
            <Plus size={16} aria-hidden="true" />
            Adicionar horário
          </button>
        </form>
      </section>

      {removed.length > 0 && (
        <section className="card">
          <h2>Horários removidos</h2>
          <p className="muted small">Ficam guardados com todos os alunos. Restaure para trazê-los de volta à grade.</p>
          <ul className="slot-config">
            {removed.map((s) => (
              <li key={s.id}>
                <span className="slot-config-label">
                  <strong>{slotLabel(s)}</strong>
                </span>
                <button className="btn small" onClick={() => void restoreSlot(s)} disabled={busy}>
                  <RotateCcw size={14} aria-hidden="true" />
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <Modal
          title={`Editar horário ${slotLabel(editing)}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditing(null)} disabled={busy}>
                <X size={14} aria-hidden="true" />
                Cancelar
              </button>
              <button className="btn primary" onClick={() => void submitEdit()} disabled={busy}>
                <Save size={14} aria-hidden="true" />
                Salvar
              </button>
            </>
          }
        >
          <div className="fields">
            <label>
              Início
              <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            </label>
            <label>
              Duração (min)
              <input type="number" min={5} max={600} step={5} value={editDur} onChange={(e) => setEditDur(e.target.value)} />
            </label>
          </div>
          {editError && <p className="error">{editError}</p>}
        </Modal>
      )}

      {pending && (
        <ImpactModal
          title={pending.title}
          message={pending.message}
          rows={pending.rows}
          days={cfg.allDays}
          slots={cfg.slots}
          confirmLabel={pending.confirmLabel}
          busy={busy}
          error={pendingError}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
