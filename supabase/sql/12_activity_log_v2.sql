-- =====================================================================
-- 12_activity_log_v2.sql — একটিভিটি লগ v2 (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ২৯)
-- পূর্বশর্ত: 09_activity_log.sql (+09a), 10_projects.sql, 10b_project_guards.sql, 11_project_rpcs.sql
--
-- যা বদলায় (শুধু ফাংশন ও ট্রিগার; লগের পুরনো সারি অপরিবর্তিত):
--   housing_log_record_change() v2 — রেকর্ডের বদলে এখন ইউনিয়ন (union_name) আর প্রতিটি কাস্টম মানের (extra.<key>)
--     আগে→পরে; নতুন/মোছা রেকর্ডের স্ন্যাপশটে union_name ও extra। (09a এর array_append ফিক্স বহাল)
--   housing_log_private_change()   — গোপন মান (beneficiary_private) বদলালে লগে **শুধু ফিল্ডের নাম**, মান কখনো নয়
--                                    (action: private_update)
--   housing_log_config_change()    — প্রকল্প ও ফিল্ডের সেটিং বদলের লগ:
--     project_create / project_update / project_publish / project_unpublish / project_delete,
--     field_create / field_update / field_archive / field_restore / field_delete
--     (শুধু ক্রম বদল — sort_order — লগ হয় না, যাতে লগ ভরে না যায়)
-- লেখা হয় শুধু SECURITY DEFINER ট্রিগার দিয়ে (লগ-টেবিলে কারো লেখার পলিসি নেই — 09 এর নিয়ম বহাল)।
--
-- ✅ এক ট্রানজেকশনে, ফিঙ্গারপ্রিন্টসহ, আবার চালালে ক্ষতি নেই। আগে: backup/before_12.sql · পরে: checks/12_selftest.sql
-- =====================================================================

begin;

do $pre$
begin
  if to_regprocedure('public.project_stats(text,boolean)') is null then
    raise exception 'আগে 11_project_rpcs.sql চালান (চেকলিস্ট সারি ২৮) — কিছুই বদলায়নি।';
  end if;
  if to_regclass('public.housing_activity_log') is null then
    raise exception 'আগে 09_activity_log.sql চালান — কিছুই বদলায়নি।';
  end if;
end
$pre$;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- রেকর্ডের লগ v2
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
  k text;
  o jsonb;
  n jsonb;
begin
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();

  if tg_op = 'INSERT' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'create', new.project_type, new.id, new.serial_no, new.name,
            jsonb_build_object('year', new.year, 'division', new.division, 'district', new.district, 'upazila', new.upazila,
                               'union_name', new.union_name, 'extra', new.extra,
                               'has_prev_photo', new.prev_photo_url is not null, 'has_current_photo', new.current_photo_url is not null));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'delete', old.project_type, old.id, old.serial_no, old.name,
            jsonb_build_object('year', old.year, 'division', old.division, 'district', old.district, 'upazila', old.upazila,
                               'union_name', old.union_name, 'address', old.address,
                               'father_or_husband_name', old.father_or_husband_name, 'extra', old.extra,
                               'had_prev_photo', old.prev_photo_url is not null, 'had_current_photo', old.current_photo_url is not null));
    return old;
  end if;

  -- UPDATE: বদলানো ফিল্ডের আগে→পরে
  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach col in array array['serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila',
                             'union_name', 'address', 'prev_photo_source', 'current_photo_source'] loop
    if o -> col is distinct from n -> col then
      changes := changes || jsonb_build_object(col, jsonb_build_object('old', o -> col, 'new', n -> col));
    end if;
  end loop;
  -- কাস্টম মান: প্রতিটি key আলাদা ("extra.amount": {old, new})
  for k in select jsonb_object_keys(coalesce(old.extra, '{}'::jsonb))
           union
           select jsonb_object_keys(coalesce(new.extra, '{}'::jsonb)) loop
    if (old.extra -> k) is distinct from (new.extra -> k) then
      changes := changes || jsonb_build_object('extra.' || k, jsonb_build_object('old', old.extra -> k, 'new', new.extra -> k));
    end if;
  end loop;
  if old.prev_photo_url is distinct from new.prev_photo_url then
    photo_kinds := array_append(photo_kinds, 'prev');
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
-- (ট্রিগার housing_beneficiaries_activity_log 09 থেকেই এই ফাংশনে যুক্ত)

-- ---------------------------------------------------------------- গোপন মানের লগ: শুধু ফিল্ডের নাম
create or replace function public.housing_log_private_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_email text;
  rec record;
  keys text[];
  oldd jsonb := case when tg_op in ('UPDATE', 'DELETE') then old.data else '{}'::jsonb end;
  newd jsonb := case when tg_op in ('INSERT', 'UPDATE') then new.data else '{}'::jsonb end;
  rid uuid := case when tg_op = 'DELETE' then old.record_id else new.record_id end;
