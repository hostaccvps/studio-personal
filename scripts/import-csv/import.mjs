#!/usr/bin/env node
// Importa planilhas CSV (uma por professor) para a agenda no Supabase.
//
// Uso:
//   node --env-file=.env import.mjs <arquivo.csv | pasta> [...] [--professor "e-mail ou nome"] [--dry-run] [--yes]
//
// Roda no SEU computador com a service_role key (variáveis de ambiente, nunca no código).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { decodeCsv, hhmmToMinutes, norm, parseScheduleCsv } from './parse.mjs';

// ---------- argumentos ----------
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const YES = args.includes('--yes') || args.includes('-y');
let professorArg = null;
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run' || a === '--yes' || a === '-y') continue;
  if (a === '--professor') professorArg = args[++i] ?? null;
  else if (a.startsWith('--')) fail(`Opção desconhecida: ${a}`);
  else inputs.push(a);
}
if (inputs.length === 0) {
  fail('Informe o(s) arquivo(s) CSV ou uma pasta.\n  Ex.: node --env-file=.env import.mjs ./planilhas --dry-run');
}

function fail(msg) {
  console.error(`\nErro: ${msg}\n`);
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env (veja .env.example) e rode com --env-file=.env.');
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- entrada interativa ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let closed = false;
const closedP = new Promise((res) => rl.once('close', () => ((closed = true), res(null))));
const ask = async (q) => (closed ? null : Promise.race([rl.question(q), closedP]));

async function confirm(question, defaultYes = false) {
  if (YES) {
    console.log(`${question} -> sim (--yes)`);
    return true;
  }
  const a = await ask(`${question} ${defaultYes ? '[S/n]' : '[s/N]'} `);
  if (a === null || a.trim() === '') return a === null ? false : defaultYes;
  return /^(s|sim|y|yes)$/i.test(a.trim());
}

// ---------- utilidades ----------
const DAY_SHORT = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
const showTime = (hhmm) => `${Number(hhmm.slice(0, 2))}:${hhmm.slice(3, 5)}`;
const slotMin = (s) => hhmmToMinutes(s.start_time);
const cellText = (e) =>
  !e ? '(sem registro)' : e.status === 'ocupado' ? `${e.student_name}${e.student_code ? ` [${e.student_code}]` : ''}` : e.status;

async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await must(build(from, from + 999));
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const loadDays = () => must(sb.from('schedule_days').select('*').order('sort_order'));
const loadSlots = () => must(sb.from('time_slots').select('*'));
// Traz TODO mundo (qualquer approval_status) para poder casar o CSV com pendentes/recusados
// e avisar — só quem está aprovado pode receber a importação de fato.
const loadProfessors = () =>
  must(sb.from('profiles').select('id, full_name, email, active, approval_status').eq('role', 'professor').order('full_name'));

const STATUS_LABEL = { pendente: 'pendente', recusado: 'recusado' };

function expandInputs(list) {
  const files = [];
  for (const p of list) {
    if (!fs.existsSync(p)) fail(`Não encontrei: ${p}`);
    if (fs.statSync(p).isDirectory()) {
      const found = fs.readdirSync(p).filter((f) => /\.csv$/i.test(f)).sort();
      if (found.length === 0) console.log(`(nenhum .csv em ${p})`);
      files.push(...found.map((f) => path.join(p, f)));
    } else files.push(p);
  }
  return files;
}

// ---------- escolha do professor ----------
const key = (s) => norm(s).replace(/[^A-Z0-9]+/g, ' ').trim();

const profLabel = (p) => p.full_name ?? '(sem nome)';
const profStatusTag = (p) => (p.active ? '' : ' (desativado)') + (STATUS_LABEL[p.approval_status] ? ` (${STATUS_LABEL[p.approval_status]})` : '');

async function pickProfessor(file, professors) {
  const wanted = professorArg ?? path.basename(file, path.extname(file));
  const k = key(wanted);
  const keysOf = (p) => [key(p.full_name), key(p.email), key(p.email.split('@')[0])];

  let found = professors.filter((p) => keysOf(p).includes(k));
  if (found.length === 0) {
    found = professors.filter((p) => {
      const name = key(p.full_name);
      if (!name) return false; // sem nome: não entra na comparação difusa (senão "casa" com qualquer arquivo)
      return name.includes(k) || k.includes(name) || k.split(' ').every((t) => name.split(' ').includes(t));
    });
  }

  let chosen = null;
  if (found.length === 1) {
    console.log(`Professor: ${profLabel(found[0])} <${found[0].email}> (identificado pelo nome do arquivo)`);
    chosen = found[0];
  } else {
    console.log(found.length > 1 ? `Vários professores combinam com "${wanted}":` : `Não identifiquei o professor pelo nome "${wanted}".`);
    const options = found.length > 1 ? found : professors;
    if (YES || closed) {
      console.log('  -> use --professor "e-mail" para indicar o professor. Arquivo pulado.');
      return null;
    }
    options.forEach((p, i) => console.log(`  ${i + 1}) ${profLabel(p)} <${p.email}>${profStatusTag(p)}`));
    const a = await ask('Número do professor (Enter para pular este arquivo): ');
    const n = Number(a);
    chosen = Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : null;
  }

  if (chosen && chosen.approval_status !== 'aprovado') {
    console.log(
      `\nAtenção: ${profLabel(chosen)} <${chosen.email}> está com o cadastro ${STATUS_LABEL[chosen.approval_status] ?? chosen.approval_status} — só é possível importar para professores aprovados. Arquivo pulado.`,
    );
    return null;
  }
  return chosen;
}

// ---------- estrutura (dias e horários) ----------
async function ensureStructure(parsed, days, slots) {
  const plan = { activateDays: [], reactivate: [], create: [] };
  const skipWeekdays = new Set();
  const skipTimes = new Set();

  for (const w of parsed.weekdays) {
    const day = days.find((d) => d.weekday === w.weekday);
    if (day?.active) continue;
    console.log(`\nO dia "${day?.label ?? w.header}" está DESATIVADO na configuração.`);
    console.log('  (ativar cria a coluna na agenda de TODOS os professores, como indisponível)');
    if (DRY) console.log('  [dry-run] perguntaria se deve ativar; as células deste dia não entram no resumo.');
    if (!DRY && (await confirm(`Ativar ${day.label}?`))) plan.activateDays.push(day);
    else skipWeekdays.add(w.weekday);
  }

  const active = slots.filter((s) => s.active);
  const byMin = new Map(active.map((s) => [slotMin(s), s]));
  const times = parsed.rows.map((r) => hhmmToMinutes(r.time)).sort((a, b) => a - b);
  const durations = active.map((s) => s.duration_minutes);
  const commonDuration =
    [...new Set(durations)].sort((a, b) => durations.filter((x) => x === b).length - durations.filter((x) => x === a).length)[0] ?? 60;

  for (const row of parsed.rows) {
    const min = hhmmToMinutes(row.time);
    if (byMin.has(min)) continue;
    const onlyBlank = [...row.cells.values()].every((c) => c.status === 'indisponivel');
    console.log(`\nO horário ${showTime(row.time)} (linha ${row.line}) NÃO existe na configuração${onlyBlank ? ' (a linha está toda vazia)' : ''}.`);

    const removed = slots.find((s) => !s.active && slotMin(s) === min);
    if (removed) {
      console.log('  Ele existe, mas foi removido. Reativar traz de volta os alunos que estavam nele.');
      if (DRY) console.log('  [dry-run] perguntaria se deve reativar.');
      if (!DRY && (await confirm(`Reativar o horário ${showTime(row.time)}?`, true))) plan.reactivate.push(removed);
      else skipTimes.add(row.time);
      continue;
    }

    const next = times[times.indexOf(min) + 1];
    const gap = next !== undefined ? next - min : null;
    const suggested = gap && gap >= 5 && gap <= 240 ? gap : commonDuration;
    if (DRY) {
      console.log(`  [dry-run] perguntaria se deve criar (duração sugerida: ${suggested} min).`);
      skipTimes.add(row.time);
      continue;
    }
    if (!(await confirm(`Criar o horário ${showTime(row.time)}?`, true))) {
      skipTimes.add(row.time);
      continue;
    }
    let duration = suggested;
    if (!YES) {
      const a = await ask(`  Duração em minutos [${suggested}]: `);
      const n = Number(a);
      if (a && a.trim() !== '') {
        if (!Number.isInteger(n) || n < 5 || n > 600) {
          console.log('  Duração inválida; usando a sugerida.');
        } else duration = n;
      }
    }
    plan.create.push({ start_time: row.time, duration_minutes: duration });
  }

  if (!DRY) await applyStructure(plan, slots);
  return { skipWeekdays, skipTimes, created: plan };
}

async function applyStructure(plan, slots) {
  if (plan.activateDays.length) {
    await must(
      sb.from('schedule_days').update({ active: true }).in('weekday', plan.activateDays.map((d) => d.weekday)).select(),
    );
    console.log(`  Dias ativados: ${plan.activateDays.map((d) => d.label).join(', ')}`);
  }
  const changedOrder = plan.reactivate.length + plan.create.length > 0;
  if (!changedOrder) return;

  const active = slots.filter((s) => s.active);
  const wasSorted = active
    .sort((a, b) => a.sort_order - b.sort_order)
    .every((s, i, a) => i === 0 || slotMin(a[i - 1]) <= slotMin(s));
  let order = active.reduce((m, s) => Math.max(m, s.sort_order), 0);

  for (const s of plan.reactivate) {
    await must(sb.from('time_slots').update({ active: true, sort_order: ++order }).eq('id', s.id).select());
    console.log(`  Horário reativado: ${showTime(s.start_time.slice(0, 5))}`);
  }
  if (plan.create.length) {
    await must(sb.from('time_slots').insert(plan.create.map((c) => ({ ...c, sort_order: ++order }))).select());
    for (const c of plan.create) console.log(`  Horário criado: ${showTime(c.start_time)} (${c.duration_minutes} min)`);
  }

  if (wasSorted) {
    const all = (await loadSlots()).filter((s) => s.active).sort((a, b) => slotMin(a) - slotMin(b));
    for (const [i, s] of all.entries()) {
      if (s.sort_order !== i + 1) await must(sb.from('time_slots').update({ sort_order: i + 1 }).eq('id', s.id).select());
    }
  }
}

// ---------- células ----------
function buildWrites(parsed, professor, slots, days, skip) {
  const byMin = new Map(slots.filter((s) => s.active).map((s) => [slotMin(s), s]));
  const activeDays = new Set(days.filter((d) => d.active).map((d) => d.weekday));
  const writes = [];
  for (const row of parsed.rows) {
    if (skip.skipTimes.has(row.time)) continue;
    const slot = byMin.get(hhmmToMinutes(row.time));
    if (!slot) continue;
    for (const [weekday, cell] of row.cells) {
      if (skip.skipWeekdays.has(weekday) || !activeDays.has(weekday)) continue;
      writes.push({
        professor_id: professor.id,
        weekday,
        time_slot_id: slot.id,
        status: cell.status,
        student_name: cell.name,
        student_code: cell.code,
        _time: row.time,
      });
    }
  }
  return writes;
}

async function processFile(file, professors) {
  console.log(`\n${'='.repeat(70)}\n${path.basename(file)}${DRY ? '   [DRY-RUN: nada será gravado]' : ''}\n${'='.repeat(70)}`);
  const parsed = parseScheduleCsv(decodeCsv(fs.readFileSync(file)));
  console.log(
    `Dias encontrados: ${parsed.weekdays.map((w) => DAY_SHORT[w.weekday]).join(', ')} · ${parsed.rows.length} horários · separador "${parsed.delimiter === '\t' ? 'TAB' : parsed.delimiter}"`,
  );
  if (parsed.ignoredHeaders.length) console.log(`Colunas ignoradas: ${parsed.ignoredHeaders.join(', ')}`);
  for (const w of parsed.warnings) console.log(`Aviso: ${w}`);

  const professor = await pickProfessor(file, professors);
  if (!professor) return { file, status: 'pulado' };
  if (!professor.active) console.log('Atenção: este professor está DESATIVADO.');

  let days = await loadDays();
  let slots = await loadSlots();
  const skip = await ensureStructure(parsed, days, slots);
  if (!DRY) {
    days = await loadDays();
    slots = await loadSlots();
  }

  const writes = buildWrites(parsed, professor, slots, days, skip);
  const current = await fetchAll((from, to) =>
    sb.from('schedule_entries').select('*').eq('professor_id', professor.id).order('id').range(from, to),
  );
  const cur = new Map(current.map((e) => [`${e.weekday}:${e.time_slot_id}`, e]));
  const changes = writes.filter((w) => {
    const c = cur.get(`${w.weekday}:${w.time_slot_id}`);
    return !c || c.status !== w.status || (c.student_name ?? null) !== w.student_name || (c.student_code ?? null) !== w.student_code;
  });
  const overwrites = changes.filter((w) => cur.get(`${w.weekday}:${w.time_slot_id}`)?.status === 'ocupado');

  const count = (s) => writes.filter((w) => w.status === s).length;
  console.log(`\nResumo para ${profLabel(professor)}:`);
  console.log(`  Células lidas: ${writes.length} → ${count('livre')} livres · ${count('ocupado')} ocupadas · ${count('indisponivel')} indisponíveis`);
  if (skip.skipTimes.size) console.log(`  Horários NÃO importados: ${[...skip.skipTimes].map(showTime).join(', ')}`);
  if (skip.skipWeekdays.size) console.log(`  Dias NÃO importados: ${[...skip.skipWeekdays].map((d) => DAY_SHORT[d]).join(', ')}`);

  const students = writes.filter((w) => w.status === 'ocupado');
  if (students.length) {
    console.log('\n  Alunos lidos (confira a separação nome / código):');
    for (const w of students.slice(0, 40)) {
      console.log(`    ${DAY_SHORT[w.weekday]} ${showTime(w._time)}  ${w.student_name}${w.student_code ? `  [código ${w.student_code}]` : ''}`);
    }
    if (students.length > 40) console.log(`    ... e mais ${students.length - 40}`);
  }

  console.log(`\n  Alterações na agenda: ${changes.length}${changes.length === 0 ? ' (já está igual ao CSV)' : ''}`);
  if (overwrites.length) {
    console.log(`  ATENÇÃO: ${overwrites.length} alteração(ões) mudam ou apagam alunos JÁ cadastrados:`);
    for (const w of overwrites.slice(0, 30)) {
      const c = cur.get(`${w.weekday}:${w.time_slot_id}`);
      console.log(`    ${DAY_SHORT[w.weekday]} ${showTime(w._time)}: ${cellText(c)}  →  ${cellText(w)}`);
    }
    if (overwrites.length > 30) console.log(`    ... e mais ${overwrites.length - 30}`);
  }

  if (DRY) return { file, status: 'dry-run', changes: changes.length };
  if (changes.length === 0) return { file, status: 'sem alterações', changes: 0 };
  if (!(await confirm(`\nAplicar ${changes.length} alterações na agenda de ${profLabel(professor)}?`))) {
    return { file, status: 'cancelado' };
  }

  const payload = changes.map(({ _time, ...w }) => w);
  for (let i = 0; i < payload.length; i += 500) {
    await must(
      sb.from('schedule_entries').upsert(payload.slice(i, i + 500), { onConflict: 'professor_id,weekday,time_slot_id' }).select('id'),
    );
  }
  console.log(`  OK: ${changes.length} células gravadas.`);
  return { file, status: 'importado', changes: changes.length };
}

// ---------- principal ----------
const files = expandInputs(inputs);
if (files.length === 0) fail('Nenhum arquivo .csv para importar.');
if (professorArg && files.length > 1) fail('--professor só pode ser usado com um único arquivo.');

const results = [];
try {
  const professors = await loadProfessors();
  if (professors.length === 0) fail('Não há professores cadastrados. Crie os usuários no Supabase (Authentication → Users) primeiro.');
  for (const f of files) {
    try {
      results.push(await processFile(f, professors));
    } catch (e) {
      console.error(`\nFalha em ${path.basename(f)}: ${e.message}`);
      results.push({ file: f, status: 'ERRO' });
    }
  }
} catch (e) {
  console.error(`\nErro: ${e.message}`);
  process.exitCode = 1;
}
rl.close();

console.log('\nResultado:');
for (const r of results) console.log(`  ${path.basename(r.file)}: ${r.status}${r.changes !== undefined ? ` (${r.changes})` : ''}`);
if (results.some((r) => r.status === 'ERRO')) process.exitCode = 1;
