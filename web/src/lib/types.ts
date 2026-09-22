export type Status = 'livre' | 'ocupado' | 'indisponivel';
export type Role = 'admin' | 'professor';
export type ApprovalStatus = 'pendente' | 'aprovado' | 'recusado';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  active: boolean;
  approval_status: ApprovalStatus;
  created_at?: string;
}

export interface Day {
  weekday: number;
  label: string;
  active: boolean;
  sort_order: number;
}

export interface Slot {
  id: string;
  start_time: string; // "HH:MM:SS"
  duration_minutes: number;
  active: boolean;
  sort_order: number;
}

export interface Entry {
  id: string;
  professor_id: string;
  weekday: number;
  time_slot_id: string;
  status: Status;
  student_name: string | null;
  student_code: string | null;
}

export const cellKey = (weekday: number, slotId: string) => `${weekday}:${slotId}`;

/** O e-mail nunca deve virar nome de exibição; usa isso em vez de `profile.full_name` direto. */
export const displayName = (p: Pick<Profile, 'full_name'> | null | undefined): string =>
  p?.full_name && p.full_name.trim() !== '' ? p.full_name : '(sem nome)';
