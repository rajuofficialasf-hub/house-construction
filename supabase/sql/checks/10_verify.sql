-- =====================================================================
-- checks/10_verify.sql — SQL ১০ এর পরে যাচাই (পর্ব ২, M-ধাপ ২ · চেকলিস্ট সারি ২৬)
-- ✅ শুধু পড়ে। anon-পরীক্ষাটি একটি সাব-ট্রানজেকশনে চলে আর নিজে ফিরে যায় — কিছুই বদলায় না।
--
-- M-ধাপ ১ এর লাইভ বেসলাইনের (২০২৬-১০-০৫ ০৪:৩১ UTC) সাথে মিলিয়ে প্রতিটি চেকের পাশে ✅ বা ❌ দেখায়।
-- 10b_project_guards.sql চালানোর পরেও এটি আবার চালানো যায় (একই ফল আসা উচিত)।
-- কোনো ❌ এলে পুরো টেবিলটি AI-কে পাঠান। বেসলাইনের পরে পুরনো প্যানেলে রেকর্ড যোগ/এডিট হয়ে থাকলে
-- রেকর্ডের চেক ❌ আসবে — তখন আগে checks/00_baseline.sql আবার চালিয়ে AI-কে পাঠাতে হবে।
--
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_10_verify()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  -- @@BASELINE-START (M-ধাপ ১ এর লাইভ বেসলাইন, docs/progress/HOUSING_PROGRESS.md → পর্ব ২ → "বেসলাইন মান"; বদলাবেন না)
  b_semi_n    integer := 10;
  b_semi_max  integer := 10;
  b_semi_fp   text    := '00d0caccb068e709ba485e5b620d065b';
  b_tin_n     integer := 0;
  b_prev      integer := 1;
  b_cur       integer := 3;
  b_cnt_semi  integer := 10;
  b_cnt_tin   integer := 0;
  b_log_n     integer := 2;
  b_log_max   integer := 2;
  b_serial_ch integer := 0;
  b_stats_md5 text    := 'a93bfa85500c86b0e79db9cd201c2776';
  b_storage   integer := 8;
  -- @@BASELINE-END
  d        jsonb;
  cnt      bigint;
  acts     text;
  anon_r   bigint;
  anon_p   bigint;
  anon_f   bigint;
  priv     text;
  pkeys    text;
