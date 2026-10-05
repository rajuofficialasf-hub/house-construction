-- =====================================================================
-- checks/12_selftest.sql — SQL ১২ (লগ v2) এর নিজে-নিজে পরীক্ষা (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ২৯)
-- ✅ কিছুই স্থায়ী হয় না: প্রতিটি পরীক্ষা নিজের সাব-ট্রানজেকশনে চলে আর ফিরে যায় — পরীক্ষার লগ-সারিও থাকে না।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run। সব ✅ আসা উচিত।
-- =====================================================================

create or replace function pg_temp.asf_mk12()
returns void
language plpgsql
as $m$
begin
  insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode, geo_depth)
  values ('zz_selftest', 'zz-selftest', 'পরীক্ষা প্রকল্প (selftest)', 'Selftest project', 'zzst', 'after_only', 'union');
  insert into public.project_fields (project_key, key, label_bn, label_en, type, required, visibility, sort_order)
  values ('zz_selftest', 'amount',   'টাকা',      'Amount',   'money',    true,  'public', 1),
         ('zz_selftest', 'category', 'ক্যাটাগরি', 'Category', 'category', false, 'public', 2),
         ('zz_selftest', 'phone',    'মোবাইল',    'Mobile',   'phone',    false, 'admin',  3);
end;
$m$;

create or replace function pg_temp.asf_12_selftest()
returns table (n integer, test text, ok text, detail text)
language plpgsql
as $f$
declare
  admin_uid uuid; admin_email text;
  fp0 jsonb; fp1 jsonb; stage text; t integer := 0;
  old_max bigint; old_md5 text; cnt bigint; rid uuid; j jsonb; s text; acts text; a_ok boolean;
