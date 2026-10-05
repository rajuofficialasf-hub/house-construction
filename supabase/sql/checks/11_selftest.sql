-- =====================================================================
-- checks/11_selftest.sql — SQL ১১ এর নিজে-নিজে পরীক্ষা (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ২৮)
-- ✅ কিছুই স্থায়ী হয় না: প্রতিটি পরীক্ষা নিজের সাব-ট্রানজেকশনে চলে, শেষে নিজেই ফিরে যায়।
--    শেষ সারিতে প্রমাণ: লাইভ ডাটার ফিঙ্গারপ্রিন্ট শুরুর মতো, অস্থায়ী প্রকল্প নেই।
-- (একটি পরীক্ষা যাচাই-ট্রিগার মুহূর্তের জন্য বন্ধ করে খারাপ মান ঢোকায় — সেটিও ফিরে যায়; ট্রিগার আবার চালু থাকে।)
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run। সব ✅ আসা উচিত।
-- =====================================================================

create or replace function pg_temp.asf_mk11()
returns void
language plpgsql
as $m$
begin
  insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode, geo_depth)
  values ('zz_selftest', 'zz-selftest', 'পরীক্ষা প্রকল্প (selftest)', 'Selftest project', 'zzst', 'after_only', 'union');
  insert into public.project_fields (project_key, key, label_bn, label_en, type, required, visibility, sort_order)
  values ('zz_selftest', 'amount',    'টাকা',        'Amount',   'money',    true,  'public', 1),
         ('zz_selftest', 'category',  'ক্যাটাগরি',   'Category', 'category', false, 'public', 2),
         ('zz_selftest', 'item_name', 'উপকরণের নাম', 'Item',     'text',     false, 'public', 3),
         ('zz_selftest', 'phone',     'মোবাইল',      'Mobile',   'phone',    false, 'admin',  4);
  insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, union_name, extra)
  values ('zz_selftest', 2025, 'ক', 'ঢাকা', 'ঢাকা', 'সাভার', 'আশুলিয়া', '{"amount": 10000, "category": "গরু"}'),
         ('zz_selftest', 2025, 'খ', 'ঢাকা', 'ঢাকা', 'সাভার', 'আশুলিয়া', '{"amount": 5000, "category": " গরু "}'),
         ('zz_selftest', 2024, 'গ', 'ঢাকা', 'ঢাকা', 'ধামরাই', '', '{"amount": 3000, "category": "ছাগল"}'),
         ('zz_selftest', 2024, 'ঘ', 'রংপুর', 'কুড়িগ্রাম', 'উলিপুর', 'বজরা', '{"amount": 2000, "category": "গাভি", "item_name": "একটি গাভি"}');
end;
$m$;

create or replace function pg_temp.asf_11_selftest()
returns table (n integer, test text, ok text, detail text)
language plpgsql
as $f$
declare
  -- @@BASELINE-START (M-ধাপ ১ এর লাইভ বেসলাইন)
  b_stats_md5 text := 'a93bfa85500c86b0e79db9cd201c2776';
  -- @@BASELINE-END
  admin_uid uuid; admin_email text;
  fp0 jsonb; fp1 jsonb; stage text; t integer := 0;
  cnt bigint; cnt2 bigint; live_n bigint; j jsonb; j2 jsonb; s text; s2 text; rid uuid;
  a_ok boolean; b_ok boolean; msg_a text; msg_b text; ser integer;
