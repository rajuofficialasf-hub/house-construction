-- Project and field guards, ported from supabase/sql/10b_project_guards.sql, 11_project_rpcs.sql and
-- 12_activity_log_v2.sql: the rules that keep a project's key, URL, serials and field data safe, the
-- serial counter for a new project, project creation with its fields in one call, the reorders, field
-- usage and category value rename, and the log of every project and field change. housing_files
-- also learns to hold a project's cover.
-- Differences from the Supabase files:
--   * Names carry the server's housing_ prefix.
--   * Every guard error is our own HC400 with fixed text, at most the stored project or field label,
--     and a field key in DETAIL. No slug, card, count or other value the client sent is echoed.
--   * A project that has ever issued a serial can't be deleted, with no override: the reference's
--     asf.allow_project_delete was a session setting, which any caller can set.
--   * Deleting a project deletes its fields, once the guard's checks have passed: with no records
--     they hold no values, and the fields' foreign key would otherwise refuse the delete.
--   * A stat card needs an id too, as the contract says.
--   * Rename-value refuses an archived field and a too-long new value before touching a record,
--     instead of failing inside the record trigger.
--   * Only the counter and log trigger functions are security definer: housing_app may only read
--     the counters and the log. Who may call what is the API's job, so there is no admin check.
--   * No RLS, asf_meta, fingerprints or grants to anon/authenticated.
--   (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P4 decisions")

-- migrate:up

-- Words a project's URL can't take: the site's own routes.
create function public.housing_reserved_slugs()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['admin', 'api', 'auth', 'login', 'logout', 'assets', 'geo', 'static', 'src', 'public',
               'node-modules', 'favicon', 'icons', 'dev', 'projects', 'records', 'search', 'about',
               'contact', 'donate', 'news', 'en', 'bn', 'new', 'edit', 'import', 'photos', 'activity',
               'settings', 'users', 'preview', 'index'];
$$;

create function public.housing_projects_guard()
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

create trigger housing_projects_guard
  before insert or update or delete on public.housing_projects
  for each row execute function public.housing_projects_guard();

-- A new leaf project, or a group turned into one, gets its serial counter from 0. An existing
-- counter is never touched. Definer because housing_app may only read the counters.
create function public.housing_projects_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_group then
    insert into public.housing_serial_counters (project_type, last_serial)
    values (new.key, 0)
    on conflict (project_type) do nothing;
  end if;
  return null;
end;
$$;

create trigger housing_projects_after_write
  after insert or update of is_group on public.housing_projects
  for each row execute function public.housing_projects_after_write();

create function public.housing_project_fields_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  used boolean := false;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if (select is_group from public.housing_projects where key = new.project_key) then
      raise exception 'প্রকল্প-গ্রুপে ফিল্ড রাখা যায় না — উপ-প্রকল্পে যোগ করুন' using errcode = 'HC400', detail = 'project_key';
    end if;
    new.label_bn := normalize(btrim(new.label_bn), NFC);
    new.label_en := btrim(new.label_en);
    new.help_bn  := normalize(btrim(new.help_bn), NFC);
    new.help_en  := btrim(new.help_en);
    if tg_op = 'INSERT' and (select count(*) from public.housing_project_fields where project_key = new.project_key) >= 40 then
      raise exception 'একটি প্রকল্পে সর্বোচ্চ ৪০টি ফিল্ড' using errcode = 'HC400', detail = 'key';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    if old.visibility = 'admin' then
      used := exists (select 1 from public.housing_beneficiary_private bp
                        join public.housing_beneficiaries b on b.id = bp.record_id
                       where b.project_type = old.project_key and bp.data ? old.key);
    else
      used := exists (select 1 from public.housing_beneficiaries
                       where project_type = old.project_key and extra ? old.key);
    end if;

    if tg_op = 'DELETE' then
      if used then
        raise exception '«%» ফিল্ডের মান রেকর্ডে আছে — মোছা যাবে না; আর্কাইভ করুন', old.label_bn
          using errcode = 'HC400', detail = 'key';
      end if;
      return old;
    end if;

    if new.project_key <> old.project_key then
      raise exception 'ফিল্ডের প্রকল্প বদলানো যায় না' using errcode = 'HC400', detail = 'project_key';
    end if;
    if used then
      if new.key <> old.key then
        raise exception '«%» ফিল্ডের মান রেকর্ডে আছে — key বদলানো যায় না', old.label_bn using errcode = 'HC400', detail = 'key';
      end if;
      if new.type <> old.type then
        raise exception '«%» ফিল্ডের মান রেকর্ডে আছে — ধরন বদলানো যায় না', old.label_bn using errcode = 'HC400', detail = 'type';
      end if;
      if new.visibility <> old.visibility then
        raise exception '«%» ফিল্ডের মান রেকর্ডে আছে — পাবলিক/গোপন বদলানো যায় না', old.label_bn using errcode = 'HC400', detail = 'visibility';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger housing_project_fields_guard
  before insert or update or delete on public.housing_project_fields
  for each row execute function public.housing_project_fields_guard();

-- A new project and its fields in one call, always as a draft. The API has already checked every
-- value's shape; the triggers check the rules. Returns the new key.
create function public.housing_project_create(p_project jsonb, p_fields jsonb default '[]'::jsonb)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  k text;
  f jsonb;
  n integer := 0;
begin
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'p_project must be a JSON object' using errcode = '22023';
  end if;
  p_fields := coalesce(p_fields, '[]'::jsonb);
  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 40 then
    raise exception 'p_fields must be an array of at most 40' using errcode = '22023';
  end if;

  insert into public.housing_projects (key, parent_key, is_group, slug, name_bn, name_en, summary_bn, summary_en,
                                       description_bn, description_en, unit_bn, unit_en, photo_mode,
                                       prev_label_bn, prev_label_en, current_label_bn, current_label_en, geo_depth,
                                       core_fields, stat_cards, display, file_prefix, icon, accent, sort_order,
                                       is_published, show_on_home)
  values (p_project ->> 'key',
          nullif(p_project ->> 'parent_key', ''),
          coalesce((p_project ->> 'is_group')::boolean, false),
          p_project ->> 'slug',
          p_project ->> 'name_bn',
          p_project ->> 'name_en',
          coalesce(p_project ->> 'summary_bn', ''), coalesce(p_project ->> 'summary_en', ''),
          coalesce(p_project ->> 'description_bn', ''), coalesce(p_project ->> 'description_en', ''),
          coalesce(nullif(p_project ->> 'unit_bn', ''), 'উপকারভোগী'), coalesce(nullif(p_project ->> 'unit_en', ''), 'beneficiaries'),
          coalesce(nullif(p_project ->> 'photo_mode', ''), 'after_only'),
          coalesce(p_project ->> 'prev_label_bn', ''), coalesce(p_project ->> 'prev_label_en', ''),
          coalesce(p_project ->> 'current_label_bn', ''), coalesce(p_project ->> 'current_label_en', ''),
          coalesce(nullif(p_project ->> 'geo_depth', ''), 'upazila'),
          coalesce(p_project -> 'core_fields', '{}'::jsonb),
          coalesce(p_project -> 'stat_cards', '[]'::jsonb),
          coalesce(p_project -> 'display', '{}'::jsonb),
          nullif(p_project ->> 'file_prefix', ''),
          coalesce(nullif(p_project ->> 'icon', ''), 'hands-heart'),
          coalesce(nullif(p_project ->> 'accent', ''), 'brand'),
          coalesce((p_project ->> 'sort_order')::integer, (select coalesce(max(sort_order), 0) + 10 from public.housing_projects)),
          false,
          coalesce((p_project ->> 'show_on_home')::boolean, true))
  returning key into k;

  for f in select value from jsonb_array_elements(p_fields) loop
    n := n + 1;
    insert into public.housing_project_fields (project_key, key, label_bn, label_en, help_bn, help_en, type, options, required,
                                               visibility, show_in_table, show_in_card, show_in_detail, filterable, searchable,
                                               fill_down, max_length, min_value, max_value, import_aliases, sort_order, is_active)
    values (k, f ->> 'key', f ->> 'label_bn', coalesce(f ->> 'label_en', ''), coalesce(f ->> 'help_bn', ''), coalesce(f ->> 'help_en', ''),
            f ->> 'type',
            coalesce(f -> 'options', '[]'::jsonb),
            coalesce((f ->> 'required')::boolean, false),
            coalesce(nullif(f ->> 'visibility', ''), 'public'),
            coalesce((f ->> 'show_in_table')::boolean, false),
            coalesce((f ->> 'show_in_card')::boolean, false),
            coalesce((f ->> 'show_in_detail')::boolean, true),
            coalesce((f ->> 'filterable')::boolean, false),
            coalesce((f ->> 'searchable')::boolean, false),
            coalesce((f ->> 'fill_down')::boolean, false),
            (f ->> 'max_length')::integer, (f ->> 'min_value')::numeric, (f ->> 'max_value')::numeric,
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(f -> 'import_aliases', '[]'::jsonb)) as x), '{}'),
            coalesce((f ->> 'sort_order')::integer, n * 10),
            true);
  end loop;

  return k;
