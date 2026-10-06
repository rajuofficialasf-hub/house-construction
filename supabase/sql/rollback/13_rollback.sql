-- =====================================================================
-- rollback/13_rollback.sql — 13_money_limit.sql ফেরানো: টাকার সীমা আবার 100000000000 (১০,০০০ কোটি)
-- শুধু দরকার হলে চালাবেন (যেমন ভুল করে চালানো)। ডাটা বদলায় না; এক ট্রানজেকশনে; আবার চালালে ক্ষতি নেই।
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

begin;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

do $fn$
declare
  def    text := pg_get_functiondef('public.housing_field_value(public.project_fields,jsonb)'::regprocedure);
  old_s  text := 'n > 10000000000 then';
  new_s  text := 'n > 100000000000 then';
  n_old  int;
begin
  n_old := (length(def) - length(replace(def, old_s, ''))) / length(old_s);
  if n_old = 0 and position(new_s in def) > 0 then
    raise notice 'আগেই ফেরানো — কিছু বদলায়নি';
    return;
  end if;
  if n_old <> 1 then
    raise exception 'প্রত্যাশিত অংশ "%" ঠিক একবার পাওয়া যায়নি (পেয়েছি %) — কিছুই বদলায়নি।', old_s, n_old;
  end if;
  execute replace(def, old_s, new_s);
end
$fn$;
revoke all on function public.housing_field_value(public.project_fields, jsonb) from public, anon, authenticated;

do $fp$
begin
  if asf_meta.data_fingerprint() is distinct from (select fp from _asf_fp_before) then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি।';
  end if;
end
$fp$;

notify pgrst, 'reload schema';

commit;

select 1 as "#", 'টাকার সর্বোচ্চ সীমা' as "চেক",
       case when pg_get_functiondef('public.housing_field_value(public.project_fields,jsonb)'::regprocedure) like '%n > 100000000000 then%' then '✅' else '❌' end as "ফল",
       '১০,০০০ কোটি (100000000000) — 13 এর আগের অবস্থা' as "বিস্তারিত";
