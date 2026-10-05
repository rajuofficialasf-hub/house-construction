-- =====================================================================
-- backup/before_11.sql — SQL 11 চালানোর আগের ব্যাকআপ (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ২৮)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md §৬.৫ · কাঠামো backup/before_10.sql এর মতো
--
-- লাইভ টেবিলগুলোর হুবহু কপি `backup` স্কিমায় (API-তে খোলা নয়), নাম `*_m3_11`। লাইভে কিছুই বদলায় না।
-- আবার চালালে আগের কপি থেকে যায়; শেষের টেবিলে কপি আর লাইভের সারি-সংখ্যা মিলিয়ে দেখায়।
-- আগে (হাতে, ঐচ্ছিক কিন্তু ভালো): Table Editor → housing_beneficiaries → Export → CSV।
-- পরে: 11_project_rpcs.sql
-- =====================================================================

begin;

create schema if not exists backup;
revoke all on schema backup from public;

create table if not exists backup.beneficiaries_m3_11     as table public.housing_beneficiaries;
create table if not exists backup.serial_counters_m3_11   as table public.housing_serial_counters;
create table if not exists backup.activity_log_m3_11      as table public.housing_activity_log;
create table if not exists backup.serial_changes_m3_11    as table public.housing_serial_changes;
create table if not exists backup.admins_m3_11            as table public.housing_admins;
create table if not exists backup.projects_m3_11          as table public.projects;
create table if not exists backup.project_fields_m3_11    as table public.project_fields;
create table if not exists backup.beneficiary_private_m3_11 as table public.beneficiary_private;

revoke all on all tables in schema backup from public;
do $rv$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema backup from anon, authenticated';
    execute 'revoke all on all tables in schema backup from anon, authenticated';
  end if;
end
$rv$;

commit;

select t as "টেবিল", copied as "কপিতে সারি", live as "লাইভে সারি",
       case when copied = live then '✅ মিলেছে'
            when t = 'housing_activity_log' and copied < live then '✅ (কপির পরে নতুন লগ-সারি, যেমন লগইন — স্বাভাবিক)'
            else '❌ মেলেনি — AI-কে জানান' end as "ফল"
from (
  select 1 as k, 'housing_beneficiaries' as t, (select count(*) from backup.beneficiaries_m3_11) as copied, (select count(*) from public.housing_beneficiaries) as live
  union all select 2, 'housing_serial_counters', (select count(*) from backup.serial_counters_m3_11), (select count(*) from public.housing_serial_counters)
  union all select 3, 'housing_activity_log', (select count(*) from backup.activity_log_m3_11), (select count(*) from public.housing_activity_log)
  union all select 4, 'housing_serial_changes', (select count(*) from backup.serial_changes_m3_11), (select count(*) from public.housing_serial_changes)
  union all select 5, 'housing_admins', (select count(*) from backup.admins_m3_11), (select count(*) from public.housing_admins)
  union all select 6, 'projects', (select count(*) from backup.projects_m3_11), (select count(*) from public.projects)
  union all select 7, 'project_fields', (select count(*) from backup.project_fields_m3_11), (select count(*) from public.project_fields)
  union all select 8, 'beneficiary_private', (select count(*) from backup.beneficiary_private_m3_11), (select count(*) from public.beneficiary_private)
) x
order by k;