begin
  if to_regprocedure('asf_meta.data_fingerprint()') is null or to_regclass('public.projects') is null then
    n := 1; chk := '10_projects.sql চালানো হয়েছে?'; ok := '❌'; info := 'আগে 10_projects.sql চালান (সারি ২৬)';
    return next;
    return;
  end if;
  d := asf_meta.data_fingerprint();

  n := 1; chk := 'রেকর্ড: semi_pucca (সংখ্যা · সর্বোচ্চ সিরিয়াল)';
  ok := case when (d #>> '{records,semi_pucca,n}')::int = b_semi_n and (d #>> '{records,semi_pucca,max}')::int = b_semi_max then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(d #>> '{records,semi_pucca,n}', '0') || ' · ' || coalesce(d #>> '{records,semi_pucca,max}', '—') || ' (বেসলাইন ' || b_semi_n || ' · ' || b_semi_max || ')';
  return next;

  n := 2; chk := 'রেকর্ড: semi_pucca ফিঙ্গারপ্রিন্ট (প্রতিটি পুরনো মান)';
  ok := case when d #>> '{records,semi_pucca,fp}' = b_semi_fp then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(d #>> '{records,semi_pucca,fp}', '—');
  return next;

  n := 3; chk := 'রেকর্ড: tin';
  ok := case when coalesce((d #>> '{records,tin,n}')::int, 0) = b_tin_n then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(d #>> '{records,tin,n}', '0') || ' টি (বেসলাইন ' || b_tin_n || ')';
  return next;

  n := 4; chk := 'অন্য কোনো প্রকল্পে রেকর্ড নেই';
  select count(*) into cnt from public.housing_beneficiaries where project_type not in ('semi_pucca', 'tin');
  ok := case when cnt = 0 then '✅' else '❌' end;
  info := cnt || ' টি';
  return next;

  n := 5; chk := 'ছবি আছে এমন রেকর্ড (পূর্বের / বর্তমান)';
  ok := case when (d #>> '{photos,prev}')::int = b_prev and (d #>> '{photos,current}')::int = b_cur then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (d #>> '{photos,prev}') || ' / ' || (d #>> '{photos,current}') || ' (বেসলাইন ' || b_prev || ' / ' || b_cur || ')';
  return next;

  n := 6; chk := 'সিরিয়াল কাউন্টার (semi_pucca · tin)';
  ok := case when (d #>> '{counters,semi_pucca}')::int = b_cnt_semi and (d #>> '{counters,tin}')::int = b_cnt_tin then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (d #>> '{counters,semi_pucca}') || ' · ' || (d #>> '{counters,tin}') || ' (বেসলাইন ' || b_cnt_semi || ' · ' || b_cnt_tin || ')';
  return next;

  n := 7; chk := 'একটিভিটি লগ: বেসলাইনের পরে রেকর্ড-বদলের সারি নেই';
  select count(*), string_agg(distinct action, ', ') into cnt, acts
    from public.housing_activity_log where id > b_log_max;
  ok := case
          when (d #>> '{log,n}')::int < b_log_n then '❌ লগের সারি কমেছে'
          when exists (select 1 from public.housing_activity_log
                        where id > b_log_max and action in ('create', 'update', 'delete', 'photo_update', 'serial_change')) then '❌ রেকর্ড বদলেছে — বেসলাইন আবার নিন'
          else '✅' end;
  info := 'মোট ' || (d #>> '{log,n}') || ' · সর্বোচ্চ id ' || (d #>> '{log,max}') || ' · বেসলাইনের পরে নতুন ' || cnt || ' টি'
          || case when acts is not null then ' (' || acts || ')' else '' end;
  return next;

  n := 8; chk := 'সিরিয়াল-বদলের লগ';
  ok := case when (d ->> 'serial_changes')::int = b_serial_ch then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (d ->> 'serial_changes') || ' (বেসলাইন ' || b_serial_ch || ')';
  return next;

  n := 9; chk := 'housing_stats(null) — পুরনো সাইটের স্ট্যাট হুবহু';
  ok := case when d ->> 'stats_md5' = b_stats_md5 then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := d ->> 'stats_md5';
  return next;

  n := 10; chk := 'Storage: housing-photos এর ফাইল';
  select count(*) into cnt from storage.objects where bucket_id = 'housing-photos';
  ok := case when cnt = b_storage then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := cnt || ' (বেসলাইন ' || b_storage || ')';
  return next;

  n := 11; chk := 'projects: ৩টি সারি (housing গ্রুপ → semi_pucca, tin; সব প্রকাশিত)';
  select count(*) into cnt from public.projects
   where (key = 'housing' and is_group and is_published and parent_key is null and slug = 'housing')
      or (key = 'semi_pucca' and not is_group and is_published and parent_key = 'housing' and slug = 'semi-pucca'
          and photo_mode = 'before_after' and file_prefix = 'semi')
      or (key = 'tin' and not is_group and is_published and parent_key = 'housing' and slug = 'tin'
          and photo_mode = 'before_after' and file_prefix = 'tin');
  ok := case when cnt = 3 and (select count(*) from public.projects) = 3 then '✅' else '❌' end;
  info := (select string_agg(key || '→' || slug, ', ' order by sort_order, key) from public.projects);
  return next;

  n := 12; chk := 'রেকর্ড → প্রকল্প FK; পুরনো project_type CHECK বাদ';
  ok := case when exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_fkey')
              and not exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_check') then '✅' else '❌' end;
  info := 'housing_beneficiaries_project_type_fkey';
  return next;

  n := 13; chk := 'নতুন কলাম: সব রেকর্ডে union_name = '''' ও extra = {}';
  select count(*) into cnt from public.housing_beneficiaries where union_name <> '' or extra <> '{}'::jsonb;
  ok := case when cnt = 0 then '✅' else '❌' end;
  info := cnt || ' টি রেকর্ডে মান আছে (০ হওয়া উচিত)';
  return next;

  n := 14; chk := 'RLS চালু: projects, project_fields, beneficiary_private';
  select count(*) into cnt from pg_class
   where oid in ('public.projects'::regclass, 'public.project_fields'::regclass, 'public.beneficiary_private'::regclass) and relrowsecurity;
  ok := case when cnt = 3 then '✅' else '❌' end;
  info := cnt || '/৩';
  return next;

  n := 15; chk := 'প্রকাশিত প্রকল্প (public_project_keys)';
  pkeys := array_to_string(public.public_project_keys(), ', ');
  ok := case when public.public_project_keys() = array['housing', 'semi_pucca', 'tin'] then '✅' else '❌' end;
  info := pkeys;
  return next;

  -- anon (লগইন ছাড়া) হিসেবে দেখা — সাব-ট্রানজেকশনে, শেষে নিজে ফিরে যায়
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
    select count(*) into anon_r from public.housing_beneficiaries;
    select count(*) into anon_p from public.projects;
    select count(*) into anon_f from public.project_fields;
    begin
      perform 1 from public.beneficiary_private limit 1;
      priv := '❌ পড়া গেছে!';
    exception when insufficient_privilege then
      priv := 'অনুমতি নেই ✅';
    end;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      anon_r := -1;
      priv := sqlerrm;
    end if;
  end;

  n := 16; chk := 'লগইন ছাড়া (anon): পুরনো সাইটের মতো সব রেকর্ড দেখা যায়';
  ok := case when anon_r = b_semi_n + b_tin_n then '✅' else '❌' end;
  info := case when anon_r = -1 then 'পরীক্ষা চালানো যায়নি: ' || priv else anon_r || ' টি রেকর্ড' end;
  return next;

  n := 17; chk := 'লগইন ছাড়া (anon): প্রকল্প ও ফিল্ড; গোপন টেবিল বন্ধ';
  ok := case when anon_r <> -1 and anon_p = 3 and anon_f = 0 and priv like '%✅' then '✅' else '❌' end;
  info := case when anon_r = -1 then '—' else 'প্রকল্প ' || anon_p || ' · ফিল্ড ' || anon_f || ' · beneficiary_private: ' || priv end;
  return next;

  n := 18; chk := 'পরের কাজ';
  ok := '➡';
  info := 'সব ✅ হলে 10b_project_guards.sql চালান, তারপর checks/10b_selftest.sql (চেকলিস্ট সারি ২৭)';
  return next;
end;
$f$;

select n as "#", chk as "চেক", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_10_verify();
