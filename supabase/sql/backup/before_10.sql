-- =====================================================================
-- backup/before_10.sql — SQL ১০/১০b চালানোর আগের ব্যাকআপ (পর্ব ২, M-ধাপ ২ · চেকলিস্ট সারি ২৫)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md §৬.৫
--
-- কী করে: লাইভ টেবিলগুলোর হুবহু কপি রাখে আলাদা `backup` স্কিমায় (API-তে খোলা নয়; anon/লগইন করা ব্যবহারকারী পড়তে পারে না)।
--   backup.beneficiaries_m2, backup.serial_counters_m2, backup.activity_log_m2, backup.serial_changes_m2, backup.admins_m2
-- Supabase ফ্রি প্ল্যানে point-in-time recovery নেই — তাই এই কপি আর Table Editor এর CSV এক্সপোর্টই রোলব্যাকের ভরসা।
-- লাইভ টেবিলে কিছুই বদলায় না। আবার চালালে আগের কপি থেকে যায় (মুছে নতুন করে নেয় না); শেষের টেবিলে
-- কপি আর লাইভের সারি-সংখ্যা মিলিয়ে দেখায় — না মিললে ❌ (তখন AI-কে জানান)।
--
-- আগে (হাতে): Supabase → Table Editor → housing_beneficiaries → Export → CSV; একইভাবে housing_serial_counters।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

begin;

create schema if not exists backup;
revoke all on schema backup from public;
do $rv$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema backup from anon, authenticated';
  end if;
end
$rv$;

create table if not exists backup.beneficiaries_m2   as table public.housing_beneficiaries;
create table if not exists backup.serial_counters_m2 as table public.housing_serial_counters;
create table if not exists backup.activity_log_m2    as table public.housing_activity_log;
create table if not exists backup.serial_changes_m2  as table public.housing_serial_changes;
create table if not exists backup.admins_m2          as table public.housing_admins;

revoke all on all tables in schema backup from public;
do $rv2$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema backup from anon, authenticated';
  end if;
end
$rv2$;

comment on schema backup is 'বহু-প্রকল্প মাইগ্রেশনের আগের কপি (M-ধাপ ২–৩)। API-তে খোলা নয়। মুছবেন না — রোলব্যাকের ভরসা।';

commit;

select t as "টেবিল", copied as "কপিতে সারি", live as "লাইভে সারি",
       case when copied = live then '✅ মিলেছে'
            when t = 'housing_activity_log' and copied < live then '✅ (কপির পরে নতুন লগ-সারি, যেমন লগইন — স্বাভাবিক)'
            else '❌ মেলেনি — AI-কে জানান' end as "ফল"
from (
  select 1 as k, 'housing_beneficiaries' as t,
         (select count(*) from backup.beneficiaries_m2) as copied, (select count(*) from public.housing_beneficiaries) as live
  union all
  select 2, 'housing_serial_counters', (select count(*) from backup.serial_counters_m2), (select count(*) from public.housing_serial_counters)
  union all
  select 3, 'housing_activity_log', (select count(*) from backup.activity_log_m2), (select count(*) from public.housing_activity_log)
  union all
  select 4, 'housing_serial_changes', (select count(*) from backup.serial_changes_m2), (select count(*) from public.housing_serial_changes)
  union all
  select 5, 'housing_admins', (select count(*) from backup.admins_m2), (select count(*) from public.housing_admins)
) x
order by k;
