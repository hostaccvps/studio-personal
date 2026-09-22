import { supabase } from './supabase';
import { sortSlots } from './time';
import type { Day, Entry, Profile, Slot, Status } from './types';

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Erro inesperado.';
}

export const isUniqueViolation = (e: unknown) =>
  Boolean(e && typeof e === 'object' && (e as { code?: string }).code === '23505');

/** O PostgREST limita ~1000 linhas por requisição; busca em páginas. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function fetchDays(): Promise<Day[]> {
  const { data, error } = await supabase.from('schedule_days').select('*').order('sort_order');
  if (error) throw error;
  return data as Day[];
}

/** Horários não removidos (active = true), na ordem configurada. */
export async function fetchSlots(): Promise<Slot[]> {
  const { data, error } = await supabase.from('time_slots').select('*').eq('active', true);
  if (error) throw error;
  return sortSlots(data as Slot[]);
}

/** Horários removidos (soft-delete), para poderem ser restaurados. */
export async function fetchRemovedSlots(): Promise<Slot[]> {
  const { data, error } = await supabase.from('time_slots').select('*').eq('active', false);
  if (error) throw error;
  return sortSlots(data as Slot[]);
}

/** Todas as contas de professor, qualquer status de aprovação (o admin decide o que fazer com cada uma). */
export async function fetchProfessors(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, active, approval_status, created_at')
    .eq('role', 'professor')
    .order('created_at');
  if (error) throw error;
  return data as Profile[];
}

export async function fetchProfessorEntries(professorId: string): Promise<Entry[]> {
  return fetchAll<Entry>((from, to) =>
    supabase.from('schedule_entries').select('*').eq('professor_id', professorId).order('id').range(from, to),
  );
}

export interface EntryPatch {
  status: Status;
  student_name: string | null;
  student_code: string | null;
  /** Hora customizada da célula (opcional). Os dois vêm juntos, ou os dois nulos (usa o horário padrão do time_slot). */
  actual_start_time?: string | null;
  actual_end_time?: string | null;
}

/**
 * Marca uma célula como livre/ocupado/indisponível. Usada tanto por "Minha agenda"
 * (professor editando a própria) quanto pelo admin (agenda de qualquer professor) —
 * o RLS de schedule_entries decide quem pode gravar o quê; aqui é só o UPDATE.
 * `data` vem nulo quando o RLS bloqueia silenciosamente (0 linhas) ou a célula sumiu.
 */
export async function updateScheduleEntry(entryId: string, patch: EntryPatch): Promise<Entry | null> {
  const { data, error } = await supabase.from('schedule_entries').update(patch).eq('id', entryId).select().maybeSingle();
  if (error) throw error;
  return (data as Entry | null) ?? null;
}

export interface OccupiedRow {
  id: string;
  weekday: number;
  time_slot_id: string;
  student_name: string | null;
  student_code: string | null;
  professor: { full_name: string | null; active: boolean } | null;
}

/** Alunos (células ocupadas) que seriam afetados por mudar um horário ou um dia. */
export async function fetchOccupied(filter: { slotId?: string; weekday?: number }): Promise<OccupiedRow[]> {
  return fetchAll<OccupiedRow>((from, to) => {
    let q = supabase
      .from('schedule_entries')
      .select('id, weekday, time_slot_id, student_name, student_code, professor:profiles(full_name, active)')
      .eq('status', 'ocupado');
    if (filter.slotId) q = q.eq('time_slot_id', filter.slotId);
    if (filter.weekday) q = q.eq('weekday', filter.weekday);
    return q.order('id').range(from, to) as unknown as PromiseLike<{ data: OccupiedRow[] | null; error: unknown }>;
  });
}

export async function fetchAllEntries(): Promise<Pick<Entry, 'professor_id' | 'weekday' | 'time_slot_id' | 'status'>[]> {
  return fetchAll((from, to) =>
    supabase.from('schedule_entries').select('professor_id, weekday, time_slot_id, status').order('id').range(from, to),
  );
}
