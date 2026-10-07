-- =====================================================================
-- checks/15_selftest.sql — ফিল্টার অনুযায়ী পরিসংখ্যানের পূর্ণ যাচাই (চেকলিস্ট সারি ৩৭)
-- ✅ শুধু পড়ে — কোনো টেবিলে কিছু লেখে না। লগইন-ছাড়া (anon) পরীক্ষাটি একটি সাব-ট্রানজেকশনে, শেষে ফেরানো।
-- প্রতিটি ফিল্টার-ফলকে সরাসরি গোনা (project_stats এর ভাগ, বা হাতে লেখা count) এর সাথে মেলায়।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_15_selftest()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  p        record;
  s        jsonb;
  full_s   jsonb;
  k        text;
  v        jsonb;
  got      jsonb;
  bad      text;
  cnt      integer;
  tested   integer;
  f        record;
  money    text;
  q        text;
  want     bigint;
  pass_n   integer := 0;
  fail_n   integer := 0;
  pub      text[] := public.public_project_keys();
  a_total  text;
  draft    text;
begin
  if to_regprocedure('public.project_stats_filtered(text,jsonb)') is null then
    n := 1; chk := '15_filtered_stats.sql চালানো হয়েছে?'; ok := '❌'; info := 'ফাংশন নেই — আগে 15_filtered_stats.sql';
    return next;
    return;
  end if;

  -- ১. ফিল্টার ছাড়া = project_stats (হালকা অংশ), প্রতিটি প্রকল্প
  bad := ''; tested := 0;
  for p in select key from public.projects order by key loop
    s := public.project_stats_filtered(p.key, '{}');
    full_s := public.project_stats(p.key, true);
    if s -> 'total' is distinct from full_s -> 'total' or s -> 'distinct' is distinct from full_s -> 'distinct'
       or s -> 'fields' is distinct from full_s -> 'fields' or s -> 'by_project' is distinct from full_s -> 'by_project' then
      bad := bad || p.key || ' ';
    end if;
    tested := tested + 1;
  end loop;
  n := 1; chk := 'ফিল্টার ছাড়া ফল = project_stats (মোট, এলাকা-কভার, টাকা/ক্যাটাগরি, উপ-প্রকল্প)';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি প্রকল্প' else 'মেলেনি: ' || bad end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ২. সাল: প্রতিটি সালের মোট = project_stats.by_year; জেলা: = by_district; বিভাগ: = by_division
  bad := ''; tested := 0;
  for p in select key from public.projects where not is_group order by key loop
    full_s := public.project_stats(p.key, true);
    for k, v in select e.key, e.value from jsonb_each(full_s -> 'by_year') e loop
      got := public.project_stats_filtered(p.key, jsonb_build_object('year', k::int)) -> 'total';
      if got is distinct from v then bad := bad || p.key || ':' || k || ' '; end if;
      tested := tested + 1;
    end loop;
    for k, v in select e.key, e.value from jsonb_each(full_s -> 'by_district') e loop
      got := public.project_stats_filtered(p.key, jsonb_build_object('district', k)) -> 'total';
      if got is distinct from v then bad := bad || p.key || ':' || k || ' '; end if;
      tested := tested + 1;
    end loop;
    for k, v in select e.key, e.value from jsonb_each(full_s -> 'by_division') e loop
      got := public.project_stats_filtered(p.key, jsonb_build_object('division', k)) -> 'total';
      if got is distinct from v then bad := bad || p.key || ':' || k || ' '; end if;
      tested := tested + 1;
    end loop;
  end loop;
  n := 2; chk := 'সাল / জেলা / বিভাগ অনুযায়ী মোট = project_stats এর ভাগ';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি ফিল্টার' else 'মেলেনি: ' || left(bad, 300) end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৩. উপজেলা + ইউনিয়ন: হাতে গোনা count এর সাথে
  bad := ''; tested := 0;
  for f in select distinct b.project_type, b.district, b.upazila, b.union_name from public.housing_beneficiaries b order by 1, 2, 3, 4 limit 200 loop
    got := public.project_stats_filtered(f.project_type, jsonb_build_object('district', f.district, 'upazila', f.upazila)) -> 'total';
    select count(*) into want from public.housing_beneficiaries b where b.project_type = f.project_type and b.district = f.district and b.upazila = f.upazila;
    if got is distinct from to_jsonb(want) then bad := bad || f.project_type || ':' || f.upazila || ' '; end if;
    if f.union_name <> '' then
      got := public.project_stats_filtered(f.project_type, jsonb_build_object('district', f.district, 'upazila', f.upazila, 'union_name', f.union_name)) -> 'total';
      select count(*) into want from public.housing_beneficiaries b
       where b.project_type = f.project_type and b.district = f.district and b.upazila = f.upazila and b.union_name = f.union_name;
      if got is distinct from to_jsonb(want) then bad := bad || f.project_type || ':' || f.union_name || ' '; end if;
    end if;
    tested := tested + 1;
  end loop;
  n := 3; chk := 'উপজেলা / ইউনিয়ন অনুযায়ী মোট = সরাসরি গোনা';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি এলাকা' else 'মেলেনি: ' || left(bad, 300) end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৪. ক্যাটাগরি (পাবলিক, ফিল্টার-চালু): প্রতিটি মানের মোট ও টাকার যোগফল = project_stats এর by_value
  bad := ''; tested := 0;
  for f in select distinct pf.project_key, pf.key from public.project_fields pf
            where pf.type = 'category' and pf.visibility = 'public' and pf.is_active and pf.filterable order by 1, 2 loop
    full_s := public.project_stats(f.project_key, false);
    for k, v in select e.key, e.value from jsonb_each(full_s #> array['fields', f.key, 'by_value']) e loop
      s := public.project_stats_filtered(f.project_key, jsonb_build_object('fields', jsonb_build_object(f.key, k)));
      if s -> 'total' is distinct from v -> 'n' then bad := bad || f.project_key || ':' || k || ' '; end if;
      for money in select e2.key from jsonb_each(v -> 'sums') e2 loop
        if s #> array['fields', money, 'sum'] is distinct from v #> array['sums', money] then
          bad := bad || f.project_key || ':' || k || '/' || money || ' ';
        end if;
      end loop;
      tested := tested + 1;
    end loop;
  end loop;
  n := 4; chk := 'ক্যাটাগরি অনুযায়ী মোট ও টাকার যোগফল = project_stats (by_value)';
  ok := case when bad = '' then '✅' when tested = 0 then '✅' else '❌' end;
  info := case when bad <> '' then 'মেলেনি: ' || left(bad, 300) when tested = 0 then 'ফিল্টার-চালু ক্যাটাগরি নেই — কিছু মেলানোর নেই' else tested || 'টি মান' end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৫. সার্চ: নামের অংশ দিয়ে — সরাসরি গোনার সাথে (নাম/পিতা-স্বামী/ঠিকানা/সার্চ-চালু ফিল্ড)
  bad := ''; tested := 0;
  for f in select distinct on (b.project_type) b.project_type, b.name from public.housing_beneficiaries b where length(b.name) >= 3 order by b.project_type, b.serial_no loop
    q := left(f.name, 3);
    got := public.project_stats_filtered(f.project_type, jsonb_build_object('q', q)) -> 'total';
    select count(*) into want from public.housing_beneficiaries b
     where b.project_type = f.project_type
       and (b.name ilike '%' || q || '%' or b.father_or_husband_name ilike '%' || q || '%' or b.address ilike '%' || q || '%'
            or exists (select 1 from public.project_fields pf
                        where pf.project_key = b.project_type and pf.is_active and pf.visibility = 'public' and pf.searchable
                          and b.extra ->> pf.key ilike '%' || q || '%'));
    if got is distinct from to_jsonb(want) then bad := bad || f.project_type || ':' || q || ' '; end if;
    tested := tested + 1;
  end loop;
  n := 5; chk := 'সার্চ (নামের অংশ) অনুযায়ী মোট = সরাসরি গোনা';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি প্রকল্প' else 'মেলেনি: ' || bad end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৬. একসাথে কয়েকটি ফিল্টার (সাল + জেলা) — সরাসরি গোনা
  bad := ''; tested := 0;
  for f in select distinct b.project_type, b.year, b.district from public.housing_beneficiaries b order by 1, 2, 3 limit 100 loop
    got := public.project_stats_filtered(f.project_type, jsonb_build_object('year', f.year, 'district', f.district)) -> 'total';
    select count(*) into want from public.housing_beneficiaries b where b.project_type = f.project_type and b.year = f.year and b.district = f.district;
    if got is distinct from to_jsonb(want) then bad := bad || f.project_type || ':' || f.year || '/' || f.district || ' '; end if;
    tested := tested + 1;
  end loop;
  n := 6; chk := 'একসাথে কয়েকটি ফিল্টার (সাল + জেলা) = সরাসরি গোনা';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি জোড়া' else 'মেলেনি: ' || left(bad, 300) end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৭. whitelist: অচেনা ফিল্ড, গোপন ফিল্ড, ভুল সাল — নীরবে বাদ (ফল = ফিল্টার ছাড়া)
  bad := ''; tested := 0;
  for p in select key from public.projects where not is_group order by key loop
    full_s := public.project_stats_filtered(p.key, '{}');
    s := public.project_stats_filtered(p.key, '{"fields": {"zz_no_such_field": "x"}, "year": "abc"}');
    if s -> 'total' is distinct from full_s -> 'total' then bad := bad || p.key || ':অচেনা '; end if;
    select pf.key into k from public.project_fields pf where pf.project_key = p.key and pf.visibility = 'admin' limit 1;
    if k is not null then
      s := public.project_stats_filtered(p.key, jsonb_build_object('fields', jsonb_build_object(k, 'x')));
      if s -> 'total' is distinct from full_s -> 'total' then bad := bad || p.key || ':গোপন ' ; end if;
    end if;
    tested := tested + 1;
  end loop;
  n := 7; chk := 'অচেনা/গোপন ফিল্ড আর ভুল সাল দিয়ে ফিল্টার করা যায় না (নীরবে বাদ)';
  ok := case when bad = '' then '✅' else '❌' end; info := case when bad = '' then tested || 'টি প্রকল্প' else 'ভুল: ' || bad end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  -- ৮. লগইন ছাড়া (anon): প্রকাশিত প্রকল্পে একই ফল; খসড়া প্রকল্পে ০ (RLS)
  bad := ''; a_total := ''; draft := null;
  select key into draft from public.projects where not is_group and not (key = any (pub)) order by key limit 1;
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    for p in select unnest(pub) as key loop
      a_total := a_total || p.key || '=' || coalesce(public.project_stats_filtered(p.key, '{}') ->> 'total', '?') || ' ';
    end loop;
    if draft is not null and (public.project_stats_filtered(draft, '{}') ->> 'total') <> '0' then bad := 'খসড়া ' || draft || ' দেখা যায়'; end if;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then bad := sqlerrm; end if;
  end;
  execute 'reset role';
  for p in select unnest(pub) as key loop
    if position(p.key || '=' || (public.project_stats(p.key, true) ->> 'total') || ' ' in a_total) = 0 then bad := bad || p.key || ' '; end if;
  end loop;
  n := 8; chk := 'লগইন ছাড়া: প্রকাশিত প্রকল্পে একই মোট, খসড়া প্রকল্পে কিছুই নয়';
  ok := case when bad = '' then '✅' else '❌' end;
  info := case when bad = '' then btrim(a_total) || coalesce(' · খসড়া ' || draft || ' = 0', ' · (খসড়া প্রকল্প নেই)') else bad end;
  if bad = '' then pass_n := pass_n + 1; else fail_n := fail_n + 1; end if;
  return next;

  n := 99; chk := 'সব মিলিয়ে'; ok := pass_n || ' ✅ · ' || fail_n || ' ❌';
  info := case when fail_n = 0 then 'সব ঠিক আছে — পুরো টেবিল AI-কে পাঠান' else 'কিছু মেলেনি — পুরো টেবিল AI-কে পাঠান' end;
  return next;
end;
$f$;

select n as "#", chk as "পরীক্ষা", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_15_selftest();
