-- Single-project stats and years (0006 grants them to housing_app; 0018 drops them).

-- migrate:up
-- =====================================================================
-- পরিসংখ্যান ও সালের তালিকা, এক প্রকল্প বা সব রেকর্ড মিলিয়ে।
-- =====================================================================

-- মোট, সাল/বিভাগ/জেলা/উপজেলা অনুযায়ী সংখ্যা, এবং distinct সংখ্যা। p_project_type null হলে দুই প্রকল্প মিলিয়ে।
-- উত্তর: {"total": 20, "by_year": {"2024": 12}, "by_division": {...}, "by_district": {...}, "by_upazila": {...},
--         "distinct": {"divisions": 8, "districts": 12, "upazilas": 12}, "by_location": {"কুড়িগ্রাম|উলিপুর": 1, ...}}
-- distinct.upazilas = distinct (district, upazila) জোড়া (একই নামের উপজেলা ভিন্ন জেলায় আলাদা গোনা হয়)।
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
    -- মানচিত্রের জন্য: "জেলা|উপজেলা" → সংখ্যা (একই নামের উপজেলা ভিন্ন জেলায় আলাদা)
    'by_location', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select district || '|' || upazila as k, count(*) as c from base group by district, upazila) t
    ), '{}'::jsonb)
  );
$$;

-- যেসব সালে ডাটা আছে, নতুন থেকে পুরনো। উত্তর: [{"year": 2025}, {"year": 2024}]
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

-- নোট: by_upazila শুধু উপজেলার নামে গোনা হয়; একই নামের উপজেলা (যেমন "সদর") ভিন্ন জেলায় থাকলে
-- একসাথে গোনা হবে। দরকার হলে পরে "জেলা › উপজেলা" কী ব্যবহার করা যাবে।

-- migrate:down
drop function if exists public.housing_years(text);
drop function if exists public.housing_stats(text);
