-- ============================================================================
--  Repaire des Contes Malveillants — schéma Supabase
--  À exécuter une fois dans : Supabase > SQL Editor > New query > Run.
-- ============================================================================

-- 1) Table d'état : une seule ligne ('main') contenant tout le tableau de bord
--    sous forme JSON. Simple, suffisant pour un outil à deux.
create table if not exists public.board (
  id          text primary key default 'main',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.board (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- 2) RLS : seuls les comptes connectés lisent / écrivent.
alter table public.board enable row level security;

drop policy if exists "board read"   on public.board;
drop policy if exists "board update" on public.board;
drop policy if exists "board insert" on public.board;

create policy "board read"   on public.board for select
  to authenticated using (true);
create policy "board update" on public.board for update
  to authenticated using (true) with check (true);
create policy "board insert" on public.board for insert
  to authenticated with check (true);

-- 3) Temps réel : notifier les clients à chaque changement de la ligne.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board'
  ) then
    execute 'alter publication supabase_realtime add table public.board';
  end if;
end $$;

-- 4) Stockage des captures d'écran (bucket public en lecture, écriture connectée).
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

drop policy if exists "screens read"   on storage.objects;
drop policy if exists "screens write"  on storage.objects;
drop policy if exists "screens delete" on storage.objects;

create policy "screens read" on storage.objects for select
  using (bucket_id = 'screenshots');
create policy "screens write" on storage.objects for insert
  to authenticated with check (bucket_id = 'screenshots');
create policy "screens delete" on storage.objects for delete
  to authenticated using (bucket_id = 'screenshots');

-- ============================================================================
--  Créer les 2 comptes ensuite : Supabase > Authentication > Users > Add user
--  (« Auto Confirm User » coché). Aucun écran d'inscription dans l'app.
-- ============================================================================
