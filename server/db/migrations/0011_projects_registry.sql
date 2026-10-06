-- The project registry, ported from supabase/sql/10_projects.sql: projects (groups and their
-- sub-projects), the custom fields admins define per project, and the private (admin-only) values
-- kept apart from the public record. Records now belong to a registered project through a foreign
-- key instead of the fixed ('semi_pucca', 'tin') CHECK, and gain union_name and extra (public custom
-- values).
-- Differences from the Supabase file:
--   * Tables keep the server's housing_ prefix: housing_projects, housing_project_fields and
--     housing_beneficiary_private.
--   * There is no RLS. The API decides who sees drafts and private fields
--     (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "Visibility").
--   * There are no asf_meta fingerprint helpers.
--   * cover_path has no path CHECK; the cover upload work adds the rule that fits the server's
--     file storage.
-- Validation and guard triggers come in later migrations, so this one holds only the shape.

-- migrate:up
create table public.housing_projects (
  key              text primary key,
  parent_key       text references public.housing_projects (key) on update restrict on delete restrict,
  is_group         boolean     not null default false,
  slug             text        not null,
  name_bn          text        not null,
  name_en          text        not null,
  summary_bn       text        not null default '',
  summary_en       text        not null default '',
  description_bn   text        not null default '',
  description_en   text        not null default '',
  unit_bn          text        not null default 'উপকারভোগী',
  unit_en          text        not null default 'beneficiaries',
  photo_mode       text        not null default 'after_only',
  prev_label_bn    text        not null default '',
  prev_label_en    text        not null default '',
  current_label_bn text        not null default '',
  current_label_en text        not null default '',
  geo_depth        text        not null default 'upazila',
  core_fields      jsonb       not null default '{}'::jsonb,
  stat_cards       jsonb       not null default '[]'::jsonb,
  display          jsonb       not null default '{}'::jsonb,
  file_prefix      text,
  icon             text        not null default 'hands-heart',
  accent           text        not null default 'brand',
  cover_path       text,
  sort_order       integer     not null default 0,
  is_published     boolean     not null default false,
  show_on_home     boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint housing_projects_key_format      check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint housing_projects_slug_key        unique (slug),
  constraint housing_projects_slug_format     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60 and slug !~ '^[0-9]+$'),
  constraint housing_projects_file_prefix_key unique (file_prefix),
  constraint housing_projects_file_prefix_format check (file_prefix is null or file_prefix ~ '^[a-z][a-z0-9]{0,15}$'),
  -- A group holds sub-projects only: no records, so no file prefix, and groups don't nest.
  constraint housing_projects_group_shape     check ((is_group and file_prefix is null and parent_key is null) or (not is_group and file_prefix is not null)),
  constraint housing_projects_not_self_parent check (parent_key is null or parent_key <> key),
  constraint housing_projects_names           check (length(btrim(name_bn)) between 1 and 120 and length(btrim(name_en)) between 1 and 120),
  constraint housing_projects_text_lengths    check (
    length(summary_bn) <= 300 and length(summary_en) <= 300
    and length(description_bn) <= 2000 and length(description_en) <= 2000
    and length(unit_bn) <= 40 and length(unit_en) <= 40
    and length(prev_label_bn) <= 60 and length(prev_label_en) <= 60
    and length(current_label_bn) <= 60 and length(current_label_en) <= 60),
  constraint housing_projects_photo_mode      check (photo_mode in ('before_after', 'after_only', 'none')),
  constraint housing_projects_geo_depth       check (geo_depth in ('upazila', 'union')),
  constraint housing_projects_json_shapes     check (jsonb_typeof(core_fields) = 'object' and jsonb_typeof(stat_cards) = 'array' and jsonb_typeof(display) = 'object'),
  constraint housing_projects_icon_accent     check (icon ~ '^[a-z0-9-]{1,40}$' and accent ~ '^[a-z0-9-]{1,40}$')
);
create index housing_projects_parent_idx on public.housing_projects (parent_key, sort_order);

create trigger housing_projects_set_updated_at before update on public.housing_projects
  for each row execute function public.housing_set_updated_at();

-- The housing group and its two sub-projects, with the names and texts the site shows today. A
-- function so the test and dev resets restore the same rows; owner-only, never granted to the app.
create function public.housing_seed_projects()
returns void
language sql
set search_path = public
as $seed$
insert into public.housing_projects (key, parent_key, is_group, slug, name_bn, name_en, description_bn, description_en,
                                     unit_bn, unit_en, photo_mode, geo_depth, stat_cards, display, file_prefix, icon, accent,
                                     sort_order, is_published, show_on_home)