begin
  if pg_get_functiondef('public.housing_log_record_change()'::regprocedure) !~ 'extra\.' then
    n := 0; test := '12_activity_log_v2.sql চালানো হয়েছে?'; ok := '❌'; detail := 'আগে 12_activity_log_v2.sql চালান';
    return next; return;
  end if;
  fp0 := asf_meta.data_fingerprint();
  select coalesce(max(id), 0), md5(coalesce(string_agg(l::text, E'\n' order by id), '')) into old_max, old_md5
    from public.housing_activity_log l;
  select a.user_id, a.email into admin_uid, admin_email from public.housing_admins a
   order by (a.role = 'main_admin') desc, a.created_at limit 1;

  -- ===================================================================== ১. নতুন রেকর্ডের স্ন্যাপশট
  t := t + 1; n := t; test := 'নতুন রেকর্ডের লগে ইউনিয়ন ও কাস্টম মান থাকে';
  begin
    stage := 'setup'; perform pg_temp.asf_mk12();
    stage := 'action';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, union_name, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', 'আশুলিয়া', '{"amount": 10000, "category": "গরু"}') returning id into rid;
    select details into j from public.housing_activity_log where record_id = rid and action = 'create' order by id desc limit 1;
    ok := case when j ->> 'union_name' = 'আশুলিয়া' and (j #>> '{extra,amount}')::int = 10000 then '✅' else '❌' end;
    detail := coalesce(j::text, 'লগ নেই');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ২. বদলের আগে→পরে
  t := t + 1; n := t; test := 'বদলের লগে ইউনিয়ন আর প্রতিটি কাস্টম মানের আগে→পরে ("extra.amount"); ছবি বদল আলাদা action';
  begin
    stage := 'setup'; perform pg_temp.asf_mk12();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, union_name, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', 'আশুলিয়া', '{"amount": 10000, "category": "গরু"}') returning id into rid;
    stage := 'action';
    update public.housing_beneficiaries set union_name = 'ধামসোনা', extra = extra || '{"amount": 12000}' where id = rid;
    select details into j from public.housing_activity_log where record_id = rid and action = 'update' order by id desc limit 1;
    a_ok := (j #>> '{changes,union_name,new}') = 'ধামসোনা' and (j #>> '{changes,extra.amount,old}')::int = 10000
            and (j #>> '{changes,extra.amount,new}')::int = 12000 and not (j -> 'changes' ? 'extra.category');
    update public.housing_beneficiaries set current_photo_url = 'https://example.invalid/c.webp', current_thumb_url = 'https://example.invalid/ct.webp' where id = rid;
    select action into s from public.housing_activity_log where record_id = rid order by id desc limit 1;
    ok := case when a_ok and s = 'photo_update' then '✅' else '❌' end;
    detail := coalesce((j -> 'changes')::text, 'লগ নেই') || ' · ছবি বদল: ' || coalesce(s, '—');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৩. মোছার স্ন্যাপশট
  t := t + 1; n := t; test := 'মোছা রেকর্ডের লগে কাস্টম মান থাকে (কী মুছল তা বোঝা যায়)';
  begin
    stage := 'setup'; perform pg_temp.asf_mk12();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 7000}') returning id into rid;
    stage := 'action';
    delete from public.housing_beneficiaries where id = rid;
    select details into j from public.housing_activity_log where record_id = rid and action = 'delete' order by id desc limit 1;
    ok := case when (j #>> '{extra,amount}')::int = 7000 then '✅' else '❌' end;
    detail := coalesce(j::text, 'লগ নেই');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৪. গোপন মান মাস্ক
  t := t + 1; n := t; test := 'গোপন মান বদলালে লগে শুধু ফিল্ডের নাম — মান (মোবাইল নম্বর) লগে কখনো নয়';
  begin
    stage := 'setup'; perform pg_temp.asf_mk12();
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_selftest', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 1}') returning id into rid;
    stage := 'action';
    insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "01711987654"}');
    update public.beneficiary_private set data = '{"phone": "01811222333"}' where record_id = rid;
    select count(*) into cnt from public.housing_activity_log where record_id = rid and action = 'private_update';
    select string_agg(details::text, ' ') into s from public.housing_activity_log where record_id = rid and action = 'private_update';
    ok := case when cnt = 2 and s like '%"phone"%' and s not like '%01711987654%' and s not like '%01811222333%' then '✅' else '❌' end;
    detail := cnt || ' টি লগ · ' || coalesce(s, '—');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৫. সেটিং বদলের লগ
  t := t + 1; n := t; test := 'প্রকল্প/ফিল্ডের সেটিং বদল লগ হয়: তৈরি, নাম বদল, প্রকাশ/অপ্রকাশ, ফিল্ড আর্কাইভ; শুধু ক্রম বদল লগ হয় না';
  begin
    stage := 'admin';
    if admin_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
    end if;
    stage := 'action';
    perform public.project_create('{"key":"zz_selftest","slug":"zz-selftest","name_bn":"পরীক্ষা","name_en":"Test","file_prefix":"zzst"}',
                                  '[{"key":"amount","label_bn":"টাকা","type":"money"}]');
    update public.projects set name_bn = 'পরীক্ষা (নতুন নাম)' where key = 'zz_selftest';
    update public.projects set is_published = true where key = 'zz_selftest';
    update public.projects set is_published = false where key = 'zz_selftest';
    update public.projects set sort_order = sort_order + 1 where key = 'zz_selftest';
    update public.project_fields set is_active = false where project_key = 'zz_selftest' and key = 'amount';
    reset role;
    select string_agg(action, ',' order by id) into acts from public.housing_activity_log
     where id > old_max and project_type = 'zz_selftest' and record_id is null;
    select actor_email into s from public.housing_activity_log where id > old_max and action = 'project_create' order by id desc limit 1;
    ok := case when acts = 'project_create,field_create,project_update,project_publish,project_unpublish,field_archive' then '✅' else '❌' end;
    detail := coalesce(acts, '—') || ' · কে: ' || coalesce(s, '—');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৬. লগে লেখা নিষেধ
  t := t + 1; n := t; test := 'লগে সরাসরি লেখা যায় না — এডমিনও নয় (শুধু ট্রিগার/ফাংশন লেখে)';
  if admin_uid is null then
    ok := '❌'; detail := 'housing_admins খালি';
  else
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated', 'email', admin_email)::text, true);
      perform set_config('request.jwt.claim.sub', admin_uid::text, true);
      set local role authenticated;
      stage := 'action';
      insert into public.housing_activity_log (action, details) values ('fake', '{}');
      ok := '❌'; detail := 'সরাসরি লেখা গেছে!';
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '✅'; detail := 'আটকেছে: ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== শেষ
  t := t + 1; n := t; test := 'পরীক্ষার পরে লগের পুরনো সারি হুবহু, লাইভ ডাটার ফিঙ্গারপ্রিন্ট অপরিবর্তিত';
  fp1 := asf_meta.data_fingerprint();
  ok := case when fp1 = fp0
                  and (select md5(coalesce(string_agg(l::text, E'\n' order by id), '')) from public.housing_activity_log l where id <= old_max) = old_md5
                  and not exists (select 1 from public.projects where key like 'zz_%') then '✅' else '❌' end;
  detail := 'লগের সারি ' || (fp1 #>> '{log,n}') || ' · সর্বোচ্চ id ' || (fp1 #>> '{log,max}');
  return next;
end;
$f$;

with r as (select * from pg_temp.asf_12_selftest())
select n as "#", test as "পরীক্ষা", ok as "ফল", detail as "বিস্তারিত" from r
union all
select 99, 'সব মিলিয়ে',
       (select count(*) filter (where ok like '✅%') || ' ✅ · ' || count(*) filter (where ok like '❌%') || ' ❌' from r),
       case when (select count(*) filter (where ok like '❌%') from r) = 0 then 'সব ঠিক আছে — পুরো টেবিল AI-কে পাঠান' else '❌ সারিগুলো সহ পুরো টেবিল AI-কে পাঠান' end
order by 1;