end;
$$;

-- Sets sort_order 10, 20, ... in the given order. Unknown keys are ignored and unchanged rows aren't
-- written, so a reorder logs nothing.
create function public.housing_projects_reorder(p_keys text[])
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  update public.housing_projects p
     set sort_order = o.ord * 10
    from unnest(p_keys) with ordinality as o(key, ord)
   where p.key = o.key and p.sort_order <> o.ord * 10;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The same for one project's fields; another project's field ids are ignored.
create function public.housing_project_fields_reorder(p_project text, p_ids uuid[])
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  update public.housing_project_fields f
     set sort_order = o.ord * 10
    from unnest(p_ids) with ordinality as o(id, ord)
   where f.id = o.id and f.project_key = p_project and f.sort_order <> o.ord * 10;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- How many of a project's records hold a value for a field and, for a public field, its 100 most
-- common values. A private field gives only the count: its values never leave the private table.
create function public.housing_project_field_usage(p_project text, p_key text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  f    public.housing_project_fields%rowtype;
  cnt  bigint;
  vals jsonb;
begin
  select * into f from public.housing_project_fields where project_key = p_project and key = p_key;
  if not found then
    raise exception 'ফিল্ড পাওয়া যায়নি' using errcode = 'P0002';
  end if;
  if f.visibility = 'admin' then
    select count(*) into cnt from public.housing_beneficiary_private bp
      join public.housing_beneficiaries b on b.id = bp.record_id
     where b.project_type = p_project and bp.data ? p_key;
    return jsonb_build_object('count', cnt, 'values', '[]'::jsonb);
  end if;
  select count(*) into cnt from public.housing_beneficiaries where project_type = p_project and extra ? p_key;
  select coalesce(jsonb_agg(jsonb_build_object('value', v, 'n', c) order by c desc, v), '[]'::jsonb) into vals
    from (select extra ->> p_key as v, count(*) as c
            from public.housing_beneficiaries
           where project_type = p_project and extra ? p_key
           group by extra ->> p_key
           order by count(*) desc, extra ->> p_key
           limit 100) t;
  return jsonb_build_object('count', cnt, 'values', vals);
end;
$$;

-- Merges one spelling of a public category value into another across a project. Only exact matches
-- of p_from change; p_to is normalised the way the record trigger stores values. Each changed record
-- is logged as an update by the record log trigger. Returns the number changed.
create function public.housing_project_field_rename_value(p_project text, p_key text, p_from text, p_to text)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  f public.housing_project_fields%rowtype;
  t text;
  n integer;
begin
  select * into f from public.housing_project_fields where project_key = p_project and key = p_key;
  if not found then
    raise exception 'ফিল্ড পাওয়া যায়নি' using errcode = 'P0002';
  end if;
  if f.type <> 'category' or f.visibility <> 'public' then
    raise exception 'শুধু পাবলিক ক্যাটাগরি ফিল্ডের মান একীকরণ করা যায়' using errcode = 'HC400', detail = 'type';
  end if;
  -- The record trigger refuses a new value for an archived field; saying so here names the cause.
  if not f.is_active then
    raise exception 'আর্কাইভ করা ফিল্ডের মান বদলানো যায় না — আগে ফিরিয়ে আনুন' using errcode = 'HC400', detail = 'is_active';
  end if;
  t := regexp_replace(normalize(btrim(coalesce(p_to, '')), NFC), '\s+', ' ', 'g');
  if t = '' then
    raise exception 'নতুন মান খালি হতে পারে না' using errcode = 'HC400', detail = 'to';
  end if;
  if length(t) > coalesce(f.max_length, 100) then
    raise exception 'নতুন মান অনেক বড়' using errcode = 'HC400', detail = 'to';
  end if;
  update public.housing_beneficiaries
     set extra = jsonb_set(extra, array[p_key], to_jsonb(t))
   where project_type = p_project and extra ->> p_key = p_from and extra ->> p_key <> t;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Logs every project and field change with the acting admin: a snapshot on create and delete, old
-- and new per changed column on update. A change of sort_order or the timestamps alone isn't logged,
-- so reorders don't fill the log. Field definitions are logged; values never pass through here.
-- Definer because housing_app may only read the log.
create function public.housing_log_config_change()
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
      return null;
    end if;
  end if;

  if tg_table_name = 'housing_projects' then
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
          || case when tg_table_name = 'housing_project_fields' then jsonb_build_object('field_key', coalesce(n ->> 'key', o ->> 'key')) else '{}'::jsonb end);
  return null;
