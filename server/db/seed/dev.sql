-- Dev-only example data: 20 fictional records (12 semi_pucca, 8 tin). Loaded by `npm run db:seed` (and by
-- `docker compose up` on a fresh database), which refuses non-local databases.
-- Safe to run again: existing serials are skipped. Never part of the migrations.

insert into public.housing_beneficiaries
  (project_type, serial_no, year, name, father_or_husband_name, division, district, upazila, address,
   prev_photo_source, current_photo_source)
values
  -- সেমিপাকা ঘর (semi_pucca) — সিরিয়াল ১–১২
  ('semi_pucca',  1, 2023, 'মোছাঃ রহিমা খাতুন',   'মৃত আব্দুল করিম',     'রংপুর',     'কুড়িগ্রাম',   'উলিপুর',        'গ্রাম: দলদলিয়া, ডাকঘর: উলিপুর',        'https://example.com/photos/semi_0001_prev.jpg', 'https://example.com/photos/semi_0001_current.jpg'),
  ('semi_pucca',  2, 2023, 'মোঃ আব্দুল হালিম',    'মৃত ইসমাইল হোসেন',    'রংপুর',     'লালমনিরহাট',  'হাতীবান্ধা',     'গ্রাম: গড্ডিমারী, ডাকঘর: হাতীবান্ধা',   'https://example.com/photos/semi_0002_prev.jpg', 'https://example.com/photos/semi_0002_current.jpg'),
  ('semi_pucca',  3, 2023, 'শেফালী বেগম',         'মোঃ জহুরুল ইসলাম',    'রাজশাহী',   'নওগাঁ',       'পোরশা',         'গ্রাম: নিতপুর, ডাকঘর: পোরশা',           'https://example.com/photos/semi_0003_prev.jpg', 'https://example.com/photos/semi_0003_current.jpg'),
  ('semi_pucca',  4, 2024, 'মোঃ সাইফুল ইসলাম',    'মোঃ আব্দুস সাত্তার',  'রাজশাহী',   'চাঁপাইনবাবগঞ্জ', 'শিবগঞ্জ',      'গ্রাম: কানসাট, ডাকঘর: কানসাট',         'https://example.com/photos/semi_0004_prev.jpg', 'https://example.com/photos/semi_0004_current.jpg'),
  ('semi_pucca',  5, 2024, 'আনোয়ারা বেগম',        'মৃত রফিকুল ইসলাম',    'খুলনা',     'সাতক্ষীরা',    'শ্যামনগর',       'গ্রাম: গাবুরা, ডাকঘর: গাবুরা',          'https://example.com/photos/semi_0005_prev.jpg', 'https://example.com/photos/semi_0005_current.jpg'),
  ('semi_pucca',  6, 2024, 'মোঃ নূর ইসলাম',       'মৃত হাবিবুর রহমান',   'খুলনা',     'বাগেরহাট',     'মোংলা',          'গ্রাম: চিলা, ডাকঘর: মোংলা বন্দর',      'https://example.com/photos/semi_0006_prev.jpg', 'https://example.com/photos/semi_0006_current.jpg'),
  ('semi_pucca',  7, 2024, 'হাসিনা আক্তার',        'মোঃ আবুল কালাম',      'বরিশাল',    'পটুয়াখালী',    'কলাপাড়া',       'গ্রাম: লালুয়া, ডাকঘর: কলাপাড়া',        'https://example.com/photos/semi_0007_prev.jpg', 'https://example.com/photos/semi_0007_current.jpg'),
  ('semi_pucca',  8, 2024, 'মোঃ জসিম উদ্দিন',     'মৃত আলী আকবর',        'চট্টগ্রাম',  'কক্সবাজার',    'টেকনাফ',         'গ্রাম: শাহপরীর দ্বীপ, ডাকঘর: টেকনাফ',   'https://example.com/photos/semi_0008_prev.jpg', 'https://example.com/photos/semi_0008_current.jpg'),
  ('semi_pucca',  9, 2025, 'রোকেয়া বেগম',         'মোঃ মোস্তফা কামাল',   'সিলেট',     'সুনামগঞ্জ',    'তাহিরপুর',       'গ্রাম: টাঙ্গুয়া, ডাকঘর: তাহিরপুর',       'https://example.com/photos/semi_0009_prev.jpg', 'https://example.com/photos/semi_0009_current.jpg'),
  ('semi_pucca', 10, 2025, 'মোঃ আলমগীর হোসেন',    'মৃত সিরাজুল ইসলাম',   'ময়মনসিংহ',  'নেত্রকোণা',    'কলমাকান্দা',     'গ্রাম: রংছাতি, ডাকঘর: কলমাকান্দা',      'https://example.com/photos/semi_0010_prev.jpg', 'https://example.com/photos/semi_0010_current.jpg'),
  ('semi_pucca', 11, 2025, 'ফাতেমা খাতুন',         'মোঃ আব্দুল মজিদ',     'ঢাকা',      'কিশোরগঞ্জ',    'ইটনা',           'গ্রাম: বড়িবাড়ি, ডাকঘর: ইটনা',          'https://example.com/photos/semi_0011_prev.jpg', 'https://example.com/photos/semi_0011_current.jpg'),
  ('semi_pucca', 12, 2025, 'মোঃ রুহুল আমিন',      'মৃত আব্দুল গফুর',     'ঢাকা',      'শরীয়তপুর',    'নড়িয়া',         'গ্রাম: মোক্তারেরচর, ডাকঘর: নড়িয়া',      'https://example.com/photos/semi_0012_prev.jpg', 'https://example.com/photos/semi_0012_current.jpg'),

  -- টিনের ঘর (tin) — সিরিয়াল ১–৮
  ('tin',  1, 2024, 'মোছাঃ জরিনা বেগম',    'মৃত মকবুল হোসেন',     'রংপুর',     'গাইবান্ধা',    'সাঘাটা',         'গ্রাম: হলদিয়া, ডাকঘর: সাঘাটা',          'https://example.com/photos/tin_0001_prev.jpg', 'https://example.com/photos/tin_0001_current.jpg'),
  ('tin',  2, 2024, 'মোঃ শহিদুল ইসলাম',    'মোঃ আকবর আলী',        'রংপুর',     'নীলফামারী',    'ডিমলা',          'গ্রাম: টেপাখড়িবাড়ি, ডাকঘর: ডিমলা',      'https://example.com/photos/tin_0002_prev.jpg', 'https://example.com/photos/tin_0002_current.jpg'),
  ('tin',  3, 2024, 'সালমা আক্তার',         'মোঃ হারুন অর রশিদ',   'সিলেট',     'হবিগঞ্জ',      'আজমিরীগঞ্জ',     'গ্রাম: শিবপাশা, ডাকঘর: আজমিরীগঞ্জ',      'https://example.com/photos/tin_0003_prev.jpg', 'https://example.com/photos/tin_0003_current.jpg'),
  ('tin',  4, 2024, 'মোঃ আব্দুর রাজ্জাক',   'মৃত মোহাম্মদ আলী',    'বরিশাল',    'ভোলা',         'চরফ্যাশন',       'গ্রাম: ঢালচর, ডাকঘর: চরফ্যাশন',         'https://example.com/photos/tin_0004_prev.jpg', 'https://example.com/photos/tin_0004_current.jpg'),
  ('tin',  5, 2025, 'নাসরিন সুলতানা',       'মোঃ আব্দুল খালেক',    'চট্টগ্রাম',  'নোয়াখালী',     'হাতিয়া',         'গ্রাম: নলচিরা, ডাকঘর: হাতিয়া',          'https://example.com/photos/tin_0005_prev.jpg', 'https://example.com/photos/tin_0005_current.jpg'),
  ('tin',  6, 2025, 'মোঃ কামাল হোসেন',     'মৃত আব্দুল বারেক',    'খুলনা',     'যশোর',         'কেশবপুর',        'গ্রাম: মঙ্গলকোট, ডাকঘর: কেশবপুর',       'https://example.com/photos/tin_0006_prev.jpg', 'https://example.com/photos/tin_0006_current.jpg'),
  ('tin',  7, 2025, 'মমতাজ বেগম',           'মোঃ শামসুল হক',       'ময়মনসিংহ',  'শেরপুর',       'নালিতাবাড়ী',     'গ্রাম: পোড়াগাঁও, ডাকঘর: নালিতাবাড়ী',     'https://example.com/photos/tin_0007_prev.jpg', 'https://example.com/photos/tin_0007_current.jpg'),
  ('tin',  8, 2025, 'মোঃ ইব্রাহিম খলিল',    'মৃত আব্দুল জব্বার',   'ঢাকা',      'টাঙ্গাইল',     'ভুয়াপুর',        'গ্রাম: গাবসারা, ডাকঘর: ভুয়াপুর',         'https://example.com/photos/tin_0008_prev.jpg', 'https://example.com/photos/tin_0008_current.jpg')
on conflict (project_type, serial_no) do nothing;
