-- The editor role: a login limited to its assigned projects (or to every project with
-- all_projects), which may add and fill in records but never delete, empty or replace. The API
-- enforces every rule (NE-SEC-03); the database keeps the data whole. housing_app still can't
-- change a role directly: housing_admin_user_save, a security definer function, is the only way,
-- and it can't make a main admin.
-- Design: the P9b decisions in docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md

-- migrate:up
alter table public.housing_admins drop constraint housing_admins_role_check;
alter table public.housing_admins
  add constraint housing_admins_role_check check (role in ('admin', 'editor', 'main_admin')),
  -- Read only for an editor; a main admin and an admin always have every project.
  add column all_projects boolean not null default false;

-- An editor's projects. A key may be a leaf or a group; a group covers its children at query time.
create table public.housing_admin_projects (
  admin_id    uuid not null references public.housing_admins (id) on delete cascade,
  project_key text not null references public.housing_projects (key) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (admin_id, project_key)
);
create index housing_admin_projects_project_key_idx on public.housing_admin_projects (project_key);

revoke all on public.housing_admin_projects from public;
grant select on public.housing_admin_projects to housing_app;

-- The keys an editor may work in: its assigned keys, every child of an assigned group (also ones
-- added later), and the parent of an assigned child. The parent is there only so the editor sees
-- its group in menus and logs; a group holds no records, and settings refuse every editor.
create function public.housing_admin_project_keys(p_admin uuid)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select p.key as k
      from public.housing_admin_projects ap
      join public.housing_projects p on p.key = ap.project_key or p.parent_key = ap.project_key
     where ap.admin_id = p_admin
    union
    select p.parent_key
      from public.housing_admin_projects ap
      join public.housing_projects p on p.key = ap.project_key
     where ap.admin_id = p_admin and p.parent_key is not null
  ) x;
$$;

-- Saves an existing login's role, projects and status, for the main admin's users page. The route
-- checks the caller is the main admin; this function keeps the data whole. It locks the target row
-- as the login does, so a login racing a disable either finishes first (and its session is deleted
-- here) or sees the admin disabled. Refusals are HC400 with the field in DETAIL.
create function public.housing_admin_user_save(p_email text, p_role text, p_all_projects boolean, p_projects text[], p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target   public.housing_admins;
  editor   boolean := p_role = 'editor';
  active   boolean := coalesce(p_active, true);
  all_p    boolean := coalesce(p_all_projects, false) and p_role = 'editor';
  keys     text[] := coalesce((select array_agg(distinct btrim(x) order by btrim(x))
                                 from unnest(coalesce(p_projects, '{}')) x where btrim(x) <> ''), '{}');
  unknown  text;
begin
  if p_role is null or p_role not in ('admin', 'editor') then
    raise exception 'ভূমিকা হবে এডমিন অথবা প্রকল্পের ইউজার' using errcode = 'HC400', detail = 'role';
  end if;
  select * into target from public.housing_admins where email = lower(btrim(coalesce(p_email, ''))) for update;
  if not found then
    raise exception 'রেকর্ড পাওয়া যায়নি' using errcode = 'P0002', detail = 'email';
  end if;
  if target.role = 'main_admin' then
    raise exception 'মূল এডমিনকে এখান থেকে বদলানো যায় না' using errcode = 'HC400', detail = 'email';
  end if;
  select string_agg(k, ', ' order by k) into unknown
    from unnest(keys) k where not exists (select 1 from public.housing_projects p where p.key = k);
  if unknown is not null then
    raise exception 'অচেনা প্রকল্প: %', unknown using errcode = 'HC400', detail = 'projects';
  end if;
  if not (editor and not all_p) then
    keys := '{}';
  elsif active and cardinality(keys) = 0 then
    raise exception 'অন্তত একটি প্রকল্প বাছুন, অথবা "সব প্রকল্প" দিন' using errcode = 'HC400', detail = 'projects';
  end if;

  update public.housing_admins
     set role = p_role,
         all_projects = all_p,
         disabled_at = case when active then null else coalesce(target.disabled_at, now()) end,
         updated_at = now()
   where id = target.id;
  delete from public.housing_admin_projects where admin_id = target.id;
  insert into public.housing_admin_projects (admin_id, project_key) select target.id, k from unnest(keys) k;
  if not active then
    delete from public.housing_admin_sessions where admin_id = target.id;
  end if;
  perform public.housing_log_event('admin_user_update', jsonb_build_object(
    'email', target.email, 'role', p_role, 'all_projects', all_p, 'projects', to_jsonb(keys), 'active', active));
  return target.id;
end;
$$;

grant execute on function public.housing_admin_project_keys(uuid) to housing_app;
grant execute on function public.housing_admin_user_save(text, text, boolean, text[], boolean) to housing_app;

-- migrate:down
-- Editors become disabled admins with their sessions ended, so a rollback never widens anyone's
-- rights; the main admin re-enables whom they choose. Assignments and the all_projects flag are
-- lost (DB-MIG-05), acceptable before any deploy.
drop function public.housing_admin_user_save(text, text, boolean, text[], boolean);
drop function public.housing_admin_project_keys(uuid);
drop table public.housing_admin_projects;
delete from public.housing_admin_sessions where admin_id in (select id from public.housing_admins where role = 'editor');
update public.housing_admins set role = 'admin', disabled_at = coalesce(disabled_at, now()) where role = 'editor';
alter table public.housing_admins drop constraint housing_admins_role_check;
alter table public.housing_admins
  drop column all_projects,
  add constraint housing_admins_role_check check (role in ('admin', 'main_admin'));
