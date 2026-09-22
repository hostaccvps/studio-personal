import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const MIGRATIONS = process.argv[2]
  ? [process.argv[2]]
  : fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => path.join(MIGRATIONS_DIR, f));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

async function newDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  return db;
}

async function applyMigrations(db, files) {
  for (const f of files) await db.exec(fs.readFileSync(f, 'utf8'));
}

function mkUsers(db) {
  return async (email, name) =>
    (
      await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
        email,
        JSON.stringify(name ? { full_name: name } : {}),
      ])
    ).rows[0].id;
}

function asFns(db) {
  async function as(userId, sql, params) {
    await db.exec(`set role ${userId ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec(`reset role;`);
    }
  }
  /** Para UPDATE/INSERT/DELETE sem RETURNING: "negado" = 0 linhas afetadas. */
  async function fails(userId, sql, params) {
    try {
      const r = await as(userId, sql, params);
      return r.affectedRows === 0 ? 'rls: 0 linhas afetadas' : false;
    } catch (e) {
      return e.message;
    }
  }
  /** Para SELECT (ou funções que retornam linhas): "negado" = 0 linhas devolvidas. */
  async function failsSelect(userId, sql, params) {
    try {
      const r = await as(userId, sql, params);
      return r.rows.length === 0 ? 'rls: 0 linhas' : false;
    } catch (e) {
      return e.message;
    }
  }
  return { as, fails, failsSelect };
}

// =============================================================================
// SEÇÃO A — migração 0002 sobre um banco "de verdade" (0001 já em uso, com
// contas e agenda reais) — é exatamente o cenário do projeto em produção.
// Só roda se houver mais de uma migração (senão não há upgrade para testar).
// =============================================================================
if (MIGRATIONS.length > 1) {
  console.log('SEÇÃO A — upgrade: 0001 em uso -> aplicar 0002 por cima\n');
  const db = await newDb();
  const mk = mkUsers(db);
  const { as, failsSelect } = asFns(db);

  await db.exec(fs.readFileSync(MIGRATIONS[0], 'utf8'));

  const admin = await mk('admin@x.com', 'Admin Antigo');
  const p1 = await mk('ana@x.com', 'Ana Antiga');
  await db.query(`update public.profiles set role='admin' where id=$1`, [admin]);

  // agenda real: uma célula ocupada, para conferir que nada some
  const cell = (await db.query(`select id from public.schedule_entries where professor_id=$1 limit 1`, [p1])).rows[0].id;
  await db.query(`update public.schedule_entries set status='ocupado', student_name='Aluno Antigo', student_code='42' where id=$1`, [cell]);
  const beforeCount = (await db.query(`select count(*)::int n from public.schedule_entries`)).rows[0].n;

  for (const f of MIGRATIONS.slice(1)) await db.exec(fs.readFileSync(f, 'utf8'));

  let r = await db.query(`select id, approval_status, full_name from public.profiles where id in ($1,$2) order by id`, [admin, p1]);
  ok(r.rows.every((x) => x.approval_status === 'aprovado'), 'contas que já existiam ficam aprovadas (backfill)');
  ok(r.rows.every((x) => x.full_name), 'nome de quem já existia não foi apagado');

  r = await db.query(`select status, student_name, student_code from public.schedule_entries where id=$1`, [cell]);
  ok(r.rows[0].status === 'ocupado' && r.rows[0].student_name === 'Aluno Antigo' && r.rows[0].student_code === '42', 'célula ocupada continua intacta depois da 0002');

  r = await db.query(`select count(*)::int n from public.schedule_entries`);
  ok(r.rows[0].n === beforeCount, `nenhuma linha de agenda foi perdida ou duplicada (${beforeCount} -> ${r.rows[0].n})`);

  r = await as(admin, `update public.schedule_days set active=true where weekday=6`);
  ok(r.affectedRows === 1, 'admin antigo continua sendo admin (is_admin() considera aprovado) depois da 0002');

  r = await as(p1, `select id from public.schedule_entries where professor_id=$1`, [p1]);
  ok(r.rows.length > 0, 'professor antigo continua enxergando a própria agenda depois da 0002');

  // cadastro feito DEPOIS da migração nasce pendente, mesmo com metadata forjada
  const novo = await mk('novo@x.com', 'Novo Depois');
  await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role":"admin","approval_status":"aprovado"}'::jsonb where id=$1`, [novo]);
  // (o trigger já rodou no insert acima; recria para simular alguém mandando metadata forjada desde o início)
  const forjadoId = (
    await db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      ['forjado@x.com', JSON.stringify({ full_name: 'Forjado Teste', role: 'admin', approval_status: 'aprovado' })],
    )
  ).rows[0].id;
  r = await db.query(`select role, approval_status from public.profiles where id=$1`, [forjadoId]);
  ok(r.rows[0].role === 'professor' && r.rows[0].approval_status === 'pendente', 'cadastro pós-migração ignora role/status forjados no metadata');
  ok(!!(await failsSelect(forjadoId, `select * from public.schedule_entries`)), 'cadastro pós-migração (pendente) não lê agenda nenhuma');

  console.log('');
}

