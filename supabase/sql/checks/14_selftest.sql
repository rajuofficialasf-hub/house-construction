-- =====================================================================
-- checks/14_selftest.sql — SQL ১৪ (প্রকল্পভিত্তিক ইউজার) এর নিজে-নিজে পরীক্ষা (পর্ব চ, M-ধাপ ১৮ · চেকলিস্ট সারি ৩৫)
-- ✅ কিছুই স্থায়ী হয় না: প্রতিটি পরীক্ষা নিজের সাব-ট্রানজেকশনে অস্থায়ী প্রকল্প (zz_…) ও অস্থায়ী ইউজার
--    (@selftest.invalid) বানিয়ে আসল সেশনের মতো (role authenticated + JWT) চালায়, তারপর সব ফিরিয়ে দেয়।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run। সব ✅ আসা উচিত — পুরো টেবিল AI-কে পাঠান।
-- =====================================================================

-- অস্থায়ী প্রকল্প, রেকর্ড আর ইউজার (postgres হিসেবে — গার্ড প্রযোজ্য নয়)
create or replace function pg_temp.asf14_setup()
returns void
language plpgsql
as $m$
begin
  insert into public.projects (key, slug, name_bn, name_en, file_prefix, photo_mode, geo_depth)
  values ('zz_a', 'zz-a', 'পরীক্ষা ক', 'Test A', 'zza', 'after_only', 'union'),
         ('zz_b', 'zz-b', 'পরীক্ষা খ', 'Test B', 'zzb', 'after_only', 'union');
  insert into public.projects (key, slug, name_bn, name_en, is_group, photo_mode, file_prefix)
  values ('zz_g', 'zz-g', 'পরীক্ষা গ্রুপ', 'Test group', true, 'none', null);
  insert into public.projects (key, slug, name_bn, name_en, parent_key, file_prefix, photo_mode)
  values ('zz_c', 'zz-c', 'পরীক্ষা গ-উপ', 'Test child', 'zz_g', 'zzc', 'after_only');
  insert into public.project_fields (project_key, key, label_bn, label_en, type, required, visibility, sort_order)
  select k, f.key, f.lb, f.le, f.t, false, f.v, f.o
    from unnest(array['zz_a', 'zz_b', 'zz_c']) k,
         (values ('amount', 'টাকা', 'Amount', 'money', 'public', 1), ('category', 'ক্যাটাগরি', 'Category', 'category', 'public', 2),
                 ('phone', 'মোবাইল', 'Mobile', 'phone', 'admin', 3)) as f(key, lb, le, t, v, o);
  insert into public.housing_beneficiaries (project_type, serial_no, year, name, father_or_husband_name, division, district, upazila, union_name, address, extra)
  values ('zz_a', 1, 2025, 'ক-এক', 'পিতা', 'ঢাকা', 'ঢাকা', 'সাভার', 'আশুলিয়া', 'গ্রাম', '{"amount": 1000, "category": "গরু"}'),
         ('zz_a', 2, 2025, 'ক-দুই', '', 'ঢাকা', 'ঢাকা', 'সাভার', '', '', '{"amount": 2000}'),
         ('zz_b', 1, 2025, 'খ-এক', 'পিতা', 'ঢাকা', 'ঢাকা', 'সাভার', '', 'গ্রাম', '{"amount": 3000}');
  -- ইউজার: e1 = শুধু zz_a · e2 = সব প্রকল্প · e3 = নিষ্ক্রিয় (zz_a) · e4 = গ্রুপ zz_g · e5 = এখনো এডমিন নয়
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-0000000000e1', 'e1@selftest.invalid'), ('00000000-0000-4000-8000-0000000000e2', 'e2@selftest.invalid'),
    ('00000000-0000-4000-8000-0000000000e3', 'e3@selftest.invalid'), ('00000000-0000-4000-8000-0000000000e4', 'e4@selftest.invalid'),
    ('00000000-0000-4000-8000-0000000000e5', 'e5@selftest.invalid');
  insert into public.housing_admins (user_id, email, role, all_projects, is_active) values
    ('00000000-0000-4000-8000-0000000000e1', 'e1@selftest.invalid', 'editor', false, true),
    ('00000000-0000-4000-8000-0000000000e2', 'e2@selftest.invalid', 'editor', true, true),
    ('00000000-0000-4000-8000-0000000000e3', 'e3@selftest.invalid', 'editor', false, false),
    ('00000000-0000-4000-8000-0000000000e4', 'e4@selftest.invalid', 'editor', false, true);
  insert into public.housing_admin_projects (user_id, project_key) values
    ('00000000-0000-4000-8000-0000000000e1', 'zz_a'), ('00000000-0000-4000-8000-0000000000e3', 'zz_a'),
    ('00000000-0000-4000-8000-0000000000e4', 'zz_g');
