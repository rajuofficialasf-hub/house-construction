-- A project's stats and the home-page overview, ported from supabase/sql/11_project_rpcs.sql
-- (project_stats, projects_overview).
-- Differences from the Supabase file:
--   * Names carry the server's housing_ prefix.
--   * Neither function knows who is asking. Supabase hid drafts through RLS; here the API passes
--     p_public_only (stats) or p_drafts (overview), already reduced to false for a visitor. With
--     p_public_only a group counts only its published children, and featured and without_photo
--     use the same leaves as the counts, so a draft child's records and photos never show.
--   * The stats always carry by_union ({} when light), so callers get one shape.
--   * by_project is one group-by joined to the leaf list, not a count per leaf.
--   * No RLS, asf_meta, fingerprints or grants to anon/authenticated.
--   (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P5 decisions")

-- migrate:up

-- The record-holding keys under p_key that a caller may count: all of them, or only the
-- published ones (whose group is published too) when p_public_only.
create function public.housing_project_counted_leaves(p_key text, p_public_only boolean)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(l order by l), '{}')
    from unnest(public.housing_project_leaf_keys(p_key)) as l
   where not p_public_only or l = any (public.housing_public_project_keys());
$$;

-- Counts by year and place, unions, per-project totals, and sums or breakdowns of the active public
-- money, number and category fields. p_light leaves out by_union's entries and by_value, which the
-- home page doesn't show. An unknown key gives zeros; the API answers 404 before calling this.
create function public.housing_project_stats(p_key text, p_light boolean, p_public_only boolean)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  leaves     text[] := public.housing_project_counted_leaves(p_key, p_public_only);
  res        jsonb;
  f          record;
  fields     jsonb := '{}'::jsonb;
  money_keys text[];
  v          jsonb;
begin
  with base as (
    select project_type, year, division, district, upazila, union_name
      from public.housing_beneficiaries
     where project_type = any (leaves)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_year', coalesce((select jsonb_object_agg(k, c) from (select year::text as k, count(*) as c from base group by year) t), '{}'::jsonb),
    'by_division', coalesce((select jsonb_object_agg(k, c) from (select division as k, count(*) as c from base group by division) t), '{}'::jsonb),
    'by_district', coalesce((select jsonb_object_agg(k, c) from (select district as k, count(*) as c from base group by district) t), '{}'::jsonb),
    'by_upazila', coalesce((select jsonb_object_agg(k, c) from (select upazila as k, count(*) as c from base group by upazila) t), '{}'::jsonb),
    'by_location', coalesce((select jsonb_object_agg(k, c) from (select district || '|' || upazila as k, count(*) as c from base group by district, upazila) t), '{}'::jsonb),
    'distinct', jsonb_build_object(
      'divisions', (select count(distinct division) from base),
      'districts', (select count(distinct district) from base),
      'upazilas',  (select count(*) from (select distinct district, upazila from base) u),
      'unions',    (select count(*) from (select distinct district, upazila, union_name from base where union_name <> '') u)
    ),
    'by_project', coalesce((
      select jsonb_object_agg(l, coalesce(c.n, 0))
        from unnest(leaves) as l
        left join (select project_type, count(*) as n from base group by project_type) c on c.project_type = l
    ), '{}'::jsonb),
    'by_union', case when p_light then '{}'::jsonb else coalesce((
      select jsonb_object_agg(k, c)
        from (select district || '|' || upazila || '|' || union_name as k, count(*) as c
                from base where union_name <> '' group by district, upazila, union_name) t
    ), '{}'::jsonb) end
  ) into res;

  -- Field keys are bound as values, never spliced into SQL. Sums take JSON numbers only.
  select coalesce(array_agg(distinct key), '{}') into money_keys
    from public.housing_project_fields
   where project_key = any (leaves) and is_active and visibility = 'public' and type in ('money', 'number');

  for f in select distinct key, type from public.housing_project_fields
            where project_key = any (leaves) and is_active and visibility = 'public' and type in ('money', 'number', 'category')
            order by key loop
    if f.type in ('money', 'number') then
      select jsonb_build_object('type', f.type, 'sum', coalesce(sum((extra ->> f.key)::numeric), 0), 'count', count(*))
        into v
        from public.housing_beneficiaries
       where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'number';
    else
      select jsonb_build_object('type', 'category', 'distinct', count(distinct extra ->> f.key))
        into v
        from public.housing_beneficiaries
       where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'string' and extra ->> f.key <> '';
      if not p_light then
        v := v || jsonb_build_object('by_value', coalesce((
          select jsonb_object_agg(c.val, jsonb_build_object('n', c.n, 'sums', c.sums))
            from (
              select g.val, g.n,
                     coalesce((
                       select jsonb_object_agg(mk, tot)
                         from (
                           select mk, sum((b2.extra ->> mk)::numeric) as tot
                             from public.housing_beneficiaries b2
                             cross join unnest(money_keys) as mk
                            where b2.project_type = any (leaves)
                              and b2.extra ->> f.key = g.val
                              and jsonb_typeof(b2.extra -> mk) = 'number'
                            group by mk
                         ) s
                     ), '{}'::jsonb) as sums
                from (
                  select extra ->> f.key as val, count(*) as n
                    from public.housing_beneficiaries
                   where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'string' and extra ->> f.key <> ''
                   group by extra ->> f.key
                ) g
            ) c
        ), '{}'::jsonb));
      end if;
    end if;
    fields := fields || jsonb_build_object(f.key, v);
  end loop;

  return res || jsonb_build_object('fields', fields);
