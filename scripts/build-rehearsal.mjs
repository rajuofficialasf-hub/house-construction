#!/usr/bin/env node
/**
 * রোলব্যাক-মহড়ার SQL তৈরি (পর্ব ২) — supabase/sql/rollback/10_12_rollback.sql এর BODY অংশ হুবহু নিয়ে
 * supabase/sql/checks/rollback_rehearsal.sql লেখে। মহড়া BODY চালায় একটি সাব-ট্রানজেকশনে, তারপর
 * স্কিমা ও ডাটার ফিঙ্গারপ্রিন্ট M-ধাপ ১ এর বেসলাইনের সাথে মেলায়, শেষে সব ফিরিয়ে দেয় — কিছুই বদলায় না।
 * SQL Editor এক ফাইল থেকে আরেক ফাইল টানতে পারে না, তাই এই স্ক্রিপ্ট দুটো ফাইলের বডি হুবহু এক রাখে।
 *
 * চালানো: npm run build-rehearsal   (রোলব্যাক ফাইলের BODY বদলালে প্রতিবার)
 * বেসলাইনের মান নিচের BASELINE অবজেক্টে (docs/progress/HOUSING_PROGRESS.md → পর্ব ২ → "বেসলাইন মান")।
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'supabase/sql/rollback/10_12_rollback.sql')
const OUT = path.join(ROOT, 'supabase/sql/checks/rollback_rehearsal.sql')

// M-ধাপ ১ এর লাইভ বেসলাইন (২০২৬-১০-০৫ ০৪:৩১ UTC)
const BASELINE = {
  schemaFp: 'b9468dd07eb1d3aeb006ccfce8eab643',
  schemaN: 83,
  semiN: 10,
  semiMax: 10,
  semiFp: '00d0caccb068e709ba485e5b620d065b',
  tinN: 0,
  cntSemi: 10,
  cntTin: 0,
  serialChanges: 0,
  statsMd5: 'a93bfa85500c86b0e79db9cd201c2776',
}

const src = fs.readFileSync(SRC, 'utf8')
const m = src.match(/-- @@BODY-START\r?\n([\s\S]*?)-- @@BODY-END/)
if (!m) {
  console.error('ত্রুটি: রোলব্যাক ফাইলে -- @@BODY-START / -- @@BODY-END পাওয়া যায়নি')
  process.exit(1)
}
const body = m[1]
if (body.includes('$rehearsal_body$')) {
  console.error('ত্রুটি: BODY তে $rehearsal_body$ আছে — ট্যাগ বদলান')
  process.exit(1)
}

const sql = `-- =====================================================================
-- checks/rollback_rehearsal.sql — রোলব্যাকের মহড়া (পর্ব ২ · চেকলিস্ট সারি ৩০) — ⚠ স্বয়ংক্রিয়ভাবে তৈরি, হাতে বদলাবেন না
-- তৈরি করে: npm run build-rehearsal (উৎস: supabase/sql/rollback/10_12_rollback.sql এর BODY)
--
-- ✅ কিছুই বদলায় না: রোলব্যাকের পুরো বডি একটি সাব-ট্রানজেকশনে চলে, স্কিমা ও ডাটার ফিঙ্গারপ্রিন্ট
--    M-ধাপ ১ এর বেসলাইনের সাথে মেলানো হয়, তারপর সব ফিরিয়ে দেওয়া হয়।
-- সব ✅ মানে: দরকার হলে রোলব্যাক ফাইলটি ডাটাবেসকে হুবহু SQL ১০-এর আগের অবস্থায় ফেরাতে পারবে।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_rollback_rehearsal()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  sch    jsonb;
  dat    jsonb;
  err    text;
  before_sch jsonb;
begin
  if to_regprocedure('asf_meta.schema_fingerprint()') is null then
    n := 1; chk := '10_projects.sql চালানো হয়েছে?'; ok := '❌'; info := 'asf_meta নেই — আগে 10_projects.sql';
    return next;
    return;
  end if;
  before_sch := asf_meta.schema_fingerprint();
  begin
    execute $rehearsal_body$
${body}$rehearsal_body$;
    sch := asf_meta.schema_fingerprint();
    dat := asf_meta.data_fingerprint();
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      err := sqlerrm;
    end if;
  end;

  if err is not null then
    n := 1; chk := 'রোলব্যাকের বডি চলেছে'; ok := '❌'; info := err;
    return next;
    return;
  end if;

  n := 1; chk := 'রোলব্যাকের বডি ত্রুটি ছাড়া চলেছে'; ok := '✅'; info := 'তারপর সব ফিরিয়ে দেওয়া হয়েছে';
  return next;

  n := 2; chk := 'স্কিমা-ফিঙ্গারপ্রিন্ট = বেসলাইন (SQL ১০-এর আগের কাঠামো)';
  ok := case when sch ->> 'fp' = '${BASELINE.schemaFp}' and (sch ->> 'n')::int = ${BASELINE.schemaN} then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (sch ->> 'fp') || ' (' || (sch ->> 'n') || ' আইটেম) · বেসলাইন ${BASELINE.schemaFp} (${BASELINE.schemaN})';
  return next;

  n := 3; chk := 'রেকর্ড (semi_pucca) = বেসলাইন';
  ok := case when (dat #>> '{records,semi_pucca,n}')::int = ${BASELINE.semiN} and (dat #>> '{records,semi_pucca,max}')::int = ${BASELINE.semiMax}
                  and dat #>> '{records,semi_pucca,fp}' = '${BASELINE.semiFp}' then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(dat #>> '{records,semi_pucca,n}', '0') || ' টি · ' || coalesce(dat #>> '{records,semi_pucca,fp}', '—');
  return next;

  n := 4; chk := 'রেকর্ড (tin) ও কাউন্টার = বেসলাইন';
  ok := case when coalesce((dat #>> '{records,tin,n}')::int, 0) = ${BASELINE.tinN}
                  and (dat #>> '{counters,semi_pucca}')::int = ${BASELINE.cntSemi} and (dat #>> '{counters,tin}')::int = ${BASELINE.cntTin}
             then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := 'tin ' || coalesce(dat #>> '{records,tin,n}', '0') || ' · কাউন্টার ' || (dat ->> 'counters');
  return next;

  n := 5; chk := 'housing_stats(null) ও সিরিয়াল-বদলের লগ = বেসলাইন';
  ok := case when dat ->> 'stats_md5' = '${BASELINE.statsMd5}' and (dat ->> 'serial_changes')::int = ${BASELINE.serialChanges}
             then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (dat ->> 'stats_md5') || ' · সিরিয়াল-বদল ' || (dat ->> 'serial_changes');
  return next;

  n := 6; chk := 'মহড়ার পরে বর্তমান কাঠামো অক্ষত (কিছুই বদলায়নি)';
  ok := case when asf_meta.schema_fingerprint() = before_sch then '✅' else '❌' end;
  info := before_sch ->> 'fp';
  return next;
end;
$f$;

select n as "#", chk as "চেক", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_rollback_rehearsal();
`

fs.writeFileSync(OUT, sql)
console.log(`লেখা হয়েছে: ${path.relative(ROOT, OUT)} (BODY ${body.split('\n').length} লাইন)`)

// ================================================================ SQL ১৪ এর রোলব্যাক-মহড়া (পর্ব চ, M-ধাপ ১৮)
// ১৪ নিজেই শুরুতে স্কিমার গভীর ছাপ asf_meta.marks('before_14') এ রাখে; মহড়া রোলব্যাক-বডি চালিয়ে সেই ছাপের সাথে মেলায়।
{
  const SRC14 = path.join(ROOT, 'supabase/sql/rollback/14_rollback.sql')
  const OUT14 = path.join(ROOT, 'supabase/sql/checks/14_rollback_rehearsal.sql')
  const m14 = fs.readFileSync(SRC14, 'utf8').match(/-- @@BODY-START\r?\n([\s\S]*?)-- @@BODY-END/)
  if (!m14 || m14[1].includes('$rehearsal_body$')) {
    console.error('ত্রুটি: 14_rollback.sql এ BODY পাওয়া যায়নি বা তাতে $rehearsal_body$ আছে')
    process.exit(1)
  }
  const sql14 = `-- =====================================================================
-- checks/14_rollback_rehearsal.sql — SQL ১৪ এর রোলব্যাক-মহড়া (পর্ব চ · চেকলিস্ট সারি ৩৫) — ⚠ স্বয়ংক্রিয়ভাবে তৈরি, হাতে বদলাবেন না
-- তৈরি করে: npm run build-rehearsal (উৎস: supabase/sql/rollback/14_rollback.sql এর BODY)
--
-- ✅ কিছুই বদলায় না: রোলব্যাকের বডি একটি সাব-ট্রানজেকশনে চলে, স্কিমার গভীর ছাপ (পলিসির শর্ত, ফাংশনের পুরো সংজ্ঞা ও
--    অনুমতি, ট্রিগার, constraint, কলাম) ১৪ চালানোর ঠিক আগের ছাপের (asf_meta.marks 'before_14') সাথে মেলানো হয়,
--    তারপর সব ফিরিয়ে দেওয়া হয়।
-- সব ✅ মানে: দরকার হলে rollback/14_rollback.sql ডাটাবেসকে হুবহু ১৪-এর আগের অবস্থায় ফেরাতে পারবে।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_14_rollback_rehearsal()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  deep   jsonb;
  dat    jsonb;
  roles  text;
  err    text;
  want   jsonb;
  now_deep jsonb;
  dat0   jsonb;
begin
  if to_regprocedure('asf_meta.deep_fingerprint()') is null or to_regclass('asf_meta.marks') is null then
    n := 1; chk := '14_project_users.sql চালানো হয়েছে?'; ok := '❌'; info := 'asf_meta.deep_fingerprint/marks নেই — আগে 14_project_users.sql';
    return next;
    return;
  end if;
  select v into want from asf_meta.marks where k = 'before_14';
  now_deep := asf_meta.deep_fingerprint();
  dat0 := asf_meta.data_fingerprint();
  begin
    execute $rehearsal_body$
${m14[1]}$rehearsal_body$;
    deep := asf_meta.deep_fingerprint();
    dat := asf_meta.data_fingerprint();
    select string_agg(distinct role, ',' order by role) into roles from public.housing_admins;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      err := sqlerrm;
    end if;
  end;

  if err is not null then
    n := 1; chk := 'রোলব্যাকের বডি চলেছে'; ok := '❌'; info := err;
    return next;
    return;
  end if;
  n := 1; chk := 'রোলব্যাকের বডি ত্রুটি ছাড়া চলেছে'; ok := '✅'; info := 'তারপর সব ফিরিয়ে দেওয়া হয়েছে';
  return next;

  n := 2; chk := 'স্কিমার গভীর ছাপ = ১৪-এর আগের (পলিসি, ফাংশন, ট্রিগার, constraint, কলাম হুবহু)';
  ok := case when want is null then '❌ ১৪-এর আগের ছাপ নেই' when deep = want then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(deep ->> 'fp', '—') || ' (' || coalesce(deep ->> 'n', '?') || ') · আগে ' || coalesce(want ->> 'fp', '—') || ' (' || coalesce(want ->> 'n', '?') || ')';
  return next;

  n := 3; chk := 'ভূমিকা আগের নিয়মে (admin / main_admin)';
  ok := case when roles is not null and roles ~ '^(admin,)?main_admin$' then '✅' else '❌' end;
  info := coalesce(roles, '—');
  return next;

  n := 4; chk := 'লাইভ ডাটা (রেকর্ড, কাউন্টার, stats) অক্ষত';
  ok := case when dat = dat0 then '✅' else '❌' end;
  info := (dat0 #>> '{records}');
  return next;

  n := 5; chk := 'মহড়ার পরে বর্তমান কাঠামো অক্ষত (কিছুই বদলায়নি)';
  ok := case when asf_meta.deep_fingerprint() = now_deep then '✅' else '❌' end;
  info := now_deep ->> 'fp';
  return next;
end;
$f$;

select n as "#", chk as "চেক", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_14_rollback_rehearsal();
`
  fs.writeFileSync(OUT14, sql14)
  console.log(`লেখা হয়েছে: ${path.relative(ROOT, OUT14)} (BODY ${m14[1].split('\n').length} লাইন)`)
}
