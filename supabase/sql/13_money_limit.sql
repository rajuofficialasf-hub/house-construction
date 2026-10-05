-- =====================================================================
-- 13_money_limit.sql — টাকার সর্বোচ্চ সীমা ১০০০ কোটি (পর্ব ২, M-ধাপ ১১ · চেকলিস্ট সারি ৩৪)
-- পূর্বশর্ত: 10b_project_guards.sql (housing_field_value)
--
-- কেন: 10b তে সীমা ছিল 100000000000 (= ১০,০০০ কোটি), অথচ বার্তায় লেখা "১০০০ কোটি"। ব্যবহারকারীর সিদ্ধান্ত
-- (২০২৬-১০-০৫): সীমা **১০০০ কোটি** = 10000000000। বার্তা আগে থেকেই ঠিক, শুধু সংখ্যা বদলায়।
--
-- যা বদলায়: শুধু housing_field_value() ফাংশনের একটি সংখ্যা — ফাংশনের বর্তমান রূপ পড়ে ঠিক ওই অংশটুকু বদলে আবার
-- তৈরি (বাকি সব হুবহু)। কোনো টেবিল, ডাটা বা পলিসি বদলায় না। লাইভ ডাটার ফিঙ্গারপ্রিন্ট আগে-পরে মেলানো হয়।
--
-- ✅ এক ট্রানজেকশনে; ভুল হলে কিছুই বদলায় না। আবার চালালে ক্ষতি নেই (আগেই চালানো থাকলে শুধু জানায়)।
--    ডাটা বদলায় না বলে আলাদা ব্যাকআপ লাগে না। ফেরাতে: rollback/13_rollback.sql
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run। শেষে একটিই ফলাফল-টেবিল।
-- =====================================================================

begin;

do $pre$
begin
  if to_regprocedure('public.housing_field_value(public.project_fields,jsonb)') is null then
    raise exception 'আগে 10b_project_guards.sql চালান — কিছুই বদলায়নি।';
  end if;
end
$pre$;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;
-- ফলের জন্য (সেশন-স্থানীয়; commit এর পরেও থাকে, শেষ টেবিলে দেখানো হয়)
drop table if exists pg_temp._asf_13;
create temp table _asf_13 (k text primary key, v text);

-- ---------------------------------------------------------------- বর্তমান ডাটায় ১০০০ কোটির বেশি টাকা আছে কি না
do $data$
declare
  bad text;
begin
  select string_agg(format('%s #%s (%s = %s)', b.project_type, b.serial_no, f.key, b.extra ->> f.key), ', ')
    into bad
  from public.housing_beneficiaries b
  join public.project_fields f on f.project_key = b.project_type and f.type = 'money' and f.visibility = 'public'
  where jsonb_typeof(b.extra -> f.key) = 'number' and (b.extra ->> f.key)::numeric > 10000000000;
  if bad is null then
    select string_agg(format('%s #%s (%s, গোপন)', b.project_type, b.serial_no, f.key), ', ')
      into bad
    from public.beneficiary_private p
    join public.housing_beneficiaries b on b.id = p.record_id
    join public.project_fields f on f.project_key = b.project_type and f.type = 'money' and f.visibility = 'admin'
    where jsonb_typeof(p.data -> f.key) = 'number' and (p.data ->> f.key)::numeric > 10000000000;
  end if;
  if bad is not null then
    raise exception 'এই রেকর্ডগুলোতে টাকা ১০০০ কোটির বেশি — আগে ঠিক করুন, কিছুই বদলায়নি: %', bad;
  end if;
end
$data$;

-- ---------------------------------------------------------------- ফাংশনের সংখ্যাটি বদল
do $fn$
declare
  def    text := pg_get_functiondef('public.housing_field_value(public.project_fields,jsonb)'::regprocedure);
  old_s  text := 'n > 100000000000 then';
  new_s  text := 'n > 10000000000 then';
  n_old  int;
begin
  n_old := (length(def) - length(replace(def, old_s, ''))) / length(old_s);
  if n_old = 0 and position(new_s in def) > 0 then
    insert into _asf_13 values ('state', 'আগেই চালানো হয়েছে — সীমা ১০০০ কোটি, কিছু বদলায়নি');
    return;
  end if;
  if n_old <> 1 then
    raise exception 'housing_field_value() তে প্রত্যাশিত অংশ "%" ঠিক একবার পাওয়া যায়নি (পেয়েছি %) — কিছুই বদলায়নি। ফলাফল AI-কে পাঠান।', old_s, n_old;
  end if;
  execute replace(def, old_s, new_s);
  insert into _asf_13 values ('state', 'সীমা ১০,০০০ কোটি → ১০০০ কোটি');
end
$fn$;
revoke all on function public.housing_field_value(public.project_fields, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- নিজে পরীক্ষা (মান শুধু মেমোরিতে, কোনো টেবিলে লেখা নয়)
do $self$
declare
  f public.project_fields := jsonb_populate_record(null::public.project_fields,
    '{"key": "amount", "type": "money", "label_bn": "টাকা", "visibility": "public", "required": false}'::jsonb);
  ok_max boolean := false;
  ok_over boolean := false;
begin
  ok_max := public.housing_field_value(f, '10000000000'::jsonb) = '10000000000'::jsonb;
  begin
    perform public.housing_field_value(f, '10000000001'::jsonb);
  exception when check_violation then
    ok_over := sqlerrm like '%১০০০ কোটি%';
  end;
  if not (ok_max and ok_over) then
    raise exception 'নিজে-পরীক্ষা ব্যর্থ (১০০০ কোটি গ্রহণ: %, তার বেশি আটকায়: %) — কিছুই বদলায়নি।', ok_max, ok_over;
  end if;
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
  select 1 as k, 'টাকার সর্বোচ্চ সীমা' as item,
         case when pg_get_functiondef('public.housing_field_value(public.project_fields,jsonb)'::regprocedure) like '%n > 10000000000 then%' then '✅' else '❌' end as ok,
         coalesce((select v from _asf_13 where k = 'state'), '') || ' — ১০০০ কোটি (10000000000)' as info
  union all
  select 2, 'নিজে-পরীক্ষা: ১০০০ কোটি গ্রহণ, তার বেশি বাংলা বার্তায় আটকায়', '✅', 'housing_field_value()'
  union all
  select 3, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট', '✅', 'অপরিবর্তিত'
) t
order by k;
