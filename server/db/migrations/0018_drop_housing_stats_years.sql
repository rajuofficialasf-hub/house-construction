-- The records' and projects' stats come from housing_project_stats (0016) and the years from the
-- records routes, so the single-project functions housing_stats and housing_years have no caller.
-- The down section recreates them as 0003 made them, with 0006's grant.

-- migrate:up
drop function public.housing_years(text);
drop function public.housing_stats(text);

-- migrate:down
create or replace function public.housing_stats(p_project_type text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select year, division, district, upazila
      from public.housing_beneficiaries
     where p_project_type is null or project_type = p_project_type
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_year', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select year::text as k, count(*) as c from base group by year) t
    ), '{}'::jsonb),
    'by_division', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select division as k, count(*) as c from base group by division) t
    ), '{}'::jsonb),
    'by_district', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select district as k, count(*) as c from base group by district) t
    ), '{}'::jsonb),
    'by_upazila', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select upazila as k, count(*) as c from base group by upazila) t
    ), '{}'::jsonb),
    'distinct', jsonb_build_object(
      'divisions', (select count(distinct division) from base),
      'districts', (select count(distinct district) from base),
      'upazilas',  (select count(*) from (select distinct district, upazila from base) u)
    ),
    'by_location', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select district || '|' || upazila as k, count(*) as c from base group by district, upazila) t
    ), '{}'::jsonb)
  );
$$;

create or replace function public.housing_years(p_project_type text default null)
returns table (year integer)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct b.year
    from public.housing_beneficiaries b
   where p_project_type is null or b.project_type = p_project_type
   order by b.year desc;
$$;

revoke all on function public.housing_stats(text), public.housing_years(text) from public;
grant execute on function public.housing_stats(text), public.housing_years(text) to housing_app;