end;
$m$;

-- আসল সেশনের মতো (সাব-ট্রানজেকশন ফিরে গেলে role ও claims ও ফিরে যায়)
create or replace function pg_temp.asf14_as(p_uid uuid, p_email text)
returns void
language plpgsql
as $m$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end;
$m$;

create or replace function pg_temp.asf_14_selftest()
returns table (n integer, test text, ok text, detail text)
language plpgsql
as $f$
declare
  e1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  e2 constant uuid := '00000000-0000-4000-8000-0000000000e2';
  e3 constant uuid := '00000000-0000-4000-8000-0000000000e3';
  e4 constant uuid := '00000000-0000-4000-8000-0000000000e4';
  main_uid uuid; main_email text;
  fp0 jsonb; t integer := 0; stage text; cnt bigint; cnt2 bigint; rid uuid; rid_b uuid; s text; arr text[]; okk boolean; errs text := '';
begin
  if to_regprocedure('public.housing_my_project_keys()') is null then
    n := 0; test := '14_project_users.sql চালানো হয়েছে?'; ok := '❌'; detail := 'আগে 14_project_users.sql চালান';
    return next; return;
  end if;
  fp0 := asf_meta.data_fingerprint();
  select a.user_id, a.email into main_uid, main_email from public.housing_admins a where a.role = 'main_admin' and a.is_active limit 1;

  -- ===================================================================== ১. ভূমিকা
  t := t + 1; n := t; test := 'ভূমিকা: মূল এডমিন ঠিক ১ জন, পুরনো "admin" ভূমিকা আর নেই';
  ok := case when (select count(*) from public.housing_admins where role = 'main_admin') = 1
                  and not exists (select 1 from public.housing_admins where role not in ('main_admin', 'editor')) then '✅' else '❌' end;
  detail := (select string_agg(role || (case when all_projects then ' (সব প্রকল্প)' else '' end), ', ') from public.housing_admins);
  return next;

  -- ===================================================================== ২. নিজের প্রকল্পে যোগ, অন্যটিতে নয়
  t := t + 1; n := t; test := 'ইউজার (শুধু zz_a): zz_a তে রেকর্ড যোগ হয়, zz_b তে আটকায়';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    stage := 'zz_a';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
    values ('zz_a', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার', '{"amount": 500}') returning id into rid;
    stage := 'zz_b';
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila) values ('zz_b', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার');
      okk := false; s := 'zz_b তে যোগ হয়ে গেছে!';
    exception when others then okk := sqlstate = '42501'; s := 'zz_b: ' || sqlerrm;
    end;
    ok := case when rid is not null and okk then '✅' else '❌' end; detail := s;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৩. এডিট
  t := t + 1; n := t; test := 'ইউজার: নিজের প্রকল্পে মান বদল ও ফাঁকা ঘর ভরা যায়; অন্য প্রকল্পের রেকর্ডে বদল ০ সারি';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    stage := 'edit';
    update public.housing_beneficiaries set extra = extra || '{"amount": 1500, "category": "ছাগল"}', address = 'নতুন গ্রাম', year = 2026
     where project_type = 'zz_a' and serial_no = 2;
    update public.housing_beneficiaries set name = 'হ্যাক' where project_type = 'zz_b';
    select count(*) into cnt from public.housing_beneficiaries where project_type = 'zz_b' and name = 'হ্যাক';
    ok := case when exists (select 1 from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 2 and address = 'নতুন গ্রাম' and (extra ->> 'amount')::int = 1500)
                    and cnt = 0 then '✅' else '❌' end;
    detail := 'zz_b তে বদলানো সারি: ' || cnt;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৪. ফাঁকা করা নিষেধ
  t := t + 1; n := t; test := 'ইউজার: ভরা ঘর ফাঁকা করা যায় না — ঠিকানা, পিতা/স্বামী, ইউনিয়ন, কাস্টম মান, বাল্কের _clear';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    errs := '';
    foreach s in array array[
      $q$update public.housing_beneficiaries set address = '' where project_type = 'zz_a' and serial_no = 1$q$,
      $q$update public.housing_beneficiaries set father_or_husband_name = '   ' where project_type = 'zz_a' and serial_no = 1$q$,
      $q$update public.housing_beneficiaries set union_name = '' where project_type = 'zz_a' and serial_no = 1$q$,
      $q$update public.housing_beneficiaries set extra = extra - 'category' where project_type = 'zz_a' and serial_no = 1$q$,
      $q$update public.housing_beneficiaries set extra = extra || '{"category": ""}' where project_type = 'zz_a' and serial_no = 1$q$,
      $q$select public.housing_bulk_update_by_serial('zz_a', '[{"serial_no": 1, "_clear": ["extra.category"]}]')$q$
    ] loop
      begin
        execute s;
        errs := errs || '✗ গেছে: ' || left(s, 60) || ' | ';
      exception when others then
        if sqlstate <> '42501' then errs := errs || '✗ অন্য ত্রুটি: ' || sqlerrm || ' | '; end if;
      end;
    end loop;
    ok := case when errs = '' then '✅' else '❌' end;
    detail := case when errs = '' then '৬টিই আটকেছে (বাংলা বার্তা, 42501)' else errs end;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৫. সিরিয়াল বদল নিষেধ
  t := t + 1; n := t; test := 'ইউজার: সিরিয়াল নম্বর বদলানো যায় না (RPC দিয়েও নয়)';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    select id into rid from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 2;
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    begin
      perform public.housing_change_serial(rid, 50);
      okk := false; s := 'RPC দিয়ে বদলে গেছে!';
    exception when others then okk := true; s := sqlerrm;
    end;
    ok := case when okk and exists (select 1 from public.housing_beneficiaries where id = rid and serial_no = 2) then '✅' else '❌' end;
    detail := s;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৬. ছবি
  t := t + 1; n := t; test := 'ইউজার: ছবি না থাকলে নতুন ছবি দেওয়া যায়; থাকা ছবি বদলানো বা মোছা যায় না';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    stage := 'নতুন ছবি';
    update public.housing_beneficiaries set current_photo_url = 'https://example.invalid/zz_a/0002/current.webp',
           current_thumb_url = 'https://example.invalid/zz_a/0002/current_thumb.webp', photo_updated_at = now()
     where project_type = 'zz_a' and serial_no = 2;
    errs := '';
    begin
      update public.housing_beneficiaries set current_photo_url = 'https://example.invalid/other.webp' where project_type = 'zz_a' and serial_no = 2;
      errs := errs || 'বদল গেছে! ';
    exception when others then if sqlstate <> '42501' then errs := errs || sqlerrm; end if;
    end;
    begin
      update public.housing_beneficiaries set current_photo_url = null, current_thumb_url = null where project_type = 'zz_a' and serial_no = 2;
      errs := errs || 'মোছা গেছে! ';
    exception when others then if sqlstate <> '42501' then errs := errs || sqlerrm; end if;
    end;
    ok := case when errs = '' and exists (select 1 from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 2 and current_photo_url like '%current.webp') then '✅' else '❌' end;
    detail := coalesce(nullif(errs, ''), 'নতুন ছবি ✓ · বদল ✗ · মোছা ✗');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৭. গোপন মান
  t := t + 1; n := t; test := 'ইউজার: নিজের প্রকল্পে গোপন মান দেওয়া/বদল যায়, ফাঁকা করা যায় না; অন্য প্রকল্পের গোপন মান দেখা যায় না';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    select id into rid from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 1;
    select id into rid_b from public.housing_beneficiaries where project_type = 'zz_b' and serial_no = 1;
    insert into public.beneficiary_private (record_id, data) values (rid_b, '{"phone": "01711000000"}');
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    stage := 'দেওয়া';
    insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "01711111111"}');
    update public.beneficiary_private set data = '{"phone": "01811111111"}' where record_id = rid;
    errs := '';
    begin
      update public.beneficiary_private set data = '{}' where record_id = rid;
      errs := errs || 'ফাঁকা করা গেছে! ';
    exception when others then if sqlstate <> '42501' then errs := errs || sqlerrm; end if;
    end;
    select count(*) into cnt from public.beneficiary_private where record_id = rid_b;
    ok := case when errs = '' and cnt = 0 and exists (select 1 from public.beneficiary_private where record_id = rid and data ->> 'phone' = '01811111111') then '✅' else '❌' end;
    detail := coalesce(nullif(errs, ''), 'অন্য প্রকল্পের গোপন সারি দেখা যায়: ' || cnt);
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৮. মোছা নিষেধ
  t := t + 1; n := t; test := 'ইউজার: রেকর্ড ও গোপন মান মোছা যায় না (০ সারি)';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    select id into rid from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 1;
    insert into public.beneficiary_private (record_id, data) values (rid, '{"phone": "01711111111"}');
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    delete from public.housing_beneficiaries where project_type = 'zz_a';
    get diagnostics cnt = row_count;
    delete from public.beneficiary_private where record_id = rid;
    get diagnostics cnt2 = row_count;
    ok := case when cnt = 0 and cnt2 = 0 and (select count(*) from public.housing_beneficiaries where project_type = 'zz_a') = 2 then '✅' else '❌' end;
    detail := 'মোছা রেকর্ড ' || cnt || ' · মোছা গোপন সারি ' || cnt2;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ৯. সেটিংস নিষেধ
  t := t + 1; n := t; test := 'ইউজার: প্রকল্প তৈরি, প্রকল্পের সেটিং বদল, ফিল্ড যোগ — কোনোটিই নয় (প্রশ্ন ২২)';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    errs := '';
    begin
      perform public.project_create('{"key":"zz_new","slug":"zz-new","name_bn":"ক","name_en":"x","file_prefix":"zzn"}', '[]');
      errs := errs || 'প্রকল্প তৈরি হয়ে গেছে! ';
    exception when others then null;
    end;
    update public.projects set name_bn = 'হ্যাক' where key = 'zz_a';
    get diagnostics cnt = row_count;
    if cnt > 0 then errs := errs || 'সেটিং বদলেছে! '; end if;
    begin
      insert into public.project_fields (project_key, key, label_bn, type) values ('zz_a', 'zz_x', 'x', 'text');
      errs := errs || 'ফিল্ড যোগ হয়েছে! ';
    exception when others then null;
    end;
    ok := case when errs = '' then '✅' else '❌' end; detail := coalesce(nullif(errs, ''), '৩টিই আটকেছে');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১০. Storage
  t := t + 1; n := t; test := 'Storage: ইউজার নিজের প্রকল্পের ফোল্ডারে নতুন ফাইল রাখতে পারেন; অন্য প্রকল্প, কভার আর ওভাররাইট — নয়';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    insert into storage.objects (bucket_id, name) values ('housing-photos', 'housing/zz_a/0001/current.webp');
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    stage := 'নিজের ফোল্ডার';
    insert into storage.objects (bucket_id, name) values ('housing-photos', 'housing/zz_a/0002/current.webp');
    errs := '';
    foreach s in array array['housing/zz_b/0001/current.webp', 'housing/_projects/zz_a/cover.webp'] loop
      begin
        insert into storage.objects (bucket_id, name) values ('housing-photos', s);
        errs := errs || 'গেছে: ' || s || ' ';
      exception when others then null;
      end;
    end loop;
    update storage.objects set name = name where bucket_id = 'housing-photos' and name = 'housing/zz_a/0001/current.webp';
    get diagnostics cnt = row_count;
    if cnt > 0 then errs := errs || 'ওভাররাইট গেছে! '; end if;
    ok := case when errs = '' then '✅' else '❌' end; detail := coalesce(nullif(errs, ''), 'নিজের ✓ · অন্য প্রকল্প ✗ · কভার ✗ · ওভাররাইট ✗');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১১. নিষ্ক্রিয় ইউজার
  t := t + 1; n := t; test := 'নিষ্ক্রিয় ইউজার: এডমিন নন, কিছুই লিখতে পারেন না, housing_current_admin খালি';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e3, 'e3@selftest.invalid');
    okk := not public.is_housing_admin() and not exists (select 1 from public.housing_current_admin());
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila) values ('zz_a', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার');
      okk := false;
    exception when others then null;
    end;
    ok := case when okk then '✅' else '❌' end; detail := 'is_housing_admin = ' || public.is_housing_admin()::text;
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১২. সব প্রকল্প ও গ্রুপ-বরাদ্দ
  t := t + 1; n := t; test := '"সব প্রকল্প" ইউজার যেকোনো প্রকল্পে যোগ করেন কিন্তু মুছতে পারেন না; গ্রুপ-বরাদ্দ = তার উপ-প্রকল্প';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e2, 'e2@selftest.invalid');
    stage := 'সব প্রকল্প';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila) values ('zz_b', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার');
    delete from public.housing_beneficiaries where project_type = 'zz_b';
    get diagnostics cnt = row_count;
    reset role;
    perform pg_temp.asf14_as(e4, 'e4@selftest.invalid');
    stage := 'গ্রুপ';
    insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila) values ('zz_c', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার');
    arr := public.housing_my_project_keys();
    okk := false;
    begin
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila) values ('zz_a', 2026, 'নতুন', 'ঢাকা', 'ঢাকা', 'সাভার');
    exception when others then okk := true;
    end;
    ok := case when cnt = 0 and okk and arr @> array['zz_g', 'zz_c'] and not ('zz_a' = any (arr)) then '✅' else '❌' end;
    detail := 'মোছা ' || cnt || ' · গ্রুপ-ইউজারের প্রকল্প: ' || array_to_string(arr, ', ');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১৩. খসড়া, লগ ও নিজের তথ্য
  t := t + 1; n := t; test := 'ইউজার নিজের খসড়া প্রকল্প ও তার লগ দেখেন, অন্যটির নয়; housing_current_admin = editor + zz_a';
  begin
    stage := 'setup'; perform pg_temp.asf14_setup();
    perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
    select string_agg(key, ',' order by key) into s from public.projects where key in ('zz_a', 'zz_b');
    okk := s = 'zz_a';
    s := s || ' · লগ: ' || coalesce((select string_agg(distinct project_type, ',') from public.housing_activity_log where project_type in ('zz_a', 'zz_b')), '—');
    okk := okk and not exists (select 1 from public.housing_activity_log where project_type = 'zz_b')
                and exists (select 1 from public.housing_activity_log where project_type = 'zz_a');
    select role || ':' || array_to_string(projects, ',') into stage from public.housing_current_admin();
    ok := case when okk and stage = 'editor:zz_a' then '✅' else '❌' end;
    detail := s || ' · নিজের তথ্য ' || coalesce(stage, '—');
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== ১৪. মূল এডমিন
  t := t + 1; n := t; test := 'মূল এডমিন: ফাঁকা করা, ছবি বদল, সিরিয়াল বদল, মোছা, সেটিং বদল, ওভাররাইট — সব পারেন';
  if main_uid is null then
    ok := '❌'; detail := 'মূল এডমিন নেই';
  else
    begin
      stage := 'setup'; perform pg_temp.asf14_setup();
      insert into storage.objects (bucket_id, name) values ('housing-photos', 'housing/zz_a/0001/current.webp');
      update public.housing_beneficiaries set current_photo_url = 'https://example.invalid/a.webp' where project_type = 'zz_a' and serial_no = 1;
      select id into rid from public.housing_beneficiaries where project_type = 'zz_a' and serial_no = 2;
      perform pg_temp.asf14_as(main_uid, main_email);
      stage := 'ফাঁকা'; update public.housing_beneficiaries set address = '', extra = extra - 'category' where project_type = 'zz_a' and serial_no = 1;
      stage := 'ছবি'; update public.housing_beneficiaries set current_photo_url = 'https://example.invalid/b.webp' where project_type = 'zz_a' and serial_no = 1;
      stage := 'সিরিয়াল'; perform public.housing_change_serial(rid, 9);
      stage := 'সেটিং'; update public.projects set name_bn = 'নতুন নাম' where key = 'zz_a';
      stage := 'ওভাররাইট'; update storage.objects set name = name where bucket_id = 'housing-photos' and name = 'housing/zz_a/0001/current.webp';
      get diagnostics cnt = row_count;
      stage := 'মোছা'; delete from public.housing_beneficiaries where id = rid;
      ok := case when cnt = 1 and not exists (select 1 from public.housing_beneficiaries where id = rid)
                      and exists (select 1 from public.projects where key = 'zz_a' and name_bn = 'নতুন নাম') then '✅' else '❌' end;
      detail := 'ওভাররাইট সারি ' || cnt;
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৫. ইউজার ব্যবস্থাপনা
  t := t + 1; n := t; test := 'ইউজার-ব্যবস্থাপনা: মূল এডমিন যোগ/বরাদ্দ করেন (লগসহ); অচেনা ইমেইল, মূল এডমিন বদল, অচেনা প্রকল্প আটকায়; ইউজার তালিকা দেখতে পান না';
  if main_uid is null then
    ok := '❌'; detail := 'মূল এডমিন নেই';
  else
    begin
      stage := 'setup'; perform pg_temp.asf14_setup();
      perform pg_temp.asf14_as(e1, 'e1@selftest.invalid');
      okk := false;
      begin perform * from public.housing_admin_users(); exception when others then okk := true; end;
      reset role;
      perform pg_temp.asf14_as(main_uid, main_email);
      stage := 'যোগ';
      perform public.housing_admin_user_save('E5@SELFTEST.INVALID', false, array['zz_b'], true);
      errs := '';
      begin perform public.housing_admin_user_save('nobody@selftest.invalid', false, '{}', true); errs := errs || 'অচেনা ইমেইল গেছে! '; exception when others then null; end;
      begin perform public.housing_admin_user_save(main_email, true, '{}', true); errs := errs || 'মূল এডমিন বদলেছে! '; exception when others then null; end;
      begin perform public.housing_admin_user_save('e1@selftest.invalid', false, array['zz_nope'], true); errs := errs || 'অচেনা প্রকল্প গেছে! '; exception when others then null; end;
      select string_agg(email || '=' || array_to_string(projects, ','), ' ') into s from public.housing_admin_users() where email like '%selftest.invalid';
      okk := okk and errs = '' and s like '%e5@selftest.invalid=zz_b%'
             and exists (select 1 from public.housing_activity_log where action = 'admin_user_update' and record_name = 'e5@selftest.invalid');
      ok := case when okk then '✅' else '❌' end; detail := coalesce(nullif(errs, ''), s);
      raise exception 'asf-rollback';
    exception when others then
      if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := stage || ': ' || sqlerrm; end if;
    end;
  end if;
  return next;

  -- ===================================================================== ১৬. anon
  t := t + 1; n := t; test := 'anon (লগইন ছাড়া): কোনো প্রকল্পে লেখার অধিকার নেই, ইউজার-তালিকা ও বরাদ্দ-টেবিল বন্ধ';
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    okk := cardinality(public.housing_my_project_keys()) = 0;
    begin perform * from public.housing_admin_users(); okk := false; exception when others then null; end;
    begin perform count(*) from public.housing_admin_projects; okk := false; exception when others then null; end;
    ok := case when okk then '✅' else '❌' end; detail := 'anon এর প্রকল্প: {}';
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then ok := '❌'; detail := sqlerrm; end if;
  end;
  return next;

  -- ===================================================================== শেষ
  t := t + 1; n := t; test := 'পরীক্ষার পরে কিছুই থেকে যায়নি; লাইভ ডাটার ফিঙ্গারপ্রিন্ট অপরিবর্তিত';
  ok := case when asf_meta.data_fingerprint() = fp0 and not exists (select 1 from public.projects where key like 'zz_%')
                  and not exists (select 1 from public.housing_admins where email like '%@selftest.invalid')
                  and not exists (select 1 from auth.users where email like '%@selftest.invalid') then '✅' else '❌' end;
  detail := 'রেকর্ড ' || coalesce(asf_meta.data_fingerprint() ->> 'records', '{}');
  return next;
end;
$f$;

with r as (select * from pg_temp.asf_14_selftest())
select n as "#", test as "পরীক্ষা", ok as "ফল", detail as "বিস্তারিত" from r
union all
select 99, 'সব মিলিয়ে',
       (select count(*) filter (where ok like '✅%') || ' ✅ · ' || count(*) filter (where ok like '❌%') || ' ❌' from r),
       case when (select count(*) filter (where ok like '❌%') from r) = 0 then 'সব ঠিক আছে — পুরো টেবিল AI-কে পাঠান' else '❌ সারিগুলো সহ পুরো টেবিল AI-কে পাঠান' end
order by 1;