// =============================================================================
// SEÇÃO B — RLS e triggers com o schema completo (todas as migrações já
// aplicadas), o estado em que o app roda no dia a dia.
// =============================================================================
console.log('SEÇÃO B — schema completo\n');
const db = await newDb();
await applyMigrations(db, MIGRATIONS);
const mk = mkUsers(db);
const { as, fails, failsSelect } = asFns(db);

/** Simula "já existia antes da 0002" / "admin aprovou": promove direto no banco. */
const approve = (id) => db.query(`update public.profiles set approval_status='aprovado' where id=$1`, [id]);

// --- usuários ---
const admin = await mk('admin@x.com', 'Admin Studio');
const p1 = await mk('ana@x.com', 'Ana Souza');
const p2 = await mk('bia@x.com', 'Bia Lima');
await db.query(`update public.profiles set role='admin' where id=$1`, [admin]);
await approve(admin);
await approve(p1);
await approve(p2);

console.log('seed / sync');
let r = await db.query(`select count(*)::int n from public.time_slots where active`);
ok(r.rows[0].n === 14, '14 horários (6h..19h)');
r = await db.query(`select count(*)::int n from public.schedule_days where active`);
ok(r.rows[0].n === 5, '5 dias ativos');
r = await db.query(`select professor_id, count(*)::int n from public.schedule_entries where professor_id in (select id from public.profiles where role='professor') group by 1 order by 1`);
ok(r.rows.length === 2 && r.rows.every((x) => x.n === 70), 'cada professor aprovado tem 5x14=70 células; admin não tem grade');
r = await db.query(`select count(*)::int n from public.schedule_entries where status <> 'indisponivel'`);
ok(r.rows[0].n === 0, 'células nascem indisponíveis');

console.log('professor: só a própria agenda');
r = await as(p1, `select distinct professor_id from public.schedule_entries`);
ok(r.rows.length === 1 && r.rows[0].professor_id === p1, 'Ana só enxerga células dela');
r = await as(p1, `select id from public.profiles`);
ok(r.rows.length === 1 && r.rows[0].id === p1, 'Ana só enxerga o próprio profile');

const own = (await as(p1, `select id from public.schedule_entries limit 1`)).rows[0].id;
await as(p1, `update public.schedule_entries set status='ocupado', student_name='  luciano ', student_code=' 1310 ' where id=$1`, [own]);
r = await db.query(`select status, student_name, student_code, updated_by from public.schedule_entries where id=$1`, [own]);
ok(r.rows[0].status === 'ocupado' && r.rows[0].student_name === 'luciano' && r.rows[0].student_code === '1310' && r.rows[0].updated_by === p1, 'Ana edita a própria célula (trim + updated_by)');

await as(p1, `update public.schedule_entries set status='livre' where id=$1`, [own]);
r = await db.query(`select student_name, student_code from public.schedule_entries where id=$1`, [own]);
ok(r.rows[0].student_name === null && r.rows[0].student_code === null, 'voltar a livre limpa o aluno');

