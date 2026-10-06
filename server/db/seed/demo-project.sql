-- Dev-only example project: "demo", a draft with custom public fields (money, number, category) and
-- a private phone field, six fictional records with unions and custom values, and their private
-- values. Loaded by `npm run db:seed` after dev.sql, and by the REST contract and admin-rest test
-- resets into housing_test only. Safe to run again: nothing is added twice. Never part of the
-- migrations, so no deployed database gets it.
-- (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P5 decisions")

-- Created through the same function the API uses, so the guards and the config log run.
select public.housing_project_create(
  jsonb_build_object(
    'key', 'demo', 'slug', 'demo', 'name_bn', 'ডেমো প্রকল্প', 'name_en', 'Demo project',
    'summary_bn', 'পরীক্ষার জন্য খসড়া প্রকল্প', 'summary_en', 'A draft project for testing',
    'photo_mode', 'after_only', 'file_prefix', 'demo', 'sort_order', 900
  ),
  jsonb_build_array(
    jsonb_build_object('key', 'amount', 'label_bn', 'অনুদান', 'label_en', 'Grant', 'type', 'money',
                       'show_in_table', true, 'show_in_card', true),
    jsonb_build_object('key', 'family_size', 'label_bn', 'পরিবারের সদস্য', 'label_en', 'Family size', 'type', 'number'),
    jsonb_build_object('key', 'trade', 'label_bn', 'পেশা', 'label_en', 'Trade', 'type', 'category',
                       'options', jsonb_build_array('দর্জি', 'মুদি দোকান', 'হাঁস-মুরগি'),
                       'show_in_table', true, 'filterable', true),
    jsonb_build_object('key', 'phone', 'label_bn', 'ফোন', 'label_en', 'Phone', 'type', 'phone', 'visibility', 'admin')
  )
)
where not exists (select 1 from public.housing_projects where key = 'demo');

insert into public.housing_beneficiaries
  (project_type, serial_no, year, name, father_or_husband_name, division, district, upazila, union_name, address, extra)
values
  ('demo', 1, 2024, 'মোছাঃ সালেহা বেগম',  'মৃত আব্দুল হক',     'রংপুর',    'কুড়িগ্রাম', 'উলিপুর',   'দলদলিয়া', 'গ্রাম: দলদলিয়া', '{"amount": 25000, "family_size": 5, "trade": "দর্জি"}'),
  ('demo', 2, 2024, 'মোঃ কাশেম আলী',      'মৃত হাশেম আলী',     'রংপুর',    'কুড়িগ্রাম', 'উলিপুর',   'দলদলিয়া', 'গ্রাম: থেতরাই',   '{"amount": 30000, "family_size": 4, "trade": "মুদি দোকান"}'),
  ('demo', 3, 2025, 'রাবেয়া খাতুন',        'মোঃ আজিজুল হক',     'রংপুর',    'কুড়িগ্রাম', 'উলিপুর',   'থেতরাই',   'গ্রাম: থেতরাই',   '{"amount": 20000, "trade": "দর্জি"}'),
  ('demo', 4, 2025, 'মোঃ মিজানুর রহমান',  'মৃত ফজলুল হক',      'খুলনা',    'সাতক্ষীরা',  'শ্যামনগর', 'গাবুরা',   'গ্রাম: গাবুরা',   '{"amount": 35000, "family_size": 6, "trade": "হাঁস-মুরগি"}'),
  ('demo', 5, 2025, 'নাজমা আক্তার',        'মোঃ রফিক মিয়া',     'খুলনা',    'সাতক্ষীরা',  'শ্যামনগর', 'গাবুরা',   'গ্রাম: চাঁদনীমুখা', '{"family_size": 3, "trade": "দর্জি"}'),
  ('demo', 6, 2025, 'মোঃ হাবিবুল্লাহ',      'মৃত আব্দুর রশিদ',   'সিলেট',    'সুনামগঞ্জ',  'তাহিরপুর', '',         'গ্রাম: টাঙ্গুয়া',  '{"amount": 15000}')
on conflict (project_type, serial_no) do nothing;

insert into public.housing_beneficiary_private (record_id, data)
select b.id, jsonb_build_object('phone', p.phone)
  from (values (1, '01700000001'), (2, '01700000002'), (3, '01700000003'),
               (4, '01800000004'), (5, '01800000005'), (6, '01900000006')) as p(serial_no, phone)
  join public.housing_beneficiaries b on b.project_type = 'demo' and b.serial_no = p.serial_no
on conflict (record_id) do nothing;
