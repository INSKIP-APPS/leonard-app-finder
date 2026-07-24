-- ──────────────────────────────────────────────────────────────────────
-- Rôle super_admin.
--
-- `profils.role` est un ENUM `public.user_role`. Ajouter une valeur d'enum et
-- l'utiliser dans la MÊME transaction est interdit par PostgreSQL — d'où deux
-- étapes : ÉTAPE 1 (add value, à committer seule), puis ÉTAPE 2 (le reste).
--
-- Modèle d'accès :
--   super_admin : tout (santé de la veille + sources & scraping + utilisateurs) ;
--   admin       : gestion des utilisateurs (invitations + rôles) ;
--   editeur     : lecture seule de la liste des utilisateurs ;
--   lecture     : aucun accès admin.
-- Seul un super_admin peut accorder ou retirer le rôle super_admin.
-- ──────────────────────────────────────────────────────────────────────

-- ═══ ÉTAPE 1 — à exécuter SEULE, puis committer ═══════════════════════
alter type public.user_role add value if not exists 'super_admin';


-- ═══ ÉTAPE 2 — à exécuter APRÈS l'étape 1 ═════════════════════════════

-- super_admin hérite de tous les pouvoirs admin (RLS + RPC via is_admin()).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (
  select 1 from public.profils where id = auth.uid() and role in ('admin', 'super_admin')
) $$;

create or replace function public.is_editor_or_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (
  select 1 from public.profils where id = auth.uid() and role in ('super_admin', 'admin', 'editeur')
) $$;

-- Trigger : admin OU super_admin peut changer un rôle ; seul un super_admin
-- peut accorder ou retirer le rôle super_admin.
create or replace function public.protect_role_change()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare r text := auth.role();
begin
  -- Bypass contextes non-utilisateur : service_role (Edge), postgres, direct DB.
  if r is null or r = 'service_role' or r = 'supabase_admin' then return new; end if;

  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profils where id = auth.uid() and role in ('admin', 'super_admin')
    ) then
      raise exception 'Seul un administrateur peut modifier le rôle d''un utilisateur';
    end if;
    if (new.role = 'super_admin' or old.role = 'super_admin')
       and not exists (
         select 1 from public.profils where id = auth.uid() and role = 'super_admin'
       ) then
      raise exception 'Seul un super administrateur peut accorder ou retirer le rôle super administrateur';
    end if;
  end if;
  return new;
end $$;

-- Recréation des RPC admin (drop des surcharges éventuelles puis create).
do $$
declare f record;
begin
  for f in
    select oid::regprocedure as sig from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('admin_set_role', 'admin_list_users')
  loop execute 'drop function ' || f.sig; end loop;
end $$;

-- Change le rôle d'un utilisateur (admin/super_admin ; super_admin requis pour super_admin).
create function public.admin_set_role(target_id uuid, new_role public.user_role)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.profils where id = auth.uid() and role in ('admin', 'super_admin')
  ) then
    raise exception 'accès refusé : réservé aux administrateurs';
  end if;
  if (new_role = 'super_admin'
      or (select role from public.profils where id = target_id) = 'super_admin')
     and not exists (
       select 1 from public.profils where id = auth.uid() and role = 'super_admin'
     ) then
    raise exception 'accès refusé : seul un super administrateur gère le rôle super administrateur';
  end if;
  update public.profils set role = new_role where id = target_id;
end $$;

-- Liste des utilisateurs — ouverte en lecture aux editeurs (consultation seule).
create function public.admin_list_users()
returns table (
  id uuid, email text, nom text, entite text,
  role public.user_role, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.is_editor_or_admin() then
    raise exception 'accès refusé : consultation réservée aux comptes autorisés';
  end if;
  return query
    select p.id, u.email::text, p.nom, p.entite, p.role, u.created_at, u.last_sign_in_at
    from public.profils p
    join auth.users u on u.id = p.id
    order by u.created_at;
end $$;

revoke all on function public.admin_set_role(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Promotion du compte super_admin (adapter l'email si besoin).
update public.profils
set role = 'super_admin'
where id = (select id from auth.users where lower(email) = lower('paul.desaintecroix@inskip.fr'));
