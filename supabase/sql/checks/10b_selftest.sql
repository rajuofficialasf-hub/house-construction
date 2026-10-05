-- =====================================================================
-- checks/10b_selftest.sql — SQL ১০ ও ১০b এর নিজে-নিজে পরীক্ষা (পর্ব ২, M-ধাপ ২ · চেকলিস্ট সারি ২৭)
-- ✅ কিছুই স্থায়ী হয় না: প্রতিটি পরীক্ষা নিজের সাব-ট্রানজেকশনে চলে আর শেষে নিজেই ফিরে যায় (রোলব্যাক)।
--    অস্থায়ী প্রকল্প zz_selftest / zz_selftest2 আর তাদের রেকর্ড পরীক্ষার পরে থাকে না; লাইভ রেকর্ড অপরিবর্তিত।
--    শেষ সারিতে প্রমাণ: পরীক্ষার পরে লাইভ ডাটার ফিঙ্গারপ্রিন্ট শুরুর মতোই।
-- তিন ভূমিকায় পরীক্ষা: লগইন ছাড়া (anon), আসল এডমিনের মতো (authenticated + housing_admins এর প্রথম এডমিনের পরিচয়), postgres।
-- (একটিভিটি লগের id-তে ফাঁক পড়তে পারে — রোলব্যাক হওয়া পরীক্ষাও একটি সংখ্যা খরচ করে; সারির সংখ্যা বদলায় না।)
--
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run। সব সারিতে ✅ আসা উচিত; ❌ এলে পুরো টেবিল AI-কে পাঠান।
-- =====================================================================

-- পরীক্ষার অস্থায়ী প্রকল্প (postgres হিসেবে তৈরি; ডাকা হয় শুধু সাব-ট্রানজেকশনের ভেতরে)
create or replace function pg_temp.asf_mk()
returns void
language plpgsql
as $m$
begin
  insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode, geo_depth, core_fields, stat_cards)
  values ('zz_selftest', 'zz-selftest', 'পরীক্ষা প্রকল্প (selftest)', 'Selftest project', 'zzst', 'after_only', 'union',
          '{"union_name": {"required": false}}'::jsonb,
          '[{"id":"total","kind":"count","label_bn":"মোট","label_en":"Total"},
            {"id":"money","kind":"sum","field":"amount","label_bn":"মোট টাকা","label_en":"Total amount","format":"money"},
            {"id":"cats","kind":"distinct","field":"category","label_bn":"মোট ক্যাটাগরি","label_en":"Categories"}]'::jsonb);
  insert into public.project_fields (project_key, key, label_bn, label_en, type, required, visibility, show_in_table, sort_order)
  values ('zz_selftest', 'amount',    'টাকা',         'Amount',   'money',    true,  'public', true,  1),
         ('zz_selftest', 'category',  'ক্যাটাগরি',    'Category', 'category', false, 'public', true,  2),
         ('zz_selftest', 'item_name', 'উপকরণের নাম',  'Item',     'text',     false, 'public', false, 3),
         ('zz_selftest', 'phone',     'মোবাইল',       'Mobile',   'phone',    false, 'admin',  false, 4);
end;
$m$;

create or replace function pg_temp.asf_10b_selftest()
returns table (n integer, test text, ok text, detail text)
language plpgsql
as $f$
declare
  admin_uid   uuid;
  admin_email text;
  fp0         jsonb;
  fp1         jsonb;
  stage       text;
  t           integer := 0;
  cnt         bigint;
  cnt2        bigint;
  live_n      bigint;
  rid         uuid;
  j           jsonb;
  s           text;
  a_ok        boolean;
  b_ok        boolean;
  msg_a       text;
  msg_b       text;
  roles0      text;
