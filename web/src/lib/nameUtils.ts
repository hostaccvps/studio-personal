import type { Profile } from './types';

/** full_name vazio, com menos de 2 palavras, ou igual ao começo do e-mail -> precisa completar o cadastro. */
export function nameNeedsCompletion(p: Pick<Profile, 'full_name' | 'email'>): boolean {
  const name = (p.full_name ?? '').trim();
  if (name === '') return true;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  const emailPrefix = p.email.split('@')[0]?.trim().toLowerCase() ?? '';
  if (name.toLowerCase() === emailPrefix) return true;
  return false;
}

// Mesma regra usada no banco (função set_my_name, em supabase/migrations/0002_*.sql):
// só letras (com acentos), espaço, hífen e apóstrofo; sem números; mínimo 2 letras.
// Duplicar aqui é proposital — o cadastro (signUp) manda full_name pronto no metadata,
// então precisa validar/formatar no cliente; o banco continua sendo a fonte de verdade
// (rejeita de novo se, por algum motivo, algo inválido chegar até ele).
const LETTERS = "A-Za-zÀ-ÖØ-öø-ÿ";
const PART_RE = new RegExp(`^[${LETTERS}]+(?:[ '-][${LETTERS}]+)*$`);
const LETTER_RE = new RegExp(`[${LETTERS}]`, 'g');
const PARTICLES = new Set(['da', 'de', 'do', 'dos', 'das', 'e']);

/** null = válido; senão, a mensagem de erro amigável. */
export function validateNamePart(value: string, label: string): string | null {
  const v = value.trim();
  if (v === '') return `Informe o ${label.toLowerCase()}.`;
  if (/\d/.test(v)) return `${label} não pode ter números.`;
  if (!PART_RE.test(v)) return `${label} deve ter só letras.`;
  const letterCount = (v.match(LETTER_RE) ?? []).length;
  if (letterCount < 2) return `${label} muito curto (mínimo 2 letras).`;
  return null;
}

function capitalizeWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();
  if (!isFirst && PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "matheus" + "sedrez" -> "Matheus Sedrez"; "joão da" + "silva e souza" -> "João da Silva e Souza". */
export function joinFullName(firstName: string, lastName: string): string {
  const raw = `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim();
  if (raw === '') return '';
  return raw
    .split(' ')
    .map((w, i) => capitalizeWord(w, i === 0))
    .join(' ');
}