end;
$$;

-- Every project a caller may see, in display order, each with light stats, its newest record with a
-- photo, and (with p_drafts) how many records still lack one; plus totals over the published
-- projects. p_drafts = true shows drafts and their records; the API sets it only for an admin.
create function public.housing_projects_overview(p_drafts boolean)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  pub        text[] := public.housing_public_project_keys();
  items      jsonb  := '[]'::jsonb;
  p          public.housing_projects%rowtype;
  leaves     text[];
  feat       jsonb;
  wp         bigint;
  pub_leaves text[];
begin
  for p in select * from public.housing_projects where p_drafts or key = any (pub) order by sort_order, key loop
    leaves := public.housing_project_counted_leaves(p.key, not p_drafts);
    select jsonb_build_object('thumb_url', coalesce(b.current_thumb_url, b.prev_thumb_url), 'name', b.name,
                              'serial_no', b.serial_no, 'project_type', b.project_type, 'photo_updated_at', b.photo_updated_at)
      into feat
      from public.housing_beneficiaries b
     where b.project_type = any (leaves) and coalesce(b.current_thumb_url, b.prev_thumb_url) is not null
     order by b.created_at desc, b.serial_no desc
     limit 1;
    wp := null;
    if p_drafts then
      select count(*) into wp from public.housing_beneficiaries where project_type = any (leaves) and current_photo_url is null;
    end if;
    items := items || jsonb_build_array(jsonb_build_object(
      'key', p.key, 'parent_key', p.parent_key, 'is_group', p.is_group, 'slug', p.slug,
      'name_bn', p.name_bn, 'name_en', p.name_en, 'summary_bn', p.summary_bn, 'summary_en', p.summary_en,
      'unit_bn', p.unit_bn, 'unit_en', p.unit_en, 'icon', p.icon, 'accent', p.accent, 'cover_path', p.cover_path,
      'photo_mode', p.photo_mode, 'sort_order', p.sort_order, 'is_published', p.is_published, 'show_on_home', p.show_on_home,
      'stat_cards', p.stat_cards,
      'stats', public.housing_project_stats(p.key, true, not p_drafts),
      'featured', feat,
      'without_photo', wp
    ));
  end loop;

  select coalesce(array_agg(key), '{}') into pub_leaves from public.housing_projects where not is_group and key = any (pub);
  return jsonb_build_object(
    'projects', items,
    'global', (
      select jsonb_build_object('projects', cardinality(pub_leaves), 'total', count(*), 'districts', count(distinct district))
        from public.housing_beneficiaries where project_type = any (pub_leaves)
    )
  );
end;
$$;

grant execute on function public.housing_project_counted_leaves(text, boolean) to housing_app;
grant execute on function public.housing_project_stats(text, boolean, boolean) to housing_app;
grant execute on function public.housing_projects_overview(boolean) to housing_app;

-- migrate:down
drop function public.housing_projects_overview(boolean);
drop function public.housing_project_stats(text, boolean, boolean);
drop function public.housing_project_counted_leaves(text, boolean);
