-- =============================================================================
-- Studio Personal — código do aluno obrigatório em horários ocupados
--
-- Segura para rodar UMA VEZ sobre o banco atual. Cole no SQL Editor do Supabase
-- depois da 0003_actual_times.sql.
--
-- Por que uma CHECK e não "student_code NOT NULL": student_code é nulo por
-- desenho em toda célula LIVRE ou INDISPONÍVEL (a grade nasce assim, e o trigger
-- limpa aluno/código fora de "ocupado"). NOT NULL na coluna quebraria a criação
-- da grade. A regra "obrigatório" vale onde o código existe: em células
-- OCUPADAS, do mesmo jeito que o nome do aluno (constraint ocupado_requires_name).
-- =============================================================================

-- 1. Backfill: células ocupadas que já existem sem código ganham 'N/A'.
--    O trigger é desligado só durante este UPDATE para não carimbar
--    updated_at/updated_by nem revalidar horários antigos.
alter table public.schedule_entries disable trigger schedule_entries_before_update;

update public.schedule_entries
set student_code = 'N/A'
where status = 'ocupado' and nullif(btrim(coalesce(student_code, '')), '') is null;

alter table public.schedule_entries enable trigger schedule_entries_before_update;

-- 2. Constraint (valida as linhas existentes — por isso o backfill vem antes)
alter table public.schedule_entries
  add constraint ocupado_requires_code
    check (status <> 'ocupado' or nullif(btrim(student_code), '') is not null);

-- 3. Mensagem amigável: o trigger (mesma função da 0001/0003) recusa antes da
--    constraint com um texto claro.
create or replace function public.schedule_entries_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_slot_start time;
begin
  if new.status <> 'ocupado' then
    new.student_name := null;
    new.student_code := null;
  else
    new.student_name := btrim(new.student_name);
    new.student_code := nullif(btrim(coalesce(new.student_code, '')), '');
    if new.student_code is null then
      raise exception 'Código é obrigatório';
    end if;
  end if;

  if (new.actual_start_time is null) <> (new.actual_end_time is null) then
    raise exception 'Hora customizada precisa vir com início e fim juntos (ou nenhum dos dois).';
  end if;

  if new.actual_start_time is not null then
    if new.actual_end_time <> new.actual_start_time + interval '60 minutes' then
      raise exception 'O horário customizado precisa durar exatamente 60 minutos.';
    end if;

    select start_time into v_slot_start from public.time_slots where id = new.time_slot_id;
    if v_slot_start is not null and new.actual_start_time < v_slot_start then
      raise exception 'A hora customizada não pode ser antes do horário padrão desta linha (%).', to_char(v_slot_start, 'HH24:MI');
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
