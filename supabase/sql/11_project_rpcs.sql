-- =====================================================================
-- 11_project_rpcs.sql — বহু-প্রকল্পের RPC (পর্ব ২, M-ধাপ ৩ · চেকলিস্ট সারি ২৮)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md §৫.৯–৫.১০ · পূর্বশর্ত: 10_projects.sql ও 10b_project_guards.sql
--
-- নতুন:
--   project_leaf_keys(key)          — প্রকল্প হলে নিজে; গ্রুপ হলে তার উপ-প্রকল্পগুলো (RLS প্রযোজ্য)
--   project_stats(key, light)       — মোট, সাল/বিভাগ/জেলা/উপজেলা/ইউনিয়ন অনুযায়ী, distinct, কাস্টম ফিল্ড (মোট টাকা,
--                                     মোট ক্যাটাগরি, ক্যাটাগরি অনুযায়ী সংখ্যা ও টাকা), উপ-প্রকল্প অনুযায়ী। INVOKER (RLS প্রযোজ্য)
--   projects_overview(drafts)       — হোম পেইজ/এডমিন ড্যাশবোর্ড: সব প্রকল্প + হালকা স্ট্যাট + ছবি, এক কলে
--   project_create(project, fields) — প্রকল্প ও তার ফিল্ড একসাথে (একটি ভুল হলে কিছুই তৈরি হয় না); সবসময় খসড়া
--   projects_reorder, project_fields_reorder — ক্রম বদল (এডমিন)
--   project_field_usage(project, key) — কতটি রেকর্ডে মান আছে, কোন মান কতবার (এডমিন)
--   project_field_rename_value(project, key, from, to) — ক্যাটাগরির বানান একীকরণ (এডমিন)
-- বদলানো (signature হুবহু, পুরনো সাইট আগের মতো চলে):
--   housing_stats(p)   — wrapper: ভেতরে project_stats; null = 'housing' গ্রুপ; উত্তর হুবহু আগের আকারে
--                        (ফাইলের ভেতরের ফিঙ্গারপ্রিন্ট-যাচাই এটি প্রমাণ করে — না মিললে সব বাতিল)
--   housing_years(p)   — wrapper
--   housing_next_serial(p) v2 — খসড়া প্রকল্পে এডমিন ছাড়া কেউ ডাকলে null
--   housing_bulk_update_by_serial v2 — প্রকল্প রেজিস্ট্রি থেকে; খালি/null = অপরিবর্তিত (আগের বাগ: আপডেট মোডে
--                        পিতার নাম ও ঠিকানা মুছে যেত); মুছতে "_clear": ["address", "extra.item_name"]; union_name ও extra
--
-- ✅ ডাটা বদলায় না (শুধু ফাংশন), এক ট্রানজেকশনে, ফিঙ্গারপ্রিন্টসহ, আবার চালালে ক্ষতি নেই।
-- আগে: backup/before_11.sql · পরে: checks/11_selftest.sql
-- =====================================================================

begin;

do $pre$
begin
  if to_regprocedure('public.housing_validate_record()') is null or to_regprocedure('public.is_housing_main_admin()') is null then
    raise exception 'আগে 10_projects.sql ও 10b_project_guards.sql চালান (চেকলিস্ট সারি ২৬–২৭) — কিছুই বদলায়নি।';
  end if;
end
$pre$;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- প্রকল্পের পাতা (leaf) key
create or replace function public.project_leaf_keys(p_key text)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(key order by sort_order, key), '{}')
    from public.projects
   where not is_group and (key = p_key or parent_key = p_key);
$$;
grant execute on function public.project_leaf_keys(text) to anon, authenticated;