begin
  if to_regprocedure('public.project_stats(text,boolean)') is null then
    n := 0; test := '11_project_rpcs.sql চালানো হয়েছে?'; ok := '❌'; detail := 'আগে 11_project_rpcs.sql চালান';
    return next; return;
  end if;
  fp0 := asf_meta.data_fingerprint();
  select count(*) into live_n from public.housing_beneficiaries where project_type in ('semi_pucca', 'tin');
  select a.user_id, a.email into admin_uid, admin_email from public.housing_admins a
   order by (a.role = 'main_admin') desc, a.created_at limit 1;

  -- ===================================================================== ১
  t := t + 1; n := t; test := 'project_stats(''housing''): মোট = লাইভ রেকর্ড, উপ-প্রকল্প অনুযায়ী ভাগ';
  j := public.project_stats('housing');
  ok := case when (j ->> 'total')::bigint = live_n and (j #>> '{by_project,semi_pucca}') is not null and (j #>> '{by_project,tin}') is not null then '✅' else '❌' end;
  detail := 'মোট ' || (j ->> 'total') || ' · ' || (j -> 'by_project')::text || ' · ইউনিয়ন ' || (j #>> '{distinct,unions}');
  return next;

  -- ===================================================================== ২
  t := t + 1; n := t; test := 'পুরনো সাইটের housing_stats(null) — হুবহু বেসলাইনের মতো (wrapper)';
  s := md5(public.housing_stats(null)::text);
  ok := case when s = b_stats_md5 then '✅ মিলেছে' else '❌ মেলেনি' end;
  detail := s || ' · semi_pucca: ' || (public.housing_stats('semi_pucca') ->> 'total') || ' · বছর: ' ||
            coalesce((select string_agg(year::text, ', ') from public.housing_years(null)), '—');
  return next;

  -- ===================================================================== ৩
  t := t + 1; n := t; test := 'টাকা ও ক্যাটাগরি: যোগফল, মোট ক্যাটাগরি, ক্যাটাগরি অনুযায়ী টাকা; " গরু " = "গরু"';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    stage := 'action';
    j := public.project_stats('zz_selftest');
    ok := case when (j #>> '{fields,amount,sum}')::numeric = 20000 and (j #>> '{fields,amount,count}')::int = 4
                    and (j #>> '{fields,category,distinct}')::int = 3
                    and (j #>> '{fields,category,by_value,গরু,n}')::int = 2
                    and (j #>> '{fields,category,by_value,গরু,sums,amount}')::numeric = 15000
                    and (j #>> '{distinct,unions}')::int = 2 and (j ->> 'total')::int = 4 then '✅' else '❌' end;
    detail := 'টাকা ' || (j #>> '{fields,amount,sum}') || ' · ক্যাটাগরি ' || (j #>> '{fields,category,distinct}') || ' · ' || (j #> '{fields,category,by_value}')::text;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৪
  t := t + 1; n := t; test := 'বানান একীকরণ: এডমিন হিসেবে "গাভি" → "গরু" — মোট ক্যাটাগরি এক কমে; লগইন ছাড়া (anon) চালানো যায় না';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    stage := 'anon';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
      perform public.project_field_rename_value('zz_selftest', 'category', 'গাভি', 'গরু');
      a_ok := false; msg_a := 'anon চালাতে পেরেছে!';
      raise exception 'asf-inner';
    exception when others then
      if sqlerrm = 'asf-inner' then null; else a_ok := sqlstate = '42501'; msg_a := 'anon: ' || sqlerrm; end if;
    end;
    stage := 'admin';
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    cnt := public.project_field_rename_value('zz_selftest', 'category', 'গাভি', 'গরু');
    reset role;
    j := public.project_stats('zz_selftest');
    b_ok := cnt = 1 and (j #>> '{fields,category,distinct}')::int = 2 and (j #>> '{fields,category,by_value,গরু,n}')::int = 3;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := 'বদলেছে ' || cnt || ' টি · মোট ক্যাটাগরি এখন ' || (j #>> '{fields,category,distinct}') || ' · ' || msg_a;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৫
  t := t + 1; n := t; test := 'খারাপ মান (যাচাই এড়িয়ে) থাকলেও project_stats ভাঙে না — সংখ্যা ছাড়া মান যোগফলে আসে না';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    alter table public.housing_beneficiaries disable trigger housing_beneficiaries_validate;
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'খারাপ', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": "abc", "category": 123}');
    alter table public.housing_beneficiaries enable trigger housing_beneficiaries_validate;
    stage := 'action';
    j := public.project_stats('zz_selftest');
    ok := case when (j #>> '{fields,amount,sum}')::numeric = 20000 and (j #>> '{fields,category,distinct}')::int = 3 and (j ->> 'total')::int = 5 then '✅' else '❌' end;
    detail := 'মোট ' || (j ->> 'total') || ' · টাকা ' || (j #>> '{fields,amount,sum}') || ' · ক্যাটাগরি ' || (j #>> '{fields,category,distinct}');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৬
  t := t + 1; n := t; test := 'ঘর নির্মাণে নতুন উপ-প্রকল্প: কাউন্টার সারি আসে, গ্রুপের স্ট্যাটে উপ-প্রকল্প হিসেবে দেখা যায়';
  begin
    stage := 'setup';
    insert into public.projects (key, parent_key, slug, name_bn, name_en, file_prefix, photo_mode)
    values ('zz_sub', 'housing', 'zz-sub', 'পরীক্ষা উপ-প্রকল্প', 'Selftest sub', 'zzsub', 'before_after');
    stage := 'action';
    select last_serial into cnt from public.housing_serial_counters where project_type = 'zz_sub';
    j := public.project_stats('housing');
    ok := case when cnt = 0 and (j #>> '{by_project,zz_sub}')::int = 0 and (j ->> 'total')::bigint = live_n then '✅' else '❌' end;
    detail := 'কাউন্টার ' || coalesce(cnt::text, 'নেই') || ' · ' || (j -> 'by_project')::text;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৭
  t := t + 1; n := t; test := 'বাল্ক v2: লাইভ সারিতে পিতার নাম ও ঠিকানা "" পাঠালে মান অপরিবর্তিত (আগের বাগ ঠিক)';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins খালি';
  else
    begin
      stage := 'setup';
      select serial_no, father_or_husband_name || '|' || address into ser, s
        from public.housing_beneficiaries where project_type = 'semi_pucca' order by serial_no limit 1;
      if ser is null then
        raise exception 'semi_pucca তে রেকর্ড নেই';
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      j := public.housing_bulk_update_by_serial('semi_pucca', jsonb_build_array(jsonb_build_object('serial_no', ser, 'father_or_husband_name', '', 'address', '')));
      reset role;
      select father_or_husband_name || '|' || address into s2 from public.housing_beneficiaries where project_type = 'semi_pucca' and serial_no = ser;
      ok := case when (j ->> 'updated')::int = 1 and s2 = s then '✅' else '❌' end;
      detail := 'সিরিয়াল ' || ser || ' · ' || j::text || ' · আগে "' || s || '" · পরে "' || s2 || '" (ফিরিয়ে দেওয়া হয়েছে)';
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ৮
  t := t + 1; n := t; test := 'বাল্ক v2: "_clear" দিয়ে ঐচ্ছিক মান মোছা যায়, আবশ্যক (টাকা) মোছা যায় না; কাস্টম মান মার্জ হয়';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    select serial_no into ser from public.housing_beneficiaries where project_type = 'zz_selftest' and name = 'ঘ';
    stage := 'action';
    j := public.housing_bulk_update_by_serial('zz_selftest', jsonb_build_array(jsonb_build_object(
           'serial_no', ser, '_clear', jsonb_build_array('extra.item_name', 'union_name'), 'extra', jsonb_build_object('amount', 2500))));
    select extra, union_name into j2, s from public.housing_beneficiaries where project_type = 'zz_selftest' and serial_no = ser;
    a_ok := (j ->> 'updated')::int = 1 and not (j2 ? 'item_name') and (j2 ->> 'amount')::int = 2500 and j2 ->> 'category' = 'গাভি' and s = '';
    msg_a := j2::text;
    begin
      perform public.housing_bulk_update_by_serial('zz_selftest', jsonb_build_array(jsonb_build_object('serial_no', ser, '_clear', jsonb_build_array('extra.amount'))));
      b_ok := false; msg_b := 'আবশ্যক মান মুছে গেছে!';
    exception when others then
      b_ok := true; msg_b := sqlerrm;
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := 'পরে: ' || msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৯
  t := t + 1; n := t; test := 'লগইন ছাড়া (anon): খসড়া প্রকল্পের পরের সিরিয়াল জানা যায় না (null); প্রকাশিতটির যায়';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
    stage := 'action';
    cnt := public.housing_next_serial('zz_selftest');
    cnt2 := public.housing_next_serial('semi_pucca');
    ok := case when cnt is null and cnt2 is not null then '✅' else '❌' end;
    detail := 'খসড়া: ' || coalesce(cnt::text, 'null') || ' · semi_pucca: ' || coalesce(cnt2::text, 'null');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১০
  t := t + 1; n := t; test := 'project_create: anon নিষেধ; এডমিন প্রকল্প+ফিল্ড একসাথে তৈরি করেন (খসড়া); একটি ফিল্ড ভুল হলে কিছুই তৈরি হয় না';
  begin
    stage := 'anon';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
      perform public.project_create('{"key":"zz_pc","slug":"zz-pc","name_bn":"ক","name_en":"A","file_prefix":"zzpc"}', '[]');
      a_ok := false; msg_a := 'anon তৈরি করতে পেরেছে!';
      raise exception 'asf-inner';
    exception when others then
      if sqlerrm = 'asf-inner' then null; else a_ok := sqlstate = '42501'; msg_a := 'anon: ' || sqlerrm; end if;
    end;
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    j := public.project_create(
      '{"key":"zz_pc","slug":"zz-pc","name_bn":"পরীক্ষা","name_en":"Test","file_prefix":"zzpc","photo_mode":"after_only","geo_depth":"union","is_published":true}',
      '[{"key":"amount","label_bn":"টাকা","type":"money","required":true,"show_in_table":true},{"key":"category","label_bn":"ক্যাটাগরি","type":"category"}]');
    select count(*) into cnt from public.project_fields where project_key = 'zz_pc';
    select count(*) into cnt2 from public.projects where key = 'zz_pc' and not is_published;
    b_ok := (j ->> 'fields')::int = 2 and cnt = 2 and cnt2 = 1;
    msg_b := j::text || ' · খসড়া: ' || (cnt2 = 1);
    begin
      perform public.project_create('{"key":"zz_pc2","slug":"zz-pc-2","name_bn":"খ","name_en":"B","file_prefix":"zzpcb"}',
                                    '[{"key":"ok_field","label_bn":"ঠিক","type":"text"},{"key":"bad","label_bn":"ভুল","type":"magic"}]');
      msg_b := msg_b || ' · ভুল ফিল্ডসহ তৈরি হয়ে গেছে!'; b_ok := false;
    exception when others then
      select count(*) into cnt from public.projects where key = 'zz_pc2';
      b_ok := b_ok and cnt = 0;
      msg_b := msg_b || ' · ভুল ফিল্ড: কিছুই তৈরি হয়নি (' || cnt || ')';
    end;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ' || msg_b;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১১
  t := t + 1; n := t; test := 'projects_overview: লগইন ছাড়া খসড়া আসে না (true দিলেও); এডমিনের ড্যাশবোর্ডে খসড়া ও ছবি-বাকির সংখ্যা আসে';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    stage := 'anon';
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
    j := public.projects_overview(true);
    a_ok := not exists (select 1 from jsonb_array_elements(j -> 'projects') e where e ->> 'key' = 'zz_selftest')
            and exists (select 1 from jsonb_array_elements(j -> 'projects') e where e ->> 'key' = 'housing')
            and (j #>> '{global,total}')::bigint = live_n;
    msg_a := 'anon: ' || (select string_agg(e ->> 'key', ', ') from jsonb_array_elements(j -> 'projects') e) || ' · মোট ' || (j #>> '{global,total}');
    reset role;
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    j := public.projects_overview(true);
    select e into j2 from jsonb_array_elements(j -> 'projects') e where e ->> 'key' = 'zz_selftest';
    b_ok := j2 is not null and (j2 ->> 'without_photo')::int = 4 and (j2 #>> '{stats,fields,amount,sum}')::numeric = 20000;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · এডমিন: খসড়া ' || coalesce(j2 ->> 'key', 'নেই') || ', ছবি বাকি ' || coalesce(j2 ->> 'without_photo', '—');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১২
  t := t + 1; n := t; test := 'ক্রম বদল ও ফিল্ডের ব্যবহার: এডমিন পারেন; anon এগুলো চালাতে পারে না';
  begin
    stage := 'setup'; perform pg_temp.asf_mk11();
    stage := 'anon';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
      perform public.project_field_usage('zz_selftest', 'category');
      a_ok := false; msg_a := 'anon ব্যবহার দেখতে পেরেছে!';
      raise exception 'asf-inner';
    exception when others then
      if sqlerrm = 'asf-inner' then null; else a_ok := sqlstate = '42501'; msg_a := 'anon: অনুমতি নেই'; end if;
    end;
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('request.jwt.claim.sub', '', true);
      perform public.projects_reorder(array['tin', 'semi_pucca']);
      a_ok := false; msg_a := msg_a || ' · anon ক্রম বদলাতে পেরেছে!';
      raise exception 'asf-inner';
    exception when others then
      if sqlerrm = 'asf-inner' then null; else a_ok := a_ok and sqlstate = '42501'; end if;
    end;
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    j := public.project_field_usage('zz_selftest', 'category');
    cnt := public.projects_reorder(array['tin', 'semi_pucca']);
    reset role;
    select sort_order into cnt2 from public.projects where key = 'tin';
    b_ok := (j ->> 'count')::int = 4 and cnt2 = 10;
    ok := case when a_ok and b_ok then '✅' else '❌' end;
    detail := msg_a || ' · ব্যবহার: ' || j::text || ' · ক্রম বদলেছে ' || cnt;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== শেষ
  t := t + 1; n := t; test := 'পরীক্ষার পরে লাইভ ডাটা অপরিবর্তিত (ফিঙ্গারপ্রিন্ট; অস্থায়ী প্রকল্প নেই; ক্রম আগের মতো)';
  fp1 := asf_meta.data_fingerprint();
  select count(*) into cnt from public.projects where key like 'zz_%';
  select count(*) into cnt2 from public.housing_serial_counters where project_type like 'zz_%';
  ok := case when fp1 = fp0 and cnt = 0 and cnt2 = 0
                  and exists (select 1 from pg_trigger where tgname = 'housing_beneficiaries_validate' and tgenabled <> 'D') then '✅' else '❌' end;
  detail := case when ok = '✅' then 'মিলেছে · যাচাই-ট্রিগার চালু' else 'আগে ' || fp0::text || ' · পরে ' || fp1::text end;
  return next;
end;
$f$;

with r as (select * from pg_temp.asf_11_selftest())
select n as "#", test as "পরীক্ষা", ok as "ফল", detail as "বিস্তারিত" from r
union all
select 99, 'সব মিলিয়ে',
       (select count(*) filter (where ok like '✅%') || ' ✅ · ' || count(*) filter (where ok like '❌%') || ' ❌' from r),
       case when (select count(*) filter (where ok like '❌%') from r) = 0 then 'সব ঠিক আছে — পুরো টেবিল AI-কে পাঠান' else '❌ সারিগুলো সহ পুরো টেবিল AI-কে পাঠান' end
order by 1;
