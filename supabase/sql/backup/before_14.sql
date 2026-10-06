-- =====================================================================
-- backup/before_14.sql — SQL 14 চালানোর আগের ব্যাকআপ (পর্ব চ, M-ধাপ ১৮ · চেকলিস্ট সারি ৩৫)
-- কাঠামো backup/before_12.sql এর মতো। 14 শুধু housing_admins এর ডাটা বদলায় (admin → editor), বাকি সব ফাংশন/পলিসি —
-- তবু নিরাপত্তার জন্য এডমিন, প্রকল্প, ফিল্ড ও গোপন মানের কপি রাখা হয়। নাম `*_m18_14`; লাইভে কিছুই বদলায় না।
-- আবার চালালে আগের কপি থেকে যায়; শেষের টেবিলে কপি আর লাইভের সারি-সংখ্যা মিলিয়ে দেখায়।
-- পরে: 14_project_users.sql
-- =====================================================================

begin;

create schema if not exists backup;
revoke all on schema backup from public;

create table if not exists backup.admins_m18_14              as table public.housing_admins;
create table if not exists backup.projects_m18_14            as table public.projects;
create table if not exists backup.project_fields_m18_14      as table public.project_fields;
create table if not exists backup.beneficiary_private_m18_14 as table public.beneficiary_private;

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
       case when copied = live then '✅ মিলেছে' else '❌ মেলেনি — AI-কে জানান' end as "ফল"
from (
  select 1 as k, 'housing_admins' as t, (select count(*) from backup.admins_m18_14) as copied, (select count(*) from public.housing_admins) as live
  union all select 2, 'projects', (select count(*) from backup.projects_m18_14), (select count(*) from public.projects)
  union all select 3, 'project_fields', (select count(*) from backup.project_fields_m18_14), (select count(*) from public.project_fields)
  union all select 4, 'beneficiary_private', (select count(*) from backup.beneficiary_private_m18_14), (select count(*) from public.beneficiary_private)
) x
order by k;
