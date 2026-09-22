import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg, fetchProfessorEntries, updateScheduleEntry, type EntryPatch } from '../lib/api';
import { slotLabel } from '../lib/time';
import { cellKey, type Day, type Entry, type Slot } from '../lib/types';
import { useConfig } from '../lib/useConfig';
import CellEditor from './CellEditor';
import WeekView, { type CellSpec } from './WeekView';

/** Agenda editável de UM professor. Serve para "Minha agenda" e para o admin abrir a de qualquer professor. */
export default function ProfessorAgenda({ professorId }: { professorId: string }) {
  const cfg = useConfig();
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ day: Day; slot: Slot } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchProfessorEntries(professorId);
      setEntries(new Map(list.map((e) => [cellKey(e.weekday, e.time_slot_id), e])));
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [professorId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const t = { livre: 0, ocupado: 0, indisponivel: 0 };
    for (const d of cfg.days)
      for (const s of cfg.slots) {
        const e = entries.get(cellKey(d.weekday, s.id));
        if (e) t[e.status] += 1;
      }
    return t;
  }, [cfg.days, cfg.slots, entries]);

  async function save(patch: EntryPatch) {
    if (!editing) return;
    const current = entries.get(cellKey(editing.day.weekday, editing.slot.id));
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    let data: Entry | null = null;
    try {
      data = await updateScheduleEntry(current.id, patch);
    } catch (e) {
      setSaving(false);
      return setSaveError(errMsg(e));
    }
    setSaving(false);
    if (!data) return setSaveError('Não foi possível salvar (sem permissão ou horário removido). Recarregue a página.');
    setEntries((prev) => new Map(prev).set(cellKey(data.weekday, data.time_slot_id), data as Entry));
    setEditing(null);
  }

  function renderCell(day: Day, slot: Slot): CellSpec {
    const e = entries.get(cellKey(day.weekday, slot.id));
    const open = () => {
      setSaveError(null);
      setEditing({ day, slot });
    };
    if (!e) return { className: 'missing', content: '·', ariaLabel: 'Sem célula' };
    if (e.status === 'livre')
      return { className: 'livre', content: <span className="cell-main">Livre</span>, onClick: open, ariaLabel: `${day.label} ${slotLabel(slot)}: livre` };
    if (e.status === 'ocupado')
      return {
        className: 'ocupado',
        content: (
          <>
            <span className="cell-main">{e.student_name}</span>
            {e.student_code && <span className="cell-code">{e.student_code}</span>}
          </>
        ),
        onClick: open,
        ariaLabel: `${day.label} ${slotLabel(slot)}: ocupado, ${e.student_name}`,
      };
    return { className: 'indisp', content: <span className="cell-main">—</span>, onClick: open, ariaLabel: `${day.label} ${slotLabel(slot)}: indisponível` };
  }

  if (cfg.loading || loading) return <p className="muted">Carregando agenda…</p>;
  if (cfg.error || loadError) return <p className="error">{cfg.error ?? loadError}</p>;

  const editingEntry = editing ? entries.get(cellKey(editing.day.weekday, editing.slot.id)) : undefined;

  return (
    <div>
      <div className="stats">
        <span className="chip livre">{totals.livre} livres</span>
        <span className="chip ocupado">{totals.ocupado} ocupados</span>
        <span className="chip indisp">{totals.indisponivel} indisponíveis</span>
      </div>
      <WeekView days={cfg.days} slots={cfg.slots} renderCell={renderCell} />
      {editing && editingEntry && (
        <CellEditor
          key={editingEntry.id}
          title={`${editing.day.label} · ${slotLabel(editing.slot)}`}
          subtitle="O que acontece neste horário toda semana?"
          entry={editingEntry}
          saving={saving}
          error={saveError}
          onSave={(p) => void save(p)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
