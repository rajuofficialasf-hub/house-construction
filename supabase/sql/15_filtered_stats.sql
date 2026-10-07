-- =====================================================================
-- 15_filtered_stats.sql — ফিল্টার অনুযায়ী পরিসংখ্যান (চেকলিস্ট সারি ৩৭)
-- পূর্বশর্ত: 11_project_rpcs.sql (project_stats, project_leaf_keys), 14_project_users.sql (asf_meta)
--
-- কেন: তালিকা-পাতার পরিসংখ্যান-কার্ড এতদিন সবসময় প্রকল্পের মোট দেখাত; ফিল্টার (সাল, বিভাগ/জেলা/উপজেলা/ইউনিয়ন,
-- ক্যাটাগরি, সার্চ) দিলে কার্ডও সেই অনুযায়ী বদলাবে (ব্যবহারকারীর নির্দেশ, ২০২৬-১০-০৬)।
--
-- যা বদলায়: শুধু **একটি নতুন ফাংশন** project_stats_filtered(p_key, p_filters) — তালিকার ফিল্টারের হুবহু নিয়মে
-- (একই whitelist: শুধু পাবলিক, সক্রিয়, ফিল্টার-চালু ফিল্ড; সার্চ নাম/পিতা-স্বামী/ঠিকানা/সার্চ-চালু ফিল্ডে) গুনে
-- project_stats এর হালকা শেপে ফেরত দেয় (total, distinct, by_project, fields) + "filtered": true।
-- security invoker — RLS মেনে চলে (লগইন ছাড়া খসড়া/গোপন কিছু আসে না)। আগের project_stats অপরিবর্তিত।
-- কোনো টেবিল, ডাটা বা পলিসি বদলায় না; লাইভ ডাটার ফিঙ্গারপ্রিন্ট আগে-পরে মেলানো হয়।
--
-- ✅ এক ট্রানজেকশনে; ভুল হলে কিছুই বদলায় না। আবার চালালে ক্ষতি নেই। ডাটা বদলায় না বলে আলাদা ব্যাকআপ লাগে না।
--    ফেরাতে: rollback/15_rollback.sql · পূর্ণ যাচাই: checks/15_selftest.sql (শুধু পড়ে)
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run। শেষে একটিই ফলাফল-টেবিল।
-- =====================================================================

begin;

do $pre$
begin
  if to_regprocedure('public.project_stats(text,boolean)') is null or to_regprocedure('public.project_leaf_keys(text)') is null then
    raise exception 'আগে 11_project_rpcs.sql চালান — কিছুই বদলায়নি।';
  end if;
  if to_regprocedure('asf_meta.data_fingerprint()') is null then
    raise exception 'asf_meta.data_fingerprint() নেই — আগে 14_project_users.sql চালান। কিছুই বদলায়নি।';
  end if;
