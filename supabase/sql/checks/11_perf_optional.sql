-- =====================================================================
-- checks/11_perf_optional.sql — ঐচ্ছিক পারফরম্যান্স পরীক্ষা (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ৩১) · পরিকল্পনা §৫.১৬
-- ⚠ ঐচ্ছিক। এখন মাত্র কয়েকটি রেকর্ড, তাই এটি না চালালেও চলে।
-- কী করে: একটি অস্থায়ী প্রকল্প (zz_perf, কখনো semi_pucca/tin নয়) বানিয়ে ৫,০০০টি কৃত্রিম রেকর্ড ঢোকায়, তারপর
--   project_stats / projects_overview / housing_stats এর সময় মাপে — তারপর সব ফিরিয়ে দেয় (কিছুই থাকে না)।
--   লক্ষ্য: ৫০ হাজার সারিতে project_stats ৩০০ ms এর কম → এখানে ৫ হাজারে ৫০ ms এর কম হলে স্বস্তি।
-- পরে আলাদাভাবে (নতুন query তে) চালান:  VACUUM ANALYZE public.housing_beneficiaries;
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run (৫–৩০ সেকেন্ড লাগতে পারে)।
-- =====================================================================

create or replace function pg_temp.asf_perf()
returns table (n integer, chk text, ms numeric, info text)
language plpgsql
as $f$
declare
  t0 timestamptz;
  j  jsonb;
  r_stats numeric; r_light numeric; r_over numeric; r_wrap numeric; r_ins numeric;
begin
  begin
    insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode, geo_depth)
    values ('zz_perf', 'zz-perf', 'পারফরম্যান্স পরীক্ষা', 'Perf test', 'zzperf', 'after_only', 'union');
    insert into public.project_fields (project_key, key, label_bn, type, required, sort_order)
    values ('zz_perf', 'amount', 'টাকা', 'money', true, 1), ('zz_perf', 'category', 'ক্যাটাগরি', 'category', false, 2);

    t0 := clock_timestamp();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, union_name, extra)
    select 'zz_perf', 2020 + (g % 6), 'পরীক্ষা ' || g, 'ঢাকা', 'জেলা ' || (g % 40), 'উপজেলা ' || (g % 300), 'ইউনিয়ন ' || (g % 900),
           jsonb_build_object('amount', 1000 + (g % 50) * 500, 'category', (array['গরু', 'ছাগল', 'মুদি দোকান', 'সেলাই মেশিন', 'রিকশা'])[1 + g % 5])
      from generate_series(1, 5000) g;
    r_ins := extract(epoch from clock_timestamp() - t0) * 1000;

    t0 := clock_timestamp(); j := public.project_stats('zz_perf');        r_stats := extract(epoch from clock_timestamp() - t0) * 1000;
    t0 := clock_timestamp(); j := public.project_stats('zz_perf', true);  r_light := extract(epoch from clock_timestamp() - t0) * 1000;
    t0 := clock_timestamp(); j := public.projects_overview(true);         r_over  := extract(epoch from clock_timestamp() - t0) * 1000;
    t0 := clock_timestamp(); j := public.housing_stats(null);             r_wrap  := extract(epoch from clock_timestamp() - t0) * 1000;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      n := 0; chk := 'পরীক্ষা চালানো যায়নি'; ms := null; info := sqlerrm; return next; return;
    end if;
  end;
  n := 1; chk := '৫,০০০ রেকর্ড ঢোকানো (যাচাই ও লগ-ট্রিগারসহ)'; ms := round(r_ins, 1); info := 'তথ্যের জন্য'; return next;
  n := 2; chk := 'project_stats (পূর্ণ, ক্যাটাগরি অনুযায়ী টাকাসহ)'; ms := round(r_stats, 1);
  info := case when r_stats < 50 then '✅ লক্ষ্যের মধ্যে' else '⚠ ধীর — AI-কে জানান' end; return next;
  n := 3; chk := 'project_stats (হালকা — হোম কার্ড)'; ms := round(r_light, 1); info := case when r_light < 50 then '✅' else '⚠' end; return next;
  n := 4; chk := 'projects_overview (সব প্রকল্প, এক কল)'; ms := round(r_over, 1); info := case when r_over < 100 then '✅' else '⚠' end; return next;
  n := 5; chk := 'housing_stats(null) (পুরনো সাইট)'; ms := round(r_wrap, 1); info := '✅ (ঘর নির্মাণের ডাটাই — কৃত্রিম সারি গোনা হয় না)'; return next;
  n := 6; chk := 'সব ফিরিয়ে দেওয়া হয়েছে'; ms := null;
  info := case when not exists (select 1 from public.projects where key = 'zz_perf') then '✅ কিছুই থাকেনি — এবার আলাদাভাবে VACUUM ANALYZE চালান' else '❌' end;
  return next;
end;
$f$;

select n as "#", chk as "মাপ", ms as "মিলিসেকেন্ড", info as "ফল" from pg_temp.asf_perf();