begin
  select coalesce(array_agg(k order by k), '{}') into keys
    from (select jsonb_object_keys(oldd) as k union select jsonb_object_keys(newd)) u
   where (oldd -> k) is distinct from (newd -> k);
  if cardinality(keys) = 0 then
    return null;
  end if;
  select project_type, serial_no, name into rec from public.housing_beneficiaries where id = rid;
  if not found then
    return null;   -- রেকর্ড মোছার সাথে গোপন সারিও মুছেছে — রেকর্ড-মোছার লগই যথেষ্ট
  end if;
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();
  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
  values (a_id, a_email, 'private_update', rec.project_type, rid, rec.serial_no, rec.name,
          jsonb_build_object('fields', to_jsonb(keys), 'masked', true));
  return null;
end;
$$;

drop trigger if exists beneficiary_private_activity_log on public.beneficiary_private;
create trigger beneficiary_private_activity_log
  after insert or update or delete on public.beneficiary_private
  for each row execute function public.housing_log_private_change();

-- ---------------------------------------------------------------- প্রকল্প ও ফিল্ডের সেটিং বদলের লগ
create or replace function public.housing_log_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_email text;
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  changes jsonb := '{}'::jsonb;
  k text;
  act text;
  pkey text;
  label text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'created_at', 'sort_order') and (o -> k) is distinct from (n -> k) then
        changes := changes || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
      end if;
    end loop;
    if changes = '{}'::jsonb then
      return null;   -- শুধু ক্রম/সময় — লগ নয়
    end if;
  end if;

  if tg_table_name = 'projects' then
    pkey := coalesce(n ->> 'key', o ->> 'key');
    label := coalesce(n ->> 'name_bn', o ->> 'name_bn');
    act := case tg_op
             when 'INSERT' then 'project_create'
             when 'DELETE' then 'project_delete'
             else case when changes ? 'is_published' and (n ->> 'is_published')::boolean then 'project_publish'
                       when changes ? 'is_published' then 'project_unpublish'
                       else 'project_update' end
           end;
  else
    pkey := coalesce(n ->> 'project_key', o ->> 'project_key');
    label := coalesce(n ->> 'label_bn', o ->> 'label_bn');
    act := case tg_op
             when 'INSERT' then 'field_create'
             when 'DELETE' then 'field_delete'
             else case when changes ? 'is_active' and not (n ->> 'is_active')::boolean then 'field_archive'
                       when changes ? 'is_active' then 'field_restore'
                       else 'field_update' end
           end;
  end if;

  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();
  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_name, details)
  values (a_id, a_email, act, pkey, label,
          case tg_op
            when 'UPDATE' then jsonb_build_object('changes', changes)
            when 'INSERT' then jsonb_build_object('snapshot', n - 'created_at' - 'updated_at')
            else jsonb_build_object('snapshot', o - 'created_at' - 'updated_at')
          end
          || case when tg_table_name = 'project_fields' then jsonb_build_object('field_key', coalesce(n ->> 'key', o ->> 'key')) else '{}'::jsonb end);
  return null;
end;
$$;

drop trigger if exists projects_activity_log on public.projects;
create trigger projects_activity_log
  after insert or update or delete on public.projects
  for each row execute function public.housing_log_config_change();
drop trigger if exists project_fields_activity_log on public.project_fields;
create trigger project_fields_activity_log
  after insert or update or delete on public.project_fields
  for each row execute function public.housing_log_config_change();

-- ---------------------------------------------------------------- ফিঙ্গারপ্রিন্ট
do $fp$
declare
  before_fp jsonb;
  after_fp  jsonb;
begin
  select fp into before_fp from _asf_fp_before;
  after_fp := asf_meta.data_fingerprint();
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
  select 1 as k, 'রেকর্ডের লগ v2 (ইউনিয়ন ও কাস্টম মানের আগে→পরে)' as item,
         case when pg_get_functiondef('public.housing_log_record_change()'::regprocedure) ~ 'extra\.' then '✅' else '❌' end as ok,
         'housing_log_record_change()' as info
  union all
  select 2, 'গোপন মানের লগ (শুধু নাম)',
         case when exists (select 1 from pg_trigger where tgname = 'beneficiary_private_activity_log') then '✅' else '❌' end,
         'beneficiary_private_activity_log'
  union all
  select 3, 'প্রকল্প ও ফিল্ডের সেটিং বদলের লগ',
         case when (select count(*) from pg_trigger where tgname in ('projects_activity_log', 'project_fields_activity_log')) = 2 then '✅' else '❌' end,
         'projects_activity_log, project_fields_activity_log'
  union all
  select 4, 'লগের পুরনো সারি ও লাইভ ডাটার ফিঙ্গারপ্রিন্ট', '✅', 'অপরিবর্তিত'
  union all
  select 5, 'পরের কাজ', '➡', 'checks/12_selftest.sql চালান (চেকলিস্ট সারি ২৯)'
) t
order by k;