const other = (await db.query(`select id from public.schedule_entries where professor_id=$1 limit 1`, [p2])).rows[0].id;
r = await as(p1, `update public.schedule_entries set status='livre' where id=$1`, [other]);
ok(r.affectedRows === 0, 'Ana NÃO edita célula da Bia (0 linhas)');
ok(!!(await fails(p1, `update public.schedule_entries set professor_id=$2 where id=$1`, [own, p2])), 'Ana não consegue trocar professor_id (grant de coluna)');
ok(!!(await fails(p1, `update public.schedule_entries set status='ocupado' where id=$1`, [own])), 'ocupado sem nome é rejeitado');
ok(!!(await fails(p1, `insert into public.schedule_entries (professor_id, weekday, time_slot_id) select $1, 6, id from public.time_slots limit 1`, [p1])), 'professor não insere células');
ok(!!(await fails(p1, `delete from public.schedule_entries`)), 'professor não apaga células');
ok(!!(await fails(p1, `update public.time_slots set duration_minutes=30`)), 'professor não altera horários');
ok(!!(await fails(p1, `update public.schedule_days set active=true where weekday=6`)), 'professor não altera dias');
ok(!!(await fails(p1, `update public.profiles set role='admin' where id=$1`, [p1])), 'professor não vira admin');
ok(!!(await fails(p1, `update public.profiles set approval_status='aprovado' where id=$1`, [p1])), 'professor não muda o próprio approval_status por UPDATE direto');
ok(!!(await fails(p1, `insert into public.time_slots (start_time, duration_minutes) values ('21:00', 60)`)), 'professor não cria horário');
ok(!!(await failsSelect(null, `select * from public.schedule_entries`)), 'anon não lê nada');

console.log('admin');
r = await as(admin, `select count(*)::int n from public.schedule_entries`);
ok(r.rows[0].n === 140, 'admin vê todas as células (2 grades de 70): ' + r.rows[0].n);
r = await as(admin, `update public.schedule_entries set status='livre' where id=$1`, [other]);
ok(r.affectedRows === 1, 'admin edita agenda de qualquer professor');
r = await as(admin, `update public.profiles set active=false, full_name='Bia S.' where id=$1`, [p2]);
ok(r.affectedRows === 1, 'admin desativa professor / edita nome');

console.log('professor desativado');
r = await as(p2, `select count(*)::int n from public.schedule_entries`);
ok(r.rows[0].n === 0, 'Bia desativada não lê mais células');
r = await as(p2, `update public.schedule_entries set status='livre' where id=$1`, [other]);
ok(r.affectedRows === 0, 'Bia desativada não edita');

console.log('config (admin) + sync');
await as(admin, `update public.schedule_days set active=true where weekday=6`);
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1 and weekday=6`, [p1]);
ok(r.rows[0].n === 14, 'ativar sábado cria 14 células para Ana');
await as(admin, `insert into public.time_slots (start_time, duration_minutes, sort_order) values ('20:00', 60, 20)`);
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1`, [p1]);
ok(r.rows[0].n === 90, 'novo horário 20:00 cria células (6 dias x 15) p/ Ana: ' + r.rows[0].n);
ok(!!(await fails(admin, `insert into public.time_slots (start_time, duration_minutes) values ('20:00', 45)`)), 'não permite 2 horários ativos com mesmo início');

