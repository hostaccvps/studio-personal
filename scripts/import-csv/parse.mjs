// Leitura e interpretação do CSV exportado do Excel (sem dependências).

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

/** Excel exporta ora UTF-8 (com BOM), ora ANSI/Windows-1252. */
export function decodeCsv(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.replace(/^﻿/, '');
}

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const best = [';', '\t', ','].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ';';
}

/** Parser CSV com aspas ("" escapa aspas; quebras de linha dentro de aspas viram espaço). */
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c === '\n' || c === '\r' ? ' ' : c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const WEEKDAY_PREFIX = { SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6, DOM: 7 };

/** "SEGUNDA-FEIRA" -> 1 ... "DOMINGO" -> 7 (ou null) */
export function parseWeekday(header) {
  const n = norm(header);
  return WEEKDAY_PREFIX[n.slice(0, 3)] ?? null;
}

/** "6:00", "06:00", "6h", "6h30", "6:00 às 7:00", "06:00 - 07:00" -> "06:00" (ou null) */
export function parseTime(cell) {
  const m = String(cell ?? '')
    .trim()
    .match(/^(\d{1,2})(?:\s*[:hH.]\s*(\d{2})?)?\s*(?:h|hs)?(?:\s*(?:-|–|—|às|as|a)\s*.*)?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * "VENDA" -> livre | vazio -> indisponivel | outro texto -> ocupado
 * "luciano 1310" -> nome "luciano", código "1310" (o número no final vira código)
 */
export function parseCell(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return { status: 'indisponivel', name: null, code: null };
  if (norm(text).replace(/[^A-Z]/g, '') === 'VENDA') return { status: 'livre', name: null, code: null };
  const m = text.match(/^(.*?)[\s\-–—:]*(\d+)$/);
  if (m && m[1].trim() !== '') return { status: 'ocupado', name: m[1].trim(), code: m[2] };
  return { status: 'ocupado', name: text, code: null };
}

export const hhmmToMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Interpreta o CSV inteiro.
 * Retorna { delimiter, weekdays:[{col,weekday,header}], ignoredHeaders, rows:[{time,line,cells:Map<weekday,cell>}], warnings }
 */
export function parseScheduleCsv(text) {
  const delimiter = detectDelimiter(text);
  const grid = parseCsv(text, delimiter);
  const warnings = [];
  if (grid.length === 0) throw new Error('O arquivo está vazio.');

  // A linha de cabeçalho é a primeira que tem ao menos um dia da semana reconhecível
  const headerIdx = grid.findIndex((r) => r.some((c) => parseWeekday(c) !== null));
  if (headerIdx === -1) throw new Error('Não encontrei o cabeçalho com os dias (SEGUNDA-FEIRA, TERÇA-FEIRA...).');
  const header = grid[headerIdx];

  const weekdays = [];
  const ignoredHeaders = [];
  header.forEach((h, col) => {
    if (col === 0) return;
    const wd = parseWeekday(h);
    if (wd) {
      if (weekdays.some((w) => w.weekday === wd)) warnings.push(`Dia repetido no cabeçalho ("${h.trim()}"): ignorei a segunda coluna.`);
      else weekdays.push({ col, weekday: wd, header: h.trim() });
    } else if (h.trim() !== '') ignoredHeaders.push(h.trim());
  });

  const rows = [];
  const seen = new Map();
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const line = r + 1;
    const cols = grid[r];
    const first = (cols[0] ?? '').trim();
    const rowIsBlank = cols.every((c) => c.trim() === '');
    if (rowIsBlank) continue;
    const time = parseTime(first);
    if (!time) {
      warnings.push(`Linha ${line}: não entendi o horário "${first}"; linha ignorada.`);
      continue;
    }
    const cells = new Map();
    for (const { col, weekday } of weekdays) cells.set(weekday, { ...parseCell(cols[col]), raw: (cols[col] ?? '').trim() });
    if (seen.has(time)) {
      warnings.push(`Horário ${time} aparece nas linhas ${seen.get(time)} e ${line}; usei a última.`);
      rows.splice(rows.findIndex((x) => x.time === time), 1);
    }
    seen.set(time, line);
    rows.push({ time, line, cells });
  }
  return { delimiter, weekdays, ignoredHeaders, rows, warnings };
}