end;
$$;

create trigger housing_projects_activity_log
  after insert or update or delete on public.housing_projects
  for each row execute function public.housing_log_config_change();
create trigger housing_project_fields_activity_log
  after insert or update or delete on public.housing_project_fields
  for each row execute function public.housing_log_config_change();

-- A project's cover is a housing_files row with kind 'cover' and the project's key instead of a
-- record. Deleting the project keeps the (tombstoned) row for the sweep and clears its key.
alter table public.housing_files
  add column project_key text references public.housing_projects (key) on update restrict on delete set null;
create index housing_files_project_key_idx on public.housing_files (project_key);
alter table public.housing_files drop constraint housing_files_kind_check;
alter table public.housing_files
  add constraint housing_files_kind_check check (kind in ('prev', 'current', 'cover')),
  add constraint housing_files_cover_shape check ((kind = 'cover' and record_id is null) or (kind <> 'cover' and project_key is null));
create unique index housing_files_live_cover on public.housing_files (project_key, variant)
  where deleted_at is null and project_key is not null;

-- cover_path holds the cover photo's URL, served by GET /api/v1/photos/<file id>.
alter table public.housing_projects
  add constraint housing_projects_cover_path check (cover_path is null or cover_path ~ '/api/v1/photos/[0-9a-f-]{36}$');

