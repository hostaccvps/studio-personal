import type { Slot } from './types';

/** "06:00:00" -> "6:00" */
export function fmtTime(t: string): string {
  const [h, m] = t.split(':');
  return `${Number(h)}:${m}`;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}

export function fmtMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function slotLabel(s: Pick<Slot, 'start_time' | 'duration_minutes'>): string {
  return `${fmtTime(s.start_time)}–${fmtMinutes(toMinutes(s.start_time) + s.duration_minutes)}`;
}

/** "06:00:00" -> "06:00" (valor para <input type="time">) */
export const toInputTime = (t: string) => t.slice(0, 5);

/** "07:30" (de um <input type="time">) -> "07:30:00" (valor para o banco) */
export const toDbTime = (hhmm: string) => `${hhmm}:00`;

/** "07:30" + 60 -> "08:30" (usado pra calcular o fim a partir do início customizado) */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const total = ((toMinutes(hhmm) + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Intervalo exibido de uma célula: customizado se tiver, senão o padrão do time_slot. */
export function effectiveRange(
  entry: { actual_start_time: string | null; actual_end_time: string | null },
  slot: Pick<Slot, 'start_time' | 'duration_minutes'>,
): { label: string; custom: boolean } {
  if (entry.actual_start_time && entry.actual_end_time) {
    return { label: `${fmtTime(entry.actual_start_time)}–${fmtTime(entry.actual_end_time)}`, custom: true };
  }
  return { label: slotLabel(slot), custom: false };
}

export function sortSlots<T extends Pick<Slot, 'sort_order' | 'start_time'>>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => a.sort_order - b.sort_order || toMinutes(a.start_time) - toMinutes(b.start_time),
  );
}
