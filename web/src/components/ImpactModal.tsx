import { TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import Modal from './Modal';
import type { OccupiedRow } from '../lib/api';
import { fmtTime, toMinutes } from '../lib/time';
import type { Day, Slot } from '../lib/types';

interface Props {
  title: string;
  message: ReactNode;
  rows: OccupiedRow[];
  days: Day[];
  slots: Slot[];
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Mostra quais professores/alunos serão afetados antes de confirmar uma mudança na grade. */
export default function ImpactModal({ title, message, rows, days, slots, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  const dayLabel = (w: number) => days.find((d) => d.weekday === w)?.label ?? `Dia ${w}`;
  const slotOf = (id: string) => slots.find((s) => s.id === id);

  const startOf = (id: string) => toMinutes(slotOf(id)?.start_time ?? '00:00');
  const ordered = [...rows].sort(
    (a, b) =>
      (a.professor?.full_name ?? '').localeCompare(b.professor?.full_name ?? '', 'pt-BR') ||
      a.weekday - b.weekday ||
      startOf(a.time_slot_id) - startOf(b.time_slot_id),
  );
  const byProf = new Map<string, OccupiedRow[]>();
  for (const r of ordered) {
    const key = r.professor?.full_name ?? '(professor removido)';
    byProf.set(key, [...(byProf.get(key) ?? []), r]);
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>
            <X size={14} aria-hidden="true" />
            Cancelar
          </button>
          <button className="btn danger" onClick={onConfirm} disabled={busy}>
            <TriangleAlert size={14} aria-hidden="true" />
            {busy ? 'Aplicando…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="impact-msg">{message}</div>
      {rows.length > 0 ? (
        <>
          <p>
            <strong>
              {rows.length} {rows.length === 1 ? 'aluno afetado' : 'alunos afetados'} em {byProf.size}{' '}
              {byProf.size === 1 ? 'agenda' : 'agendas'}:
            </strong>
          </p>
          <ul className="impact-list">
            {[...byProf.entries()].map(([prof, list]) => (
              <li key={prof}>
                <strong>{prof}</strong>
                {list[0].professor && !list[0].professor.active && <span className="badge">inativo</span>}
                <ul>
                  {list.map((r) => {
                    const s = slotOf(r.time_slot_id);
                    return (
                      <li key={r.id}>
                        {dayLabel(r.weekday)} {s ? fmtTime(s.start_time) : ''} — {r.student_name}
                        {r.student_code ? ` (${r.student_code})` : ''}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">Nenhum aluno cadastrado neste item.</p>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
