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

export function sortSlots<T extends Pick<Slot, 'sort_order' | 'start_time'>>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => a.sort_order - b.sort_order || toMinutes(a.start_time) - toMinutes(b.start_time),
  );
}
