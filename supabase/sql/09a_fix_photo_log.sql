-- =====================================================================
-- 09a_fix_photo_log.sql — জরুরি ফিক্স (M-ধাপ ১, ২০২৬-১০-০৫)
-- সমস্যা: 09_activity_log.sql এর লগ-ট্রিগারে `photo_kinds || 'current'` লেখা ছিল। Postgres এখানে 'current' কে
--   একটি অ্যারে হিসেবে পড়তে চায় → "malformed array literal" ত্রুটি। ফলে 09 চালানোর পর থেকে **কোনো রেকর্ডের ছবি
--   যোগ/বদল/মোছা (এডমিন ফর্ম, ছবির বাল্ক আপলোড, migrate-photos স্ক্রিপ্ট) ব্যর্থ হয়** — পুরো আপডেট বাতিল হয়।
--   (লোকাল Postgres এ 09 চালিয়ে পরীক্ষার সময় ধরা পড়েছে।)
-- ফিক্স: array_append(photo_kinds, 'current')। শুধু এই একটি ফাংশন বদলায়; টেবিল, ডাটা, লগের পুরনো সারি অপরিবর্তিত।
--
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run। শেষে একটি সারি: "✅ …"।
-- সব-অথবা-কিছুই-না: ভেতরের পরীক্ষা ব্যর্থ হলে ফিক্সও বাতিল হয় (কিছুই বদলায় না) — তখন লাল বার্তা AI-কে পাঠান।
-- পরীক্ষাটি একটি রেকর্ডের ছবির লিংক সাময়িক বদলে দেখে, তারপর নিজেই ফিরিয়ে দেয় (সাব-ট্রানজেকশন রোলব্যাক) —
-- লাইভ ডাটা বা লগে কিছুই থেকে যায় না।
-- পূর্বশর্ত: 09_activity_log.sql আগে চালানো থাকতে হবে।
-- =====================================================================

begin;

do $pre$
begin
  if to_regclass('public.housing_activity_log') is null then
    raise exception 'আগে 09_activity_log.sql চালান (চেকলিস্ট সারি ২৩) — কিছুই বদলায়নি।';
  end if;
end
$pre$;

create or replace function public.housing_log_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_email text;
  changes jsonb := '{}'::jsonb;
  act text;
  photo_kinds text[] := '{}';
  col text;
  o jsonb;
  n jsonb;
begin
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();

  if tg_op = 'INSERT' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'create', new.project_type, new.id, new.serial_no, new.name,
            jsonb_build_object('year', new.year, 'division', new.division, 'district', new.district, 'upazila', new.upazila,
                               'has_prev_photo', new.prev_photo_url is not null, 'has_current_photo', new.current_photo_url is not null));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'delete', old.project_type, old.id, old.serial_no, old.name,
            jsonb_build_object('year', old.year, 'division', old.division, 'district', old.district, 'upazila', old.upazila, 'address', old.address,
                               'father_or_husband_name', old.father_or_husband_name,
                               'had_prev_photo', old.prev_photo_url is not null, 'had_current_photo', old.current_photo_url is not null));
    return old;
  end if;

  -- UPDATE: বদলানো ফিল্ডের আগে→পরে
  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach col in array array['serial_no','year','name','father_or_husband_name','division','district','upazila','address','prev_photo_source','current_photo_source'] loop
    if o -> col is distinct from n -> col then
      changes := changes || jsonb_build_object(col, jsonb_build_object('old', o -> col, 'new', n -> col));
    end if;
  end loop;
  if old.prev_photo_url is distinct from new.prev_photo_url then
    photo_kinds := array_append(photo_kinds, 'prev'); -- || 'prev' দিলে Postgres 'prev' কে অ্যারে ভেবে ত্রুটি দেয় (09a ফিক্স)
    changes := changes || jsonb_build_object('prev_photo', jsonb_build_object('old', old.prev_photo_url is not null, 'new', new.prev_photo_url is not null));
  end if;
  if old.current_photo_url is distinct from new.current_photo_url then
    photo_kinds := array_append(photo_kinds, 'current');
    changes := changes || jsonb_build_object('current_photo', jsonb_build_object('old', old.current_photo_url is not null, 'new', new.current_photo_url is not null));
  end if;

  if changes = '{}'::jsonb then
    return new; -- শুধু updated_at/photo_updated_at ইত্যাদি — লগ নয়
  end if;

  if old.serial_no is distinct from new.serial_no then
    act := 'serial_change';
  elsif array_length(photo_kinds, 1) > 0 and (changes - 'prev_photo' - 'current_photo') = '{}'::jsonb then
    act := 'photo_update';
  else
    act := 'update';
  end if;

  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
  values (a_id, a_email, act, new.project_type, new.id, new.serial_no, new.name,
          jsonb_build_object('changes', changes, 'photo_kinds', to_jsonb(photo_kinds)));
  return new;
end;
$$;

-- ---------- নিজে নিজে পরীক্ষা: ছবির লিংক বদলালে ট্রিগার আর ত্রুটি দেয় না (সব ফিরিয়ে দেওয়া হয়) ----------
do $test$
declare
  rid uuid;
  logs_before bigint;
  logs_after bigint;
begin
  select id into rid from public.housing_beneficiaries order by project_type, serial_no limit 1;
  if rid is null then
    return; -- রেকর্ড নেই — পরীক্ষার দরকার নেই
  end if;
  select count(*) into logs_before from public.housing_activity_log;
  begin
    update public.housing_beneficiaries
       set current_photo_url = coalesce(current_photo_url, '') || '#selftest'
     where id = rid;
    raise exception using errcode = 'P0001', message = 'asf-selftest-rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'asf-selftest-rollback' then
        raise;
      end if;
  end;
  select count(*) into logs_after from public.housing_activity_log;
  if logs_after <> logs_before then
    raise exception 'পরীক্ষার লগ-সারি ফিরে যায়নি (%) — কিছুই বদলায়নি', logs_after - logs_before;
  end if;
end
$test$;

commit;

select '✅ ছবি-লগ ফিক্স বসেছে; ছবির লিংক বদলের পরীক্ষা সফল (লাইভ ডাটা অপরিবর্তিত)' as "ফল";
