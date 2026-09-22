-- =============================================================================
-- Studio Personal — autocadastro de professores com aprovação do admin
--
-- Segura para rodar UMA VEZ sobre o banco atual (projeto já em uso, com dados
-- reais): não apaga nem altera nenhuma agenda. Cole este arquivo inteiro no
-- SQL Editor do Supabase e execute depois da 0001_initial.sql.
--
-- IMPORTANTE — ORDEM DOS PASSOS MANUAIS (ver README.md):
--   1º rodar esta migração
--   2º só depois religar "Allow new users to sign up"
--   3º por fim desligar "Confirm email"
-- Rodar a migração DEPOIS de reabrir o cadastro público criaria uma janela em
-- que um cadastro poderia ser feito com o gatilho ainda antigo e, pior, ser
-- "adotado" pelo backfill abaixo (que aprova tudo que já existir no banco no
-- momento em que a migração roda). Rodando a migração primeiro, esse backfill
-- só alcança as contas que já existiam antes de hoje.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COLUNAS
-- -----------------------------------------------------------------------------

-- Nasce 'pendente' por padrão (vale tanto para quem já existe quanto para
-- quem for criado a partir de agora — o backfill no fim do arquivo promove
-- quem já existe para 'aprovado').
alter table public.profiles
  add column approval_status text not null default 'pendente'
    check (approval_status in ('pendente', 'aprovado', 'recusado'));

-- O e-mail nunca deve virar nome de exibição: quem se cadastra sem informar
-- nome fica com full_name vazio até completar o cadastro no app. Isso exige
-- que a coluna deixe de ser NOT NULL (era assim na 0001).
alter table public.profiles alter column full_name drop not null;

-- -----------------------------------------------------------------------------
-- 2. FUNÇÕES (redefinidas para considerar aprovação)
-- -----------------------------------------------------------------------------

-- Admin só conta se também estiver aprovado (toda conta nova nasce pendente,
-- inclusive uma futura conta de admin — ela precisa ser promovida por SQL,
-- igual hoje, e agora também aprovada; ver README).
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active and approval_status = 'aprovado'
  );
$$;

-- "Ativo" agora também exige estar aprovado — isso, sozinho, já tira
-- professores pendentes/recusados de schedule_entries (a policy dessa tabela
-- usa esta função) sem precisar mexer nas policies de schedule_entries.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and approval_status = 'aprovado'
  );
$$;

-- Cria o profile quando um usuário é criado no Supabase Auth.
-- NUNCA lê role/approval_status do raw_user_meta_data (metadata é controlada
-- pela própria pessoa que se cadastra) — só o nome. Toda conta nova é
-- professor + pendente, sempre, sem exceção nem para quem manda metadata
-- forjada. Sem fallback para o e-mail: sem nome informado, fica sem nome
-- (a tela "Complete seu cadastro" cobre esse caso no app).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, approval_status)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email,
    'professor',
    'pendente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A grade só nasce para quem já foi aprovado (além de ativo). Aprovar um
-- professor (UPDATE em approval_status) já dispara o mesmo gatilho de sempre
-- (profiles_sync_entries) e cria a grade dele — nenhum código novo para isso.
create or replace function public.sync_schedule_entries()
returns void
language sql security definer
set search_path = public
as $$
  insert into public.schedule_entries (professor_id, weekday, time_slot_id, status)
  select p.id, d.weekday, t.id, 'indisponivel'
  from public.profiles p
  cross join public.schedule_days d
  cross join public.time_slots t
  where p.role = 'professor' and p.active and p.approval_status = 'aprovado' and d.active and t.active
  on conflict (professor_id, weekday, time_slot_id) do nothing;
$$;

-- Permite à PRÓPRIA pessoa logada corrigir o próprio nome (pendente,
-- recusada ou aprovada — qualquer uma) sem abrir uma policy genérica de
-- UPDATE em profiles. Valida e normaliza no banco (não confia no front-end):
-- nome e sobrenome com só letras (acentos, espaço, hífen e apóstrofo
-- permitidos), sem números, mínimo 2 letras cada. Reaproveita a mesma
-- capitalização usada no cadastro ("matheus sedrez" -> "Matheus Sedrez",
-- partículas da/de/do/dos/das/e minúsculas, exceto se forem a primeira
-- palavra).
create or replace function public.set_my_name(p_first_name text, p_last_name text)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_full  text;
  v_row   public.profiles;
begin
  if v_first !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]+([ ''-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$'
     or length(regexp_replace(v_first, '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) < 2 then
    raise exception 'Nome inválido: use só letras, com pelo menos 2 letras.';
  end if;
  if v_last !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]+([ ''-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$'
     or length(regexp_replace(v_last, '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) < 2 then
    raise exception 'Sobrenome inválido: use só letras, com pelo menos 2 letras.';
  end if;

  select string_agg(
           case
             when i > 1 and lower(word) in ('da', 'de', 'do', 'dos', 'das', 'e') then lower(word)
             else upper(left(word, 1)) || lower(substring(word from 2))
           end,
           ' ' order by i
         )
    into v_full
  from unnest(regexp_split_to_array(v_first || ' ' || v_last, '\s+')) with ordinality as t(word, i);

  update public.profiles set full_name = v_full
  where id = (select auth.uid())
  returning * into v_row;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.set_my_name(text, text) from public, anon;
grant execute on function public.set_my_name(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS: dias e horários deixam de ser legíveis por quem não está aprovado
-- -----------------------------------------------------------------------------
-- (schedule_entries não precisa mudar: já usa is_active_user(), redefinida
-- acima. profiles também não precisa mudar: cada um já só lia o próprio
-- registro ou tudo, se admin — isso continua valendo para pendente/recusado,
-- que é exatamente o que a tela de aguardando/recusado e a de completar
-- cadastro precisam.)

drop policy if exists schedule_days_select on public.schedule_days;
create policy schedule_days_select on public.schedule_days
  for select to authenticated
  using (public.is_active_user());

drop policy if exists time_slots_select on public.time_slots;
create policy time_slots_select on public.time_slots
  for select to authenticated
  using (public.is_active_user());

-- Admin aprova/recusa com um UPDATE comum (mesma policy profiles_update_admin
-- de sempre); só falta liberar a coluna.
grant update (approval_status) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 4. BACKFILL — quem já existe hoje fica aprovado (roda uma vez, agora)
-- -----------------------------------------------------------------------------
-- Alcança só as contas já cadastradas neste exato momento (inclusive o
-- admin). É por isso que a ordem dos passos manuais importa: rodar esta
-- migração ANTES de reabrir o cadastro público garante que nenhuma conta
-- criada depois de hoje seja varrida para dentro deste UPDATE.
update public.profiles set approval_status = 'aprovado';
