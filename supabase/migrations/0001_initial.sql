-- =============================================================================
-- Studio Personal — migração inicial
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute uma vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABELAS
-- -----------------------------------------------------------------------------

-- Perfil de cada usuário (1:1 com auth.users)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        text not null default 'professor' check (role in ('admin', 'professor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Dias da semana (7 linhas fixas; o admin liga/desliga). weekday: 1=segunda ... 7=domingo (ISO)
create table public.schedule_days (
  weekday     smallint primary key check (weekday between 1 and 7),
  label       text not null,
  active      boolean not null default false,
  sort_order  smallint not null
);

-- Horários da grade (editáveis). Remover = active=false (nunca DELETE físico).
create table public.time_slots (
  id                uuid primary key default gen_random_uuid(),
  start_time        time not null,
  duration_minutes  smallint not null check (duration_minutes between 5 and 600),
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

-- Só um horário ATIVO por hora de início (horários removidos não contam)
create unique index time_slots_active_start_uidx
  on public.time_slots (start_time) where active;

-- A célula da agenda: professor x dia x horário
create table public.schedule_entries (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.profiles (id) on delete cascade,
  weekday       smallint not null references public.schedule_days (weekday),
  time_slot_id  uuid not null references public.time_slots (id),
  status        text not null default 'indisponivel'
                  check (status in ('livre', 'ocupado', 'indisponivel')),
  student_name  text,
  student_code  text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,
  unique (professor_id, weekday, time_slot_id),
  constraint ocupado_requires_name
    check (status <> 'ocupado' or nullif(btrim(student_name), '') is not null)
);

create index schedule_entries_slot_idx    on public.schedule_entries (time_slot_id);
create index schedule_entries_weekday_idx on public.schedule_entries (weekday);
create index schedule_entries_status_idx  on public.schedule_entries (status);

-- -----------------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES E TRIGGERS
-- -----------------------------------------------------------------------------

-- O usuário logado é admin ativo? (SECURITY DEFINER para poder ler profiles
-- de dentro das políticas de RLS sem recursão)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;

-- O usuário logado está com a conta ativa?
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

-- Cria automaticamente o profile quando um usuário é criado no Supabase Auth.
-- O nome vem de user_metadata.full_name (se informado) ou do começo do e-mail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garante que exista uma célula para cada combinação
-- (professor ativo) x (dia ativo) x (horário ativo). Só INSERE o que falta,
-- com status 'indisponivel'. Nunca altera nem apaga células existentes.
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
  where p.role = 'professor' and p.active and d.active and t.active
  on conflict (professor_id, weekday, time_slot_id) do nothing;
$$;

create or replace function public.trg_sync_schedule_entries()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.sync_schedule_entries();
  return null;
end;
$$;

create trigger profiles_sync_entries
  after insert or update on public.profiles
  for each statement execute function public.trg_sync_schedule_entries();

create trigger time_slots_sync_entries
  after insert or update on public.time_slots
  for each statement execute function public.trg_sync_schedule_entries();

create trigger schedule_days_sync_entries
  after insert or update on public.schedule_days
  for each statement execute function public.trg_sync_schedule_entries();

-- Ao gravar uma célula: limpa aluno se não estiver ocupada, normaliza texto,
-- carimba quem e quando alterou.
create or replace function public.schedule_entries_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'ocupado' then
    new.student_name := null;
    new.student_code := null;
  else
    new.student_name := btrim(new.student_name);
    new.student_code := nullif(btrim(coalesce(new.student_code, '')), '');
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger schedule_entries_before_update
  before update on public.schedule_entries
  for each row execute function public.schedule_entries_before_update();

-- Só o próprio banco (triggers) e o service_role chamam essas funções
revoke execute on function public.sync_schedule_entries()      from public, anon, authenticated;
revoke execute on function public.trg_sync_schedule_entries()  from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.schedule_days    enable row level security;
alter table public.time_slots       enable row level security;
alter table public.schedule_entries enable row level security;

-- Privilégios de tabela (o RLS filtra linhas; os GRANTs limitam também as COLUNAS)
revoke all on public.profiles, public.schedule_days, public.time_slots, public.schedule_entries
  from anon, authenticated;

grant select on public.profiles         to authenticated;
grant update (full_name, active, role) on public.profiles to authenticated;

grant select on public.schedule_days    to authenticated;
grant update (active) on public.schedule_days to authenticated;

grant select, insert on public.time_slots to authenticated;
grant update (start_time, duration_minutes, active, sort_order) on public.time_slots to authenticated;

grant select on public.schedule_entries to authenticated;
grant update (status, student_name, student_code) on public.schedule_entries to authenticated;

grant all on public.profiles, public.schedule_days, public.time_slots, public.schedule_entries
  to service_role;

-- profiles: cada um lê o próprio; admin lê todos e edita nome/ativo/papel.
-- (INSERT só acontece pelo trigger de auth; não existe DELETE pelo app.)
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- schedule_days: qualquer usuário logado lê; só admin altera
create policy schedule_days_select on public.schedule_days
  for select to authenticated
  using (true);

create policy schedule_days_update_admin on public.schedule_days
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- time_slots: qualquer usuário logado lê; só admin cria/altera
create policy time_slots_select on public.time_slots
  for select to authenticated
  using (true);

create policy time_slots_insert_admin on public.time_slots
  for insert to authenticated
  with check (public.is_admin());

create policy time_slots_update_admin on public.time_slots
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- schedule_entries: professor ativo lê/edita SÓ as próprias; admin lê/edita todas.
-- Não há INSERT/DELETE para usuários: as linhas nascem pela sincronização.
create policy schedule_entries_select on public.schedule_entries
  for select to authenticated
  using (
    public.is_admin()
    or (professor_id = (select auth.uid()) and public.is_active_user())
  );

create policy schedule_entries_update on public.schedule_entries
  for update to authenticated
  using (
    public.is_admin()
    or (professor_id = (select auth.uid()) and public.is_active_user())
  )
  with check (
    public.is_admin()
    or (professor_id = (select auth.uid()) and public.is_active_user())
  );

-- -----------------------------------------------------------------------------
-- 4. CONFIGURAÇÃO INICIAL
-- -----------------------------------------------------------------------------

-- Dias: segunda a sexta ativos; sábado e domingo cadastrados mas desligados
insert into public.schedule_days (weekday, label, active, sort_order) values
  (1, 'Segunda-feira', true,  1),
  (2, 'Terça-feira',   true,  2),
  (3, 'Quarta-feira',  true,  3),
  (4, 'Quinta-feira',  true,  4),
  (5, 'Sexta-feira',   true,  5),
  (6, 'Sábado',        false, 6),
  (7, 'Domingo',       false, 7);

-- Horários: das 6:00 às 20:00, blocos de 60 min (último bloco começa às 19:00)
insert into public.time_slots (start_time, duration_minutes, sort_order)
select make_time(h, 0, 0), 60, h
from generate_series(6, 19) as h;

-- Usuários que já existiam no Auth antes desta migração ganham profile
insert into public.profiles (id, full_name, email)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
       u.email
from auth.users u
on conflict (id) do nothing;

select public.sync_schedule_entries();
