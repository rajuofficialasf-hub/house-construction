-- The photo-mode guard says how many records hold the photos the current mode still needs, as the
-- reference does (a8e2154, supabase/sql/10b_project_guards.sql). 0015 had dropped the count under the
-- "fixed text" rule, which is about values the client sent; this count is the database's own.
-- Only housing_projects_guard() changes. The trigger keeps pointing at it.
-- (docs/progress/P8_WALKTHROUGH_CHECKLIST.md, D1)

-- migrate:up
create or replace function public.housing_projects_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  par   public.housing_projects%rowtype;
  last_s integer;
  card  jsonb;
  homes integer := 0;
  cnt   bigint;
begin
  if tg_op = 'DELETE' then
    if old.is_group then
      if exists (select 1 from public.housing_projects where parent_key = old.key) then
        raise exception '«%» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান', old.name_bn
          using errcode = 'HC400', detail = 'parent_key';
      end if;
    else
      if exists (select 1 from public.housing_beneficiaries where project_type = old.key) then
        raise exception '«%» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
      select last_serial into last_s from public.housing_serial_counters where project_type = old.key;
      if not found then
        raise exception '«%» প্রকল্পের সিরিয়াল-কাউন্টার পাওয়া যায়নি — নিরাপত্তার জন্য মোছা বন্ধ', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
      -- The counter row stays, so the same key created again never reissues a serial.
      if last_s > 0 then
        raise exception '«%» প্রকল্পে আগে রেকর্ড ছিল — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
    end if;
    delete from public.housing_project_fields where project_key = old.key;
    return old;
  end if;

  new.slug             := lower(btrim(new.slug));
  new.name_bn          := normalize(btrim(new.name_bn), NFC);
  new.name_en          := btrim(new.name_en);
  new.summary_bn       := normalize(btrim(new.summary_bn), NFC);
  new.summary_en       := btrim(new.summary_en);
  new.description_bn   := normalize(btrim(new.description_bn), NFC);
  new.description_en   := btrim(new.description_en);
  new.unit_bn          := normalize(btrim(new.unit_bn), NFC);
  new.unit_en          := btrim(new.unit_en);
  new.prev_label_bn    := normalize(btrim(new.prev_label_bn), NFC);
  new.prev_label_en    := btrim(new.prev_label_en);
  new.current_label_bn := normalize(btrim(new.current_label_bn), NFC);
  new.current_label_en := btrim(new.current_label_en);

  if new.slug = any (public.housing_reserved_slugs()) then
    raise exception 'এই URL সংরক্ষিত শব্দ — অন্যটি দিন' using errcode = 'HC400', detail = 'slug';
  end if;
  if new.parent_key is not null then
    select * into par from public.housing_projects where key = new.parent_key;
    if not found or not par.is_group then
      raise exception 'উপ-প্রকল্পের অভিভাবক অবশ্যই একটি প্রকল্প-গ্রুপ হতে হবে' using errcode = 'HC400', detail = 'parent_key';
    end if;
  end if;

  -- A card's field is checked by the publish checklist in the UI, not here.
  if jsonb_typeof(new.stat_cards) = 'array' then
    if jsonb_array_length(new.stat_cards) > 8 then
      raise exception 'স্ট্যাট কার্ড সর্বোচ্চ ৮টি' using errcode = 'HC400', detail = 'stat_cards';
    end if;
    for card in select value from jsonb_array_elements(new.stat_cards) loop
      if jsonb_typeof(card) <> 'object'
         or jsonb_typeof(card -> 'id') is distinct from 'string'
         or btrim(card ->> 'id') = '' or length(card ->> 'id') > 40
         or coalesce(card ->> 'kind', '') not in ('count', 'geo', 'sum', 'distinct')
         or coalesce(btrim(card ->> 'label_bn'), '') = ''
         or (card ->> 'kind' in ('sum', 'distinct') and coalesce(card ->> 'field', '') = '')
         or (card ->> 'kind' = 'geo' and coalesce(card ->> 'level', '') not in ('division', 'district', 'upazila', 'union')) then
        raise exception 'স্ট্যাট কার্ডের তথ্য অসম্পূর্ণ' using errcode = 'HC400', detail = 'stat_cards';
      end if;
      if card -> 'home' = 'true'::jsonb then
        homes := homes + 1;
      end if;
    end loop;
    if homes > 3 then
      raise exception 'হোম পেইজের কার্ডে সর্বোচ্চ ৩টি স্ট্যাট' using errcode = 'HC400', detail = 'stat_cards';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.key <> old.key then
      raise exception 'প্রকল্পের key বদলানো যায় না (সিরিয়াল, ছবি ও লগ এর ওপর নির্ভর করে)' using errcode = 'HC400', detail = 'key';
    end if;
    if old.is_published and new.slug <> old.slug then
      raise exception 'প্রকাশিত প্রকল্পের URL বদলানো যায় না — আগে অপ্রকাশিত করুন' using errcode = 'HC400', detail = 'slug';
    end if;
    if old.is_published and new.parent_key is distinct from old.parent_key then
      raise exception 'প্রকাশিত প্রকল্পের অবস্থান বদলানো যায় না — আগে অপ্রকাশিত করুন' using errcode = 'HC400', detail = 'parent_key';
    end if;
    if new.is_group <> old.is_group
       and (exists (select 1 from public.housing_beneficiaries where project_type = old.key)
            or exists (select 1 from public.housing_projects where parent_key = old.key)
            or exists (select 1 from public.housing_project_fields where project_key = old.key)) then
      raise exception 'রেকর্ড, উপ-প্রকল্প বা ফিল্ড থাকা অবস্থায় গ্রুপ/প্রকল্প ধরন বদলানো যায় না' using errcode = 'HC400', detail = 'is_group';
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode in ('after_only', 'none') then
      select count(*) into cnt from public.housing_beneficiaries
       where project_type = old.key and (prev_photo_url is not null or prev_thumb_url is not null);
      if cnt > 0 then
        raise exception '% টি রেকর্ডে আগের ছবি আছে — ছবি মোড "শুধু পরের ছবি"/"ছবি নেই" করা যাবে না', cnt
          using errcode = 'HC400', detail = 'photo_mode';
      end if;
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode = 'none' then
      select count(*) into cnt from public.housing_beneficiaries
       where project_type = old.key and (current_photo_url is not null or current_thumb_url is not null);
      if cnt > 0 then
        raise exception '% টি রেকর্ডে ছবি আছে — ছবি মোড "ছবি নেই" করা যাবে না', cnt using errcode = 'HC400', detail = 'photo_mode';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- migrate:down
