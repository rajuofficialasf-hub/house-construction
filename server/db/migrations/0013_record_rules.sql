-- Record rules, ported from supabase/sql/10b_project_guards.sql: one custom value's check and
-- normalisation (housing_field_value), the record check on every insert and update
-- (housing_validate_record), and the private-values check (housing_beneficiary_private_validate).
-- Differences from the Supabase file:
--   * Every raise uses our own SQLSTATE HC400, which server/src/errors.ts passes to the client with
--     its message and the field key in DETAIL. Messages hold fixed text, a field or project label and
--     configured limits, never a value or key the client sent; an unknown key goes only into DETAIL,
--     and only when it has the field-key format.
--   * The money limit is 1e10 (supabase/sql/13_money_limit.sql).
--   * The "only a main admin may remove a photo" check is gone: a trigger can't know the caller's
--     role safely, so the API refuses photo columns in record bodies instead
--     (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P2 decisions").
--   * The functions run as the caller (no security definer); housing_app already reads the tables
--     they read. There is no RLS and no asf_meta.

-- migrate:up

-- One custom value, checked and normalised for its field. Returns the normalised value, or null for
-- an empty text (not stored).
create function public.housing_field_value(f public.housing_project_fields, v jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  lbl text := coalesce(nullif(f.label_bn, ''), f.key);
  det text := case when f.visibility = 'admin' then 'private.' else 'extra.' end || f.key;
  s   text;
  n   numeric;
  lim integer;
begin
  if f.type in ('text', 'long_text', 'category', 'phone') then
    if jsonb_typeof(v) <> 'string' then
      raise exception '«%»: লেখা দিন', lbl using errcode = 'HC400', detail = det;
    end if;
    s := normalize(btrim(v #>> '{}'), NFC);
    if f.type = 'category' then
      s := regexp_replace(s, '\s+', ' ', 'g');
    elsif f.type = 'phone' then
      s := translate(s, '০১২৩৪৫৬৭৮৯', '0123456789');
      if s <> '' and s !~ '^[0-9+\- ]{6,20}$' then
        raise exception '«%»: সঠিক মোবাইল নম্বর দিন', lbl using errcode = 'HC400', detail = det;
      end if;
    end if;
    lim := coalesce(f.max_length, case f.type when 'long_text' then 2000 when 'category' then 100 else 500 end);
    if length(s) > lim then
      raise exception '«%»: লেখা বেশি লম্বা (সর্বোচ্চ % অক্ষর)', lbl, lim using errcode = 'HC400', detail = det;
    end if;
    if s = '' then
      return null;
    end if;
    return to_jsonb(s);

  elsif f.type in ('number', 'money') then
    if jsonb_typeof(v) <> 'number' then
      raise exception '«%»: শুধু সংখ্যা দিন (যেমন 10000)', lbl using errcode = 'HC400', detail = det;
    end if;
    n := (v #>> '{}')::numeric;
    if f.type = 'money' then
      if n <> trunc(n) then
        raise exception '«%»: টাকা পূর্ণসংখ্যায় দিন (পয়সা নয়)', lbl using errcode = 'HC400', detail = det;
      end if;
      if n < 0 or n > 10000000000 then
        raise exception '«%»: টাকার পরিমাণ ০ থেকে ১০০০ কোটির মধ্যে হতে হবে', lbl using errcode = 'HC400', detail = det;
      end if;
    elsif n <> round(n, 2) then
      raise exception '«%»: সর্বোচ্চ ২ ঘর দশমিক', lbl using errcode = 'HC400', detail = det;
    end if;
    if f.min_value is not null and n < f.min_value then
      raise exception '«%»: সর্বনিম্ন %', lbl, f.min_value using errcode = 'HC400', detail = det;
    end if;
    if f.max_value is not null and n > f.max_value then
      raise exception '«%»: সর্বোচ্চ %', lbl, f.max_value using errcode = 'HC400', detail = det;
    end if;
    return v;

  elsif f.type = 'date' then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '«%»: তারিখ YYYY-MM-DD আকারে দিন', lbl using errcode = 'HC400', detail = det;
    end if;
    begin
      perform (v #>> '{}')::date;
    exception when others then
      raise exception '«%»: তারিখটি সঠিক নয়', lbl using errcode = 'HC400', detail = det;
    end;
    return v;
  end if;

  raise exception 'অজানা ফিল্ড-ধরন: %', f.type using errcode = 'HC400', detail = det;
end;
$$;

-- Checks and normalises a record before every insert and update. The name sorts after
-- housing_beneficiaries_assign_serial, protect_serial and set_updated_at, so it sees the final serial.
create function public.housing_validate_record()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p       public.housing_projects%rowtype;
  f       public.housing_project_fields%rowtype;
  r       record;
  is_ins  boolean := tg_op = 'INSERT';
  cleaned jsonb := '{}'::jsonb;
  nv      jsonb;
  core    jsonb;
begin
  select * into p from public.housing_projects where key = new.project_type;
  if not found then
    raise exception 'অচেনা প্রকল্প' using errcode = 'HC400', detail = 'project_type';
  end if;
  if p.is_group then
    raise exception '«%» একটি প্রকল্প-গ্রুপ — এতে সরাসরি রেকর্ড রাখা যায় না; উপ-প্রকল্প বাছুন', p.name_bn
      using errcode = 'HC400', detail = 'project_type';
  end if;
  core := coalesce(p.core_fields, '{}'::jsonb);

  new.name                   := normalize(btrim(coalesce(new.name, '')), NFC);
  new.father_or_husband_name := normalize(btrim(coalesce(new.father_or_husband_name, '')), NFC);
  new.division               := normalize(btrim(coalesce(new.division, '')), NFC);
  new.district               := normalize(btrim(coalesce(new.district, '')), NFC);
  new.upazila                := normalize(btrim(coalesce(new.upazila, '')), NFC);
  new.union_name             := normalize(btrim(coalesce(new.union_name, '')), NFC);
  new.address                := normalize(btrim(coalesce(new.address, '')), NFC);

  -- Required columns. On update an optional-turned-required column is enforced only if it had a
  -- value, so old records aren't locked.
  if new.name = '' then
    raise exception 'উপকারভোগীর নাম আবশ্যক' using errcode = 'HC400', detail = 'name';
  end if;
  if new.division = '' or new.district = '' or new.upazila = '' then
    raise exception 'বিভাগ, জেলা ও উপজেলা আবশ্যক' using errcode = 'HC400', detail = 'upazila';
  end if;
  if coalesce((core -> 'father_or_husband_name' ->> 'required')::boolean, false)
     and new.father_or_husband_name = '' and (is_ins or old.father_or_husband_name <> '') then
    raise exception 'পিতা/স্বামীর নাম আবশ্যক' using errcode = 'HC400', detail = 'father_or_husband_name';
  end if;
  if coalesce((core -> 'address' ->> 'required')::boolean, false)
     and new.address = '' and (is_ins or old.address <> '') then
    raise exception 'বিস্তারিত ঠিকানা আবশ্যক' using errcode = 'HC400', detail = 'address';
  end if;
  if p.geo_depth = 'union' and coalesce((core -> 'union_name' ->> 'required')::boolean, false)
     and new.union_name = '' and (is_ins or old.union_name <> '') then
    raise exception 'ইউনিয়ন আবশ্যক' using errcode = 'HC400', detail = 'union_name';
  end if;

  -- Photo mode (R8)
  if p.photo_mode <> 'before_after'
     and (new.prev_photo_url is not null or new.prev_thumb_url is not null)
     and (is_ins or new.prev_photo_url is distinct from old.prev_photo_url or new.prev_thumb_url is distinct from old.prev_thumb_url) then
    raise exception 'এই প্রকল্পে আগের ছবি রাখা যায় না (ছবি মোড: শুধু পরের ছবি)' using errcode = 'HC400', detail = 'prev_photo_url';
  end if;
  if p.photo_mode = 'none'
     and (new.current_photo_url is not null or new.current_thumb_url is not null)
     and (is_ins or new.current_photo_url is distinct from old.current_photo_url or new.current_thumb_url is distinct from old.current_thumb_url) then
    raise exception 'এই প্রকল্পে ছবি রাখা যায় না (ছবি মোড: ছবি নেই)' using errcode = 'HC400', detail = 'current_photo_url';
  end if;

  -- Custom public values
  if new.extra is null then
    new.extra := '{}'::jsonb;
  end if;
  if jsonb_typeof(new.extra) <> 'object' then
    raise exception 'extra অবশ্যই একটি JSON object' using errcode = 'HC400', detail = 'extra';
  end if;
  for r in select key, value from jsonb_each(new.extra) loop
    if r.value = 'null'::jsonb or r.value = '""'::jsonb then
      continue;
    end if;
    -- An unchanged value stays as it was, even for a field archived since.
    if not is_ins and (old.extra -> r.key) is not distinct from r.value then
      cleaned := cleaned || jsonb_build_object(r.key, r.value);
      continue;
    end if;
    select * into f from public.housing_project_fields where project_key = new.project_type and key = r.key;
    if not found then
      raise exception 'অচেনা ফিল্ড — এই প্রকল্পে এমন ফিল্ড নেই' using errcode = 'HC400',
        detail = case when r.key ~ '^[a-z][a-z0-9_]{0,39}$' then 'extra.' || r.key else 'extra' end;
    end if;
    if f.visibility <> 'public' then
      raise exception '«%» গোপন ফিল্ড — এর মান পাবলিক অংশে (extra) রাখা যায় না', f.label_bn
        using errcode = 'HC400', detail = 'extra.' || f.key;
    end if;
    if not f.is_active then
      raise exception '«%» ফিল্ডটি আর্কাইভ করা — নতুন মান দেওয়া যায় না', f.label_bn
        using errcode = 'HC400', detail = 'extra.' || f.key;
    end if;
    nv := public.housing_field_value(f, r.value);
    if nv is not null then
      cleaned := cleaned || jsonb_build_object(r.key, nv);
    end if;
  end loop;

  -- A required field must be present on insert; on update a value it had can't be cleared.
  for f in select * from public.housing_project_fields
            where project_key = new.project_type and is_active and required and visibility = 'public' loop
    if not (cleaned ? f.key) and (is_ins or (old.extra ? f.key)) then
      raise exception '«%» আবশ্যক', f.label_bn using errcode = 'HC400', detail = 'extra.' || f.key;
    end if;
  end loop;

  new.extra := cleaned;
  return new;
end;
$$;

create trigger housing_beneficiaries_validate
  before insert or update on public.housing_beneficiaries
  for each row execute function public.housing_validate_record();

-- Checks and normalises a record's private values. An unchanged value is kept only on UPDATE, so the
-- API updates an existing row rather than upserting it.
create function public.housing_beneficiary_private_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pt      text;
  f       public.housing_project_fields%rowtype;
  r       record;
  cleaned jsonb := '{}'::jsonb;
  nv      jsonb;
begin
  select project_type into pt from public.housing_beneficiaries where id = new.record_id;
  if not found then
    raise exception 'রেকর্ড পাওয়া যায়নি' using errcode = 'HC400', detail = 'record_id';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'data অবশ্যই একটি JSON object' using errcode = 'HC400', detail = 'data';
  end if;
  for r in select key, value from jsonb_each(new.data) loop
    if r.value = 'null'::jsonb or r.value = '""'::jsonb then
      continue;
    end if;
    if tg_op = 'UPDATE' and (old.data -> r.key) is not distinct from r.value then
      cleaned := cleaned || jsonb_build_object(r.key, r.value);
      continue;
    end if;
    select * into f from public.housing_project_fields where project_key = pt and key = r.key;
    if not found then
      raise exception 'অচেনা গোপন ফিল্ড' using errcode = 'HC400',
        detail = case when r.key ~ '^[a-z][a-z0-9_]{0,39}$' then 'private.' || r.key else 'private' end;
    end if;
    if f.visibility <> 'admin' then
      raise exception '«%» পাবলিক ফিল্ড — এর মান গোপন অংশে নয়, extra-তে যাবে', f.label_bn
        using errcode = 'HC400', detail = 'private.' || f.key;
    end if;
    if not f.is_active then
      raise exception '«%» ফিল্ডটি আর্কাইভ করা — নতুন মান দেওয়া যায় না', f.label_bn
        using errcode = 'HC400', detail = 'private.' || f.key;
    end if;
    nv := public.housing_field_value(f, r.value);
    if nv is not null then
      cleaned := cleaned || jsonb_build_object(r.key, nv);
    end if;
  end loop;
  new.data := cleaned;
  return new;
end;
$$;

create trigger housing_beneficiary_private_validate
  before insert or update on public.housing_beneficiary_private
  for each row execute function public.housing_beneficiary_private_validate();

-- Trigger functions need no grant; housing_field_value is called from inside them as the caller.
grant execute on function public.housing_field_value(public.housing_project_fields, jsonb) to housing_app;

-- migrate:down
drop trigger housing_beneficiary_private_validate on public.housing_beneficiary_private;
drop function public.housing_beneficiary_private_validate();
drop trigger housing_beneficiaries_validate on public.housing_beneficiaries;
drop function public.housing_validate_record();
drop function public.housing_field_value(public.housing_project_fields, jsonb);