values ('housing', null, true, 'housing', 'ঘর নির্মাণ প্রকল্প', 'Housing Project',
        'ঘরহীন ও অসহায় পরিবারের জন্য নিরাপদ বাসস্থান। প্রতিটি ঘরের আগের ও বর্তমান অবস্থার ছবিসহ উপকারভোগীদের পূর্ণ তালিকা এখানে দেখা যায়। প্রকল্পটি চলমান।',
        'Safe homes for homeless and helpless families. The full list of beneficiaries with before and current photos of every house is shown here. The project is ongoing.',
        'ঘর', 'houses', 'before_after', 'upazila',
        '[{"id":"total","kind":"count","label_bn":"মোট ঘর নির্মাণ","label_en":"Houses built","icon":"house","home":true},
          {"id":"districts","kind":"geo","level":"district","label_bn":"মোট জেলা কভার","label_en":"Districts covered","icon":"pin","home":true},
          {"id":"upazilas","kind":"geo","level":"upazila","label_bn":"মোট উপজেলা কভার","label_en":"Upazilas covered","icon":"grid","home":true}]'::jsonb,
        '{}'::jsonb, null, 'house', 'brand', 10, true, true)
on conflict (key) do nothing;

insert into public.housing_projects (key, parent_key, is_group, slug, name_bn, name_en, summary_bn, summary_en, description_bn, description_en,
                                     unit_bn, unit_en, photo_mode, prev_label_bn, prev_label_en, current_label_bn, current_label_en,
                                     geo_depth, core_fields, stat_cards, display, file_prefix, icon, accent, sort_order, is_published, show_on_home)
select v.key, 'housing', false, v.slug, v.name_bn, v.name_en, v.desc_bn, v.desc_en, v.desc_bn, v.desc_en,
       'ঘর', 'houses', 'before_after', 'পূর্বের ঘর', 'Before', 'বর্তমান ঘর', 'After',
       'union',
       '{"union_name": {"required": false}}'::jsonb,
       '[{"id":"total","kind":"count","label_bn":"মোট উপকারভোগী","label_en":"Total beneficiaries","home_label_bn":"মোট ঘর নির্মাণ","home_label_en":"Houses built","icon":"users","home":true},
         {"id":"divisions","kind":"geo","level":"division","label_bn":"মোট বিভাগ","label_en":"Divisions","icon":"map"},
         {"id":"districts","kind":"geo","level":"district","label_bn":"মোট জেলা","label_en":"Districts","home_label_bn":"মোট জেলা কভার","home_label_en":"Districts covered","icon":"pin","home":true},
         {"id":"upazilas","kind":"geo","level":"upazila","label_bn":"মোট উপজেলা","label_en":"Upazilas","home_label_bn":"মোট উপজেলা কভার","home_label_en":"Upazilas covered","icon":"grid","home":true}]'::jsonb,
       '{"show_map": true, "geo_columns": "split"}'::jsonb,
       v.prefix, v.icon, 'brand', v.sort_order, true, true
  from (values
    ('semi_pucca', 'semi-pucca', 'সেমিপাকা ঘর নির্মাণ', 'Semi-pucca House Construction',
     'ইটের দেয়াল ও টিনের ছাউনিতে টেকসই, নিরাপদ ঘর — দীর্ঘমেয়াদি বাসস্থানের সমাধান।',
     'Durable, safe homes with brick walls and tin roofs — a long-term housing solution.',
     'semi', 'house', 10),
    ('tin', 'tin', 'টিনের ঘর নির্মাণ', 'Tin-shed House Construction',
     'দ্রুত ও স্বল্প ব্যয়ে নির্মিত টিনের ঘর — জরুরি প্রয়োজনে মাথা গোঁজার ঠাঁই।',
     'Quickly built, low-cost tin-shed homes — shelter for urgent needs.',
     'tin', 'tin-house', 20)
  ) as v(key, slug, name_bn, name_en, desc_bn, desc_en, prefix, icon, sort_order)
on conflict (key) do nothing;
$seed$;

select public.housing_seed_projects();

