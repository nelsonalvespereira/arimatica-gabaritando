-- Ordem das questões dentro de cada assunto (a "lista" do Banco de Questões).
-- Idempotente: pode rodar mais de uma vez.
--
-- O admin define a ordem na tela "Simulados e Questões" → botão "Ordenar".
-- O aluno vê as questões nessa ordem e com essa numeração no Banco de Questões.
-- Questão sem ordem (null) fica no fim do assunto, pela data de cadastro.

alter table public.questoes add column if not exists ordem integer;

create index if not exists questoes_assunto_ordem_idx on public.questoes (assunto_id, ordem);

-- Recebe os ids na ordem desejada e grava 1, 2, 3... Só o admin pode chamar.
create or replace function public.reordenar_questoes(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Apenas o administrador pode ordenar as questões.' using errcode = '42501';
  end if;

  update public.questoes q
     set ordem = x.pos
    from unnest(p_ids) with ordinality as x(id, pos)
   where q.id = x.id;
end;
$$;

revoke all on function public.reordenar_questoes(uuid[]) from public, anon;
grant execute on function public.reordenar_questoes(uuid[]) to authenticated;
