import { Check, X } from 'lucide-react';
import { useState } from 'react';
import Modal from './Modal';
import type { EntryPatch } from '../lib/api';
import type { Entry, Status } from '../lib/types';

interface Props {
  title: string;
  subtitle: string;
  entry: Entry;
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

export default function CellEditor({ title, subtitle, entry, saving, error, onSave, onClose }: Props) {
  const [status, setStatus] = useState<Status>(entry.status);
  const [name, setName] = useState(entry.student_name ?? '');
  const [code, setCode] = useState(entry.student_code ?? '');
  const nameMissing = status === 'ocupado' && name.trim() === '';

  function submit() {
    if (nameMissing) return;
    onSave({
      status,
      student_name: status === 'ocupado' ? name.trim() : null,
      student_code: status === 'ocupado' ? code.trim() || null : null,
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
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