-- ---------------------------------------------------------------- পরিসংখ্যান
create or replace function public.project_stats(p_key text, p_light boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  leaves     text[] := public.project_leaf_keys(p_key);
  res        jsonb;
  f          record;
  fields     jsonb := '{}'::jsonb;
  money_keys text[];
  v          jsonb;
begin
  with base as (
    select project_type, year, division, district, upazila, union_name
      from public.housing_beneficiaries
     where project_type = any (leaves)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_year', coalesce((select jsonb_object_agg(k, c) from (select year::text as k, count(*) as c from base group by year) t), '{}'::jsonb),
    'by_division', coalesce((select jsonb_object_agg(k, c) from (select division as k, count(*) as c from base group by division) t), '{}'::jsonb),
    'by_district', coalesce((select jsonb_object_agg(k, c) from (select district as k, count(*) as c from base group by district) t), '{}'::jsonb),
    'by_upazila', coalesce((select jsonb_object_agg(k, c) from (select upazila as k, count(*) as c from base group by upazila) t), '{}'::jsonb),
    'by_location', coalesce((select jsonb_object_agg(k, c) from (select district || '|' || upazila as k, count(*) as c from base group by district, upazila) t), '{}'::jsonb),
    'distinct', jsonb_build_object(
      'divisions', (select count(distinct division) from base),
      'districts', (select count(distinct district) from base),
      'upazilas',  (select count(*) from (select distinct district, upazila from base) u),
      'unions',    (select count(*) from (select distinct district, upazila, union_name from base where union_name <> '') u)
    ),
    'by_project', coalesce((select jsonb_object_agg(l, (select count(*) from base where project_type = l)) from unnest(leaves) as l), '{}'::jsonb)
  ) into res;

  if not p_light then
    res := res || jsonb_build_object('by_union', coalesce((
      select jsonb_object_agg(k, c)
        from (select district || '|' || upazila || '|' || union_name as k, count(*) as c
                from public.housing_beneficiaries
               where project_type = any (leaves) and union_name <> ''
               group by district, upazila, union_name) t
    ), '{}'::jsonb));
  end if;

  -- কাস্টম ফিল্ড: শুধু সক্রিয় ও পাবলিক; key প্যারামিটার হিসেবে (dynamic SQL নেই); যোগফলে শুধু JSON number
  select array_agg(distinct key) into money_keys
    from public.project_fields
   where project_key = any (leaves) and is_active and visibility = 'public' and type in ('money', 'number');
  money_keys := coalesce(money_keys, '{}');

  for f in select distinct key, type from public.project_fields
            where project_key = any (leaves) and is_active and visibility = 'public' and type in ('money', 'number', 'category')
            order by key loop
    if f.type in ('money', 'number') then
      select jsonb_build_object('type', f.type, 'sum', coalesce(sum((extra ->> f.key)::numeric), 0), 'count', count(*))
        into v
        from public.housing_beneficiaries
       where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'number';
    else
      select jsonb_build_object('type', 'category', 'distinct', count(distinct extra ->> f.key))
        into v
        from public.housing_beneficiaries
       where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'string' and extra ->> f.key <> '';
      if not p_light then
        v := v || jsonb_build_object('by_value', coalesce((
          select jsonb_object_agg(c.val, jsonb_build_object('n', c.n, 'sums', c.sums))
            from (
              select g.val, g.n,
                     coalesce((
                       select jsonb_object_agg(mk, tot)
                         from (
                           select mk, sum((b2.extra ->> mk)::numeric) as tot
                             from public.housing_beneficiaries b2
                             cross join unnest(money_keys) as mk
                            where b2.project_type = any (leaves)
                              and b2.extra ->> f.key = g.val
                              and jsonb_typeof(b2.extra -> mk) = 'number'
                            group by mk
                         ) s
                     ), '{}'::jsonb) as sums
                from (
                  select extra ->> f.key as val, count(*) as n
                    from public.housing_beneficiaries
                   where project_type = any (leaves) and jsonb_typeof(extra -> f.key) = 'string' and extra ->> f.key <> ''
                   group by extra ->> f.key
                ) g
            ) c
        ), '{}'::jsonb));
      end if;
    end if;
    fields := fields || jsonb_build_object(f.key, v);
  end loop;

  return res || jsonb_build_object('fields', fields);
end;
$$;
grant execute on function public.project_stats(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- সামঞ্জস্যের wrapper (পুরনো সাইট)
-- উত্তর হুবহু 04_rpc_stats.sql এর আকারে — নতুন key (by_union, fields, by_project, distinct.unions) বাদ।
create or replace function public.housing_stats(p_project_type text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  j jsonb := public.project_stats(coalesce(p_project_type, 'housing'), true);
begin
  return jsonb_build_object(
    'total', j -> 'total',
    'by_year', j -> 'by_year',
    'by_division', j -> 'by_division',
    'by_district', j -> 'by_district',
    'by_upazila', j -> 'by_upazila',
    'distinct', jsonb_build_object(
      'divisions', j #> '{distinct,divisions}',
      'districts', j #> '{distinct,districts}',
      'upazilas',  j #> '{distinct,upazilas}'
    ),
    'by_location', j -> 'by_location'
  );
end;
$$;
grant execute on function public.housing_stats(text) to anon, authenticated;

create or replace function public.housing_years(p_project_type text default null)
returns table (year integer)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct b.year
    from public.housing_beneficiaries b
   where b.project_type = any (public.project_leaf_keys(coalesce(p_project_type, 'housing')))
   order by b.year desc;
$$;
grant execute on function public.housing_years(text) to anon, authenticated;

-- ---------------------------------------------------------------- পরের সিরিয়াল v2 (খসড়া সুরক্ষা)
create or replace function public.housing_next_serial(p_project_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select c.last_serial + 1
    from public.housing_serial_counters c
   where c.project_type = p_project_type
     and (p_project_type = any (public.public_project_keys()) or public.is_housing_admin());
$$;
grant execute on function public.housing_next_serial(text) to anon, authenticated;

-- ---------------------------------------------------------------- হোম পেইজ / ড্যাশবোর্ড: এক কলে সব
create or replace function public.projects_overview(p_include_drafts boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  is_admin boolean := public.is_housing_admin();
  drafts   boolean := coalesce(p_include_drafts, false) and is_admin;
  pub      text[]  := public.public_project_keys();
  items    jsonb   := '[]'::jsonb;
  p        public.projects%rowtype;
  leaves   text[];
  f_thumb  text;
  f_name   text;
  f_serial integer;
  f_ptype  text;
  f_at     timestamptz;
  wp       bigint;
  pub_leaves text[];
begin
  for p in select * from public.projects where drafts or key = any (pub) order by sort_order, key loop
    leaves := public.project_leaf_keys(p.key);
    f_thumb := null; f_name := null; f_serial := null; f_ptype := null; f_at := null;
    select coalesce(b.current_thumb_url, b.prev_thumb_url), b.name, b.serial_no, b.project_type, b.photo_updated_at
      into f_thumb, f_name, f_serial, f_ptype, f_at
      from public.housing_beneficiaries b
     where b.project_type = any (leaves) and coalesce(b.current_thumb_url, b.prev_thumb_url) is not null
     order by b.created_at desc, b.serial_no desc
     limit 1;
    wp := null;
    if drafts then
      select count(*) into wp from public.housing_beneficiaries where project_type = any (leaves) and current_photo_url is null;
    end if;
    items := items || jsonb_build_array(jsonb_build_object(
      'key', p.key, 'parent_key', p.parent_key, 'is_group', p.is_group, 'slug', p.slug,
      'name_bn', p.name_bn, 'name_en', p.name_en, 'summary_bn', p.summary_bn, 'summary_en', p.summary_en,
      'unit_bn', p.unit_bn, 'unit_en', p.unit_en, 'icon', p.icon, 'accent', p.accent, 'cover_path', p.cover_path,
      'photo_mode', p.photo_mode, 'sort_order', p.sort_order, 'is_published', p.is_published, 'show_on_home', p.show_on_home,
      'stat_cards', p.stat_cards,
      'stats', public.project_stats(p.key, true),
      'featured', case when f_thumb is null then null
                       else jsonb_build_object('thumb_url', f_thumb, 'name', f_name, 'serial_no', f_serial,
                                               'project_type', f_ptype, 'photo_updated_at', f_at) end,
      'without_photo', wp
    ));
  end loop;

  select coalesce(array_agg(key), '{}') into pub_leaves from public.projects where not is_group and key = any (pub);
  return jsonb_build_object(
    'projects', items,
    'global', (
      select jsonb_build_object('projects', cardinality(pub_leaves), 'total', count(*), 'districts', count(distinct district))
        from public.housing_beneficiaries where project_type = any (pub_leaves)
    )
  );
end;
$$;
grant execute on function public.projects_overview(boolean) to anon, authenticated;

-- ---------------------------------------------------------------- নতুন প্রকল্প (ফিল্ডসহ, একসাথে)
-- INVOKER: ফাংশনের ভেতরেও RLS প্রযোজ্য (লেখা শুধু এডমিন)। নতুন প্রকল্প সবসময় খসড়া (is_published = false)।
create or replace function public.project_create(p_project jsonb, p_fields jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  k  text;
  f  jsonb;
  n  integer := 0;
begin
  if not public.is_housing_admin() then
    raise exception 'অনুমতি নেই — শুধু এডমিন প্রকল্প তৈরি করতে পারেন' using errcode = '42501';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'p_project অবশ্যই একটি JSON object' using errcode = '22023';
  end if;
  p_fields := coalesce(p_fields, '[]'::jsonb);
  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 40 then
    raise exception 'p_fields অবশ্যই ≤ ৪০ সদস্যের array' using errcode = '22023';
  end if;

  insert into public.projects (key, parent_key, is_group, slug, name_bn, name_en, summary_bn, summary_en,
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
          coalesce((p_project ->> 'sort_order')::integer, (select coalesce(max(sort_order), 0) + 10 from public.projects)),
          false,
          coalesce((p_project ->> 'show_on_home')::boolean, true))
  returning key into k;

  for f in select value from jsonb_array_elements(p_fields) loop
    n := n + 1;
    insert into public.project_fields (project_key, key, label_bn, label_en, help_bn, help_en, type, required, visibility,
                                       show_in_table, show_in_card, show_in_detail, filterable, searchable, fill_down,
                                       max_length, min_value, max_value, import_aliases, sort_order, is_active)
    values (k, f ->> 'key', f ->> 'label_bn', coalesce(f ->> 'label_en', ''), coalesce(f ->> 'help_bn', ''), coalesce(f ->> 'help_en', ''),
            f ->> 'type',
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

  return jsonb_build_object('key', k, 'fields', n);
end;
$$;
revoke execute on function public.project_create(jsonb, jsonb) from public, anon;
grant execute on function public.project_create(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- ক্রম বদল
create or replace function public.projects_reorder(p_keys text[])
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_housing_admin() then
    raise exception 'অনুমতি নেই' using errcode = '42501';
  end if;
  update public.projects p
     set sort_order = o.ord * 10
    from unnest(p_keys) with ordinality as o(key, ord)
   where p.key = o.key and p.sort_order <> o.ord * 10;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.projects_reorder(text[]) from public, anon;
grant execute on function public.projects_reorder(text[]) to authenticated;

create or replace function public.project_fields_reorder(p_project text, p_ids uuid[])
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_housing_admin() then
    raise exception 'অনুমতি নেই' using errcode = '42501';
  end if;
  update public.project_fields f
     set sort_order = o.ord * 10
    from unnest(p_ids) with ordinality as o(id, ord)
   where f.id = o.id and f.project_key = p_project and f.sort_order <> o.ord * 10;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.project_fields_reorder(text, uuid[]) from public, anon;
grant execute on function public.project_fields_reorder(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------- ফিল্ডের ব্যবহার (এডমিন)
create or replace function public.project_field_usage(p_project text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f   public.project_fields%rowtype;
  cnt bigint;
  vals jsonb;
begin
  if not public.is_housing_admin() then
    raise exception 'অনুমতি নেই' using errcode = '42501';
  end if;
  select * into f from public.project_fields where project_key = p_project and key = p_key;
  if not found then
    raise exception 'ফিল্ড পাওয়া যায়নি' using errcode = 'P0002';
  end if;
  if f.visibility = 'admin' then
    select count(*) into cnt from public.beneficiary_private bp
      join public.housing_beneficiaries b on b.id = bp.record_id
     where b.project_type = p_project and bp.data ? p_key;
    return jsonb_build_object('count', cnt, 'values', '[]'::jsonb);   -- গোপন মান তালিকায় দেখানো হয় না
  end if;
  select count(*) into cnt from public.housing_beneficiaries where project_type = p_project and extra ? p_key;
  select coalesce(jsonb_agg(jsonb_build_object('value', v, 'n', n) order by n desc, v), '[]'::jsonb) into vals
    from (select extra ->> p_key as v, count(*) as n
            from public.housing_beneficiaries
           where project_type = p_project and extra ? p_key
           group by extra ->> p_key
           order by count(*) desc
           limit 100) t;
  return jsonb_build_object('count', cnt, 'values', vals);
end;
$$;
revoke execute on function public.project_field_usage(text, text) from public, anon;
grant execute on function public.project_field_usage(text, text) to authenticated;

-- ---------------------------------------------------------------- ক্যাটাগরির বানান একীকরণ (এডমিন; এডিট — সব এডমিন)
create or replace function public.project_field_rename_value(p_project text, p_key text, p_from text, p_to text)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  f  public.project_fields%rowtype;
  t  text;
  n  integer;
begin
  if not public.is_housing_admin() then
    raise exception 'অনুমতি নেই' using errcode = '42501';
  end if;
  select * into f from public.project_fields where project_key = p_project and key = p_key;
  if not found then
    raise exception 'ফিল্ড পাওয়া যায়নি' using errcode = 'P0002';
  end if;
  if f.type <> 'category' or f.visibility <> 'public' then
    raise exception 'শুধু পাবলিক ক্যাটাগরি ফিল্ডের মান একীকরণ করা যায়' using errcode = '23514';
  end if;
  t := regexp_replace(normalize(btrim(coalesce(p_to, '')), NFC), '\s+', ' ', 'g');
  if t = '' then
    raise exception 'নতুন মান খালি হতে পারে না' using errcode = '23514';
  end if;
  update public.housing_beneficiaries
     set extra = jsonb_set(extra, array[p_key], to_jsonb(t))
   where project_type = p_project and extra ->> p_key = p_from and extra ->> p_key <> t;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.project_field_rename_value(text, text, text, text) from public, anon;
grant execute on function public.project_field_rename_value(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- বাল্ক আপডেট v2 (signature অপরিবর্তিত)
-- p_rows: [{"serial_no": 1, "name": "...", "address": "...", "union_name": "...", "extra": {"amount": 5000},
--           "_clear": ["address", "extra.item_name"]}, ...]
-- নিয়ম: key না থাকা, null বা "" = অপরিবর্তিত। মুছতে "_clear" (মোছা যায়: father_or_husband_name, address, union_name,
-- prev_photo_source, current_photo_source, extra.<key>; আবশ্যক ঘর মোছা যাচাই-ট্রিগার আটকায়)।
-- extra এর গোপন (শুধু-এডমিন) ফিল্ড যায় beneficiary_private এ। security invoker → RLS: অ-এডমিনে ০ সারি (সব missing)।
create or replace function public.housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          jsonb;
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
begin
  select is_group into is_grp from public.projects where key = p_project_type;
  if not found then
    raise exception 'অচেনা project_type: %', p_project_type using errcode = '23514';
  end if;
  if is_grp then
    raise exception '«%» একটি প্রকল্প-গ্রুপ — উপ-প্রকল্প বাছুন', p_project_type using errcode = '23514';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;
  select coalesce(array_agg(key), '{}') into admin_keys
    from public.project_fields where project_key = p_project_type and visibility = 'admin';

  for r in select * from jsonb_array_elements(p_rows) loop
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
        insert into public.beneficiary_private (record_id, data) values (rid, priv_patch)
        on conflict (record_id) do update set data = public.beneficiary_private.data || excluded.data;
      end if;
    end if;
  end loop;

  return jsonb_build_object('updated', updated, 'missing', to_jsonb(missing));
end;
$$;
grant execute on function public.housing_bulk_update_by_serial(text, jsonb) to authenticated;

-- ---------------------------------------------------------------- ফিঙ্গারপ্রিন্ট (stats_md5 = wrapper হুবহু আগের মতো)
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
  select 1 as k, 'নতুন RPC (৮টি)' as item,
         case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('project_leaf_keys', 'project_stats', 'projects_overview', 'project_create',
                       'projects_reorder', 'project_fields_reorder', 'project_field_usage', 'project_field_rename_value')) = 8 then '✅' else '❌' end as ok,
         'project_stats, projects_overview, project_create, …' as info
  union all
  select 2, 'পুরনো সাইটের স্ট্যাট (housing_stats wrapper) হুবহু আগের মতো', '✅', 'ফাইলের ভেতরে ফিঙ্গারপ্রিন্টে প্রমাণিত (stats_md5 অপরিবর্তিত)'
  union all
  select 3, 'project_stats(''housing'')', case when (public.project_stats('housing') ->> 'total')::int = (select count(*) from public.housing_beneficiaries where project_type in ('semi_pucca', 'tin')) then '✅' else '❌' end,
         'মোট ' || (public.project_stats('housing') ->> 'total') || ' · উপ-প্রকল্প ' || (public.project_stats('housing') -> 'by_project')::text
  union all
  select 4, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট', '✅', 'অপরিবর্তিত'
  union all
  select 5, 'পরের কাজ', '➡', 'checks/11_selftest.sql চালান (চেকলিস্ট সারি ২৮)'
) t
order by k;
