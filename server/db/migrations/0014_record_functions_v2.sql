-- Record functions v2, ported from supabase/sql/11_project_rpcs.sql and 12_activity_log_v2.sql:
-- a project's leaf keys, the v2 bulk update, a bulk insert for any project, and the activity log v2
-- for records and private values.
-- Differences from the Supabase files:
--   * project_leaf_keys is housing_project_leaf_keys, after the server's table prefix. It doesn't
--     know who is asking; callers filter by housing_public_project_keys() for a visitor.
--   * The bulk update keeps its signature, so the old PUT /api/v1/housing/bulk runs it too. Its
--     private part updates first and inserts only when no row exists: an upsert fires the BEFORE
--     INSERT trigger first, with no old row, which would refuse an unchanged archived private key.
--   * housing_bulk_insert_records is new. Both bulk functions add the failing row's 0-based index to
--     a guard's error as HINT 'row_index=<n>', which server/src/errors.ts passes to the client.
--   * Errors are our own SQLSTATE HC400/HC409 with fixed text, never a key or value the client sent.
--   * housing_next_serial is unchanged: the Supabase v2 only adds a "drafts for admins" check, and
--     the API makes that check (a session setting can't be trusted for it).
--   * No RLS, asf_meta, fingerprints or grants to anon/authenticated.
--   (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P3 decisions")

-- migrate:up

-- The keys of the record-holding projects under a key: the key itself for a leaf, its children for a group.
create function public.housing_project_leaf_keys(p_key text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(key order by sort_order, key), '{}')
    from public.housing_projects
   where not is_group and (key = p_key or parent_key = p_key);
$$;

-- Bulk update by serial. p_rows: [{"serial_no": 1, "name": "...", "union_name": "...",
--   "extra": {"amount": 5000}, "_clear": ["address", "extra.item_name"]}, ...]
-- An absent, null or "" value leaves the column unchanged; "_clear" empties father_or_husband_name,
-- address and union_name, nulls a photo source, and removes a public extra.<key>. extra merges; keys
-- of the project's private fields go to housing_beneficiary_private, merged into what is there.
-- A serial with no record goes into "missing". All rows commit together or not at all.
-- housing_bulk_insert_records splits extra the same way; change both together.
create or replace function public.housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          jsonb;
  ord        bigint;
  i          integer;
  s          integer;
  rid        uuid;
  updated    integer := 0;
  missing    integer[] := '{}';
  clr        text[];
  clr_extra  text[];
  pub_patch  jsonb;
  priv_patch jsonb;
  admin_keys text[];
  is_grp     boolean;
  e_state    text;
  e_msg      text;
  e_detail   text;
begin
  select is_group into is_grp from public.housing_projects where key = p_project_type;
  if not found then
    raise exception 'অচেনা প্রকল্প' using errcode = 'HC400', detail = 'project_type';
  end if;
  if is_grp then
    raise exception 'এটি একটি প্রকল্প-গ্রুপ — উপ-প্রকল্প বাছুন' using errcode = 'HC400', detail = 'project_type';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;
  select coalesce(array_agg(key), '{}') into admin_keys
    from public.housing_project_fields where project_key = p_project_type and visibility = 'admin';

  begin
    for r, ord in select e, o from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
      i := ord - 1;
      s := nullif(r ->> 'serial_no', '')::integer;
      if s is null then
        raise exception 'প্রতিটি সারিতে serial_no লাগবে' using errcode = '23502';
      end if;
      clr := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r -> '_clear', '[]'::jsonb)) as x), '{}');
      clr_extra := coalesce((select array_agg(substr(x, 7)) from unnest(clr) as x where x like 'extra.%'), '{}');
      select coalesce(jsonb_object_agg(e.key, e.value) filter (where not (e.key = any (admin_keys))), '{}'::jsonb),
             coalesce(jsonb_object_agg(e.key, e.value) filter (where e.key = any (admin_keys)), '{}'::jsonb)
        into pub_patch, priv_patch
        from jsonb_each(case when jsonb_typeof(r -> 'extra') = 'object' then r -> 'extra' else '{}'::jsonb end) e
       where e.value <> 'null'::jsonb and e.value <> '""'::jsonb;

      rid := null;
      update public.housing_beneficiaries b
         set year                   = coalesce(nullif(r ->> 'year', '')::integer, b.year),
             name                   = coalesce(nullif(btrim(r ->> 'name'), ''), b.name),
             father_or_husband_name = case when 'father_or_husband_name' = any (clr) then ''
                                           else coalesce(nullif(btrim(r ->> 'father_or_husband_name'), ''), b.father_or_husband_name) end,
             division               = coalesce(nullif(btrim(r ->> 'division'), ''), b.division),
             district               = coalesce(nullif(btrim(r ->> 'district'), ''), b.district),
             upazila                = coalesce(nullif(btrim(r ->> 'upazila'), ''), b.upazila),
             union_name             = case when 'union_name' = any (clr) then ''
                                           else coalesce(nullif(btrim(r ->> 'union_name'), ''), b.union_name) end,
             address                = case when 'address' = any (clr) then ''
                                           else coalesce(nullif(btrim(r ->> 'address'), ''), b.address) end,
             prev_photo_source      = case when 'prev_photo_source' = any (clr) then null
                                           else coalesce(nullif(btrim(r ->> 'prev_photo_source'), ''), b.prev_photo_source) end,
             current_photo_source   = case when 'current_photo_source' = any (clr) then null
                                           else coalesce(nullif(btrim(r ->> 'current_photo_source'), ''), b.current_photo_source) end,
             extra                  = (b.extra || pub_patch) - clr_extra
       where b.project_type = p_project_type and b.serial_no = s
       returning b.id into rid;

      if rid is null then
        missing := array_append(missing, s);
      else
        updated := updated + 1;
        if priv_patch <> '{}'::jsonb then
          update public.housing_beneficiary_private p set data = p.data || priv_patch where p.record_id = rid;
          if not found then
            insert into public.housing_beneficiary_private (record_id, data) values (rid, priv_patch);
          end if;
        end if;
      end if;
    end loop;
  exception
    when sqlstate 'HC400' or sqlstate 'HC409' then
      get stacked diagnostics e_state = returned_sqlstate, e_msg = message_text, e_detail = pg_exception_detail;
      raise exception using errcode = e_state, message = e_msg, detail = e_detail, hint = 'row_index=' || i;
  end;

  return jsonb_build_object('updated', updated, 'missing', to_jsonb(missing));