// ocupado sobrevive a desativar horário e a reativar
await as(admin, `update public.schedule_entries set status='ocupado', student_name='joao', student_code='9' where id=$1`, [own]);
const slot = (await db.query(`select time_slot_id from public.schedule_entries where id=$1`, [own])).rows[0].time_slot_id;
await as(admin, `update public.time_slots set active=false where id=$1`, [slot]);
await as(admin, `update public.time_slots set active=true where id=$1`, [slot]);
r = await db.query(`select student_name from public.schedule_entries where id=$1`, [own]);
ok(r.rows[0].student_name === 'joao', 'desativar/reativar horário preserva o aluno');
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1 and weekday=(select weekday from public.schedule_entries where id=$2) and time_slot_id=$3`, [p1, own, slot]);
ok(r.rows[0].n === 1, 'sync não duplica células');

// reativar professor recria/mantém células
await as(admin, `update public.profiles set active=true where id=$1`, [p2]);
r = await as(p2, `select count(*)::int n from public.schedule_entries`);
ok(r.rows[0].n === 90, 'Bia reativada volta a ver as células: ' + r.rows[0].n);

console.log('\nhorário customizado (actual_start_time / actual_end_time)');
const slotStart = (await db.query(`select start_time from public.time_slots where id=$1`, [slot])).rows[0].start_time;
const addMin = (t, m) => {
  const [h, mi] = t.split(':').map(Number);
  const total = ((h * 60 + mi + m) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
};

r = await as(p1, `update public.schedule_entries set actual_start_time=$2, actual_end_time=$3 where id=$1 returning actual_start_time, actual_end_time`, [own, addMin(slotStart, 30), addMin(slotStart, 90)]);
ok(r.rows[0].actual_start_time === addMin(slotStart, 30) && r.rows[0].actual_end_time === addMin(slotStart, 90), 'Ana define hora customizada na própria célula');

r = await as(p1, `update public.schedule_entries set actual_start_time=null, actual_end_time=null where id=$1 returning actual_start_time`, [own]);
ok(r.rows[0].actual_start_time === null, '"Usar horário padrão" limpa os dois campos');

ok(!!(await fails(p1, `update public.schedule_entries set actual_start_time=$2 where id=$1`, [own, addMin(slotStart, 30)])), 'rejeita hora customizada com só um dos campos preenchido');
ok(!!(await fails(p1, `update public.schedule_entries set actual_start_time=$2, actual_end_time=$3 where id=$1`, [own, addMin(slotStart, 30), addMin(slotStart, 45)])), 'rejeita duração customizada diferente de 60 minutos');
ok(!!(await fails(p1, `update public.schedule_entries set actual_start_time=$2, actual_end_time=$3 where id=$1`, [own, addMin(slotStart, -30), addMin(slotStart, 30)])), 'rejeita hora customizada antes do horário padrão da linha');

r = await as(p1, `update public.schedule_entries set actual_start_time=$2, actual_end_time=$3 where id=$1 returning id`, [other, addMin(slotStart, 30), addMin(slotStart, 90)]);
ok(r.affectedRows === 0, 'Ana não consegue customizar a hora de uma célula da Bia');

console.log('\ncadastro / aprovação de professores');

// cadastro novo: nasce pendente mesmo mandando role/status forjados no metadata
const pendId = (
  await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    ['carlos@x.com', JSON.stringify({ full_name: 'Carlos Pendente', role: 'admin', approval_status: 'aprovado' })],
  )
).rows[0].id;
r = await db.query(`select role, approval_status, active, full_name from public.profiles where id=$1`, [pendId]);
ok(r.rows[0].role === 'professor' && r.rows[0].approval_status === 'pendente', 'cadastro novo nasce professor + pendente mesmo mandando role/status forjados');
ok(r.rows[0].full_name === 'Carlos Pendente', 'o nome informado é aceito (só role/status forjados são ignorados)');

// sem nome nenhum -> full_name fica nulo (sem cair para o e-mail)
const semNomeId = await mk('semnome@x.com', null);
r = await db.query(`select full_name from public.profiles where id=$1`, [semNomeId]);
ok(r.rows[0].full_name === null, 'cadastro sem nome fica com full_name nulo (sem usar o e-mail)');

// pendente: só lê o próprio profile, nada de agenda/dias/horários
r = await as(pendId, `select id from public.profiles`);
ok(r.rows.length === 1 && r.rows[0].id === pendId, 'pendente só enxerga o próprio profile');
ok(!!(await failsSelect(pendId, `select * from public.schedule_entries`)), 'pendente não lê nenhuma schedule_entry');
ok(!!(await failsSelect(pendId, `select * from public.schedule_days`)), 'pendente não lê schedule_days');
ok(!!(await failsSelect(pendId, `select * from public.time_slots`)), 'pendente não lê time_slots');
ok(!!(await fails(pendId, `update public.profiles set approval_status='aprovado' where id=$1`, [pendId])), 'pendente não se autoaprova');
ok(!!(await fails(pendId, `update public.profiles set active=false where id=$1`, [pendId])), 'pendente não muda o próprio active');
ok(!!(await fails(pendId, `update public.profiles set role='admin' where id=$1`, [pendId])), 'pendente não muda o próprio role');

// set_my_name: só o próprio; nome inválido é rejeitado
r = await as(pendId, `select * from set_my_name('matheus', 'sedrez')`);
ok(r.rows[0].full_name === 'Matheus Sedrez', 'set_my_name normaliza e capitaliza o nome');
r = await db.query(`select full_name from public.profiles where id=$1`, [p1]);
ok(r.rows[0].full_name === 'Ana Souza', 'set_my_name de um usuário não muda o nome de outro');
ok(!!(await failsSelect(pendId, `select * from set_my_name('ana1', 'valida')`)), 'set_my_name rejeita nome com número');
ok(!!(await failsSelect(pendId, `select * from set_my_name('a', 'valida')`)), 'set_my_name rejeita nome muito curto');
ok(!!(await failsSelect(pendId, `select * from set_my_name('', '')`)), 'set_my_name rejeita nome vazio');
r = await as(pendId, `select * from set_my_name('joão da', 'silva e souza')`);
ok(r.rows[0].full_name === 'João da Silva e Souza', 'set_my_name deixa partículas (da/e) minúsculas, exceto a primeira palavra');

// admin aprova -> grade nasce (mesmo mecanismo de sync de sempre)
r = await as(admin, `update public.profiles set approval_status='aprovado' where id=$1`, [pendId]);
ok(r.affectedRows === 1, 'admin aprova o pendente');
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1`, [pendId]);
ok(r.rows[0].n === 90, 'aprovar cria a grade do professor (mesma lógica de sync): ' + r.rows[0].n);
r = await as(pendId, `select count(*)::int n from public.schedule_entries where professor_id=$1`, [pendId]);
ok(r.rows[0].n === 90, 'depois de aprovado, o professor já enxerga a própria agenda');