begin
  if to_regprocedure('public.housing_validate_record()') is null then
    n := 0; test := '10b_project_guards.sql চালানো হয়েছে?'; ok := '❌'; detail := 'আগে 10b_project_guards.sql চালান';
    return next;
    return;
  end if;
  fp0 := asf_meta.data_fingerprint();
  select string_agg(user_id::text || ':' || role, ',' order by user_id) into roles0 from public.housing_admins;
  select count(*) into live_n from public.housing_beneficiaries;
  -- মূল এডমিনের পরিচয়ে পরীক্ষা (না থাকলে সবচেয়ে পুরনো এডমিন)
  select a.user_id, a.email into admin_uid, admin_email from public.housing_admins a
   order by (a.role = 'main_admin') desc, a.created_at limit 1;

  -- ===================================================================== ১. গ্রুপে রেকর্ড
  t := t + 1; n := t; test := 'গ্রুপ (housing) এ সরাসরি রেকর্ড ঢোকানো আটকায়';
  begin
    stage := 'action';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila)
    values ('housing', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার');
    ok := '❌'; detail := 'ঢুকে গেছে!';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '✅'; detail := 'আটকেছে: ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ২. এডমিন প্রকল্প তৈরি → কাউন্টার
  t := t + 1; n := t; test := 'এডমিন হিসেবে নতুন প্রকল্প তৈরি হয়, সাথে সিরিয়াল-কাউন্টার (০) আসে';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins টেবিলে কোনো এডমিন নেই — এডমিনের পরীক্ষা চালানো গেল না';
  else
    begin
      stage := 'admin';
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode)
      values ('zz_selftest', 'zz-selftest', 'পরীক্ষা প্রকল্প', 'Selftest', 'zzst', 'after_only');
      reset role;
      select last_serial into cnt from public.housing_serial_counters where project_type = 'zz_selftest';
      ok := case when cnt = 0 then '✅' else '❌' end;
      detail := 'কাউন্টার: ' || coalesce(cnt::text, 'নেই');
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ৩. টাকা: স্ট্রিং আটকায়, সংখ্যা গ্রহণ
  t := t + 1; n := t; test := 'টাকা: "১০,০০০" (লেখা) আটকায়, 10000 (সংখ্যা) গ্রহণ হয়; ক্যাটাগরির ফাঁকা ঠিক হয়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values ('zz_selftest', 2025, 'পরীক্ষা ক', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": "১০,০০০"}');
      a_ok := false; msg_a := 'ঢুকে গেছে!';
    exception when others then
      a_ok := sqlstate = '23514'; msg_a := sqlerrm;
    end;
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা খ', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 10000, "category": "  গরু   ছাগল  "}')
    returning extra into j;
    b_ok := (j ->> 'amount')::numeric = 10000 and j ->> 'category' = 'গরু ছাগল';
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := 'লেখা: ' || msg_a || ' · সংখ্যা: ' || j::text;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৪. অচেনা ও গোপন key
  t := t + 1; n := t; test := 'extra-তে অচেনা key আর গোপন (এডমিন) ফিল্ডের key আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    stage := 'action';
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 5000, "nonsense": "x"}');
      a_ok := false; msg_a := 'অচেনা key ঢুকে গেছে!';
    exception when others then
      a_ok := sqlstate = '23514'; msg_a := sqlerrm;
    end;
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 5000, "phone": "01711000000"}');
      b_ok := false; msg_b := 'গোপন key extra-তে ঢুকে গেছে!';
    exception when others then
      b_ok := sqlstate = '23514'; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৫. NFC
  t := t + 1; n := t; test := 'ভাঙা-রূপের (decomposed) বাংলা লেখা NFC হয়ে জমা হয়, দুই পাশের ফাঁকা বাদ';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    stage := 'action';
    -- "মো" কে ম + ে + া (U+09AE U+09C7 U+09BE) ভাঙা রূপে পাঠানো হলো → NFC তে জোড়া লেগে ো (U+09CB) হওয়া উচিত।
    -- সাথে একক-অক্ষর "য়" (U+09DF) → NFC তে Unicode নিয়মে য + ় (U+09AF U+09BC) হয় (আগের পর্বের বাংলা NFC নিয়ম)।
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, union_name, extra)
    values ('zz_selftest', 2025, '  ' || E'মো' || 'ছাঃ মা' || E'য়' || 'া  ', 'ঢাকা', 'ঢাকা', 'সাভার', ' আশুলিয়া ', '{"amount": 1}')
    returning name, union_name into s, msg_b;
    ok := case when s = normalize(s, NFC) and position(E'ো' in s) = 2 and position(E'য়' in s) = 0
                    and s = normalize(E'মো' || 'ছাঃ মা' || E'য়' || 'া', NFC) and msg_b = 'আশুলিয়া' then '✅' else '❌' end;
    detail := 'জমা হয়েছে: "' || s || '" (দৈর্ঘ্য ' || length(s) || ') · ইউনিয়ন: "' || msg_b || '"';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৬. আবশ্যক কাস্টম ফিল্ড
  t := t + 1; n := t; test := 'আবশ্যক ফিল্ড (টাকা) ছাড়া নতুন রেকর্ড আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    stage := 'action';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"category": "গরু"}');
    ok := '❌'; detail := 'ঢুকে গেছে!';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      ok := case when stage = 'action' then '✅' else '❌' end;
      detail := case when stage = 'action' then 'আটকেছে: ' else stage || ': ' end || sqlerrm;
    end if;
  end;
  return next;

  -- ===================================================================== ৭. শুধু-পরের-ছবি
  t := t + 1; n := t; test := 'শুধু-পরের-ছবি প্রকল্পে আগের ছবি (prev) আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    stage := 'action';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra, prev_photo_url)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}', 'https://example.invalid/prev.webp');
    ok := '❌'; detail := 'ঢুকে গেছে!';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      ok := case when stage = 'action' then '✅' else '❌' end;
      detail := case when stage = 'action' then 'আটকেছে: ' else stage || ': ' end || sqlerrm;
    end if;
  end;
  return next;

  -- ===================================================================== ৮. প্রকল্প মোছা
  t := t + 1; n := t; test := 'রেকর্ড আছে এমন প্রকল্প মোছা আটকায়; কখনো-রেকর্ড-না-থাকা প্রকল্প মোছা যায় (এডমিন)';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}');
    insert into public.projects (key, slug, name_bn, name_en, file_prefix) values ('zz_selftest2', 'zz-selftest-2', 'পরীক্ষা ২', 'Selftest 2', 'zzsb');
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    begin
      delete from public.projects where key = 'zz_selftest';
      a_ok := false; msg_a := 'রেকর্ডসহ প্রকল্প মুছে গেছে!';
    exception when others then
      a_ok := true; msg_a := sqlerrm;
    end;
    delete from public.projects where key = 'zz_selftest2';
    get diagnostics cnt = row_count;
    b_ok := cnt = 1;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · খালি প্রকল্প মোছা: ' || cnt || ' টি';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৯. প্রকাশিত প্রকল্পের slug
  t := t + 1; n := t; test := 'প্রকাশিত প্রকল্পের (semi_pucca) URL বদলানো আটকায়; সংরক্ষিত slug ("admin") আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    begin
      update public.projects set slug = 'semi-pucca-x' where key = 'semi_pucca';
      get diagnostics cnt = row_count;
      a_ok := false; msg_a := 'বদলে গেছে! (' || cnt || ' সারি)';
    exception when others then
      a_ok := true; msg_a := sqlerrm;
    end;
    begin
      update public.projects set slug = 'admin' where key = 'zz_selftest';
      b_ok := false; msg_b := '"admin" slug নেওয়া গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১০. প্রকল্পের key ও গ্রুপ মোছা
  t := t + 1; n := t; test := 'প্রকল্পের key বদল আর উপ-প্রকল্পসহ গ্রুপ (housing) মোছা আটকায়';
  begin
    stage := 'admin';
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    begin
      update public.projects set key = 'semi_x' where key = 'tin';
      a_ok := false; msg_a := 'key বদলে গেছে!';
    exception when others then
      a_ok := true; msg_a := sqlerrm;
    end;
    begin
      delete from public.projects where key = 'housing';
      b_ok := false; msg_b := 'গ্রুপ মুছে গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১১. ফিল্ড-গার্ড
  t := t + 1; n := t; test := 'মান আছে এমন ফিল্ড মোছা ও তার ধরন বদল আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1, "item_name": "ছাগল"}');
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    begin
      delete from public.project_fields where project_key = 'zz_selftest' and key = 'item_name';
      a_ok := false; msg_a := 'মুছে গেছে!';
    exception when others then
      a_ok := true; msg_a := sqlerrm;
    end;
    begin
      update public.project_fields set type = 'long_text' where project_key = 'zz_selftest' and key = 'item_name';
      b_ok := false; msg_b := 'ধরন বদলে গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১২. ছবি মোড বদল
  t := t + 1; n := t; test := 'আগের ছবি আছে এমন প্রকল্পে (semi_pucca) ছবি মোড "শুধু পরের ছবি" করা আটকায়';
  select count(*) into cnt from public.housing_beneficiaries where project_type = 'semi_pucca' and prev_photo_url is not null;
  if cnt = 0 then
    ok := '⚠ এড়ানো'; detail := 'semi_pucca তে আগের ছবি নেই — পরীক্ষার দরকার নেই';
  else
    begin
      stage := 'action';
      update public.projects set photo_mode = 'after_only' where key = 'semi_pucca';
      ok := '❌'; detail := 'বদলে গেছে!';
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '✅'; detail := 'আটকেছে: ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৩. গোপন টেবিল
  t := t + 1; n := t; test := 'গোপন টেবিল: মোবাইলের বাংলা অঙ্ক ইংরেজি হয়; পাবলিক ফিল্ডের key সেখানে আটকায় (এডমিন)';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}') returning id into rid;
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "০১৭১১-০০০০০০"}') returning data into j;
    a_ok := j ->> 'phone' = '01711-000000';
    begin
      update public.beneficiary_private set data = data || '{"amount": 5}' where record_id = rid;
      b_ok := false; msg_b := 'পাবলিক key গোপন টেবিলে ঢুকে গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := 'জমা: ' || j::text || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১৪. anon: খসড়া লুকানো
  t := t + 1; n := t; test := 'লগইন ছাড়া (anon): খসড়া প্রকল্প, তার ফিল্ড ও রেকর্ড দেখা যায় না; গোপন টেবিল বন্ধ; প্রকাশিত রেকর্ড দেখা যায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}') returning id into rid;
    insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "01711000000"}');
    stage := 'anon';
    set local role anon;
    stage := 'action';
    select count(*) into cnt from public.projects where key = 'zz_selftest';
    select count(*) into cnt2 from public.project_fields where project_key = 'zz_selftest';
    a_ok := cnt = 0 and cnt2 = 0;
    msg_a := 'খসড়া প্রকল্প ' || cnt || ' · ফিল্ড ' || cnt2;
    select count(*) into cnt from public.housing_beneficiaries where project_type = 'zz_selftest';
    select count(*) into cnt2 from public.housing_beneficiaries where project_type in ('semi_pucca', 'tin');
    a_ok := a_ok and cnt = 0 and cnt2 = live_n;
    msg_a := msg_a || ' · খসড়ার রেকর্ড ' || cnt || ' · প্রকাশিত রেকর্ড ' || cnt2 || '/' || live_n;
    begin
      perform 1 from public.beneficiary_private limit 1;
      b_ok := false; msg_b := 'গোপন টেবিল পড়া গেছে!';
    exception when insufficient_privilege then
      b_ok := true; msg_b := 'গোপন টেবিল: অনুমতি নেই';
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১৫. এডমিন খসড়া দেখে
  t := t + 1; n := t; test := 'এডমিন খসড়া প্রকল্প, তার রেকর্ড ও গোপন মান দেখতে পান';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins খালি';
  else
    begin
      stage := 'setup';
      perform pg_temp.asf_mk();
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}') returning id into rid;
      insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "01711000000"}');
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      select count(*) into cnt from public.projects where key = 'zz_selftest';
      select count(*) into cnt2 from public.housing_beneficiaries where project_type = 'zz_selftest';
      a_ok := cnt = 1 and cnt2 = 1;
      select count(*) into cnt from public.beneficiary_private where record_id = rid;
      a_ok := a_ok and cnt = 1;
      ok := case when a_ok then '✅' else '❌' end;
      detail := 'প্রকল্প/রেকর্ড/গোপন সারি দেখা গেছে: ' || a_ok;
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৬. পুরনো প্যানেলের "সংরক্ষণ"
  t := t + 1; n := t; test := 'লাইভ রেকর্ডে একই মান দিয়ে সংরক্ষণ (এডমিন) সফল — পুরনো প্যানেল নতুন ট্রিগারে আটকাবে না';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins খালি';
  else
    begin
      stage := 'scan';
      -- সংরক্ষণে NFC/ফাঁকা ঠিক হয়ে মান বদলাবে এমন সারি (তথ্যের জন্য)
      select count(*) into cnt2 from public.housing_beneficiaries
       where name <> normalize(btrim(name), NFC)
          or father_or_husband_name <> normalize(btrim(father_or_husband_name), NFC)
          or division <> normalize(btrim(division), NFC) or district <> normalize(btrim(district), NFC)
          or upazila <> normalize(btrim(upazila), NFC) or address <> normalize(btrim(address), NFC);
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      update public.housing_beneficiaries
         set name = name, father_or_husband_name = father_or_husband_name, year = year,
             division = division, district = district, upazila = upazila, address = address,
             prev_photo_source = prev_photo_source, current_photo_source = current_photo_source
       where project_type in ('semi_pucca', 'tin');
      get diagnostics cnt = row_count;
      ok := case when cnt = live_n then '✅' else '❌' end;
      detail := cnt || '/' || live_n || ' টি সারি সংরক্ষণ সফল (ফিরিয়ে দেওয়া হয়েছে) · NFC/ফাঁকা ঠিক হবে এমন সারি: ' || cnt2;
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৭. স্ট্যাট কার্ডের আকার
  t := t + 1; n := t; test := 'ভুল স্ট্যাট কার্ড (অচেনা ধরন / হোমে ৪টি) আটকায়';
  begin
    stage := 'setup';
    perform pg_temp.asf_mk();
    stage := 'action';
    begin
      update public.projects set stat_cards = '[{"id":"x","kind":"magic","label_bn":"x"}]' where key = 'zz_selftest';
      a_ok := false; msg_a := 'অচেনা ধরন নেওয়া গেছে!';
    exception when others then
      a_ok := true; msg_a := sqlerrm;
    end;
    begin
      update public.projects set stat_cards =
        '[{"id":"a","kind":"count","label_bn":"ক","home":true},{"id":"b","kind":"count","label_bn":"খ","home":true},
          {"id":"c","kind":"count","label_bn":"গ","home":true},{"id":"d","kind":"count","label_bn":"ঘ","home":true}]'
       where key = 'zz_selftest';
      b_ok := false; msg_b := 'হোমে ৪টি নেওয়া গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১৮. এডমিন (মূল নন) মুছতে পারেন না
  t := t + 1; n := t; test := 'সাধারণ এডমিন: যোগ/এডিট পারেন, কিন্তু রেকর্ড মোছা ও ছবি মোছা পারেন না';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins খালি';
  else
    begin
      stage := 'setup';
      perform pg_temp.asf_mk();
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra, current_photo_url, current_thumb_url)
      values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}', 'https://example.invalid/c.webp', 'https://example.invalid/ct.webp')
      returning id into rid;
      -- পরীক্ষার জন্য এই এডমিনকে সাময়িকভাবে সাধারণ এডমিন করা (শেষে ফিরে যায়)
      update public.housing_admins set role = 'admin' where user_id = admin_uid;
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      update public.housing_beneficiaries set extra = extra || '{"item_name": "ছাগল"}' where id = rid;
      get diagnostics cnt = row_count;
      a_ok := cnt = 1;                                   -- এডিট পারেন
      delete from public.housing_beneficiaries where id = rid;
      get diagnostics cnt2 = row_count;
      a_ok := a_ok and cnt2 = 0;                         -- মোছা নীরবে ০ সারি (RLS)
      msg_a := 'এডিট ' || cnt || ' সারি · মোছা ' || cnt2 || ' সারি';
      begin
        update public.housing_beneficiaries set current_photo_url = null, current_thumb_url = null where id = rid;
        b_ok := false; msg_b := 'ছবি মুছে গেছে!';
      exception when others then
        b_ok := sqlstate = '42501'; msg_b := sqlerrm;
      end;
      ok := case when a_ok and b_ok then '✅' else '❌' end;
      detail := msg_a || ' · ' || msg_b;
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৯. মূল এডমিন মুছতে পারেন
  t := t + 1; n := t; test := 'মূল এডমিন: রেকর্ড ও ছবি মুছতে পারেন';
  if admin_uid is null or not exists (select 1 from public.housing_admins where user_id = admin_uid and role = 'main_admin') then
    ok := '❌'; detail := 'মূল এডমিন নেই';
  else
    begin
      stage := 'setup';
      perform pg_temp.asf_mk();
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra, current_photo_url, current_thumb_url)
      values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}', 'https://example.invalid/c.webp', 'https://example.invalid/ct.webp')
      returning id into rid;
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      update public.housing_beneficiaries set current_photo_url = null, current_thumb_url = null where id = rid;
      get diagnostics cnt = row_count;
      delete from public.housing_beneficiaries where id = rid;
      get diagnostics cnt2 = row_count;
      ok := case when cnt = 1 and cnt2 = 1 then '✅' else '❌' end;
      detail := 'ছবি মোছা ' || cnt || ' · রেকর্ড মোছা ' || cnt2 || ' (' || admin_email || ')';
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== শেষ: কিছুই থেকে যায়নি
  t := t + 1; n := t; test := 'পরীক্ষার পরে লাইভ ডাটা অপরিবর্তিত (ফিঙ্গারপ্রিন্ট শুরুর মতো; অস্থায়ী প্রকল্প নেই; এডমিনের ভূমিকা আগের মতো)';
  fp1 := asf_meta.data_fingerprint();
  select count(*) into cnt from public.projects where key like 'zz_selftest%';
  select count(*) into cnt2 from public.housing_serial_counters where project_type like 'zz_selftest%';
  ok := case when (fp1 - 'log') = (fp0 - 'log') and (fp1 #>> '{log,n}') = (fp0 #>> '{log,n}') and cnt = 0 and cnt2 = 0
                  and roles0 is not distinct from (select string_agg(user_id::text || ':' || role, ',' order by user_id) from public.housing_admins)
             then '✅' else '❌' end;
  detail := case when ok = '✅' then 'মিলেছে · লগের সারি ' || (fp1 #>> '{log,n}')
                 else 'আগে ' || fp0::text || ' · পরে ' || fp1::text || ' · অস্থায়ী প্রকল্প ' || cnt || ' · কাউন্টার ' || cnt2 end;
  return next;
end;
$f$;

with r as (select * from pg_temp.asf_10b_selftest())
select n as "#", test as "পরীক্ষা", ok as "ফল", detail as "বিস্তারিত" from r
union all
select 99, 'সব মিলিয়ে',
       (select count(*) filter (where ok like '✅%') || ' ✅ · ' || count(*) filter (where ok like '❌%') || ' ❌' from r),
       case when (select count(*) filter (where ok like '❌%') from r) = 0 then 'সব ঠিক আছে — পুরো টেবিল AI-কে পাঠান' else '❌ সারিগুলো সহ পুরো টেবিল AI-কে পাঠান' end
order by 1;