end;
$$;

-- Bulk insert for any non-group project. p_rows: [{"serial_no": 1, "year": 2024, "name": "...",
--   "division": "...", "district": "...", "upazila": "...", "union_name": "...", "address": "...",
--   "extra": {"amount": 5000, "phone": "..."}}, ...]
-- With p_use_given_serial each row keeps its serial_no; otherwise the serial trigger assigns the next.
-- Keys of the project's private fields go to housing_beneficiary_private. Returns the number inserted.
-- All rows commit together or not at all. housing_bulk_update_by_serial splits extra the same way;
-- change both together.
create function public.housing_bulk_insert_records(p_project_key text, p_rows jsonb, p_use_given_serial boolean)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          jsonb;
  ord        bigint;
  i          integer;
  rid        uuid;
  inserted   integer := 0;
  pub_part   jsonb;
  priv_part  jsonb;
  admin_keys text[];
  is_grp     boolean;
  e_state    text;
  e_msg      text;
  e_detail   text;
  e_con      text;
begin
  select is_group into is_grp from public.housing_projects where key = p_project_key;
  if not found then
    raise exception 'অচেনা প্রকল্প' using errcode = 'HC400', detail = 'project_type';
  end if;
  if is_grp then
    raise exception 'এটি একটি প্রকল্প-গ্রুপ — উপ-প্রকল্প বাছুন' using errcode = 'HC400', detail = 'project_type';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;
  select coalesce(array_agg(key), '{}') into admin_keys
    from public.housing_project_fields where project_key = p_project_key and visibility = 'admin';

  begin
    for r, ord in select e, o from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
      i := ord - 1;
      select coalesce(jsonb_object_agg(e.key, e.value) filter (where not (e.key = any (admin_keys))), '{}'::jsonb),
             coalesce(jsonb_object_agg(e.key, e.value) filter (where e.key = any (admin_keys)), '{}'::jsonb)
        into pub_part, priv_part
        from jsonb_each(case when jsonb_typeof(r -> 'extra') = 'object' then r -> 'extra' else '{}'::jsonb end) e
       where e.value <> 'null'::jsonb and e.value <> '""'::jsonb;

      insert into public.housing_beneficiaries
        (project_type, serial_no, year, name, father_or_husband_name, division, district, upazila,
         union_name, address, prev_photo_source, current_photo_source, extra)
      values
        (p_project_key,
         case when p_use_given_serial then (r ->> 'serial_no')::integer end,
         (r ->> 'year')::integer,
         r ->> 'name',
         coalesce(r ->> 'father_or_husband_name', ''),
         r ->> 'division',
         r ->> 'district',
         r ->> 'upazila',
         coalesce(r ->> 'union_name', ''),
         coalesce(r ->> 'address', ''),
         r ->> 'prev_photo_source',
         r ->> 'current_photo_source',
         pub_part)
      returning id into rid;
      inserted := inserted + 1;

      if priv_part <> '{}'::jsonb then
        insert into public.housing_beneficiary_private (record_id, data) values (rid, priv_part);
      end if;
    end loop;
  exception
    when sqlstate 'HC400' or sqlstate 'HC409' then
      get stacked diagnostics e_state = returned_sqlstate, e_msg = message_text, e_detail = pg_exception_detail;
      raise exception using errcode = e_state, message = e_msg, detail = e_detail, hint = 'row_index=' || i;
    when unique_violation then
      get stacked diagnostics e_con = constraint_name;
      if e_con = 'housing_beneficiaries_project_serial_key' then
        raise exception 'এই সিরিয়াল আগে থেকেই আছে'
          using errcode = 'HC409', detail = 'serial_no', hint = 'row_index=' || i;
      end if;
      raise;
  end;

  return inserted;