create or replace function public.housing_projects_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  par   public.housing_projects%rowtype;
  last_s integer;
  card  jsonb;
  homes integer := 0;
begin
  if tg_op = 'DELETE' then
    if old.is_group then
      if exists (select 1 from public.housing_projects where parent_key = old.key) then
        raise exception '«%» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান', old.name_bn
          using errcode = 'HC400', detail = 'parent_key';
      end if;
    else
      if exists (select 1 from public.housing_beneficiaries where project_type = old.key) then
        raise exception '«%» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
      select last_serial into last_s from public.housing_serial_counters where project_type = old.key;
      if not found then
        raise exception '«%» প্রকল্পের সিরিয়াল-কাউন্টার পাওয়া যায়নি — নিরাপত্তার জন্য মোছা বন্ধ', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
      -- The counter row stays, so the same key created again never reissues a serial.
      if last_s > 0 then
        raise exception '«%» প্রকল্পে আগে রেকর্ড ছিল — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন', old.name_bn
          using errcode = 'HC400', detail = 'key';
      end if;
    end if;
    delete from public.housing_project_fields where project_key = old.key;
    return old;
  end if;

  new.slug             := lower(btrim(new.slug));
  new.name_bn          := normalize(btrim(new.name_bn), NFC);
  new.name_en          := btrim(new.name_en);
  new.summary_bn       := normalize(btrim(new.summary_bn), NFC);
  new.summary_en       := btrim(new.summary_en);
  new.description_bn   := normalize(btrim(new.description_bn), NFC);
  new.description_en   := btrim(new.description_en);
  new.unit_bn          := normalize(btrim(new.unit_bn), NFC);
  new.unit_en          := btrim(new.unit_en);
  new.prev_label_bn    := normalize(btrim(new.prev_label_bn), NFC);
  new.prev_label_en    := btrim(new.prev_label_en);
  new.current_label_bn := normalize(btrim(new.current_label_bn), NFC);
  new.current_label_en := btrim(new.current_label_en);

  if new.slug = any (public.housing_reserved_slugs()) then
    raise exception 'এই URL সংরক্ষিত শব্দ — অন্যটি দিন' using errcode = 'HC400', detail = 'slug';
  end if;
  if new.parent_key is not null then
    select * into par from public.housing_projects where key = new.parent_key;
    if not found or not par.is_group then
      raise exception 'উপ-প্রকল্পের অভিভাবক অবশ্যই একটি প্রকল্প-গ্রুপ হতে হবে' using errcode = 'HC400', detail = 'parent_key';
    end if;
  end if;

  -- A card's field is checked by the publish checklist in the UI, not here.
  if jsonb_typeof(new.stat_cards) = 'array' then
    if jsonb_array_length(new.stat_cards) > 8 then
      raise exception 'স্ট্যাট কার্ড সর্বোচ্চ ৮টি' using errcode = 'HC400', detail = 'stat_cards';
    end if;
    for card in select value from jsonb_array_elements(new.stat_cards) loop
      if jsonb_typeof(card) <> 'object'
         or jsonb_typeof(card -> 'id') is distinct from 'string'
         or btrim(card ->> 'id') = '' or length(card ->> 'id') > 40
         or coalesce(card ->> 'kind', '') not in ('count', 'geo', 'sum', 'distinct')
         or coalesce(btrim(card ->> 'label_bn'), '') = ''
         or (card ->> 'kind' in ('sum', 'distinct') and coalesce(card ->> 'field', '') = '')
         or (card ->> 'kind' = 'geo' and coalesce(card ->> 'level', '') not in ('division', 'district', 'upazila', 'union')) then
        raise exception 'স্ট্যাট কার্ডের তথ্য অসম্পূর্ণ' using errcode = 'HC400', detail = 'stat_cards';
      end if;
      if card -> 'home' = 'true'::jsonb then
        homes := homes + 1;
      end if;
    end loop;
    if homes > 3 then
      raise exception 'হোম পেইজের কার্ডে সর্বোচ্চ ৩টি স্ট্যাট' using errcode = 'HC400', detail = 'stat_cards';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.key <> old.key then
      raise exception 'প্রকল্পের key বদলানো যায় না (সিরিয়াল, ছবি ও লগ এর ওপর নির্ভর করে)' using errcode = 'HC400', detail = 'key';
    end if;
    if old.is_published and new.slug <> old.slug then
      raise exception 'প্রকাশিত প্রকল্পের URL বদলানো যায় না — আগে অপ্রকাশিত করুন' using errcode = 'HC400', detail = 'slug';
    end if;
    if old.is_published and new.parent_key is distinct from old.parent_key then
      raise exception 'প্রকাশিত প্রকল্পের অবস্থান বদলানো যায় না — আগে অপ্রকাশিত করুন' using errcode = 'HC400', detail = 'parent_key';
    end if;
    if new.is_group <> old.is_group
       and (exists (select 1 from public.housing_beneficiaries where project_type = old.key)
            or exists (select 1 from public.housing_projects where parent_key = old.key)
            or exists (select 1 from public.housing_project_fields where project_key = old.key)) then
      raise exception 'রেকর্ড, উপ-প্রকল্প বা ফিল্ড থাকা অবস্থায় গ্রুপ/প্রকল্প ধরন বদলানো যায় না' using errcode = 'HC400', detail = 'is_group';
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode in ('after_only', 'none')
       and exists (select 1 from public.housing_beneficiaries
                    where project_type = old.key and (prev_photo_url is not null or prev_thumb_url is not null)) then
      raise exception 'আগের ছবিসহ রেকর্ড আছে — ছবি মোড "শুধু পরের ছবি" বা "ছবি নেই" করা যাবে না' using errcode = 'HC400', detail = 'photo_mode';
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode = 'none'
       and exists (select 1 from public.housing_beneficiaries
                    where project_type = old.key and (current_photo_url is not null or current_thumb_url is not null)) then
      raise exception 'ছবিসহ রেকর্ড আছে — ছবি মোড "ছবি নেই" করা যাবে না' using errcode = 'HC400', detail = 'photo_mode';
    end if;
  end if;
  return new;
end;
$$;