end
$pre$;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- ফাংশন
-- p_filters (সব ঐচ্ছিক; অচেনা/ভুল মান নীরবে বাদ — তালিকার মতোই):
--   { "year": 2025, "division": "…", "district": "…", "upazila": "…", "union_name": "…",
--     "fields": { "category": "গাভী", "amount": 120000 }, "q": "রহিমা" }
create or replace function public.project_stats_filtered(p_key text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  leaves      text[] := public.project_leaf_keys(p_key);
  flt         jsonb  := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  f_year      integer;
  f_div       text := nullif(normalize(btrim(coalesce(flt ->> 'division', '')), NFC), '');
  f_dist      text := nullif(normalize(btrim(coalesce(flt ->> 'district', '')), NFC), '');
  f_upa       text := nullif(normalize(btrim(coalesce(flt ->> 'upazila', '')), NFC), '');
  f_union     text := nullif(normalize(btrim(coalesce(flt ->> 'union_name', '')), NFC), '');
  f_q         text;
  pat         text;
  cond        jsonb := '{}'::jsonb;
  search_keys text[];
  num_keys    text[];
  cat_keys    text[];
  fk          text;
  fv          jsonb;
  ftype       text;
  res         jsonb;
begin
  if coalesce(flt ->> 'year', '') ~ '^[0-9]{1,4}$' then
    f_year := (flt ->> 'year')::integer;
  end if;

  -- সার্চ: তালিকার মতো (, ( ) % \ বাদ, ফাঁকা এক করে; * = যেকোনো অক্ষর — PostgREST এর ilike এর মতো)
  f_q := nullif(btrim(regexp_replace(regexp_replace(normalize(left(coalesce(flt ->> 'q', ''), 200), NFC), '[,()%\\]', ' ', 'g'), '\s+', ' ', 'g')), '');
  if f_q is not null then
    pat := '%' || replace(f_q, '*', '%') || '%';
  end if;

  -- কাস্টম ফিল্টার: শুধু পাবলিক, সক্রিয়, ফিল্টার-চালু ফিল্ড (whitelist); টাকা/সংখ্যায় JSON number, বাকিতে লেখা
  if jsonb_typeof(flt -> 'fields') = 'object' then
    for fk, fv in select e.key, e.value from jsonb_each(flt -> 'fields') e loop
      select pf.type into ftype
        from public.project_fields pf
       where pf.project_key = any (leaves) and pf.key = fk and pf.is_active and pf.visibility = 'public' and pf.filterable
       limit 1;
      continue when ftype is null;
      if ftype in ('money', 'number') then
        if jsonb_typeof(fv) = 'number' then
          cond := cond || jsonb_build_object(fk, fv);
        end if;
      elsif jsonb_typeof(fv) = 'string' and btrim(fv #>> '{}') <> '' then
        cond := cond || jsonb_build_object(fk, left(regexp_replace(normalize(fv #>> '{}', NFC), '\s+', ' ', 'g'), 100));
      end if;
    end loop;
  end if;

  select coalesce(array_agg(distinct pf.key) filter (where pf.searchable), '{}'),
         coalesce(array_agg(distinct pf.key) filter (where pf.type in ('money', 'number')), '{}'),
         coalesce(array_agg(distinct pf.key) filter (where pf.type = 'category'), '{}')
    into search_keys, num_keys, cat_keys
    from public.project_fields pf
   where pf.project_key = any (leaves) and pf.is_active and pf.visibility = 'public';

  with base as materialized (
    select b.project_type, b.year, b.division, b.district, b.upazila, b.union_name, b.extra
      from public.housing_beneficiaries b
     where b.project_type = any (leaves)
       and (f_year is null or b.year = f_year)
       and (f_div is null or b.division = f_div)
       and (f_dist is null or b.district = f_dist)
       and (f_upa is null or b.upazila = f_upa)
       and (f_union is null or b.union_name = f_union)
       and (cond = '{}'::jsonb or b.extra @> cond)
       and (pat is null
            or b.name ilike pat or b.father_or_husband_name ilike pat or b.address ilike pat
            or exists (select 1 from unnest(search_keys) sk where b.extra ->> sk ilike pat))
  ),
  nums as (
    select k, coalesce(sum((b.extra ->> k)::numeric), 0) as s, count(*) as c
      from base b cross join unnest(num_keys) k
     where jsonb_typeof(b.extra -> k) = 'number'
     group by k
  ),
  cats as (
    select k, count(distinct b.extra ->> k) as d
      from base b cross join unnest(cat_keys) k
     where jsonb_typeof(b.extra -> k) = 'string' and b.extra ->> k <> ''
     group by k
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'distinct', jsonb_build_object(
      'divisions', (select count(distinct division) from base),
      'districts', (select count(distinct district) from base),
      'upazilas',  (select count(*) from (select distinct district, upazila from base) u),
      'unions',    (select count(*) from (select distinct district, upazila, union_name from base where union_name <> '') u)
    ),
    'by_project', coalesce((select jsonb_object_agg(l, (select count(*) from base where project_type = l)) from unnest(leaves) as l), '{}'::jsonb),
    'fields', coalesce((
      select jsonb_object_agg(t.key,
               case when t.type in ('money', 'number')
                    then jsonb_build_object('type', t.type, 'sum', coalesce(n.s, 0), 'count', coalesce(n.c, 0))
                    else jsonb_build_object('type', 'category', 'distinct', coalesce(c.d, 0)) end)
        from (select distinct on (pf.key) pf.key, pf.type
                from public.project_fields pf
               where pf.project_key = any (leaves) and pf.is_active and pf.visibility = 'public'
                 and pf.type in ('money', 'number', 'category')
               order by pf.key, pf.type) t
        left join nums n on n.k = t.key
        left join cats c on c.k = t.key
    ), '{}'::jsonb),
    'filtered', true
  ) into res;

  return res;
end;
$$;
revoke all on function public.project_stats_filtered(text, jsonb) from public;
grant execute on function public.project_stats_filtered(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- নিজে পরীক্ষা: ফিল্টার ছাড়া = project_stats (প্রতিটি প্রকল্প)
do $self$
declare
  p    record;
  a    jsonb;
  b    jsonb;
  bad  text := '';
  n    integer := 0;
begin
  for p in select key from public.projects order by key loop
    a := public.project_stats_filtered(p.key, '{}'::jsonb);
    b := public.project_stats(p.key, true);
    if a -> 'total' is distinct from b -> 'total' or a -> 'distinct' is distinct from b -> 'distinct'
       or a -> 'by_project' is distinct from b -> 'by_project' or a -> 'fields' is distinct from b -> 'fields' then
      bad := bad || p.key || ' ';
    end if;
    n := n + 1;
  end loop;
  if bad <> '' then
    raise exception 'নিজে-পরীক্ষা ব্যর্থ: ফিল্টার ছাড়া ফল project_stats এর সাথে মেলেনি (%) — কিছুই বদলায়নি। ফলাফল AI-কে পাঠান।', btrim(bad);
  end if;
  drop table if exists pg_temp._asf_15;
  create temp table _asf_15 as select n as projects;
end
$self$;

do $fp$
declare
  before_fp jsonb := (select fp from _asf_fp_before);
  after_fp  jsonb := asf_meta.data_fingerprint();
begin
  if after_fp is distinct from before_fp then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি (পুরো ফাইল বাতিল)। ফলাফল AI-কে পাঠান।'
      using detail = 'আগে: ' || before_fp::text || ' | পরে: ' || after_fp::text;
  end if;
end
$fp$;

notify pgrst, 'reload schema';

commit;

select k as "#", item as "চেক", ok as "ফল", info as "বিস্তারিত"
from (
  select 1 as k, 'নতুন ফাংশন project_stats_filtered (লগইন ছাড়াও চলে, RLS মেনে)' as item,
         case when to_regprocedure('public.project_stats_filtered(text,jsonb)') is not null
               and has_function_privilege('anon', 'public.project_stats_filtered(text,jsonb)', 'execute') then '✅' else '❌' end as ok,
         'project_stats অপরিবর্তিত' as info
  union all
  select 2, 'নিজে-পরীক্ষা: ফিল্টার ছাড়া ফল = project_stats', '✅',
         coalesce((select projects from pg_temp._asf_15), 0)::text || 'টি প্রকল্পে মিলেছে'
  union all
  select 3, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট', '✅', 'অপরিবর্তিত (ভিন্ন হলে ফাইলটি নিজেই বাতিল হতো)'
) r
order by k;
