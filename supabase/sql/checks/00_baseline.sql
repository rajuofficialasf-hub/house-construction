-- =====================================================================
-- checks/00_baseline.sql — বেসলাইন (M-ধাপ ১, ২০২৬-১০-০৫)
-- ✅ শুধু পড়ে। ডাটাবেসে কিছুই বদলায় না (কোনো insert/update/delete/create নেই)।
--
-- কী করে: বহু-প্রকল্প মাইগ্রেশনের (SQL ১০–১২) আগে এখনকার অবস্থার একটি "ছবি" নেয়, যাতে পরে প্রমাণ করা যায়
-- লাইভ ডাটা অক্ষত আছে (docs/MULTI_PROJECT_PLAN.md §৬.৩)। ফলাফলটি পুরো কপি করে AI-কে পাঠান;
-- AI মানগুলো checks/10_verify.sql এ বসাবে।
--
-- চালানো: Supabase → SQL Editor → New query → এই পুরো ফাইল পেস্ট → Run। নিচে একটিই টেবিল আসবে।
--
-- ফিঙ্গারপ্রিন্টে শুধু পুরনো কলাম (updated_at বাদ; নতুন কলাম union_name/extra পরে আসবে, সেগুলোও বাদ),
-- সময় UTC তে — তাই সফল মাইগ্রেশনের পরেও একই মান আসবে।
-- =====================================================================

with
rec as (
  select project_type,
         count(*)       as records,
         max(serial_no) as max_serial,
         md5(string_agg(row(
           id, project_type, serial_no, year, name, father_or_husband_name,
           division, district, upazila, address,
           prev_photo_url, prev_thumb_url, current_photo_url, current_thumb_url,
           prev_photo_source, current_photo_source,
           photo_updated_at at time zone 'UTC', created_at at time zone 'UTC'
         )::text, E'\n' order by serial_no)) as fingerprint
  from public.housing_beneficiaries
  group by project_type
),
photos as (
  select count(*) filter (where prev_photo_url is not null)    as prev_n,
         count(*) filter (where current_photo_url is not null) as current_n
  from public.housing_beneficiaries
),
schema_items as (
  select 'col:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') as x
    from information_schema.columns
   where table_schema = 'public'
  union all
  select 'con:' || c.conrelid::regclass::text || '.' || c.conname || ':' || c.contype::text
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where n.nspname = 'public'
  union all
  select 'pol:' || schemaname || '.' || tablename || '.' || policyname || ':' || cmd
    from pg_policies
   where schemaname in ('public', 'storage')
  union all
  select 'fn:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'trg:' || t.tgrelid::regclass::text || '.' || t.tgname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
),
schema_fp as (
  select md5(string_agg(x, E'\n' order by x)) as fp, count(*) as n from schema_items
),
stats as (
  select public.housing_stats(null) as j
)
select k as "#", item as "বিষয়", val as "মান"
from (
  select 1 as k, 'বেসলাইন নেওয়ার সময় (UTC)' as item, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as val
  union all
  select 2, '09_activity_log.sql চালানো হয়েছে? (সারি ২৩)',
         case when to_regclass('public.housing_activity_log') is null
              then '❌ না — আগে 09_activity_log.sql চালান, তারপর এই ফাইল আবার'
              else '✅ হ্যাঁ' end
  union all
  select 10 + row_number() over (order by project_type),
         'রেকর্ড: ' || project_type,
         records || ' টি · সর্বোচ্চ সিরিয়াল ' || max_serial || ' · fingerprint ' || fingerprint
    from rec
  union all
  select 20, 'ছবি আছে এমন রেকর্ড (পূর্বের / বর্তমান)', prev_n || ' / ' || current_n from photos
  union all
  select 30 + row_number() over (order by project_type),
         'কাউন্টার: ' || project_type,
         last_serial::text
    from public.housing_serial_counters
  union all
  select 40, 'একটিভিটি লগ (মোট সারি · সর্বোচ্চ id)',
         case when to_regclass('public.housing_activity_log') is null then '— (টেবিল নেই)'
              else (xpath('/row/c/text()', query_to_xml(
                     'select count(*)::text || '' · '' || coalesce(max(id)::text, ''—'') as c from public.housing_activity_log',
                     false, true, '')))[1]::text end
  union all
  select 41, 'সিরিয়াল-বদলের লগ (মোট সারি)', (select count(*)::text from public.housing_serial_changes)
  union all
  select 50, 'housing_stats(null): total', j ->> 'total' from stats
  union all
  select 51, 'housing_stats(null): md5', md5(j::text) from stats
  union all
  select 52, 'housing_stats(null): JSON', j::text from stats
  union all
  select 60, 'স্কিমা-ফিঙ্গারপ্রিন্ট', fp || ' (' || n || ' আইটেম)' from schema_fp
  union all
  select 70, 'Storage: housing-photos এ ফাইল সংখ্যা',
         (select count(*)::text from storage.objects where bucket_id = 'housing-photos')
) t
order by k;
