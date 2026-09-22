-- =============================================================================
-- Studio Personal — horário customizado por célula (actual_start_time / actual_end_time)
--
-- Segura para rodar UMA VEZ sobre o banco atual: só adiciona colunas opcionais
-- (default nulo) em schedule_entries — nenhuma linha existente muda de valor.
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute depois da
-- 0002_aprovacao_professores.sql.
--
-- Por que assim: time_slots continua a grade padrão do studio (6:00, 7:00,
-- 8:00...), a mesma para todo mundo — é o que mantém a tela Horários do admin
-- e o mapa de calor do Painel limpos. actual_start_time/actual_end_time são um
-- ajuste OPCIONAL por célula: o professor pode dizer "esse horário, que mora
-- na linha das 7:00, na verdade é às 7:30" sem criar uma linha nova na grade
-- de ninguém. Vazio = usa o horário padrão do time_slot, como sempre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COLUNAS
-- -----------------------------------------------------------------------------

alter table public.schedule_entries
  add column actual_start_time time null,
  add column actual_end_time   time null;

-- -----------------------------------------------------------------------------
-- 2. VALIDAÇÃO (redefine o trigger de sempre — mesma função da 0001)
-- -----------------------------------------------------------------------------
-- Continua limpando aluno fora de "ocupado" e carimbando quem/quando alterou;
-- só ganhou a validação do horário customizado:
--   - os dois campos vêm juntos (ambos nulos ou ambos preenchidos)
--   - a duração é sempre 60 minutos (fixo — o app nem deixa escolher outra)
--   - não pode ser ANTES do horário padrão da linha em que a célula está
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

-- -----------------------------------------------------------------------------
-- 3. GRANT — mesmas pessoas que já editam status/aluno passam a poder
--    editar o horário customizado da própria célula (RLS de schedule_entries
--    não muda: a policy já existente é que decide QUAIS linhas).
-- -----------------------------------------------------------------------------
grant update (actual_start_time, actual_end_time) on public.schedule_entries to authenticated;