end;
$$;

-- Record log v2: create and delete snapshots carry union_name and extra, and an update logs
-- union_name and each changed extra key ("extra.amount": {old, new}). extra holds only public
-- values (the record trigger refuses private keys there), and only admins read the log.
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

  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach col in array array['serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila',
                             'union_name', 'address', 'prev_photo_source', 'current_photo_source'] loop
    if o -> col is distinct from n -> col then
      changes := changes || jsonb_build_object(col, jsonb_build_object('old', o -> col, 'new', n -> col));
    end if;
  end loop;
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

-- Private values log only the names of the keys that changed, never a value
-- (details {"fields": [...], "masked": true}). When the record itself is gone (the delete cascade),
-- the record's delete row is enough and nothing is written.
create function public.housing_log_private_change()
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
    return null;
  end if;
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();
  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
  values (a_id, a_email, 'private_update', rec.project_type, rid, rec.serial_no, rec.name,
          jsonb_build_object('fields', to_jsonb(keys), 'masked', true));
  return null;
end;
$$;

create trigger housing_beneficiary_private_activity_log
  after insert or update or delete on public.housing_beneficiary_private
  for each row execute function public.housing_log_private_change();

-- The bulk update keeps its grant from 0006; trigger functions need none.
grant execute on function public.housing_project_leaf_keys(text) to housing_app;
grant execute on function public.housing_bulk_insert_records(text, jsonb, boolean) to housing_app;

-- migrate:down
drop trigger housing_beneficiary_private_activity_log on public.housing_beneficiary_private;
drop function public.housing_log_private_change();
drop function public.housing_bulk_insert_records(text, jsonb, boolean);
drop function public.housing_project_leaf_keys(text);

-- housing_log_record_change as 0005_activity_log.sql made it.
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

-- housing_bulk_update_by_serial as 0004_bulk_update.sql made it.
create or replace function public.housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        jsonb;
  s        integer;
  n        integer;
  updated  integer := 0;
  missing  integer[] := '{}';
begin
  if p_project_type not in ('semi_pucca', 'tin') then
    raise exception 'অচেনা project_type: %', p_project_type using errcode = '23514';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    s := (r->>'serial_no')::integer;
    if s is null then
      raise exception 'প্রতিটি সারিতে serial_no লাগবে' using errcode = '23502';
    end if;
    update public.housing_beneficiaries b
       set year                   = coalesce((r->>'year')::integer, b.year),
           name                   = coalesce(nullif(r->>'name', ''), b.name),
           father_or_husband_name = coalesce(r->>'father_or_husband_name', b.father_or_husband_name),
           division               = coalesce(nullif(r->>'division', ''), b.division),
           district               = coalesce(nullif(r->>'district', ''), b.district),
           upazila                = coalesce(nullif(r->>'upazila', ''), b.upazila),
           address                = coalesce(r->>'address', b.address),
           prev_photo_source      = coalesce(r->>'prev_photo_source', b.prev_photo_source),
           current_photo_source   = coalesce(r->>'current_photo_source', b.current_photo_source)
     where b.project_type = p_project_type and b.serial_no = s;
    get diagnostics n = row_count;
    if n = 0 then
      missing := missing || s;
    else
      updated := updated + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', updated, 'missing', to_jsonb(missing));
end;
$$;
