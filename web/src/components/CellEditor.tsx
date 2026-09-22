import { Check, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import Modal from './Modal';
import type { EntryPatch } from '../lib/api';
import { addMinutesToTime, fmtTime, slotLabel, toDbTime, toInputTime, toMinutes } from '../lib/time';
import type { Entry, Slot, Status } from '../lib/types';

const CUSTOM_DURATION_MIN = 60;

interface Props {
  title: string;
  subtitle: string;
  entry: Entry;
  slot: Slot;
  /** Só a tela "Minha agenda" deixa o professor customizar a hora da própria célula. */
  allowCustomTime?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (patch: EntryPatch) => void;
  onClose: () => void;
}

const OPTIONS: { value: Status; label: string; hint: string }[] = [
  { value: 'livre', label: 'Livre', hint: 'Disponível para vender' },
  { value: 'ocupado', label: 'Ocupado', hint: 'Aluno fixo' },
  { value: 'indisponivel', label: 'Indisponível', hint: 'Não atendo' },
];

export default function CellEditor({ title, subtitle, entry, slot, allowCustomTime, saving, error, onSave, onClose }: Props) {
  const [status, setStatus] = useState<Status>(entry.status);
  const [name, setName] = useState(entry.student_name ?? '');
  const [code, setCode] = useState(entry.student_code ?? '');
  const [customStart, setCustomStart] = useState(entry.actual_start_time ? toInputTime(entry.actual_start_time) : '');
  const [timeError, setTimeError] = useState<string | null>(null);
  const nameMissing = status === 'ocupado' && name.trim() === '';

  const minStart = toInputTime(slot.start_time);
  const customEnd = customStart ? addMinutesToTime(customStart, CUSTOM_DURATION_MIN) : '';

  function submit() {
    if (nameMissing) return;
    if (customStart && toMinutes(customStart) < toMinutes(minStart)) {
      setTimeError(`Não pode ser antes do horário padrão desta linha (${fmtTime(slot.start_time)}).`);
      return;
    }
    setTimeError(null);
    onSave({
      status,
      student_name: status === 'ocupado' ? name.trim() : null,
      student_code: status === 'ocupado' ? code.trim() || null : null,
      actual_start_time: customStart ? toDbTime(customStart) : null,
      actual_end_time: customStart ? toDbTime(customEnd) : null,
    });
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={saving}>
            <X size={14} aria-hidden="true" />
            Cancelar
          </button>
          <button className="btn primary" onClick={submit} disabled={saving || nameMissing}>
            <Check size={14} aria-hidden="true" />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="muted small">{subtitle}</p>
        <div className="status-picker" role="radiogroup" aria-label="Situação do horário">
          {OPTIONS.map((o) => (
            <button
              type="button"
              key={o.value}
              role="radio"
              aria-checked={status === o.value}
              className={`status-opt ${o.value}${status === o.value ? ' selected' : ''}`}
              onClick={() => setStatus(o.value)}
            >
              <strong>{o.label}</strong>
              <span>{o.hint}</span>
            </button>
          ))}
        </div>

        {status === 'ocupado' && (
          <div className="fields">
            <label>
              Nome do aluno
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="off"
                placeholder="ex.: Luciano"
              />
            </label>
            <label>
              Código (opcional)
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="ex.: 1310"
              />
            </label>
          </div>
        )}

        {allowCustomTime && (
          <div className="fields custom-time">
            <label>
              Hora customizada (opcional)
              <input
                type="time"
                step={900}
                min={minStart}
                value={customStart}
                onChange={(e) => {
                  setTimeError(null);
                  setCustomStart(e.target.value);
                }}
              />
            </label>
            {customStart ? (
              <p className="muted small">
                Duração fixa de {CUSTOM_DURATION_MIN} min — será <strong>{fmtTime(toDbTime(customStart))}</strong> às{' '}
                <strong>{fmtTime(toDbTime(customEnd))}</strong>.
              </p>
            ) : (
              <p className="muted small">Sem hora customizada, vale o horário padrão desta linha: {slotLabel(slot)}.</p>
            )}
            {customStart && (
              <button type="button" className="btn small ghost" onClick={() => setCustomStart('')}>
                <RotateCcw size={13} aria-hidden="true" />
                Usar horário padrão
              </button>
            )}
            {timeError && <p className="error small">{timeError}</p>}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
