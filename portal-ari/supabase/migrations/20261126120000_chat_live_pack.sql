-- Chat da live dentro de um pack. Idempotente: pode rodar mais de uma vez.
--
-- Quem vê e quem escreve: as mesmas pessoas que enxergam a live do pack
-- (a RLS de pack_itens só mostra o item para quem tem o pack dentro do prazo, e para o admin).
-- O nome do autor e o user_id são preenchidos pelo banco (o aluno não consegue se passar por outro).

do $$
declare
  tipo_id text;
begin
  -- Usa o mesmo tipo da coluna pack_itens.id (uuid ou número), seja qual for.
  select format_type(atttypid, atttypmod) into tipo_id
    from pg_attribute
   where attrelid = 'public.pack_itens'::regclass and attname = 'id';

  execute format($f$
    create table if not exists public.pack_live_chat (
      id         bigint generated always as identity primary key,
      item_id    %s not null references public.pack_itens (id) on delete cascade,
      user_id    uuid not null references auth.users (id) on delete cascade,
      autor      text not null default 'Aluno',
      texto      text not null check (char_length(btrim(texto)) between 1 and 500),
      created_at timestamptz not null default now()
    )$f$, tipo_id);
end $$;

create index if not exists pack_live_chat_item_idx on public.pack_live_chat (item_id, created_at);

-- Preenche autor e user_id a partir de quem está logado.
create or replace function public.pack_live_chat_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.autor := coalesce(
    nullif(btrim((select nome from public.profiles where id = auth.uid())), ''),
    'Aluno'
  );
  new.texto := btrim(new.texto);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pack_live_chat_autor on public.pack_live_chat;
create trigger trg_pack_live_chat_autor
  before insert on public.pack_live_chat
  for each row execute function public.pack_live_chat_autor();

alter table public.pack_live_chat enable row level security;

drop policy if exists pack_live_chat_ler on public.pack_live_chat;
create policy pack_live_chat_ler on public.pack_live_chat
  for select to authenticated
  using (exists (select 1 from public.pack_itens i where i.id = pack_live_chat.item_id and i.tipo = 'live'));

drop policy if exists pack_live_chat_escrever on public.pack_live_chat;
create policy pack_live_chat_escrever on public.pack_live_chat
  for insert to authenticated
  with check (
    auth.uid() is not null
    and exists (select 1 from public.pack_itens i where i.id = pack_live_chat.item_id and i.tipo = 'live')
  );

-- Admin pode apagar mensagem (moderação).
drop policy if exists pack_live_chat_admin_apagar on public.pack_live_chat;
create policy pack_live_chat_admin_apagar on public.pack_live_chat
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

revoke all on public.pack_live_chat from anon;
grant select, insert, delete on public.pack_live_chat to authenticated;

-- Mensagens novas chegam na hora para quem está na live (Realtime do Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pack_live_chat'
     ) then
    alter publication supabase_realtime add table public.pack_live_chat;
  end if;
end $$;
