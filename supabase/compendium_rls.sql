-- ============================================================================
--  Compendium — protéger les notes réservées au MJ
--  OPTIONNEL, à exécuter une fois dans : Supabase > SQL Editor > New query > Run.
--
--  Sans ce script, la table `board` laisse tout compte connecté lire toutes les
--  lignes : l'interface cache bien les notes non partagées aux joueurs, mais un
--  joueur curieux pourrait les lire en interrogeant l'API. Ces politiques sont
--  « restrictives » : elles s'ajoutent aux politiques existantes sans les
--  remplacer, et ne concernent que les lignes du Compendium (`wiki:…`).
--
--  Un joueur (user_metadata.role = 'player') :
--    - lit seulement les notes marquées `shared` par le MJ ;
--    - ne peut écrire que sur les notes déjà partagées (les éditeurs autorisés
--      par le menu), jamais sur les autres.
--
--  Limite : le rôle vient de `user_metadata`, que l'utilisateur peut modifier
--  lui-même. Pour une vraie garantie, fixer le rôle dans `app_metadata` (non
--  modifiable côté client) et remplacer `user_metadata` par `app_metadata`
--  ci-dessous. Pour annuler : drop policy "wiki read"/"wiki update"/"wiki insert".
-- ============================================================================

drop policy if exists "wiki read"   on public.board;
drop policy if exists "wiki update" on public.board;
drop policy if exists "wiki insert" on public.board;

create policy "wiki read" on public.board
  as restrictive for select to authenticated
  using (
    id not like 'wiki:%'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'player'
    or coalesce(data ->> 'shared', 'false') = 'true'
  );

create policy "wiki update" on public.board
  as restrictive for update to authenticated
  using (
    id not like 'wiki:%'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'player'
    or coalesce(data ->> 'shared', 'false') = 'true'
  )
  with check (
    id not like 'wiki:%'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'player'
    or coalesce(data ->> 'shared', 'false') = 'true'
  );

create policy "wiki insert" on public.board
  as restrictive for insert to authenticated
  with check (
    id not like 'wiki:%'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'player'
    or coalesce(data ->> 'shared', 'false') = 'true'
  );