create table public.housing_project_fields (
  id             uuid        primary key default gen_random_uuid(),
  project_key    text        not null references public.housing_projects (key) on update restrict on delete restrict,
  key            text        not null,
  label_bn       text        not null,
  label_en       text        not null default '',
  help_bn        text        not null default '',
  help_en        text        not null default '',
  type           text        not null,
  options        jsonb       not null default '[]'::jsonb,
  required       boolean     not null default false,
  visibility     text        not null default 'public',
  show_in_table  boolean     not null default false,
  show_in_card   boolean     not null default false,
  show_in_detail boolean     not null default true,
  filterable     boolean     not null default false,
  searchable     boolean     not null default false,
  fill_down      boolean     not null default false,
  max_length     integer,
  min_value      numeric,
  max_value      numeric,
  import_aliases text[]      not null default '{}',
  sort_order     integer     not null default 0,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint housing_project_fields_project_key_key unique (project_key, key),
  constraint housing_project_fields_key_format   check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- A custom key can't shadow a record column or a list query parameter.
  constraint housing_project_fields_key_reserved check (
    key not in ('id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district',
                'upazila', 'union_name', 'address', 'extra', 'created_at', 'updated_at', 'photo_updated_at',
                'q', 'page', 'sort', 'f')
    and key !~ '^(prev|current)_'),
  constraint housing_project_fields_labels       check (length(btrim(label_bn)) between 1 and 120 and length(label_en) <= 120
                                                        and length(help_bn) <= 300 and length(help_en) <= 300),
  constraint housing_project_fields_type         check (type in ('text', 'long_text', 'number', 'money', 'category', 'date', 'phone')),
  constraint housing_project_fields_visibility   check (visibility in ('public', 'admin')),
  constraint housing_project_fields_phone_private check (type <> 'phone' or visibility = 'admin'),
  -- A private field's values never appear in a table, card, filter or search.
  constraint housing_project_fields_private_hidden check (visibility = 'public' or not (show_in_table or show_in_card or filterable or searchable)),
  constraint housing_project_fields_options      check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 100),
  constraint housing_project_fields_max_length   check (max_length is null or max_length between 1 and 2000),
  constraint housing_project_fields_minmax       check (min_value is null or max_value is null or min_value <= max_value),
  constraint housing_project_fields_aliases      check (cardinality(import_aliases) <= 20)
);
-- The unique (project_key, key) index also serves the project_key foreign key.
create index housing_project_fields_project_idx on public.housing_project_fields (project_key, sort_order);

create trigger housing_project_fields_set_updated_at before update on public.housing_project_fields
  for each row execute function public.housing_set_updated_at();

-- The FK goes on before the CHECK comes off, so project_type is never unconstrained.
alter table public.housing_beneficiaries
  add constraint housing_beneficiaries_project_type_fkey
  foreign key (project_type) references public.housing_projects (key) on update restrict on delete restrict;
alter table public.housing_beneficiaries drop constraint housing_beneficiaries_project_type_check;

alter table public.housing_beneficiaries add column union_name text  not null default '';
alter table public.housing_beneficiaries add column extra      jsonb not null default '{}'::jsonb;
alter table public.housing_beneficiaries
  add constraint housing_beneficiaries_extra_check check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) < 16384);

create index housing_beneficiaries_extra_gin             on public.housing_beneficiaries using gin (extra);
create index housing_beneficiaries_project_geo_idx       on public.housing_beneficiaries (project_type, district, upazila);
create index housing_beneficiaries_project_union_idx     on public.housing_beneficiaries (project_type, union_name) where union_name <> '';
create index housing_beneficiaries_project_created_idx   on public.housing_beneficiaries (project_type, created_at desc);

-- Values of private (visibility = 'admin') fields, such as a phone number, kept out of the record
-- so no public read, search or stat can reach them.
create table public.housing_beneficiary_private (
  record_id  uuid        primary key references public.housing_beneficiaries (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint housing_beneficiary_private_data check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384)
);

create trigger housing_beneficiary_private_set_updated_at before update on public.housing_beneficiary_private
  for each row execute function public.housing_set_updated_at();

-- Keys of the projects a visitor may see: published, and in a published group if in one.
create function public.housing_public_project_keys()
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
    from public.housing_projects p
    left join public.housing_projects g on g.key = p.parent_key
   where p.is_published
     and (p.parent_key is null or g.is_published);
$$;

revoke all on public.housing_projects, public.housing_project_fields, public.housing_beneficiary_private from public;
grant select, insert, update, delete on public.housing_projects, public.housing_project_fields,
  public.housing_beneficiary_private to housing_app;
grant execute on function public.housing_public_project_keys() to housing_app;

-- migrate:down
-- Drops every custom value, private value and registered project. Nothing is deployed, so no
-- shared database holds them; with real data, fix forward instead.
drop function public.housing_public_project_keys();
drop table public.housing_beneficiary_private;
drop index public.housing_beneficiaries_project_created_idx;
drop index public.housing_beneficiaries_project_union_idx;
drop index public.housing_beneficiaries_project_geo_idx;
drop index public.housing_beneficiaries_extra_gin;
alter table public.housing_beneficiaries drop constraint housing_beneficiaries_extra_check;
alter table public.housing_beneficiaries drop column extra;
alter table public.housing_beneficiaries drop column union_name;
alter table public.housing_beneficiaries
  add constraint housing_beneficiaries_project_type_check check (project_type in ('semi_pucca', 'tin'));
alter table public.housing_beneficiaries drop constraint housing_beneficiaries_project_type_fkey;
drop table public.housing_project_fields;
drop function public.housing_seed_projects();
drop table public.housing_projects;