// recusado: sem acesso, sem grade
const recId = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, ['dani@x.com', JSON.stringify({ full_name: 'Dani Recusada' })])).rows[0].id;
r = await as(admin, `update public.profiles set approval_status='recusado' where id=$1`, [recId]);
ok(r.affectedRows === 1, 'admin recusa o cadastro');
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1`, [recId]);
ok(r.rows[0].n === 0, 'recusado não ganha grade nenhuma');
ok(!!(await failsSelect(recId, `select * from public.schedule_entries`)), 'recusado não lê agenda nenhuma');
ok(!!(await failsSelect(recId, `select * from public.schedule_days`)), 'recusado não lê schedule_days');
r = await as(recId, `select id from public.profiles`);
ok(r.rows.length === 1 && r.rows[0].id === recId, 'recusado ainda lê o próprio profile (tela de recusado / completar nome)');

// "aprovar mesmo assim" um recusado também funciona
r = await as(admin, `update public.profiles set approval_status='aprovado' where id=$1`, [recId]);
ok(r.affectedRows === 1, 'admin aprova um recusado ("aprovar mesmo assim")');
r = await db.query(`select count(*)::int n from public.schedule_entries where professor_id=$1`, [recId]);
ok(r.rows[0].n === 90, 'grade nasce ao aprovar um recusado também');

// admin (is_admin) exige approval_status aprovado também
const fakeAdminId = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, ['fake@x.com', JSON.stringify({ full_name: 'Fake Admin' })])).rows[0].id;
await db.query(`update public.profiles set role='admin' where id=$1`, [fakeAdminId]); // promovido, mas ainda pendente
ok(!!(await fails(fakeAdminId, `update public.schedule_days set active=true where weekday=7`)), 'admin promovido mas ainda pendente não age como admin');

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