grant execute on function public.housing_project_create(jsonb, jsonb) to housing_app;
grant execute on function public.housing_projects_reorder(text[]) to housing_app;
grant execute on function public.housing_project_fields_reorder(text, uuid[]) to housing_app;
grant execute on function public.housing_project_field_usage(text, text) to housing_app;
grant execute on function public.housing_project_field_rename_value(text, text, text, text) to housing_app;
-- The guard calls it as the writer, so housing_app needs it too.
grant execute on function public.housing_reserved_slugs() to housing_app;

-- migrate:down
-- Rolling back deletes cover file rows; their stored objects stay on disk until removed by hand.
-- Nothing is deployed, so that is accepted (DB-MIG-05). Log rows and counters stay.
alter table public.housing_projects drop constraint housing_projects_cover_path;
delete from public.housing_files where kind = 'cover';
drop index public.housing_files_live_cover;
alter table public.housing_files drop constraint housing_files_cover_shape;
alter table public.housing_files drop constraint housing_files_kind_check;
alter table public.housing_files add constraint housing_files_kind_check check (kind in ('prev', 'current'));
drop index public.housing_files_project_key_idx;
alter table public.housing_files drop column project_key;

drop trigger housing_project_fields_activity_log on public.housing_project_fields;
drop trigger housing_projects_activity_log on public.housing_projects;
drop function public.housing_log_config_change();
drop function public.housing_project_field_rename_value(text, text, text, text);
drop function public.housing_project_field_usage(text, text);
drop function public.housing_project_fields_reorder(text, uuid[]);
drop function public.housing_projects_reorder(text[]);
drop function public.housing_project_create(jsonb, jsonb);
drop trigger housing_project_fields_guard on public.housing_project_fields;
drop function public.housing_project_fields_guard();
drop trigger housing_projects_after_write on public.housing_projects;
drop function public.housing_projects_after_write();
drop trigger housing_projects_guard on public.housing_projects;
drop function public.housing_projects_guard();
drop function public.housing_reserved_slugs();
