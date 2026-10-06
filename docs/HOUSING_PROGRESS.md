# ঘর নির্মাণ প্রকল্প — অগ্রগতি নথি (HOUSING_PROGRESS.md)

> নতুন চ্যাটে কাজ শুরু করার আগে এই ফাইলটি পুরোটা পড়তে হবে।
> প্রতিটি ধাপ শেষে এই ফাইল আপডেট হবে। সর্বশেষ আপডেট: ২০২৬-১০-০৬ (পর্ব ২, পর্ব চ — M-ধাপ ১৭)
> **পর্ব ২ (২০২৬-১০-০৪ থেকে):** সাইটটি বহু-প্রকল্প প্ল্যাটফর্মে রূপান্তরিত হচ্ছে। পরিকল্পনা: `docs/MULTI_PROJECT_PLAN.md` (আসল কপি); অগ্রগতি: এই ফাইলের শেষে "পর্ব ২ — বহু-প্রকল্প"। প্রতিটি M-ধাপের আগে দুটিই পড়তে হবে।

---

## ⏳ ডাটাবেস সেটআপ — শেষে একসাথে করার জমা তালিকা

> ব্যবহারকারীর সিদ্ধান্ত (২০২৬-০৯-২৯): ডাটাবেস/Supabase এর কাজ এখন নয়, **সব ধাপ শেষে একবারে**। (পর্ব ১-এর জন্য; সারি ১–২৩।)
> **পর্ব ২-এর সিদ্ধান্ত (২০২৬-১০-০৫, প্রশ্ন ১৪ = পথ ক):** নতুন SQL (সারি ২৫–৩০) চালানো হবে M-ধাপ ২ ও ৩-এর শেষেই, প্রতিবার আগে ব্যাকআপ আর পরে যাচাই। কোড লেখা কখনো ডাটাবেসের জন্য আটকাবে না।
> তাই প্রতিটি ধাপে ডাটাবেস-সংক্রান্ত করণীয় এখানে জমা হবে; ধাপের "আমাকে যা করতে হবে" অংশে শুধু রেফারেন্স থাকবে।
> ততদিন UI তে ডাটা-নির্ভর অংশ (স্ট্যাট কার্ড, তালিকা) লাল "সংযোগ কনফিগার হয়নি" বার্তা দেখাবে — প্রত্যাশিত।

| # | কাজ | কোন ধাপ থেকে | বিস্তারিত কোথায় |
|---|---|---|---|
| ১ | Supabase প্রজেক্ট খোলা (Region: Singapore) | ধাপ ২ | ধাপ ২ → করণীয় ১ |
| ২ | Authentication → Email এ "Allow new users to sign up" বন্ধ | ধাপ ২ | ধাপ ২ → করণীয় ২ |
| ৩ | Authentication → Users এ এডমিন ইউজার তৈরি (Auto Confirm) | ধাপ ২ | ধাপ ২ → করণীয় ৩ |
| ৪ | SQL Editor এ `supabase/sql/01` → `05` (+ `07`, `09`) ক্রমে চালানো (04 এর সর্বশেষ সংস্করণ, ধাপ ৪ এ বদলেছে)। ⚠ `06_seed` এখন `sql/dev/` এ — লাইভে আর কখনো নয় (M-ধাপ ১) | ধাপ ২, ৪ | `supabase/README.md` |
| ৫ | নিজের ইমেইল `housing_admins` এ যোগ | ধাপ ২ | ধাপ ২ → করণীয় ৫ |
| ৬ | যাচাই কোয়েরি (count/max serial, counters, housing_stats সহ distinct) | ধাপ ২, ৪ | ধাপ ২ → করণীয় ৬; ধাপ ৪ → করণীয় ১ |
| ৭ | Project Settings → API থেকে URL ও **anon** key নিয়ে `.env.local` | ধাপ ২ | `.env.example` |
| ৮ | Storage → Buckets এ `housing-photos` (Public) আছে কি না দেখা | ধাপ ২ | `supabase/sql/05_storage.sql` |
| ৯ | (নোট) `06_seed.sql` এ একটি উপজেলার বানান স্থির তালিকার সাথে মেলানো হয়েছে (ভূঞাপুর → ভুয়াপুর); seed এখনো চালানো হয়নি, তাই বাড়তি কাজ নেই | ধাপ ৬ | `supabase/sql/dev/06_seed.sql` (M-ধাপ ১ এ সরানো) |
| ১০ | (নিয়ম) ডাটাবেসে বাংলা টেক্সট **NFC-নরমালাইজড** হতে হবে; শীট থেকে ইম্পোর্ট/এডমিন ফর্মে কোড তা করবে (ধাপ পরে)। পুরনো ডাটা থাকলে একবার `update … set division = normalize(division, NFC)` (Postgres 13+) চালাতে হবে | ধাপ ৬ | ধাপ ৬ → সিদ্ধান্ত |
| ১১ | ছবি মাইগ্রেশন স্ক্রিপ্টের জন্য প্রজেক্ট রুটে `.env` (গিটে যায় না): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role — **শুধু এই ফাইলে**, কখনো VITE_ নয়) | ধাপ ৭ | `.env.example` নিচের অংশ |
| ১২ | ছবি মাইগ্রেশন চালানো: প্রথমে ১০–২০টি দিয়ে পরীক্ষা, তারপর সব; ব্যর্থগুলো `failed.csv` থেকে ম্যানুয়ালি | ধাপ ৭ | ধাপ ৭ → করণীয় |
| ১৩ | (তথ্য) Storage bucket পলিসি `05_storage.sql` এ অপরিবর্তিত; শুধু পাথ এখন `housing/{project}/{serial}/…webp` | ধাপ ৭ | `supabase/sql/05_storage.sql` |
| ১৪ | `03_rls.sql` বদলেছে (ধাপ ১০): `housing_admins.role` কলাম + `housing_current_admin()` RPC — সারি ৪ এ এই ফাইলের সর্বশেষ সংস্করণ চালান; আগে চালানো থাকলে আবার চালালেই হবে (idempotent) | ধাপ ১০ | `supabase/sql/03_rls.sql` |
| ১৫ | প্রথম এডমিন ইউজার তৈরি ও `housing_admins` এ যোগ (role 'admin') — ধাপ ১০ → করণীয় | ধাপ ১০ | ধাপ ১০ → করণীয় |
| ১৬ | `02_serial.sql` বদলেছে (ধাপ ১১): `housing_next_serial()`, `housing_change_serial()` RPC, protect-ট্রিগারে সেশন-সেটিং, অডিট টেবিল `housing_serial_changes` — সারি ৪ এ সর্বশেষ সংস্করণ চালান (idempotent) | ধাপ ১১ | `supabase/sql/02_serial.sql` |
| ১৭ | নতুন ফাইল `07_rpc_bulk.sql` (ধাপ ১২): `housing_bulk_update_by_serial()` — সারি ৪ এর ক্রমে ৭ নম্বরে চালান | ধাপ ১২ | `supabase/sql/07_rpc_bulk.sql` |
| ১৮ | প্রকৃত শীট ইম্পোর্ট: আগে ২০–৫০ সারির ছোট ফাইল দিয়ে "নতুন যোগ করুন" পরীক্ষা, তারপর পুরো; শেষে "সিরিয়াল সহ এক্সপোর্ট" নিয়ে Google Sheet এ সিরিয়াল বসান | ধাপ ১২ | ধাপ ১২ → করণীয় |
| ১৯ | সব SQL চালানোর পর `npm run security-check` — সব PASS হতে হবে (লগইন ছাড়া পড়া যায়, লেখা যায় না) | শেষ ধাপ | `scripts/security-check.mjs` |
| ২১ | ✅ `04_rpc_stats.sql` আবার চালানো হয়েছে (২০২৬-০৯-৩০): `by_location` লাইভে আছে | মানচিত্র | `supabase/sql/04_rpc_stats.sql` |
| ২২ | ✅ `08_reset_test_data.sql` চালানো হয়েছে; প্রকৃত ডাটা (সেমিপাকা ১০ সারি) ইম্পোর্ট, ৪টি ছবি স্ক্রিপ্টে উঠেছে (২০২৬-০৯-৩০) | ইম্পোর্ট | — |
| ২৩ | ✅ (AI যাচাই ২০২৬-১০-০৫: লাইভে টেবিল ও `housing_log_event` আছে — `security-check`; বেসলাইনের সারি ২-এ নিশ্চিত হবে) `09_activity_log.sql`: একটিভিটি লগ টেবিল + ট্রিগার + RPC | একটিভিটি লগ | `supabase/sql/09_activity_log.sql` |
| ২৩ক | ✅ (২০২৬-১০-০৫; 10_projects.sql এর পূর্বশর্ত পাস করায় নিশ্চিত) `09a_fix_photo_log.sql`। 09-এর লগ-ট্রিগারে বাগ: ছবি যোগ/বদল/মোছা হলে "malformed array literal" ত্রুটি, পুরো আপডেট বাতিল — অর্থাৎ 09 চালানোর পর থেকে এডমিন ফর্ম, ছবির বাল্ক আপলোড ও `migrate-photos` এ ছবি বসানো ব্যর্থ। ফাইলটি শুধু ফাংশনটি ঠিক করে, নিজে পরীক্ষা করে (রোলব্যাকসহ), শেষে "✅" দেখায় | M-ধাপ ১ | `supabase/sql/09a_fix_photo_log.sql` |
| ২০ | ব্রাউজারে ম্যানুয়াল যাচাই তালিকা (শেষ ধাপ → §৫) মোবাইল/ট্যাবলেট/ডেস্কটপে | শেষ ধাপ | শেষ ধাপ → §৫ |
| **পর্ব ২** | **বহু-প্রকল্প (docs/MULTI_PROJECT_PLAN.md, পরিশিষ্ট ক)** | | |
| ২৪ | ✅ (২০২৬-১০-০৫ ০৪:৩১ UTC) `supabase/sql/checks/00_baseline.sql` চালানো হয়েছে; মানগুলো পর্ব ২ → M-ধাপ ১ → "বেসলাইন মান"-এ সংরক্ষিত | M-১ | পর্ব ২ → M-ধাপ ১ |
| ২৫ | ✅ (২০২৬-১০-০৫, ৫/৫ মিলেছে) **ব্যাকআপ:** Table Editor থেকে `housing_beneficiaries` ও `housing_serial_counters` → Export CSV (কম্পিউটারে রাখুন); তারপর SQL Editor-এ `supabase/sql/backup/before_10.sql` → ৫টি সারি "✅ মিলেছে" | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৬ | ✅ (২০২৬-১০-০৫; ১০: ৭/৭, verify: ১৮/১৮) `supabase/sql/10_projects.sql` চালানো (৮ সারি ✅), তারপর `supabase/sql/checks/10_verify.sql` (১৮ সারি — সব ✅) — দুটোর ফলাফল-টেবিল AI-কে পাঠানো | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৭ | ✅ (২০২৬-১০-০৫; 10b ৭/৭, মূল এডমিন css@assunnahfoundation.org, selftest ২০/২০, রোলব্যাক-মহড়া ৬/৬ — স্কিমা হুবহু বেসলাইনে ফেরে) `supabase/sql/10b_project_guards.sql` চালানো (৮ সারি ✅; মূল এডমিনের ইমেইল দেখুন), তারপর `supabase/sql/checks/10b_selftest.sql` (২১ সারি — শেষ সারি "২০ ✅ · ০ ❌"), তারপর `checks/rollback_rehearsal.sql` (৬ সারি ✅) — ফলাফল AI-কে পাঠানো | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৮ | ✅ (২০২৬-১০-০৫; ব্যাকআপ ৮/৮, ১১: ৪/৪, selftest ১৩/১৩) `backup/before_11.sql` (৮ ✅), তারপর `11_project_rpcs.sql` (৫ সারি), তারপর `checks/11_selftest.sql` (শেষ সারি "১৩ ✅ · ০ ❌") — ফলাফল AI-কে | M-৩ | পর্ব ২ → M-ধাপ ৩ → §৪ |
| ২৯ | ✅ (২০২৬-১০-০৫; ব্যাকআপ ৮/৮, ১২: ৪/৪, selftest ৭/৭) `backup/before_12.sql` (৮ ✅), তারপর `12_activity_log_v2.sql` (৫ সারি), তারপর `checks/12_selftest.sql` (শেষ সারি "৭ ✅ · ০ ❌") — ফলাফল AI-কে | M-৩ | পর্ব ২ → M-ধাপ ৩ → §৪ |
| ৩০ | ✅ (২০২৬-১০-০৫; M-৩ অংশ — security-check ৩৭/৩৭, মহড়া ৬/৬) · M-১৬ (২০২৬-১০-০৬, AI): security-check ৩৭/৩৭ — **নতুন প্রকল্প চালুর পর (সারি ৩৩) আবার আপনি** `npm run security-check` (সব PASS) আর `checks/rollback_rehearsal.sql` (সব ✅) | M-৩, M-১৬ | পরিকল্পনা §৬.৬ |
| ৩১ | (ঐচ্ছিক) `checks/11_perf_optional.sql`, তারপর আলাদাভাবে `VACUUM ANALYZE public.housing_beneficiaries` | যেকোনো সময় | পরিকল্পনা §৫.১৬ |
| ৩২ | পরীক্ষা প্রকল্পের রেকর্ড মুছে `supabase/sql/dev/remove_demo_project.sql` (অথবা অপ্রকাশিত রেখে দেওয়া) — **ফাইল তৈরি ও লোকালে পরীক্ষিত (M-১৬)**; লাইভে demo না থাকলে কিছু করার নেই | M-১৬ | পর্ব ২ → M-ধাপ ১৬ → §৪ |
| ৩৩ | স্বাবলম্বী ও দক্ষতা ভিত্তিক চালু: খসড়ায় ইম্পোর্ট (আগে পাইলট), প্রিভিউ, প্রকাশ, তারপর ছবি; শেষে `npm run baseline-check`, `security-check`, `photo-check`, `smoke` | M-১৬ | পর্ব ২ → M-ধাপ ১৬ → §৪; `docs/ADMIN_GUIDE.md` §৯ |
| ৩৪ | ✅ (২০২৬-১০-০৬; ৩/৩ ✅ — ফল "আগেই চালানো হয়েছে": আগে একবার চালানো ছিল, এবার কিছু বদলায়নি; ফিঙ্গারপ্রিন্ট অপরিবর্তিত) `supabase/sql/13_money_limit.sql` চালানো — টাকার সর্বোচ্চ সীমা **১০০০ কোটি** (আপনার সিদ্ধান্ত, ২০২৬-১০-০৫; শুধু একটি ফাংশনের সংখ্যা বদলায়, ডাটা নয় — আলাদা ব্যাকআপ লাগে না)। শেষে ৩ সারি ✅ আসা চাই। ১০০০ কোটির বেশি টাকার রেকর্ড থাকলে নিজে থামে (তালিকাসহ)। ফেরাতে: `rollback/13_rollback.sql`। ততদিন ফর্ম/ইম্পোর্ট নিজেই ১০০০ কোটিতে থামায় | M-ধাপ ১১ | `supabase/sql/13_money_limit.sql`; পর্ব ২ → M-ধাপ ১১ |
| **পর্ব চ** | **বড় ডাটা, ডিফল্ট ক্রম ও প্রকল্পভিত্তিক ইউজার (পরিকল্পনা → পর্ব চ, M-ধাপ ১৭–২০)** | | |
| ৩৫ | `backup/before_14.sql` → `14_project_users.sql` → `checks/14_selftest.sql` → রোলব্যাক-মহড়া — প্রকল্পভিত্তিক ইউজার; মোছা, ছবি ওভাররাইট, মান ফাঁকা করা ও সিরিয়াল বদল শুধু সুপার এডমিন (ফাইল M-ধাপ ১৮-এ তৈরি হবে) | M-১৮ | পরিকল্পনা পর্ব চ |
| ৩৬ | Supabase → Authentication → Add user (প্রতিটি ইউজার, ইমেইল-পাসওয়ার্ড), তারপর প্যানেল → ইউজার-পাতায় প্রকল্প বরাদ্দ | M-১৯ | পরিকল্পনা পর্ব চ |

**সুপারিশকৃত ক্রম:** ১ → ২ → ৩ → ৪ (SQL 01–07) → ৫ → ৬ → ৭ → ৮ → ১৯ (security-check) → ১৫ এর লগইন পরীক্ষা → ১৮ (ইম্পোর্ট) → ১১–১২ (ছবি মাইগ্রেশন) → ২০ (ম্যানুয়াল যাচাই)।

পরের ধাপগুলোতে SQL বদলালে এই টেবিলে সারি যোগ/আপডেট হবে (যেমন নতুন RPC, কলাম, পলিসি)।
পরামর্শ (ঐচ্ছিক, ব্যবহারকারী চাইলে): ডাটাবেস ছাড়াই UI বানানো/দেখার জন্য একটি `mock` অ্যাডাপ্টার (ইন-মেমরি, seed এর ২০ রেকর্ড) `VITE_HOUSING_BACKEND=mock` দিয়ে — এতে তালিকা/ফিল্টার/ভিউ পেইজ DB ছাড়াই টেস্ট করা যাবে।

---

## সারসংক্ষেপ (সবসময় হালনাগাদ থাকবে)

### প্রযুক্তি স্ট্যাক (ধাপ ০ তে শূন্য থেকে তৈরি — কোনো পূর্ববর্তী কোডবেস ছিল না)
| বিষয় | মান |
|---|---|
| ফ্রেমওয়ার্ক | React 19 |
| ভাষা | TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`) |
| বিল্ড টুল | Vite 8 (`@vitejs/plugin-react`) |
| রাউটার | React Router 8 (`react-router` প্যাকেজ, declarative mode: `BrowserRouter` + `Routes`/`Route`) |
| স্টাইলিং | Tailwind CSS 4 (`@tailwindcss/vite` প্লাগইন)। **আলাদা `tailwind.config.js` নেই**; টোকেন `src/index.css` এর `@theme` ব্লকে |
| ফন্ট | `--font-sans`: 'Ubuntu Sans', 'Noto Sans Bengali', ui-sans-serif, system-ui, sans-serif (Google Fonts, `index.html` এ লোড) |
| লিন্টার | oxlint (Vite টেমপ্লেট থেকে আসা) |
| পাথ অ্যালিয়াস | `@/` → `src/` (vite.config.ts + tsconfig.app.json) |
| Node | v24 (ডেভ মেশিনে) |
| ব্যাকএন্ড (টেস্টিং) | Supabase (এখনো যুক্ত হয়নি) |
| ব্যাকএন্ড (প্রোডাকশন) | নিজস্ব সার্ভার, প্রযুক্তি অনির্ধারিত — `docs/API_CONTRACT.md` অনুযায়ী বানানো হবে |
| ছবি স্টোরেজ | নিজস্ব স্টোরেজ (এখন: Supabase Storage; পরে: সার্ভারের স্টোরেজ) |

### ডিজাইন টোকেন (`src/index.css`)
- `brand-50 … brand-950`: সবুজ প্যালেট (প্রাথমিক পছন্দ; ফাউন্ডেশনের অফিসিয়াল ব্র্যান্ড কালার জানালে বদলানো হবে)
- `accent-400/500/600`: সোনালি-হলুদ, বাটন/হাইলাইটের জন্য
- `container-page` ইউটিলিটি: `mx-auto max-w-6xl px-4 sm:px-6 lg:px-8`
- body: `bg-slate-50 text-slate-800`

### ফোল্ডার কাঠামো (বর্তমান + পরিকল্পিত)
```
index.html                      # lang="bn", Google Fonts লিঙ্ক
vite.config.ts                  # react + tailwindcss প্লাগইন, @ অ্যালিয়াস
src/
  main.tsx                      # BrowserRouter + App
  App.tsx                       # রুট টেবিল (SiteLayout → পেইজ)
  index.css                     # Tailwind import + @theme টোকেন
  config/site.ts                # সাইটের নাম ইত্যাদি
  lib/banglaNumber.ts           # toBanglaNumber, formatBanglaNumber (ভাষা অনুযায়ী বাংলা/ইংরেজি অঙ্ক)
  lib/money.ts                  # formatTaka (৳ ১,২৩,৪৫৬ / ৳123,456), parseBanglaNumber ("১০,০০০/-", "Tk 5,000"), MONEY_MAX (M-ধাপ ৫খ)
  lib/fuzzyMatch.ts             # looseKey, levenshtein, nearDuplicates ("গাভী" ≈ "গাভি") — geoMatch ও ক্যাটাগরি (M-ধাপ ৫খ)
  lib/transliterate.ts          # বাংলা → ল্যাটিন ("উপকরণের নাম" → "upokoroner nam") — ফিল্ডের key বানাতে (M-ধাপ ৮)
  i18n/                         # ভাষা টগল (২০২৬-০৯-৩০): key = বাংলা লেখা
    core.ts                     #   t(bn, vars) অনুবাদ, gn(নাম) ভৌগোলিক নাম, getLang()
    en.ts                       #   ইংরেজি অভিধান (বাংলা → English), সব UI লেখা
    langContext.ts              #   useLang()
    LanguageProvider.tsx        #   LanguageProvider (key={lang} remount, localStorage asf_lang, <html lang>), LanguageToggle (বাং | EN)
    index.ts                    #   barrel
  vite-env.d.ts                 # ImportMetaEnv টাইপ (VITE_* ভ্যারিয়েবল)
  app/layout/                   # SiteLayout, SiteHeader (মোবাইল মেনুসহ), SiteFooter, ProjectsMenu ("প্রকল্পসমূহ ▾", M-ধাপ ৬)
  app/routes/                   # appRoutes (রেজিস্ট্রি থেকে প্রকল্পের রাউট + /admin/*), routeGuards (ConfigAwareNotFound, LegacyAdminRedirect, AdminIndexRedirect, RegistryAuthSync), ProjectFrame (DraftBanner) (M-ধাপ ৬)
  lib/useDocumentTitle.ts       # ট্যাবের শিরোনাম "পেইজ — সাইট" (M-ধাপ ৬)
  components/ErrorBoundary.tsx   # রেন্ডার error হলে পেইজ সাদা না হয়ে বার্তা + আবার চেষ্টা/রিলোড (App ও মানচিত্রে)
  components/Toast.tsx          # সাইট-ব্যাপী টোস্ট প্রোভাইডার (App.tsx এ) (ধাপ ১১)
  components/useToast.ts        # useToast(): success/error/info
  pages/                        # HomePage, NotFoundPage
  backend/                      # ব্যাকএন্ড স্তর — সব প্রকল্পের জন্য (M-ধাপ ৪-এ features/housing/backend থেকে সরানো)
    index.ts                    # বাইরে থেকে import করার এক দরজা
    factory.ts                  # env (VITE_HOUSING_BACKEND) দেখে অ্যাডাপ্টার বাছে; getHousingApi/getProjectsApi/getAuthProvider/getImageStorage
    fallbackProjects.ts         # projects টেবিল না থাকলে ঘর নির্মাণের ৩টি প্রকল্প (SQL ১০-এর seed এর হুবহু কপি) (M-ধাপ ৪)
    interfaces/
      types.ts                  # ProjectKey, Project, ProjectField, FieldType, PhotoMode, GeoDepth, StatCardDef, ProjectStats, ProjectOverview, HousingRecord (union_name, extra), ListParams (union_name, fields, sort), HousingApiError …
      housingApi.ts             # HousingApi: রেকর্ড, stats (project_stats), গোপন মান (getPrivate/setPrivate), ছবি, লগ
      projectsApi.ts            # ProjectsApi: রেজিস্ট্রি, ওভারভিউ, প্রকল্প/ফিল্ড তৈরি-বদল-ক্রম, ফিল্ডের ব্যবহার, ক্যাটাগরির বানান একীকরণ (M-ধাপ ৪)
      authProvider.ts, imageStorage.ts, index.ts
    supabase/                   # সব ফ্যাক্টরি `GetClient` (() => SupabaseClient) নেয় — ব্রাউজারে anon, স্ক্রিপ্টে service_role
      client.ts                 # getSupabase() (env, anon key, lazy), GetClient টাইপ, TABLE, STORAGE_BUCKET
      errors.ts                 # Supabase এরর → HousingApiError
      session.ts                # assertAdmin(getClient), adminRole() (main_admin/admin; rpc housing_current_admin, cache)
      legacy.ts                 # পুরনো ডাটাবেসে চলা: "নেই" এরর চেনা, মনে রাখা, withFallback(), VITE_SIMULATE_LEGACY_DB (M-ধাপ ৪)
      stats.ts                  # project_stats, না থাকলে housing_stats → একই শেপ (M-ধাপ ৪)
      housingApi.ts             # createSupabaseHousingApi(getClient, storage, {trustedServer?, projects?}) — ফিল্টার whitelist, লেখার payload নিয়ম, ছবি-মোড
      projectsApi.ts            # createSupabaseProjectsApi(getClient, {trustedServer?}) — ৬০ সেকেন্ডের get-ক্যাশ (M-ধাপ ৪)
      authProvider.ts           # createSupabaseAuthProvider(getClient)
      imageStorage.ts           # createSupabaseImageStorage(getClient) — photoPath, upsert, webp
      index.ts
    rest/
      endpoints.ts              # API_CONTRACT v1.0 এর পাথ (/api/projects/:key/…, /api/records/:id/…)
      http.ts                   # restRequest(): JSON, Bearer token (localStorage 'housing_rest_token') / credentials include, এরর ম্যাপিং
      authProvider.ts           # REST AuthProvider (login/logout/me, listeners, cross-tab storage event) — ধাপ ১০
      index.ts                  # HousingApi/ProjectsApi/ImageStorage stub (ধাপ ১৩)
  features/admin/               # এডমিন প্যানেল (M-ধাপ ৭)
    layout/AdminLayout.tsx      # বাম সাইডবার (lg+), ফোনে ড্রয়ার, ৪৪px টাচ-টার্গেট; রেকর্ড-লিংক রেজিস্ট্রি থেকে; লগআউট
    ui/                         # Field (লেবেল+ত্রুটি+aria), Badge, Step, styles (inputClass, বোতাম, কার্ড)
    projects/                   # projectRules (slug/key/প্রিফিক্স — ডাটাবেসের নিয়মের প্রতিরূপ, বাংলা ত্রুটি), projectTemplates (৪টি টেমপ্লেট + buildProjectInput), publishChecklist, UnpublishDialog
      fieldRules.ts             # ফিল্ডের key (fieldKeyFrom, §৫.৩), সংরক্ষিত key, SENSITIVE_LABEL, tableColumns (৯-কলামের গণনা) (M-ধাপ ৮)
      FieldEditorDrawer.tsx     # ফিল্ড যোগ/সম্পাদনার ড্রয়ার — ডাটা থাকলে key/ধরন/পাবলিক-গোপন লক (M-ধাপ ৮)
      FieldPreview.tsx          # ফর্ম, টেবিলের সারি (কলাম n/৯), মোবাইল কার্ডের প্রিভিউ (M-ধাপ ৮)
      StatCardPicker.tsx        # নতুন স্ট্যাট কার্ড: গণনা / এলাকা কভার / যোগফল / ক্যাটাগরি সংখ্যা (M-ধাপ ৮)
      tabs/FieldsTab.tsx        # সেটিংসের "ফিল্ড" ট্যাব: সিস্টেম ফিল্ড 🔒 + কাস্টম ফিল্ড (ব্যাজ, ↑↓, আর্কাইভ, মোছা) (M-ধাপ ৮)
      tabs/StatsTab.tsx         # সেটিংসের "পরিসংখ্যান" ট্যাব: আসল সংখ্যায় প্রিভিউ, লেবেল, আইকন, হোম ≤ ৩, মোট ≤ ৮ (M-ধাপ ৮)
    pages/                      # AdminDashboardPage, AdminProjectsPage, ProjectWizardPage, ProjectSettingsPage, lazyAdminPages
    photos/PhotoBulkPage.tsx    # /admin/photos?project= — যেকোনো প্রকল্পে ছবি বাল্ক (ছবি মোড অনুযায়ী ঘর, ভুল ঘর লাল, ওভাররাইট নিশ্চিতকরণ, লগ প্রকল্প ধরে) (M-ধাপ ১২)
    activity/ActivityPage.tsx   # /admin/activity — লেবেল ফিল্ডের সংজ্ঞা থেকে, টাকা ৳, প্রকল্প/ফিল্ডের সেটিং-বদল, গোপন মান (শুধু নাম), এক-বানান, এক্সপোর্ট (M-ধাপ ১২)
    import/                     # বাল্ক ইম্পোর্ট — যেকোনো প্রকল্পের, ফিল্ড-চালিত (M-ধাপ ১১-এ features/housing থেকে git mv)
      ImportPage.tsx            # /admin/import?project= — ৪ ধাপ; প্রকল্প রেজিস্ট্রি থেকে (খসড়াও); নতুন যোগ / সিরিয়াল ধরে আপডেট (নিয়মের ব্যাখ্যাসহ); গোপন মান আলাদা
      importFields.ts           # buildImportFields(project), guessMapping (হুবহু → লম্বা বিকল্প নাম → পুরনো regex), isIgnoredHeader (এক্সপোর্টের তথ্য-কলাম)
      importAnalyze.ts          # analyzeRows (ফিল্ড-টাইপ রেজিস্ট্রি; ইউনিয়নসহ ৪ স্তর; আপডেটে খালি = অপরিবর্তিত, (মুছুন) → _clear), fillDown
      importParse.ts            # parseSpreadsheet(file): xlsx/csv → {headers, rows} (SheetJS lazy, UTF-8 BOM, ফর্মুলা-সুরক্ষার ' সরানো)
      GeoFixPanel.tsx           # না-মেলা বিভাগ/জেলা/উপজেলা (লাল) আর তালিকায় নেই এমন ইউনিয়ন (ঐচ্ছিক, হলুদ)
      CategoryReviewPanel.tsx   # শীটের ক্যাটাগরি মান ও সারির সংখ্যা, ডাটাবেসে আছে কি না, কাছাকাছি বানান → এক বানানে (ঐচ্ছিক)
    records/                    # রেকর্ড — যেকোনো প্রকল্পের, ফিল্ড-চালিত (M-ধাপ ১০-এ features/housing থেকে git mv)
      AdminRecordsPage.tsx      # /admin/records/:key — একই গ্রুপের ট্যাব, ফিল্টার + ক্যাটাগরি ফিল্টার (f.<key>), টেবিল, বাল্ক ডিলেট (মূল এডমিন), এক্সপোর্ট (গোপনসহ জিজ্ঞাসা)
      AdminRecordsTable.tsx     # কনফিগ-চালিত কলাম/কার্ড (recordColumns), টাকার কলামে পাতার মোট; ঘর নির্মাণে আগের কলামই
      RecordForm.tsx            # নতুন/এডিট ফর্ম: সিরিয়াল (আগের মতো), পরিচয়, GeoSelect (ইউনিয়নসহ), কাস্টম ফিল্ড, "🔒 শুধু এডমিন তথ্য", ছবি মোড অনুযায়ী ছবির ঘর
      RecordFormPage.tsx        # /admin/records/:key/new ও /:serial/edit
      CategoryValuesPanel.tsx   # ক্যাটাগরির মান ও সংখ্যা, কাছাকাছি বানান, "এক বানানে আনুন" (project_field_rename_value)
      recordColumns.ts          # adminLayout(project) → কলাম/কার্ড/টাকার কলাম/ছবির ঘর; photoKindsOf, photoSlotLabel
      recordsCsv.ts             # csvPlan (হেডার = বাংলা লেবেল), exportRecordsCsv (গোপনসহ: getPrivateMany), csvFilename (-private)
      useCategoryUsage.ts       # ক্যাটাগরি ফিল্ডের মান (project_field_usage) — ফিল্টার ও প্যানেল
  features/projects/fields/     # ফিল্ড-টাইপ রেজিস্ট্রি — ফর্ম/ইম্পোর্ট/টেবিল/CSV এর একটি উৎস (M-ধাপ ৫খ)
    fieldValues.ts              # FieldDef, parse/format/toCsv/toInput প্রতিটি ধরনের (ডাটাবেসের housing_field_value এর নিয়মে), ত্রুটির বার্তা
    fieldComponents.tsx         # Input (Text/LongText/Number/Category/Date/Phone) ও Cell (Text/LongText/Number/Money)
    fieldTypes.ts               # FIELD_TYPE_SPECS = মানের নিয়ম + কম্পোনেন্ট; fieldSpec(type)
    fieldStyles.ts              # FIELD_INPUT_CLASS (রেকর্ড-ফর্মের inputClass এর হুবহু)
    MoneyInput.tsx              # টাকার ঘর: বাংলা/ইংরেজি অঙ্ক, কমা, ৳, /-; পাশে লাইভ "৳ ১,২০,০০০"; inputMode numeric (M-ধাপ ১০)
    systemFields.ts             # সাল, নাম, পিতা/স্বামী, বিভাগ, জেলা, উপজেলা, ইউনিয়ন, ঠিকানা — সীমা ও লেবেল
    resolveFields.ts            # resolveFields(project) = সিস্টেম (core_fields অনুযায়ী) + কাস্টম; fieldValue(def, record, private)
    index.ts
  features/geo/                 # ভূগোল — M-ধাপ ৯-এ features/housing থেকে সরানো (git mv); ঘর নির্মাণ ও সব প্রকল্পের
    data/bdGeo.ts               # স্থির তালিকা: ৮ বিভাগ → ৬৪ জেলা → ৪৯৪ উপজেলা (বাংলা NFC + ইংরেজি নাম); উৎস ফাইলের মাথায়
    data/bd-unions.json         # ইউনিয়ন: জেলা → উপজেলা → [[বাংলা, ইংরেজি]] — ৪,৫৩৭টি, ৪৮৯/৪৯৪ উপজেলা, ~৫৩ KB gzip; scripts/build-unions.mjs এর ফল (হাতে নয়)
    data/unionOverrides.json    # ইউনিয়ন-তালিকায় হাতে সংশোধন (add/rename/remove) — build-unions মেশায়; এখন খালি
    geo.ts                      # nfc(), getDivisions/getDistricts/getUpazilas, normalizeGeo, isValidGeo, divisionOfDistrict
    geoMatch.ts                 # looseKey, matchDivision/District/Upazila (fuzzy), matchUnion, unionLooseKey, resolveGeo(fixes, {union, unions}) — ৪র্থ স্তর, candidatesFor
    unions.ts                   # loadUnions() (lazy import, আলাদা chunk), useUnionData(), unionsOf, hasUnionList, gnUnion(জেলা, উপজেলা, ইউনিয়ন)
    GeoSelect.tsx               # বিভাগ → জেলা → উপজেলা (→ ইউনিয়ন) — RecordForm এর হুবহু চেহারা; রেকর্ড-ফর্মে বসবে M-ধাপ ১০-এ
    UnionCombobox.tsx           # ইউনিয়নের কম্বোবক্স: সাজেশন, নিজে লেখা, হলুদ সতর্কতা, "পৌরসভা" চিপ, ↑↓/Enter/Esc
  dev/                          # শুধু dev সার্ভারে, বিল্ডে নেই: geo-demo.html + GeoDemo.tsx + geoDemoMain.tsx (/src/dev/geo-demo.html) (M-ধাপ ৯)
  features/projects/list/       # পাবলিক তালিকা — যেকোনো প্রকল্পের, কনফিগ-চালিত (M-ধাপ ১৩; HousingListPage/StatCards/HousingTable থেকে git mv)
    ProjectListPage.tsx         # /<প্রকল্প> — সাব-নেভ (গ্রুপের উপ-প্রকল্প হলে), নাম/বর্ণনা, কার্ড, মানচিত্র, ফিল্টার, টেবিল; API কল ২টি (list, stats)
    ProjectStatCards.tsx        # stat_cards অনুযায়ী কার্ড; টাকা formatTaka (৳), count-up, স্কেলেটন
    ProjectFilters.tsx          # সাল (by_year), বিভাগ→জেলা→উপজেলা→ইউনিয়ন (by_union; ডাটায় থাকলে), ক্যাটাগরি (by_value, f_<key>), নাম
    ProjectTable.tsx            # ≥1024px টেবিল (ফিল্ড-টাইপ রেজিস্ট্রির Cell), Thumb, ViewButton, PlaceText, লাইটবক্স
    RecordCardList.tsx          # ফোন/ট্যাবের কার্ড; শুধু-পরে প্রকল্পে একটি পূর্ণ-চওড়া ৪:৩ ছবি
    listColumns.ts              # listLayout(project, {showUnion}) → কলাম/কার্ড-ফিল্ড/ছবির ঘর; fieldHeader, photoLabel, placeParts
    listFilters.ts              # ProjectListFilters (= HousingFilters + union + fields), URL ⇄ ফিল্টার (পুরনো প্যারামিটার অপরিবর্তিত)
  features/projects/detail/     # বিস্তারিত মডাল — যেকোনো প্রকল্পের (M-ধাপ ১৪; HousingDetailPage থেকে git mv)
    ProjectDetailPage.tsx       # /<প্রকল্প>/:serial — Outlet child; আগের/পরের (পাতা পেরিয়ে), কীবোর্ড, সোয়াইপ, স্ক্রল-লক; ছবি মোড অনুযায়ী ছবি; হাইলাইট কার্ড; ঘর
    PhotoViewer.tsx             # শুধু-পরের-ছবির একক ছবি: জুম/প্যান/পিঞ্চ/ডাবল-ট্যাপ (ZoomFrame), −/+/রিসেট, ফুলস্ক্রিন, পেছনে ঝাপসা কপি
    detailLayout.ts             # detailLayout(project) → ছবির ঘর/হাইলাইট (টাকা, ক্যাটাগরি)/ঘর; fieldsFor (ইউনিয়ন শুধু মান থাকলে), fieldText, compareLabels
    FieldValue.tsx              # একটি ঘরের মান: সিস্টেম ফিল্ড আগের হুবহু, কাস্টম ফিল্ড রেজিস্ট্রির Cell দিয়ে
  features/projects/home/       # হোম পেইজ (M-ধাপ ১৫)
    useProjectsOverview.ts      # একটিই projects_overview() কল (খসড়া কখনো নয়)
    ProjectCardGrid.tsx         # শিরোনাম + কার্ডের গ্রিড (ফোনে ১, md ২, xl ৩ কলাম); শীর্ষ-স্তরের প্রকাশিত ও show_on_home প্রকল্প
    ProjectCard.tsx             # কভার → সর্বশেষ রেকর্ডের থাম্ব → রঙের গ্রেডিয়েন্ট + আইকন; আইকন-ব্যাজ, নাম, সারাংশ, home কার্ড (৳), উপ-প্রকল্পের চিপ, "প্রকল্প দেখুন"
    cover.ts                    # coverSrc(cover_path, updated_at) → পাবলিক URL + ?v=
  features/projects/landing/GroupLandingPage.tsx  # /housing ইত্যাদি গ্রুপ-ল্যান্ডিং (M-ধাপ ১৫-এ HousingLandingPage থেকে git mv); দেখতে আগের হুবহু
  features/projects/stats/statCards.ts  # cardValue/formatCardValue (project_stats → কার্ডের সংখ্যা), suggestCard (নিজে লেবেল), newCardId (M-ধাপ ৮)
  features/projects/registry/   # প্রকল্প রেজিস্ট্রি — সব প্রকল্পের জন্য (M-ধাপ ৫ক)
    projectsStore.ts            # মডিউল-স্তরের তালিকা: স্ন্যাপশট asf_projects_v1 → ফলব্যাক → নেটওয়ার্ক; findProject, childrenOf, housingProjects, projectPath, refreshProjects
    useProjects.ts              # useRegistry / useProjects / useProject (useSyncExternalStore)
    icons.ts, iconShapes.tsx    # আইকন-রেজিস্ট্রি (projects.icon এর key → SVG): বাড়ি, টিনের ঘর, গরু, ছাগল, দোকান, সেলাই মেশিন, টুলস, কয়েন, হাত-হৃদয়, মানুষ + fallback
    ProjectIcon.tsx             # <ProjectIcon icon={project.icon} />
    statIcons.ts, statIconShapes.tsx, StatIcon.tsx  # স্ট্যাট কার্ডের আইকন (users, house, map, pin, grid, coins, tags, calendar, chart, heart) (M-ধাপ ৮)
    accents.ts                  # রঙের নির্দিষ্ট তালিকা (projects.accent): brand, teal, sky, indigo, amber, rose
    index.ts
  features/housing/             # ঘর নির্মাণ ফিচার (ধাপ ১ থেকে)
    (backend/ → src/backend/ এ সরানো হয়েছে, M-ধাপ ৪)
    components/
      HousingSubnav.tsx         # হাউজিং সেকশনের ভেতরের পিল-নেভিগেশন (variant light/dark)
      FeaturedProjects.tsx      # এখন শুধু গ্রুপ-ল্যান্ডিং এ: উপ-প্রকল্পের কার্ড, মোবাইলে স্ক্রল-স্ন্যাপ + তীর; intro prop (M-ধাপ ১৫)
      UpazilaMap.tsx            # SVG উপজেলা মানচিত্র (d3-geo + topojson-client): সংখ্যা অনুযায়ী সবুজ, সংখ্যার বাবল, টুলটিপ, ক্লিক, হুইল/পিঞ্চ জুম, প্যান, +/−/রিসেট, লেজেন্ড (২০২৬-০৯-৩০)
      UpazilaMapPanel.tsx       # তালিকা পেইজে ফিল্টারের উপরে; ডিফল্টে লুকানো — গ্রেডিয়েন্ট ব্যানার-বাটন "মানচিত্রে দেখুন" (উপজেলা/ঘর সংখ্যা); খুললে পতাকা-মানচিত্র; ক্লিক ↔ বিভাগ/জেলা/উপজেলা ফিল্টার। M-ধাপ ১৩: stats পেইজ থেকে (নিজে কল নয়), একক প্রকল্পের unit_bn/unit_en ("ঘর" হলে আগের বাক্য)
      FeaturedProjectCard.tsx   # "সফলতার গল্প"-স্টাইল কার্ড: প্রথম উপকারভোগীর ছবি, ৩টি পরিসংখ্যান টাইল (মোট ঘর / জেলা কভার / উপজেলা কভার — stats, count-up), "আরো দেখুন", সোনালি বারে নাম/ঠিকানা/প্রকল্প-সাল/সিরিয়াল · M-ধাপ ১৫: টাইল প্রকল্পের home কার্ড থেকে (টাকা ৳)
      Pagination.tsx            # আগের/পরের, পেইজ নম্বর (ellipsis), "মোট X টির মধ্যে Y–Z"
      Lightbox.tsx              # বড় ছবির মোডাল (Esc/ব্যাকড্রপে বন্ধ, body স্ক্রল লক)
      SafeImage.tsx             # ছবি নেই/লোড ব্যর্থ হলে প্লেসহোল্ডার; lazy + async decode
      ErrorNotice.tsx           # HousingApiError → বাংলা বার্তা (StatCards ও তালিকায় ব্যবহৃত)
      HousingFilters.tsx        # ফিল্টার বার: সাল, বিভাগ→জেলা→উপজেলা (cascading), নাম খোঁজা (৫০০ms debounce), মুছুন (ধাপ ৬)
      ImageUploader.tsx         # পুনর্ব্যবহারযোগ্য ড্র্যাগ-ড্রপ আপলোডার + StatusPill + ProgressBar (ধাপ ৭; ধাপ ১১ এ ফর্মে)
      PhotoCompare.tsx          # আগে-পরে তুলনা: clip-path স্লাইডার / পাশাপাশি, সিঙ্ক জুম-প্যান (হুইল, ডাবল-ট্যাপ, পিঞ্চ), +/−/রিসেট/ফুলস্ক্রিন (ধাপ ৯); M-ধাপ ১৪: labels prop, ZoomFrame/Layer/Badge/ToolButton export
      RequireAdmin.tsx          # protected layout route: loading → লগইন যাচাই; এডমিন নয় → /admin/login (state.from) (ধাপ ১০; M-ধাপ ৬)
      ConfirmDialog.tsx         # নিশ্চিতকরণ ডায়ালগ (danger/primary, busy, confirmDisabled) (ধাপ ১১)
      PhotoField.tsx            # ফর্মের একক ছবি ফিল্ড: বিদ্যমান ছবি + মুছুন + ImageUploader (একটি)
    hooks/
      useHousingStats.ts        # HousingApi.stats(projectType) → loading/ready/error (data: ProjectStats — M-ধাপ ১৩)
      useHousingList.ts         # HousingApi.list(params) → সার্ভার-সাইড পেজিনেশন; আগের ডাটা ধরে রাখে
      useHousingYears.ts        # HousingApi.years(projectType) → সালের ড্রপডাউন
      useCountUp.ts             # count-up অ্যানিমেশন (rAF, reduced-motion সচেতন)
      useAuth.ts                # AuthProvider.currentUser/isAdmin + onAuthChange → {status, user, isAdmin}
      useFeaturedRecord.ts      # প্রকল্পের প্রথম উপকারভোগী (list page_size 1, serial asc) — হোম কার্ডের জন্য
    pages/
      listContext.ts            # ListOutletContext: তালিকা → ডিটেইল (ProjectDetailPage) এ project/params/list/page
      HousingLoginPage.tsx      # /admin/login — ইমেইল+পাসওয়ার্ড ফর্ম (AuthProvider.login), সাইন-আপ নেই (ধাপ ১০)
      lazyPages.tsx             # ভিউ মোড ও এডমিন পেইজের React.lazy + <Lazy> Suspense wrapper (শেষ ধাপ)
    utils/
      housingProjects.ts        # রেজিস্ট্রি থেকে: useHousingProjects, useHousingProjectBySlug, adminPath, projectPath (M-ধাপ ৫ক-এ PROJECT_META এর জায়গায়)
      imagePath.ts              # photoPath(type, serial, kind, variant) → housing/{type}/{0001}/{kind}[_thumb].webp; padSerial; photoSrc(url, photo_updated_at)
      photoSpec.ts              # PHOTO_SPEC: maxWidth 1600, thumbWidth 400, quality 80, webp — ব্রাউজার ও স্ক্রিপ্ট দুটোতেই
      imageProcessing.ts        # processImage(file) → {photo, thumb} WebP (canvas, EXIF-সচেতন); formatBytes
      photoFilename.ts          # parsePhotoFilename(নাম, aliases) → {project_type, serial_no, kind|null}; buildProjectAliases (file_prefix/key/slug, অঙ্কসহ); photoTarget (ছবি মোড অনুযায়ী ঘর); photoNameExamples (M-ধাপ ১২)
      uploadItems.ts            # UploadItem টাইপ, createUploadItems/revokeUploadItems, STATUS_LABEL
      csvExport.ts              # toCsv (BOM + ফর্মুলা-সুরক্ষা: = + - @ ট্যাব লাইন-ব্রেক → আগে '), guardFormula/stripFormulaGuard, downloadText (M-ধাপ ১০)
      mapData.ts                # loadMapData(): /geo/bd-upazilas.json (TopoJSON) → GeoJSON features + জেলা/বিভাগ/দেশ সীমানা mesh (cache); locationKey()
      districtColors.ts         # districtColors(counts) → জেলা → রঙ (মোট অনুযায়ী ক্রম, ১৪-রঙ প্যালেট + HSL fallback); withAlpha()
public/geo/bd-upazilas.json     # ৫৪৫ উপজেলা/থানার সীমানা (GADM 4.1 level 3, ১২% সরলীকৃত TopoJSON, ~২৬০ KB), properties {id, dv, ds, up (বাংলা NFC), en}; scripts/build-map.mjs দিয়ে তৈরি
scripts/build-map.mjs           # GADM json → বাংলা নাম মেলানো (fold + Levenshtein ≤2, alias, MANUAL override) → mapshaper simplify → TopoJSON; রিপোর্ট ছাপে (npm run build-map -- --in <gadm41_BGD_3.json>)
      filters.ts                # HousingFilters টাইপ, URL ⇄ ফিল্টার, hasActiveFilters, filtersEqual
scripts/
  migrate-photos.mjs            # Node: CSV/ফোল্ডার → ডাউনলোড → sharp WebP → একই Supabase অ্যাডাপ্টার দিয়ে আপলোড (npm run migrate-photos)
  security-check.mjs            # anon key দিয়ে: পড়া খোলা, INSERT/UPDATE/DELETE/RPC/Storage-আপলোড বন্ধ — PASS/FAIL (npm run security-check)
  i18n-check.mjs                # src/ এর সব বাংলা UI লেখা বনাম en.ts — অনুপস্থিত/অব্যবহৃত key, t() ছাড়া JSX টেক্সট (npm run i18n-check)
  photo-check.mjs               # anon হিসেবে প্রতিটি রেকর্ডের ছবির URL (?v= সহ) এ HEAD — সব 200 কি না (npm run photo-check) (M-ধাপ ১)
  build-rehearsal.mjs           # রোলব্যাক ফাইলের BODY থেকে checks/rollback_rehearsal.sql তৈরি (npm run build-rehearsal) (M-ধাপ ২)
  smoke.mjs                     # puppeteer-core + Chrome/Edge: ৩৬০–১২৮০px × বাংলা/ইংরেজি — ওভারফ্লো, console error, ভুল 404, ErrorBoundary, মানচিত্র-ট্যাপ, ব্যাকএন্ড-পথ; স্ক্রিনশট .smoke/ (npm run smoke; --legacy = পুরনো-ডাটাবেস মোড, নিজের dev সার্ভারে) (M-ধাপ ১, ৪)
  content-check.mjs             # anon হিসেবে প্রকল্প/ফিল্ড/ওভারভিউয়ের সারসংক্ষেপ + কোথায় ইংরেজি খালি; শুধু সতর্কবার্তা (npm run content-check) (M-ধাপ ৪)
  adapter-check.mts             # নকল ক্লায়েন্টে adapter-এর নিয়ম: ফলব্যাক, লেখার payload, whitelist, ছবি-মোড — ২৫টি পরীক্ষা (npm run adapter-check) (M-ধাপ ৪)
  admin-ui-check.mjs            # এডমিন প্যানেলের UI, নকল এডমিন সেশনে; পড়া লাইভ (anon), সব লেখা আটকানো — ৩২টি পরীক্ষা (npm run admin-ui-check) (M-ধাপ ৭)
  build-unions.mjs              # nuhil/bangladesh-geocode (পিন করা কমিট, sha256 যাচাই) → পরিষ্কার → bdGeo join → overrides → bd-unions.json (npm run build-unions [-- --check | --src DIR]) (M-ধাপ ৯)
  geo-check.mjs                 # ইউনিয়নের ডাটা, মেলানো, gnUnion, কম্বোবক্স (ব্রাউজারে, dev ডেমো পাতা), বিল্ডের chunk (npm run geo-check) (M-ধাপ ৯)
  field-types-check.mjs         # টাকা, প্রতিটি ফিল্ড-ধরনের parse/format/CSV, fuzzy, resolveFields — ৭৭টি পরীক্ষা (npm run field-types-check) (M-ধাপ ৫খ)
  baseline-check.mjs            # anon হিসেবে ঘর নির্মাণের লাইভ মান বনাম M-ধাপ ১ এর বেসলাইন — ফিঙ্গারপ্রিন্ট (§৬.৩ হুবহু; row()/jsonb এর লেখা PGlite-এ মেলানো), ছবি, stats md5 (npm run baseline-check) (M-ধাপ ১৬)
supabase/
  README.md                     # SQL চালানোর ক্রম
  sql/01_schema.sql             # টেবিল, constraint, ইনডেক্স, updated_at (পোর্টেবল)
  sql/02_serial.sql             # কাউন্টার + সিরিয়াল ট্রিগার (পোর্টেবল Postgres)
  sql/03_rls.sql                # housing_admins, is_housing_admin(), RLS (Supabase-নির্দিষ্ট)
  sql/04_rpc_stats.sql          # housing_stats(), housing_years()
  sql/05_storage.sql            # bucket + storage পলিসি (Supabase-নির্দিষ্ট)
  sql/07_rpc_bulk.sql           # housing_bulk_update_by_serial() (ধাপ ১২)
  sql/09_activity_log.sql       # একটিভিটি লগ: টেবিল, রেকর্ড-ট্রিগার (old→new), housing_log_event() RPC, RLS (২০২৬-০৯-৩০; ছবি-লগ বাগ ঠিক করা ২০২৬-১০-০৫)
  sql/09a_fix_photo_log.sql     # জরুরি ফিক্স: লগ-ট্রিগারে array_append (ছবি বদলে ত্রুটি) + নিজে পরীক্ষা (M-ধাপ ১)
  sql/checks/00_baseline.sql    # শুধু পড়ে: রেকর্ড/কাউন্টার/লগ/স্ট্যাট/স্কিমা ফিঙ্গারপ্রিন্ট — বহু-প্রকল্প মাইগ্রেশনের আগে (M-ধাপ ১)
  sql/10_projects.sql           # পর্ব ২: projects (seed housing→semi_pucca,tin), project_fields, beneficiary_private, FK, union_name/extra, public_project_keys(), RLS, asf_meta (M-ধাপ ২)
  sql/10b_project_guards.sql    # পর্ব ২: যাচাই-ট্রিগার (NFC, extra ধরন, ছবি মোড), গোপন-key সুরক্ষা, প্রকল্প/ফিল্ড গার্ড, নতুন প্রকল্পের কাউন্টার (M-ধাপ ২)
  sql/backup/before_10.sql      # backup স্কিমায় লাইভ টেবিলের কপি (M-ধাপ ২)
  sql/checks/10_verify.sql      # SQL ১০ এর পরে বেসলাইনের সাথে মেলানো + anon পরীক্ষা (M-ধাপ ২)
  sql/checks/10b_selftest.sql   # ১৮টি নিজে-ফিরে-যাওয়া পরীক্ষা: anon / এডমিন / postgres (M-ধাপ ২)
  sql/11_project_rpcs.sql       # পর্ব ২: project_stats, projects_overview, housing_stats/years wrapper, next_serial v2, বাল্ক v2, এডমিন RPC (M-ধাপ ৩)
  sql/12_activity_log_v2.sql    # পর্ব ২: লগ v2 (ইউনিয়ন, extra), গোপন মানের লগ (মান ছাড়া), প্রকল্প/ফিল্ডের সেটিং-লগ (M-ধাপ ৩)
  sql/backup/before_11.sql, before_12.sql # ৮টি টেবিলের কপি (M-ধাপ ৩)
  sql/checks/11_selftest.sql    # ১২টি নিজে-ফিরে-যাওয়া পরীক্ষা (অস্থায়ী প্রকল্পে) (M-ধাপ ৩)
  sql/checks/12_selftest.sql    # ৬টি লগ-পরীক্ষা (M-ধাপ ৩)
  sql/checks/11_perf_optional.sql # ঐচ্ছিক: ৫,০০০ কৃত্রিম রেকর্ডে সময় মাপা, তারপর ফেরত (M-ধাপ ৩)
  sql/rollback/10_12_rollback.sql # SQL ১০–১২ উল্টানো (গার্ডসহ; ১২ → ১১ → ১০b → ১০) (M-ধাপ ২–৩)
  sql/checks/rollback_rehearsal.sql # রোলব্যাকের মহড়া — scripts/build-rehearsal.mjs দিয়ে তৈরি, কিছুই বদলায় না (M-ধাপ ২)
  sql/dev/06_seed.sql           # ২০টি ডামি রেকর্ড — শুধু খালি টেস্ট DB; রেকর্ড থাকলে গার্ড থামায় (M-ধাপ ১ এ সরানো)
  sql/dev/08_reset_test_data.sql # ⚠ সব রেকর্ড মুছে কাউন্টার ০ — ২০২৬-০৯-৩০ এ একবার চালানো; এখন গার্ডসহ (M-ধাপ ১ এ সরানো)
  sql/dev/remove_demo_project.sql # পরীক্ষা প্রকল্প (demo) সরানো — লাইভে চালানো যায়; প্রকাশিত/রেকর্ড/ছবি থাকলে বা ঘর নির্মাণ হলে থামে, ছাপ মেলায় (M-ধাপ ১৬)
  sql/13_money_limit.sql        # টাকার সীমা ১০০০ কোটি (1e10) + rollback/13_rollback.sql (M-ধাপ ১১)
docs/
  HOUSING_PROGRESS.md
  API_CONTRACT.md
  MULTI_PROJECT_PLAN.md         # পর্ব ২: বহু-প্রকল্প প্ল্যাটফর্মের পরিকল্পনা (আসল কপি, M-ধাপ ১ থেকে)
  ADMIN_GUIDE.md                # এডমিন ব্যবহার নির্দেশিকা: লগইন, প্রকল্প খোলা, ফিল্ড, রেকর্ড, ইম্পোর্ট, ছবি, প্রকাশ/অপ্রকাশ, চালুর ক্রম (M-ধাপ ১৬)
README.md                       # চালানো, সব পরীক্ষা-টুল, রাউট টেবিল (M-ধাপ ১৬-এ হালনাগাদ)
```

### ডাটাবেস স্কিমা (ধাপ ২ এ চূড়ান্ত; SQL: `supabase/sql/`)
টেবিল: `public.housing_beneficiaries`

| কলাম | টাইপ | নোট |
|---|---|---|
| id | uuid PK, default gen_random_uuid() | |
| project_type | text, CHECK in ('semi_pucca','tin') | |
| serial_no | integer NOT NULL, CHECK ≥ 1 | UNIQUE (project_type, serial_no); ট্রিগার বরাদ্দ করে; UPDATE এ বদলানো নিষেধ (ট্রিগার) |
| year | integer, CHECK 2000–2100 | সাল |
| name | text NOT NULL, খালি নয় | উপকারভোগীর নাম |
| father_or_husband_name | text, default '' | পিতা/স্বামীর নাম |
| division, district, upazila | text NOT NULL | বিভাগ/জেলা/উপজেলা |
| address | text, default '' | বিস্তারিত ঠিকানা |
| prev_photo_url, prev_thumb_url | text null | পূর্বের ঘরের ছবি ও থাম্বনেইল (নিজস্ব স্টোরেজের পাবলিক URL) |
| current_photo_url, current_thumb_url | text null | বর্তমান ঘরের ছবি ও থাম্বনেইল |
| prev_photo_source, current_photo_source | text null | শীটের মূল SharePoint লিঙ্ক; শুধু রেফারেন্স, UI তে নয় |
| photo_updated_at | timestamptz null | ছবি বদলালে বদলায়; URL এ `?v=` ক্যাশ-বাস্টিং |
| created_at, updated_at | timestamptz | updated_at ট্রিগারে স্বয়ংক্রিয় |

ইনডেক্স: unique(project_type, serial_no), year, division, district, upazila, name, (project_type, year)।

সহায়ক টেবিল/ফাংশন:
- `housing_serial_counters(project_type PK, last_serial)` — প্রতি প্রকল্পের কাউন্টার। BEFORE INSERT ট্রিগার `housing_assign_serial()`: serial_no null → পরের নম্বর; দেওয়া থাকলে রাখে ও কাউন্টার ≥ সেটি করে। কাউন্টার কখনো কমে না → ডিলেটের পর পুনঃব্যবহার নেই। RLS চালু, পলিসি নেই (API দিয়ে অগম্য); ট্রিগার security definer।
- BEFORE UPDATE ট্রিগার `housing_protect_serial()`: project_type বদল নিষেধ; serial_no বদল শুধু সেশন-সেটিং `housing.allow_serial_change='on'` থাকলে — যা কেবল `housing_change_serial(p_id, p_new_serial)` RPC (security definer; এডমিন যাচাই, অনন্যতা → 23505, কাউন্টার ≥ নতুন, অডিট সারি) সেট করে। `housing_next_serial(p_project_type)` → কাউন্টার+১ (পূর্বাভাস)।
- `housing_serial_changes(id, record_id, project_type, old_serial, new_serial, changed_by, changed_at)` — সিরিয়াল বদলের অডিট লগ; RLS: এডমিন SELECT, লেখা শুধু RPC।
- `housing_admins(user_id PK → auth.users, email, role text default 'admin' CHECK in ('admin'), created_at)` — এডমিন তালিকা (ভবিষ্যতে role বাড়ানো যায়)। `is_housing_admin()` (security definer) RLS/Storage পলিসিতে; `housing_current_admin()` → (role, email) ফ্রন্টএন্ড AuthProvider এ।
- RLS: `housing_beneficiaries` SELECT সবাই (anon+authenticated); INSERT/UPDATE/DELETE শুধু `is_housing_admin()`।
- RPC: `housing_stats(p_project_type)` → jsonb {total, by_year, by_division, by_district, by_upazila, distinct{divisions, districts, upazilas}, by_location{"জেলা|উপজেলা": n}}; `housing_years(p_project_type)` → table(year); `housing_bulk_update_by_serial(p_project_type, p_rows jsonb)` → {updated, missing[]} (ইম্পোর্টের আপডেট মোড, ≤৫০০/কল, security invoker → RLS)।
- Storage bucket `housing-photos` (public read, ৫ MB, jpeg/png/webp); লেখা শুধু এডমিন। **পাথ (ধাপ ৭):** `housing/{project_type}/{serial ৪ অঙ্ক}/prev.webp | prev_thumb.webp | current.webp | current_thumb.webp` — যেমন `housing/semi_pucca/0001/prev.webp`। একই সিরিয়ালে আপডেট = একই পাথে ওভাররাইট + `photo_updated_at`।

### env ভ্যারিয়েবল (শুধু নাম; `.env.example` দেখুন; মান `.env.local` এ, গিটে যায় না)
| নাম | কাজ |
|---|---|
| `VITE_HOUSING_BACKEND` | `supabase` অথবা `rest` — কোন অ্যাডাপ্টার চলবে |
| `VITE_SUPABASE_URL` | Supabase প্রজেক্ট URL (শুধু supabase মোডে) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key — service_role key কখনোই নয় |
| `VITE_API_BASE_URL` | নিজস্ব সার্ভারের REST বেস URL (শুধু rest মোডে) |

### রাউটের তালিকা
| পাথ | পেইজ | লগইন | অবস্থা |
|---|---|---|---|
| `/` | হোম: হিরো + "প্রকল্পসমূহ" — প্রতি প্রকল্পের প্রথম উপকারভোগীর তথ্য দিয়ে কার্ড (ছবি, বর্ণনা, আরো দেখুন → তালিকা, সোনালি বারে নাম/ঠিকানা/প্রকল্প-সাল/সিরিয়াল) | না | ✅ (২০২৬-০৯-৩০ পুনর্ডিজাইন) |
| `*` | ৪০৪ | না | ✅ ধাপ ০ |
| `/housing` | ল্যান্ডিং: হিরো + হোমের মতোই ছবিসহ প্রকল্প কার্ড (FeaturedProjects; পুরনো ProjectCard ২০২৬-০৯-৩০ এ বাদ) | না | ✅ |
| `/housing/semi-pucca?year=&division=&district=&upazila=&q=&page=` | সেমিপাকা: স্ট্যাট কার্ড (ধাপ ৪) + ফিল্টার (ধাপ ৬) + **ইন্টারেক্টিভ উপজেলা মানচিত্র** (২০২৬-০৯-৩০, ভাঁজযোগ্য, lazy) + টেবিল/পেজিনেশন (ধাপ ৫) — HousingListPage projectType="semi_pucca" | না | ✅ |
| `/housing/tin?…` | টিনের ঘর: একই কম্পোনেন্ট, projectType="tin" | না | ✅ |
| `/housing/<slug>/:serial_no?…` | ভিউ মোড (ধাপ ৮): তালিকার উপরে full-screen মডাল; সব তথ্য + আগে-পরে তুলনা (ধাপ ৯); আগের/পরের (তালিকার ক্রমে, পেইজ পেরোয়), ← → Esc, সোয়াইপ; query string এ ফিল্টার/পেইজ বজায় | না | ✅ ধাপ ৮–৯ |
| `/admin/login` | এডমিন লগইন (ইমেইল + পাসওয়ার্ড); লগইন থাকলে `/admin` এ; পরে ফেরার-পাথে | না | ✅ ধাপ ১০; M-ধাপ ৬-এ নতুন ঠিকানা |
| `/admin` | → প্রথম প্রকল্পের রেকর্ড-তালিকা (ড্যাশবোর্ড আসবে M-ধাপ ৭-এ) | হ্যাঁ | ✅ M-ধাপ ৬ |
| `/admin/records/<key>?…` | এডমিন রেকর্ড (key দিয়ে, যেমন `semi_pucca`): প্রকল্প ট্যাব (রেজিস্ট্রি থেকে), ফিল্টার (সংখ্যা → সিরিয়াল খোঁজা), সিরিয়াল কলাম, এডিট/ডিলেট, বাল্ক ডিলেট, CSV | হ্যাঁ | ✅ ধাপ ১১; M-ধাপ ৬ |
| `/admin/records/<key>/new` | নতুন রেকর্ড ফর্ম | হ্যাঁ | ✅ |
| `/admin/records/<key>/:serial/edit` | এডিট ফর্ম (প্রি-ফিল, সিরিয়াল লক + বিশেষ বদল, ছবি প্রতিস্থাপন/মোছা) | হ্যাঁ | ✅ |
| `/admin/import?project=<key>` | বাল্ক ইম্পোর্ট উইজার্ড (প্রকল্প আগে থেকে বাছাই করা যায়) | হ্যাঁ | ✅ |
| `/admin/photos?project=<key>` | ছবি বাল্ক আপডেট | হ্যাঁ | ✅ |
| `/admin/activity?action=&project=&actor=&from=&to=&record=&page=` | একটিভিটি লগ | হ্যাঁ | ✅ |
| `/housing/admin/*` (পুরনো) | নতুনে রিডাইরেক্ট: `/housing/admin` → `/admin`, `…/login` → `/admin/login`, `…/semi-pucca[/new\|/:serial/edit]` → `/admin/records/semi_pucca[/…]`, `…/import\|photos\|activity` → `/admin/…` (query সহ) | — | ✅ M-ধাপ ৬ |

### বর্তমানে চালু অ্যাডাপ্টার
ফ্যাক্টরি (`src/backend/factory.ts`, M-ধাপ ৪-এ সরানো) `VITE_HOUSING_BACKEND` পড়ে; অচেনা/খালি হলে ডিফল্ট `supabase`।
- **supabase**: পূর্ণ বাস্তবায়ন (ধাপ ২) — HousingApi (list/getById/getBySerial/create/update/delete/bulkInsert/stats/years/filterOptions/uploadPhoto/deletePhoto), AuthProvider (email+password, শুধু `housing_admins` এ থাকা ইউজার), ImageStorage (bucket `housing-photos`)। প্রথম UI ব্যবহার: ধাপ ৪ এর স্ট্যাট কার্ড `stats()` ডাকে। Supabase প্রজেক্টের বিরুদ্ধে চালিয়ে যাচাই হয়নি (ব্যবহারকারীর প্রজেক্ট নেই); টাইপ-চেক ও বিল্ড পাস।
- **rest**: `rest/http.ts` (fetch helper: JSON, Bearer/কুকি, এরর → HousingApiError) ও `rest/authProvider.ts` **বাস্তবায়িত** (ধাপ ১০); HousingApi/ImageStorage stub (ধাপ ১৩)। `rest/endpoints.ts` এ API_CONTRACT এর সব পাথ।

---

## ধাপ ০ — বেস প্রজেক্ট তৈরি ও নথির কাঠামো
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন

### ১. কী তৈরি বা পরিবর্তন হয়েছে
প্রথমে ধরা হয়েছিল বিদ্যমান সাইট আছে; ফোল্ডার খালি পাওয়া যায় এবং ব্যবহারকারী জানান সোর্স নেই। তাই শূন্য থেকে বেস প্রজেক্ট তৈরি হয়েছে।

- স্ক্যাফোল্ড: `npm create vite@latest -- --template react-ts`; তারপর `react-router`, `tailwindcss`, `@tailwindcss/vite` ইনস্টল
- `package.json` (name: asf-website), `package-lock.json`, `.gitignore` (env ফাইল বাদ), `.oxlintrc.json`, `tsconfig*.json` (paths অ্যালিয়াস যোগ)
- `vite.config.ts` — tailwind প্লাগইন + `@` অ্যালিয়াস
- `index.html` — `lang="bn"`, শিরোনাম, Google Fonts (Ubuntu Sans + Noto Sans Bengali)
- `src/index.css` — Tailwind import, `@theme` টোকেন (font-sans, brand, accent), `container-page` ইউটিলিটি
- `src/main.tsx`, `src/App.tsx` — BrowserRouter, রুট টেবিল
- `src/app/layout/SiteLayout.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`
- `src/config/site.ts`, `src/lib/banglaNumber.ts`
- `src/pages/HomePage.tsx`, `src/pages/NotFoundPage.tsx`
- `.env.example`, `README.md`
- `docs/HOUSING_PROGRESS.md`, `docs/API_CONTRACT.md`
- গিট রিপোজিটরি `git init` করা হয়েছে (কোনো কমিট করা হয়নি)
- মুছে ফেলা: টেমপ্লেটের `App.css`, `assets/` (লোগো/হিরো ছবি)

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **TypeScript**: তিনটি ইন্টারফেস (HousingApi, AuthProvider, ImageStorage) ও দুই অ্যাডাপ্টারের চুক্তি টাইপ দিয়ে জোরদার করা যায়; REST ডেভেলপারের জন্যও টাইপ ফাইলই রেফারেন্স।
- **Vite**: হালকা, দ্রুত, স্ট্যাটিক হোস্টিংয়ে সহজে ডিপ্লয়। SSR (Next) দরকার নেই কারণ ব্যাকএন্ড আলাদা থাকবে।
- **React Router declarative mode** (`BrowserRouter`/`Routes`): সরল, লোডার/অ্যাকশনের দরকার নেই কারণ ডাটা অ্যাডাপ্টার দিয়ে আসবে। প্যাকেজ `react-router` (v7+ থেকে `react-router-dom` আলাদা লাগে না)।
- **Tailwind v4**: বর্তমান স্থিতিশীল সংস্করণ; কনফিগ CSS এ (`@theme`)। ব্যবহারকারীর "Tailwind কনফিগে fontFamily" নির্দেশ `--font-sans` টোকেন দিয়ে পূরণ হয়েছে।
- **ব্র্যান্ড সবুজ প্যালেট**: অফিসিয়াল কালার জানা নেই, তাই আমার পছন্দ; টোকেন এক জায়গায় থাকায় পরে বদলানো সহজ।
- **হোস্টিং নোট**: `BrowserRouter` ব্যবহারে প্রোডাকশন সার্ভারে সব পাথ `index.html` এ ফলব্যাক (SPA rewrite) করতে হবে।
- ছবির মূল SharePoint লিঙ্ক আলাদা কলামে রাখার প্রস্তাব (মাইগ্রেশন ট্রেস করার জন্য); সম্মতি বাকি।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ~~`/housing/*` লিঙ্কগুলো এখনো ৪০৪~~ (ধাপ ১ এ সমাধান)।
- ব্র্যান্ড কালার ও লোগো প্লেসহোল্ডার।
- ভিউ মোডের URL ধরন চূড়ান্ত হয়নি।
- হোম পেইজের বর্ণনা-লেখা প্লেসহোল্ডার; ফাউন্ডেশনের আসল লেখা বসাতে হবে।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. `npm install` চালান (node_modules গিটে নেই)।
2. `.env.example` কপি করে `.env.local` বানান (এখনই মান লাগবে না; ধাপ ১ এ Supabase কী লাগবে)।
3. সিদ্ধান্ত দিন: (ক) ছবির মূল SharePoint লিঙ্ক ডাটাবেসে রেফারেন্স কলাম হিসেবে রাখা হবে কি না; (খ) ব্র্যান্ড কালার/লোগো থাকলে দিন; (গ) ভিউ মোডের URL: `/housing/semi-pucca/১২` ধরনের (সিরিয়াল) নাকি id ভিত্তিক।
4. ধাপ ১ এর আগে একটি Supabase প্রজেক্ট তৈরি করে URL ও anon key হাতে রাখুন।

### ৫. কিভাবে টেস্ট করতে হবে
```bash
npm install
npm run dev
```
- ব্রাউজারে http://localhost:5173 খুলুন: সবুজ হেডার, হিরো সেকশন, দুটি প্রকল্প কার্ড, ফুটারে বাংলা সাল (যেমন © ২০২৬) দেখা যাবে।
- মোবাইল প্রস্থে (৭৬৮px এর নিচে) হ্যামবার্গার মেনু আসবে, ক্লিকে খুলবে/বন্ধ হবে।
- http://localhost:5173/abc → বাংলা ৪০৪ পেইজ।
- বাংলা অক্ষর Noto Sans Bengali ও ল্যাটিন Ubuntu Sans এ রেন্ডার হচ্ছে কি না DevTools → Computed → font দেখে যাচাই করুন।
- `npm run build` ও `npm run lint` — দুটোই ত্রুটি/সতর্কতা ছাড়া পাস করে (এই ধাপে যাচাইকৃত)।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ১: রাউটিং ও ফোল্ডার কাঠামো (নিচে দেখুন)।

---

## ধাপ ১ — রাউটিং ও ফোল্ডার কাঠামো
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `src/vite-env.d.ts` — VITE_* env ভ্যারিয়েবলের টাইপ
- `src/features/housing/routes.tsx` — `/housing`, `/housing/semi-pucca`, `/housing/tin`, `/housing/admin`
- `src/features/housing/backend/interfaces/{types,housingApi,authProvider,imageStorage,index}.ts` — তিনটি ইন্টারফেস ও ডোমেইন টাইপ
- `src/features/housing/backend/supabase/index.ts`, `backend/rest/index.ts` — stub অ্যাডাপ্টার
- `src/features/housing/backend/factory.ts`, `backend/index.ts` — env-ভিত্তিক অ্যাডাপ্টার নির্বাচক
- `src/features/housing/pages/{HousingLandingPage,HousingListPage,HousingAdminPage}.tsx`
- `src/features/housing/components/HousingSubnav.tsx`
- `src/features/housing/utils/{projectType,imagePath}.ts`
- `src/features/housing/hooks/.gitkeep`, `data/.gitkeep`

পরিবর্তিত:
- `src/App.tsx` — `{housingRoutes}` যুক্ত

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ফোল্ডারের নাম `backend/`** (ব্যবহারকারীর নির্দেশ অনুযায়ী), ধাপ ০ এর পরিকল্পিত `api/` নামের বদলে। ভেতরে `interfaces/`, `supabase/`, `rest/`, `factory.ts`।
- **ইন্টারফেসে বাড়তি মেথড**: `HousingApi.getBySerial(projectType, serialNo)` (ভিউ মোড সিরিয়াল ধরে খুলতে) ও `AuthProvider.onAuthChange(cb)` (সেশন বদলালে UI আপডেট)। API_CONTRACT এ `by-serial` endpoint আগে থেকেই ছিল।
- **এরর মডেল**: সব অ্যাডাপ্টার `HousingApiError` (code + message + details) throw করবে; কোড API_CONTRACT এর এরর কোডের সাথে মেলানো, সাথে ক্লায়েন্ট-সাইড `NETWORK_ERROR` ও `NOT_IMPLEMENTED`।
- **`publicUrl` সিঙ্ক্রোনাস**: পাথ থেকে URL সরাসরি গণনাযোগ্য (Supabase Storage public bucket ও REST দুটোতেই), তাই Promise নয়।
- **ফ্যাক্টরি lazy + cached**: প্রথম কলে অ্যাডাপ্টার তৈরি হয়, পরে একই অবজেক্ট ফেরত দেয়। অচেনা env মানে dev মোডে console.warn, ডিফল্ট `supabase`।
- **রুট এলিমেন্ট হিসেবে export** (`housingRoutes`): React Router এ `<Route>` অবশ্যই `<Routes>` এর সরাসরি child হতে হয়, তাই কম্পোনেন্টের বদলে JSX এলিমেন্ট export করা হয়েছে।
- **PROJECT_META এক জায়গায়**: শিরোনাম, URL slug, ফাইল প্রিফিক্স একসাথে, যাতে দুই প্রকল্পের পার্থক্য কোডে ছড়িয়ে না থাকে (DRY)।
- `/housing/admin` এ এখনো লগইন গার্ড নেই (ধাপ ৩); পেইজ ফাঁকা বলে ঝুঁকি নেই।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- অ্যাডাপ্টার stub; কোনো ডাটা লোড হয় না।
- ভিউ মোডের রুট ও URL ধরন এখনো ঠিক হয়নি।
- `hooks/`, `data/` খালি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. এই ধাপে নতুন কিছু ইনস্টল লাগেনি; `npm run dev` চালিয়ে দেখুন।
2. ধাপ ০ এর তিনটি সিদ্ধান্ত এখনো বাকি: SharePoint লিঙ্ক কলাম, ব্র্যান্ড কালার/লোগো, ভিউ মোডের URL।
3. ধাপ ২ এর আগে Supabase প্রজেক্টের URL ও anon key `.env.local` এ বসান।

### ৫. কিভাবে টেস্ট করতে হবে
```bash
npm run dev
```
- `/housing` → শিরোনাম "ঘর নির্মাণ প্রকল্প", দুটি সবুজ বাটন; ক্লিকে যথাক্রমে `/housing/semi-pucca` ও `/housing/tin`।
- `/housing/semi-pucca` → শিরোনাম "সেমিপাকা ঘর নির্মাণ"; `/housing/tin` → "টিনের ঘর নির্মাণ"। উপরে পিল-নেভিগেশনে সক্রিয় পেইজ সবুজ।
- `/housing/admin` → "এডমিন প্যানেল"। `/housing/xyz` → ৪০৪।
- হেডারের "ঘর নির্মাণ প্রকল্প" লিঙ্ক `/housing` এ যায় এবং সাব-রুটেও হাইলাইট থাকে।
- যাচাইকৃত: `npm run build`, `npm run lint` পাস; সার্ভার-সাইড রেন্ডার স্মোক টেস্টে ৬টি পাথ (`/`, `/housing`, দুই প্রকল্প, `/housing/admin`, একটি ভুল পাথ) সঠিক পেইজ দিয়েছে।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ২: ডাটা মডেল, API চুক্তি, Supabase অ্যাডাপ্টার (নিচে দেখুন)।

---

## ধাপ ২ — ডাটা মডেল, API চুক্তি ও Supabase (টেস্ট) অ্যাডাপ্টার
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); **Supabase এ চালিয়ে যাচাই বাকি** (ব্যবহারকারীর প্রজেক্ট তৈরি হলে)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `supabase/sql/01_schema.sql` … `06_seed.sql`, `supabase/README.md`
- `src/features/housing/backend/supabase/{client,errors,session,housingApi,authProvider,imageStorage}.ts`
- `src/features/housing/backend/rest/endpoints.ts`
- npm: `@supabase/supabase-js` (২.১১৭)

পরিবর্তিত:
- `backend/interfaces/types.ts` — ফিল্ড নাম DB টেবিলের সাথে মেলানো (name, father_or_husband_name, address, *_photo_url, *_thumb_url, *_photo_source, photo_updated_at); PhotoKind `prev|current`, PhotoVariant `full|thumb`; DEFAULT_PAGE_SIZE ৫০; HousingStats এক অবজেক্ট (by_year/by_division/by_district/by_upazila); এরর কোডে CONFIG_ERROR
- `backend/interfaces/housingApi.ts` — `years()`, `uploadPhoto()`, `deletePhoto()` যোগ
- `backend/interfaces/imageStorage.ts` — `upload(file, target{variant})`, `delete(paths[])`, `pathFromUrl()`
- `backend/supabase/index.ts`, `backend/rest/index.ts`, `backend/factory.ts` — নতুন কাঠামো; supabase HousingApi ImageStorage নিয়ে তৈরি হয়
- `utils/imagePath.ts` — variant (thumb), `extFromMime`, `photoSrc`
- `.env.example` — ব্যাখ্যা যোগ (নতুন ভ্যারিয়েবল নেই)
- `docs/API_CONTRACT.md` — সংস্করণ ০.২, পুরো পুনর্লিখন

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **এডমিন = `housing_admins` টেবিলে থাকা ইউজার**, "লগইন করা যেকোনো ইউজার" নয়। Supabase এ ইমেইল সাইন-আপ ডিফল্টে খোলা থাকে; তা হলে যে কেউ নিজে অ্যাকাউন্ট খুলে লিখতে পারত। তালিকায় না থাকলে লগইন সফল হলেও অ্যাডাপ্টার সাথে সাথে signOut করে FORBIDDEN দেয়।
- **সিরিয়াল ডাটাবেস ট্রিগারে** (ক্লায়েন্টে নয়): একই সময়ে দুই এডমিন যোগ করলেও ডুপ্লিকেট হবে না; ইম্পোর্টে শীটের সিরিয়াল দিলে সেটি রাখে ও কাউন্টার তোলে। UPDATE এ serial_no/project_type বদল ট্রিগারে নিষিদ্ধ।
- **ছবির ফ্লো HousingApi.uploadPhoto/deletePhoto এ** (ফাইল + রেকর্ড আপডেট একসাথে); ImageStorage নিম্নস্তরের (শুধু ফাইল)। কারণ: REST মোডে একটি endpoint দুটো কাজ একসাথে করে; UI কে দুই-ধাপ নিয়ে ভাবতে হয় না।
- **থাম্বনেইল ক্লায়েন্টে তৈরি হবে** (ধাপ ৩ এ canvas দিয়ে, দীর্ঘ পাশ ৪০০px jpg), কারণ Supabase Storage নিজে রিসাইজ করে না (Image Transformation পেইড)। REST চুক্তিতে thumb ঐচ্ছিক; না এলে সার্ভার বানাবে।
- **রেকর্ড ডিলিটে ছবিও মুছে**: সিরিয়াল পুনঃব্যবহার হয় না বলে ফাইল চিরকাল অনাথ থাকত। (আগের TBD; এখন সিদ্ধান্ত। বদলাতে চাইলে বলুন।)
- **শীটের মূল লিঙ্ক `*_photo_source` কলামে থাকবে** (ব্যবহারকারীর ধাপ ২ নির্দেশ অনুযায়ী; ধাপ ০ এর প্রশ্নের উত্তর হয়ে গেল)।
- **ছবির URL এ `?v=` ফ্রন্টএন্ড যোগ করে** (`photoSrc()`), DB তে সাদা URL — যাতে DB পোর্টেবল থাকে এবং ব্যাকএন্ড পরিবর্তনে URL ফরম্যাট ভাঙে না।
- **kind এর নাম `current`** (`curr` নয়) — কলাম নামের (`current_photo_url`) সাথে মিল রেখে টেমপ্লেট-লিটারাল দিয়ে কলাম বানানো যায়।
- **bulkInsert**: ২০০ সারির চাঙ্ক, চাঙ্ক-স্তরে atomic; ব্যর্থ হলে সেখানে থেমে `failed[]` এ কারণ। `use_given_serial` এ ব্যাচের ভেতরের ডুপ্লিকেট ক্লায়েন্টে আগেই ধরা হয়।
- **খোঁজ (`q`)**: name/father_or_husband_name/address এ ILIKE; PostgREST `or()` এর জন্য `, ( ) %` অক্ষর বাদ দেওয়া হয়।
- **`filterOptions` আলাদা endpoint নয়**: years + stats থেকে ক্লায়েন্টে তৈরি (কম endpoint, একই তথ্য)।
- **by_upazila শুধু নামে**: একই নামের উপজেলা (যেমন "সদর") ভিন্ন জেলায় একসাথে গোনা হবে; API_CONTRACT এ TBD হিসেবে নোট।
- **`stats()` project_type ছাড়া ডাকলে** দুই প্রকল্প মিলিয়ে এক অবজেক্ট (আগের খসড়ার per-type ম্যাপ বাদ; `/housing` ল্যান্ডিং দুইবার ডাকবে)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- **SQL ও অ্যাডাপ্টার প্রকৃত Supabase প্রজেক্টে চালিয়ে দেখা হয়নি** (লোকাল Postgres নেই)। প্রথম চালানোয় ছোটখাটো সিনট্যাক্স সমস্যা বের হতে পারে; হলে এররটি জানালে ঠিক করা হবে।
- Storage পলিসি `storage.objects` এ `create policy` চালাতে Supabase SQL Editor এ যথেষ্ট অধিকার আছে; ব্যর্থ হলে Dashboard → Storage → Policies দিয়ে হাতে বানাতে হবে।
- কোনো UI এখনো অ্যাডাপ্টার ব্যবহার করে না।
- বিভাগ/জেলা/উপজেলার স্থির তালিকা (`data/`) এখনো নেই।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — Supabase টেস্ট প্রজেক্ট সেটআপ
1. **প্রজেক্ট খুলুন:** https://supabase.com → Sign in → "New project"। Organization বাছুন, নাম দিন (যেমন `asf-housing-test`), শক্ত Database password দিন (কোথাও লিখে রাখুন; কোডে লাগবে না), Region: Singapore (`ap-southeast-1`) বাছুন (বাংলাদেশের কাছে)। "Create new project" → ১–২ মিনিট অপেক্ষা।
2. **সাইন-আপ বন্ধ করুন:** বাম মেনু Authentication → Providers → Email: "Enable email provider" চালু রাখুন, কিন্তু **"Allow new users to sign up" বন্ধ** করুন। "Confirm email" বন্ধ করলে টেস্টে সুবিধা (প্রোডাকশনে সিদ্ধান্ত আলাদা)।
3. **এডমিন ইউজার বানান:** Authentication → Users → "Add user" → "Create new user" → ইমেইল ও পাসওয়ার্ড দিন, "Auto Confirm User" টিক দিন → Create।
4. **SQL চালান:** বাম মেনু SQL Editor → "New query"। প্রজেক্টের `supabase/sql/` ফোল্ডারের ফাইলগুলো **এই ক্রমে** একটার পর একটা পুরো কনটেন্ট পেস্ট করে "Run" (Ctrl+Enter):
   1. `01_schema.sql` → "Success" দেখাবে
   2. `02_serial.sql`
   3. `03_rls.sql`
   4. `04_rpc_stats.sql`
   5. `05_storage.sql`
   6. `06_seed.sql` → ২০ সারি ইনসার্ট হবে
5. **নিজেকে এডমিন করুন:** SQL Editor এ (ইমেইল বদলে):
   ```sql
   insert into public.housing_admins (user_id, email)
   select id, email from auth.users where email = 'আপনার@ইমেইল'
   on conflict (user_id) do nothing;
   select * from public.housing_admins;
   ```
6. **যাচাই:** SQL Editor এ:
   ```sql
   select project_type, count(*), max(serial_no) from public.housing_beneficiaries group by project_type;
   select * from public.housing_serial_counters;
   select public.housing_stats('semi_pucca');
   ```
   প্রত্যাশা: semi_pucca ১২ (max 12), tin ৮ (max 8); কাউন্টার 12 ও 8; stats এ total 12।
   Storage → Buckets এ `housing-photos` (Public) দেখা যাবে।
7. **কী কপি করুন:** Project Settings (গিয়ার) → API → "Project URL" এবং "Project API keys" এর **anon public** key (service_role **নয়**)। প্রজেক্ট রুটে `.env.local` ফাইলে:
   ```
   VITE_HOUSING_BACKEND=supabase
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
8. ধাপ ৩ এ প্রথম UI যুক্ত হলে ব্রাউজার থেকে ডাটা দেখা যাবে। তার আগে ব্রাউজারে দ্রুত পরীক্ষা করতে চাইলে (ঐচ্ছিক) API যাচাই: `https://xxxx.supabase.co/rest/v1/housing_beneficiaries?select=serial_no,name&limit=3` ঠিকানায় `apikey: <anon key>` হেডারসহ (Postman/curl) GET করলে ৩টি সারি আসবে; হেডার ছাড়া ৪০১।

### ৫. কিভাবে টেস্ট করতে হবে
- কোড: `npm run build` ও `npm run lint` পাস (যাচাইকৃত)। SSR স্মোক টেস্টে ৬ রুট আগের মতোই সঠিক।
- ডাটাবেস: উপরের ৬ নম্বর যাচাই কোয়েরি।
- সিরিয়াল ট্রিগার: SQL Editor এ
  ```sql
  insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila)
  values ('tin', 2025, 'পরীক্ষা', 'ঢাকা', 'ঢাকা', 'সাভার') returning serial_no;  -- 9 আসবে
  delete from public.housing_beneficiaries where name = 'পরীক্ষা';
  insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila)
  values ('tin', 2025, 'পরীক্ষা ২', 'ঢাকা', 'ঢাকা', 'সাভার') returning serial_no;  -- 10 আসবে (9 পুনঃব্যবহার হয় না)
  update public.housing_beneficiaries set serial_no = 99 where name = 'পরীক্ষা ২';  -- এরর আসবে
  delete from public.housing_beneficiaries where name = 'পরীক্ষা ২';
  ```
- RLS: Dashboard → Table Editor এ "housing_beneficiaries" এর পাশে RLS enabled দেখাবে। anon key দিয়ে REST এ GET কাজ করবে, POST ৪০১/৪০৩ দেবে।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৩: `/housing` ল্যান্ডিং পেইজ (নিচে দেখুন)।

---

## ধাপ ৩ — ল্যান্ডিং পেইজ (দুটি কার্ড-বাটন)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `src/features/housing/components/ProjectCard.tsx` — বড় কার্ড-বাটন (পুরো কার্ড লিঙ্ক): আইকন, শিরোনাম, বর্ণনা, "তালিকা দেখুন →"
- `src/features/housing/components/ProjectIcons.tsx` — ইনলাইন SVG: `SemiPuccaHouseIcon` (ইটের দেয়াল), `TinHouseIcon` (ঢেউটিন), `ProjectIcon` (type অনুযায়ী)

পরিবর্তিত:
- `pages/HousingLandingPage.tsx` — উপরে সবুজ হিরো (সাব-নেভ, শিরোনাম, পরিচিতি), নিচে "প্রকল্প বেছে নিন" + দুই কার্ড (`grid sm:grid-cols-2`, মোবাইলে এক কলাম)
- `utils/projectType.ts` — `PROJECT_META` এ `description` যোগ (কার্ডের লেখা এক জায়গায়)
- `components/HousingSubnav.tsx` — `variant="dark"` (গাঢ় ব্যাকগ্রাউন্ডে সাদা পিল)

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **আইকন ইনলাইন SVG**, কোনো আইকন লাইব্রেরি নয়: মাত্র দুটি আইকন, নির্ভরতা বাড়ানো অর্থহীন; `currentColor` দিয়ে hover এ রঙ বদলায়।
- **hover অ্যানিমেশন `motion-safe:` দিয়ে**: ব্যবহারকারীর OS এ "reduce motion" থাকলে ওঠা/স্কেল বন্ধ থাকে, রঙ/ছায়া বদল থাকে।
- **পুরো কার্ড একটি `<Link>`** (ভেতরে আলাদা বাটন নয়): ট্যাপ এরিয়া বড়, কীবোর্ডে একটি ট্যাব-স্টপ, `aria-label` এ পুরো উদ্দেশ্য।
- **কার্ডের বর্ণনা `PROJECT_META.description` এ**: দুই প্রকল্পের পার্থক্য এক জায়গায় থাকার নীতি (DRY) বজায়।
- হিরোতে পরিসংখ্যান রাখা হয়নি (ডাটা লোড এই ধাপের বাইরে); পরে stats RPC দিয়ে যুক্ত করা যাবে।
- হোম পেইজের (`src/pages/HomePage.tsx`) ছোট কার্ড আলাদাই রইল — এই ধাপের বাইরে; পরে চাইলে একই ProjectCard ব্যবহার করা যাবে।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ছবি/ইলাস্ট্রেশন হিসেবে শুধু SVG আইকন; ফাউন্ডেশনের আসল ছবি থাকলে পরে বসানো যাবে।
- ব্র্যান্ড কালার এখনো প্লেসহোল্ডার সবুজ।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- কিছু না। ডাটাবেস/লগইন লাগে না।

### ৫. কিভাবে টেস্ট করতে হবে
```bash
npm run dev
```
- `/housing` → উপরে সবুজ হিরো, নিচে দুটি সাদা কার্ড পাশাপাশি (ডেস্কটপ) / উপর-নিচ (মোবাইল, ৬৪০px এর নিচে)।
- মাউস রাখলে কার্ড উপরে ওঠে, ছায়া বাড়ে, আইকনের বক্স সবুজ হয়ে সাদা আইকন, তীর ডানে সরে, পেছনের হালকা বৃত্ত বড় হয়।
- ক্লিক: বাম কার্ড → `/housing/semi-pucca`, ডান কার্ড → `/housing/tin`।
- Tab চেপে কার্ডে ফোকাস দিলে সবুজ রিং; Enter এ যায়।
- যাচাইকৃত: build/lint পাস; SSR স্মোকে `/housing` এ দুটি লিঙ্ক ও দুই শিরোনাম রেন্ডার।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৪: লিস্ট পেইজে স্ট্যাট কার্ড (নিচে দেখুন)।

---

## ধাপ ৪ — স্ট্যাটিস্টিক কার্ড (লিস্ট পেইজের উপরে)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); Supabase এ চালিয়ে যাচাই বাকি

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `src/features/housing/hooks/useHousingStats.ts` — `stats(projectType)` লোড; loading/ready/error
- `src/features/housing/hooks/useCountUp.ts` — count-up (rAF, ease-out, reduced-motion এ তাৎক্ষণিক)
- `src/features/housing/components/StatCards.tsx` — ৪ কার্ড (মোট উপকারভোগী / বিভাগ / জেলা / উপজেলা), skeleton, এরর বার্তা, SVG আইকন

পরিবর্তিত:
- `pages/HousingListPage.tsx` — শিরোনামের নিচে `<StatCards projectType=… />`
- `backend/interfaces/types.ts` — `HousingStats.distinct {divisions, districts, upazilas}`; `HousingApiError.from(err)`
- `backend/supabase/housingApi.ts` — `stats()` এ distinct মার্জ
- `supabase/sql/04_rpc_stats.sql` — `housing_stats()` উত্তরে `distinct` অংশ (**আবার চালাতে হবে**)
- `docs/API_CONTRACT.md` — ০.৩: stats উত্তরে `distinct`
- `hooks/.gitkeep` মুছে ফেলা

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **distinct সংখ্যা সার্ভার/RPC থেকে**, `by_division` ইত্যাদির key গুনে নয়: `by_upazila` শুধু নামে গোনা হয়, তাই একই নামের উপজেলা (যেমন "সদর") ভিন্ন জেলায় থাকলে কম দেখাত। `distinct.upazilas` = distinct (district, upazila) জোড়া। REST ব্যাকএন্ডকেও এটি দিতে হবে (চুক্তিতে যোগ)।
- **কার্ড শুধু `projectType` নেয়**, কোনো ফিল্টার নয় → ফিল্টার এলেও সংখ্যা বদলাবে না (ব্যবহারকারীর নিয়ম)।
- **count-up `motion-safe` নীতিতে**: `prefers-reduced-motion` হলে এক ফ্রেমে চূড়ান্ত মান। স্ক্রিন-রিডারের জন্য `aria-label` এ সবসময় চূড়ান্ত মান, অ্যানিমেটেড মধ্যবর্তী মান নয়।
- **effect এ সিঙ্ক্রোনাস setState এড়ানো** (oxlint react নিয়ম): `useHousingStats` উত্তরের সাথে projectType key রাখে, তাই loading রেন্ডারে নির্ণীত; `useCountUp` ref + rAF দিয়ে।
- **এরর কার্ডে কারণভেদে বার্তা**: CONFIG_ERROR (env নেই) ও NETWORK_ERROR এর জন্য বাংলা ইঙ্গিত; বাকিতে অ্যাডাপ্টারের বার্তা। `.env.local` ছাড়া পেইজ ক্র্যাশ করে না, লাল বক্স দেখায়।
- মোবাইলে ২×২ গ্রিড, `lg` থেকে ১×৪।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- প্রকৃত Supabase এ RPC উত্তর যাচাই হয়নি।
- একই পেইজে stats একবারই লোড হয়; ক্যাশ নেই — প্রকল্প পেইজে বারবার এলে প্রতিবার কল (ছোট RPC, আপাতত গ্রহণযোগ্য)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. Supabase প্রজেক্ট থাকলে: SQL Editor এ `supabase/sql/04_rpc_stats.sql` **আবার** চালান (`create or replace`, নিরাপদ)। যাচাই: `select public.housing_stats('semi_pucca')->'distinct';` → `{"divisions": 8, "districts": 12, "upazilas": 12}` (seed ডাটায়)।
2. `.env.local` এ `VITE_SUPABASE_URL` ও `VITE_SUPABASE_ANON_KEY` থাকতে হবে; না থাকলে কার্ডের জায়গায় লাল বার্তা দেখাবে (প্রত্যাশিত)।

### ৫. কিভাবে টেস্ট করতে হবে
```bash
npm run dev
```
- `/housing/semi-pucca`: প্রথমে ৪টি ধূসর pulse skeleton, তারপর সংখ্যা ০ থেকে বেড়ে বাংলায় থামে (seed: ১২ / ৮ / ১২ / ১২)। `/housing/tin`: ৮ / ৭ / ৮ / ৮।
- ব্রাউজার সরু করলে ২×২ গ্রিড।
- Windows: Settings → Accessibility → Visual effects → Animation effects বন্ধ করে রিলোড → সংখ্যা সরাসরি আসে।
- `.env.local` সাময়িকভাবে সরিয়ে রিলোড → লাল বক্স "ব্যাকএন্ড সংযোগ কনফিগার করা হয়নি"।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; SSR স্মোকে দুই লিস্ট পেইজে ৪ লেবেল, skeleton ও `aria-busy` রেন্ডার।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৫: টেবিল ও পেজিনেশন (নিচে দেখুন)।

---

## ধাপ ৫ — ডাটা টেবিল ও পেজিনেশন
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত ডাটায় যাচাই বাকি (ডাটাবেস তালিকা দেখুন)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `hooks/useHousingList.ts` — `list(params)`; params (JSON key) বদলালে রিলোড; নতুন পেইজ লোডের সময় আগের ডাটা `data` তে থাকে
- `components/HousingTable.tsx` — ১১ কলাম (ক্রম, সাল, নাম, পিতা/স্বামী, বিভাগ, জেলা, উপজেলা, ঠিকানা, পূর্বের ছবি, বর্তমান ছবি, বিস্তারিত); md+ এ টেবিল (`overflow-x-auto`, `min-w-[1100px]`), ছোট পর্দায় কার্ড; থাম্বনেইল ক্লিকে লাইটবক্স
- `components/Pagination.tsx`, `components/Lightbox.tsx`, `components/SafeImage.tsx`, `components/ErrorNotice.tsx`

পরিবর্তিত:
- `pages/HousingListPage.tsx` — `?page=` URL থেকে; `useHousingList({project_type, page, page_size: 50, sort: 'serial_no', order: 'asc'})`; skeleton, এরর, খালি অবস্থা, টেবিল, পেজিনেশন; পেইজ বদলালে টেবিলের শুরুতে স্ক্রল
- `components/StatCards.tsx` — নিজস্ব এরর বক্সের বদলে শেয়ারড `ErrorNotice`

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **পেইজ নম্বর URL এ (`?page=3`)**, React state এ নয়: লিঙ্ক শেয়ার/বুকমার্ক করা যায়, ব্রাউজারের Back কাজ করে, ভিউ পেইজ থেকে ফিরলে একই পেইজে থাকে। পেইজ ১ হলে প্যারাম মুছে ফেলা হয় (পরিষ্কার URL)। ভবিষ্যতে ফিল্টারও একই URL এ যাবে।
- **"ক্রম" = (page−1)×page_size + index + 1**, `serial_no` নয় — ব্যবহারকারীর নিয়ম। `serial_no` টেবিলে কলাম হিসেবে নেই; লাইটবক্স ক্যাপশন ও ভিউ-লিঙ্কে আছে।
- **টেবিলে শুধু `*_thumb_url`** (lazy, 56×56 / মোবাইলে বড়); `*_photo_url` কেবল লাইটবক্স খুললে লোড হয়। থাম্ব না থাকলেও বড় ছবি থাকলে বাটন ক্লিকযোগ্য (প্লেসহোল্ডার দেখিয়ে)।
- **`?v=` = `Date.parse(photo_updated_at)`** (`utils/imagePath.ts › photoSrc`), থাম্ব ও বড় ছবি দুটোতেই।
- **SafeImage**: `src` null → "ছবি নেই" প্লেসহোল্ডার; `onError` → "লোড হয়নি" প্লেসহোল্ডার (ক্রসচিহ্নসহ); `src` বদলালে আবার চেষ্টা। `role="img"` + `aria-label` এ অবস্থা।
- **মোবাইলে কার্ড লেআউট** (টেবিলের অনুভূমিক স্ক্রল নয়): ১১ কলামের টেবিল ফোনে পড়া কষ্টকর; কার্ডে নাম/ঠিকানা/দুই ছবি এক নজরে। md (৭৬৮px) থেকে টেবিল, তাতে অনুভূমিক স্ক্রল।
- **পেইজ বদলে skeleton নয়, টেবিল হালকা (`opacity-60`, `aria-busy`)**: লেআউট লাফায় না। প্রথম লোডে skeleton।
- **পেজিনেশন নম্বর**: ≤৭ পেইজে সব; নইলে ১ … বর্তমান±১ … শেষ।
- **"বিস্তারিত" বাটন `/housing/<slug>/<serial_no>` এ লিঙ্ক** — প্রস্তাবিত ভিউ-মোড পাথ (সিরিয়াল-ভিত্তিক: মানুষের পড়ার মতো, স্থায়ী)। রুট এখনো নেই → ৪০৪। ব্যবহারকারী id-ভিত্তিক চাইলে `HousingTable.tsx › viewPath()` এক জায়গায় বদলাবে।
- **ভবিষ্যৎ ফিল্টারের জন্য প্রস্তুত**: `useHousingList` পুরো `ListParams` নেয়; পেইজে শুধু params অবজেক্টে ফিল্টার যোগ করলেই হবে। স্ট্যাট কার্ড এতে প্রভাবিত হবে না।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ভিউ-মোড রুট নেই (বাটন ৪০৪ দেয়) — পরের কোনো ধাপে।
- বড় ছবির লাইটবক্সে জুম/সোয়াইপ নেই (শুধু দেখা ও বন্ধ)।
- `?page=` সীমার বাইরে (যেমন ৯৯৯) দিলে খালি টেবিল + পেজিনেশন দেখাবে; স্বয়ংক্রিয় শেষ পেইজে পাঠানো হয় না।
- প্রকৃত ডাটায় (Supabase) চালিয়ে দেখা হয়নি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- ডাটাবেস: উপরের জমা তালিকা (নতুন কিছু যোগ হয়নি)।
- সিদ্ধান্ত (পরে দিলেও চলবে): ভিউ-মোড URL সিরিয়াল-ভিত্তিক (`/housing/tin/১২` → `/housing/tin/12`) ঠিক আছে কি না।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস ছাড়া:
```bash
npm run dev
```
- `/housing/tin` → স্ট্যাট কার্ড ও তালিকার জায়গায় লাল "সংযোগ কনফিগার হয়নি" বক্স (প্রত্যাশিত)। ক্র্যাশ নয়।

ডাটাবেস সংযুক্ত হলে (seed ডাটা):
- `/housing/semi-pucca` → ১২ সারি, ক্রম ১–১২, "মোট ১২ টির মধ্যে ১–১২ দেখানো হচ্ছে", পেইজ বাটন শুধু "১", আগের/পরের নিষ্ক্রিয়।
- সব ছবির ঘরে "ছবি নেই" প্লেসহোল্ডার (seed এ URL null)।
- ব্রাউজার ৭৬৮px এর নিচে → কার্ড লেআউট; উপরে → টেবিল, সরু হলে অনুভূমিক স্ক্রল।
- ৫০+ রেকর্ড থাকলে: পেইজ ২ এ ক্রম ৫১ থেকে, URL এ `?page=2`, Back চাপলে পেইজ ১।
- ছবি থাকলে: থাম্বনেইল ক্লিক → কালো ব্যাকড্রপে বড় ছবি, Esc/বাইরে ক্লিকে বন্ধ; DevTools Network এ বড় ছবি লাইটবক্স খোলার আগে লোড হয় না; URL এ `?v=`।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; SSR স্মোকে নমুনা রেকর্ড দিয়ে ক্রম (পেইজ ৩ → ১০১), বাংলা সাল, থাম্বে `?v=`, বড় ছবি অনুপস্থিত, `loading="lazy"`, প্লেসহোল্ডার, ভিউ লিঙ্ক, পেজিনেশন টেক্সট ও ellipsis — সব পাস।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৬: ফিল্টার ও স্থির ভৌগোলিক তালিকা (নিচে দেখুন)।

---

## ধাপ ৬ — ফিল্টার ও স্থির বিভাগ-জেলা-উপজেলা তালিকা
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত ডাটায় যাচাই বাকি (ডাটাবেস তালিকা দেখুন)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `data/bdGeo.ts` — স্থির তালিকা। **উৎস: GitHub `nuhil/bangladesh-geocode` (MIT)**, রিপোর সর্বশেষ কমিট ২০২৩-০৩-১৭, নামানো ২০২৬-০৯-২৯। **গণনা: ৮ বিভাগ, ৬৪ জেলা, ৪৯৪ উপজেলা।** বিভাগভিত্তিক জেলা: চট্টগ্রাম ১১, ঢাকা ১৩, খুলনা ১০, রাজশাহী ৮, রংপুর ৮, বরিশাল ৬, সিলেট ৪, ময়মনসিংহ ৪। যাচাই: কোনো জেলা উপজেলাহীন নয়, ডুপ্লিকেট নেই, সব নাম বাংলায়; নতুন উপজেলা ডাসার, মধ্যনগর, ঈদগাঁও আছে। ফাইলের নাম `.ts` (ব্যবহারকারী `.js` বলেছিলেন; প্রজেক্ট TypeScript বলে টাইপসহ `.ts`)।
- `utils/geo.ts` — helper: `nfc()`, `getDivisions()`, `getDistricts(division)`, `getUpazilas(division, district)`, `normalizeGeo()`, `isValidGeo()`, `divisionOfDistrict()`
- `utils/filters.ts` — ফিল্টার টাইপ ও URL ⇄ ফিল্টার রূপান্তর
- `hooks/useHousingYears.ts`, `components/HousingFilters.tsx`

পরিবর্তিত:
- `pages/HousingListPage.tsx` — ফিল্টার বার; URL params → `ListParams`; ফিল্টার বদলালে `page` মুছে (পেইজ ১) ও `replace: true`; খালি ফলাফলে "কোনো তথ্য পাওয়া যায়নি"
- `backend/supabase/housingApi.ts` — ফিল্টার/খোঁজার মান NFC
- `supabase/sql/06_seed.sql` — ভূঞাপুর → ভুয়াপুর (স্থির তালিকার বানান)

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **Unicode NFC নরমালাইজেশন (গুরুত্বপূর্ণ আবিষ্কার):** উৎস ডাটাসেটে ড়/ঢ়/য় কোথাও precomposed (U+09DC/DD/DF), কোথাও ড+় (U+09A1+U+09BC) আকারে ছিল (১০২ বনাম ৬২টি)। কীবোর্ড/শীট থেকেও দুই রূপ আসে; তুলনা তখন ব্যর্থ হয় ("কুড়িগ্রাম" ≠ "কুড়িগ্রাম")। সমাধান: তালিকা তৈরিতে NFC (সব decomposed হয়), সব তুলনা/ফিল্টার ইনপুট/অ্যাডাপ্টারে `nfc()`। **ডাটাবেসে লেখার সময়ও NFC করতে হবে** (এডমিন ফর্ম/ইম্পোর্ট ধাপে), নইলে exact-match ফিল্টার মিলবে না। ডাটাবেস তালিকায় সারি ১০।
- **স্থির তালিকাই canonical বানান**: seed এর "ভূঞাপুর" উৎসে "ভুয়াপুর" — seed বদলানো হয়েছে। বাস্তব শীটের বানান ভিন্ন হলে ইম্পোর্টে ভ্যালিডেশন ধরবে (তখন ম্যাপিং/সংশোধন লাগবে)।
- **ফিল্টার অবস্থা URL এ** (`?year=&division=&district=&upazila=&q=`), খালি মান লেখা হয় না; `page` ফিল্টার বদলালে মুছে যায়। URL আপডেট `replace: true` যাতে প্রতিটি কী-স্ট্রোক Back-হিস্টরিতে না জমে; পেইজ বদল `push` থাকে।
- **URL থেকে আসা অসঙ্গত মান স্যানিটাইজ**: `normalizeGeo` — বিভাগের বাইরের জেলা বা জেলার বাইরের উপজেলা বাদ; অবৈধ সাল বাদ; `q` ১০০ অক্ষরে কাটা।
- **cascading**: বিভাগ বদলালে জেলা+উপজেলা খালি, জেলা বদলালে উপজেলা খালি; জেলা/উপজেলা সিলেক্ট নিষ্ক্রিয় যতক্ষণ উপরেরটি না বাছা হয় ("আগে বিভাগ বাছুন")।
- **সালের অপশন `HousingApi.years()`** থেকে (ডাটাবেসে থাকা মান) — ব্যবহারকারীর নিয়ম; লোড হওয়া পর্যন্ত সিলেক্ট নিষ্ক্রিয়।
- **সার্চ debounce ৫০০ms** কম্পোনেন্টের ভেতরে; বাইরে থেকে `q` বদলালে (মুছুন/Back) ইনপুট সিঙ্ক হয় "adjust state during render" প্যাটার্নে (effect এ setState নয়)। ব্যাকএন্ডে `q` নাম ছাড়াও পিতা/স্বামীর নাম ও ঠিকানায় মেলে (API_CONTRACT অনুযায়ী) — লেবেল "উপকারভোগীর নাম"।
- **"ফিল্টার মুছুন"** কোনো ফিল্টার না থাকলে নিষ্ক্রিয়।
- স্ট্যাট কার্ড ফিল্টারে অপ্রভাবিত (আগের নিয়ম বজায়)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- উৎসের উপজেলা সংখ্যা ৪৯৪; সরকারি সংখ্যা সময়ে বদলায় — নতুন উপজেলা এলে `bdGeo.ts` এ হাতে যোগ করতে হবে (ফাইলের মাথায় নোট)।
- বানান-ভিন্নতা (যেমন ভূঞাপুর/ভুয়াপুর, নেত্রকোণা/নেত্রকোনা) বাস্তব শীটে থাকতে পারে; ইম্পোর্ট ধাপে ম্যাপিং টুল লাগতে পারে।
- প্রকৃত ডাটায় ফিল্টার চালিয়ে দেখা হয়নি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- **যাচাই**: `src/features/housing/data/bdGeo.ts` এর গণনা (৮ / ৬৪ / ৪৯৪) ও বানান আপনার প্রত্যাশার সাথে মেলে কি না দেখুন; ভিন্ন উৎস/বানান চাইলে ডাটাসেট দিন।
- ডাটাবেস: জমা তালিকা (সারি ৯–১০ নতুন; এখনই কিছু করার নেই)।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস ছাড়া (`npm run dev`, `/housing/tin`):
- ফিল্টার বার দেখা যাবে; বিভাগ বাছলে জেলা সিলেক্ট সক্রিয় ও শুধু সেই বিভাগের জেলা; জেলা বাছলে উপজেলা। URL এ `?division=…&district=…` বসে। সাল সিলেক্ট "লোড হচ্ছে…" থেকে এরর অবস্থায় যাবে (তালিকা লোড হয়নি) — প্রত্যাশিত।
- নাম বক্সে লিখলে ৫০০ms পর URL এ `q=` আসে; "ফিল্টার মুছুন" সব খালি করে ও ইনপুটও খালি হয়।
- `?division=রংপুর&district=ঢাকা` হাতে দিলে জেলা বাদ পড়ে (স্যানিটাইজ)।

ডাটাবেস সংযুক্ত হলে (seed):
- সেমিপাকা: সাল ড্রপডাউনে ২০২৩/২০২৪/২০২৫; বিভাগ "রংপুর" → ২ সারি (উলিপুর, হাতীবান্ধা); জেলা "কুড়িগ্রাম" → ১; নাম "রহিমা" → ১; কোনো মিল না থাকলে "কোনো তথ্য পাওয়া যায়নি"।
- ফিল্টার বদলালে ক্রম আবার ১ থেকে; স্ট্যাট কার্ডের সংখ্যা বদলায় না।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; স্ক্রিপ্টে গণনা ৮/৬৪/৪৯৪, precomposed ইনপুটে মিল, অসঙ্গত URL স্যানিটাইজ, seed এর ২০টি ঠিকানা স্থির তালিকায় বৈধ, রেন্ডার করা ফিল্টারে cascading অপশন সঠিক।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৭: ছবি ব্যবস্থাপনা (নিচে দেখুন)।

---

## ধাপ ৭ — ছবি ব্যবস্থাপনা (সিরিয়াল ধরে স্থানান্তর ও আপডেট)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); Supabase-এ প্রকৃত আপলোড যাচাই বাকি (ডাটাবেস তালিকা); ব্রাউজারের বাল্ক পেইজ লগইন ছাড়া আপলোড করতে পারবে না (লগইন পেইজ পরের ধাপ)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `utils/photoSpec.ts`, `utils/imageProcessing.ts` (ব্রাউজার canvas → WebP ১৬০০px + থাম্ব ৪০০px), `utils/photoFilename.ts`, `utils/uploadItems.ts`
- `components/ImageUploader.tsx` (ড্র্যাগ-ড্রপ, প্রিভিউ, প্রগ্রেস; `showList={false}` হলে শুধু ড্রপ-জোন)
- `hooks/useAuth.ts`
- `pages/HousingPhotoBulkPage.tsx` + রুট `/housing/admin/photos`; `HousingAdminPage` এ লিঙ্ক
- `scripts/migrate-photos.mjs` + `package.json` স্ক্রিপ্ট `migrate-photos` (চলে `tsx` দিয়ে, তাই TS অ্যাডাপ্টার সরাসরি import হয়)
- devDependencies: `tsx`, `sharp`

পরিবর্তিত:
- `utils/imagePath.ts` — নতুন নিয়ম `photoPath()`: `housing/{project_type}/{serial ৪ অঙ্ক}/{kind}[_thumb].webp`
- `backend/supabase/*` — **ক্লায়েন্ট ইনজেকশন** (`GetClient`), `trustedServer` অপশন; ImageStorage সবসময় `image/webp`, upsert
- `backend/interfaces/housingApi.ts` — `getBySerials(projectType, serialNos[])`; REST stub + `endpoints.bySerials`
- `backend/factory.ts` — `getSupabase` (lazy) পাস করে
- `supabase/sql/05_storage.sql` — মন্তব্যে নতুন পাথ নিয়ম (SQL অপরিবর্তিত)
- `.env.example` — স্ক্রিপ্টের `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (মন্তব্য করা)
- `docs/API_CONTRACT.md` — ০.৫

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **একই অ্যাডাপ্টার কোড ব্রাউজার ও স্ক্রিপ্টে**: Supabase অ্যাডাপ্টারগুলো এখন `getClient` ফাংশন নেয়। ব্রাউজারে factory anon-key client দেয়; স্ক্রিপ্ট service_role client দেয় + `trustedServer: true` (ক্লায়েন্ট-সাইড assertAdmin বাদ — service_role এ সেশন নেই, RLS বাইপাস)। ফলে পাথ নিয়ম, ওভাররাইট, `photo_updated_at`, পুরনো-পাথ পরিষ্কার — সব এক জায়গায় (`uploadPhoto`)। পরে REST অ্যাডাপ্টার এলে স্ক্রিপ্টে শুধু ফ্যাক্টরি বদলালেই হবে।
- **স্ক্রিপ্ট `.mjs` কিন্তু `tsx` দিয়ে চলে**: ব্যবহারকারীর দেওয়া ফাইলনাম রাখা হয়েছে; TS ইমপোর্টের জন্য `tsx` (Node এর নিজস্ব type-stripping extensionless import পারে না)।
- **থাম্বনেইলও WebP** (ধাপ ২ এ jpg ছিল): এক ফরম্যাট, ছোট ফাইল; পাথ নিয়মে `_thumb.webp`।
- **কম্প্রেশন স্পেক এক ফাইলে (`photoSpec.ts`)**: ব্রাউজার (canvas) ও sharp একই সংখ্যা ব্যবহার করে; ব্রাউজারে EXIF রোটেশন `createImageBitmap(…, {imageOrientation:'from-image'})`, sharp এ `.rotate()`।
- **বাল্ক পেইজে ফাইলনাম নিয়ম** `semi|semi_pucca|tin` + `_`/`-` + সিরিয়াল + `prev|previous|before|old` / `current|curr|after|now|new`; সিরিয়ালের পর বাড়তি অংশ উপেক্ষা; প্রিফিক্স না থাকলে ড্রপডাউনের প্রকল্প। ব্যাচে একই লক্ষ্যের দ্বিতীয় ফাইল "ডুপ্লিকেট — বাদ"।
- **ওভাররাইট সুরক্ষা**: প্রিভিউতে বিদ্যমান থাম্ব + "ওভাররাইট হবে" ব্যাজ, বাটনে সংখ্যা; নিশ্চিত না করলে কিছু হয় না। রেকর্ড নেই/নাম বোঝা যায়নি → বাদ (আপলোড হয় না)।
- **ব্রাউজারে ২টি, স্ক্রিপ্টে ৪টি সমান্তরাল**: ব্রাউজারে canvas মেমরি সীমিত; স্ক্রিপ্টে ডাউনলোড I/O-বাউন্ড।
- **স্ক্রিপ্টে ডাউনলোড যাচাই**: content-type + ম্যাজিক বাইট (JPEG/PNG/WebP/GIF/HEIC); HTML/`<` দিয়ে শুরু হলে "লগইন লাগছে"; 401/403 → "Anyone with the link" করতে বলে; SharePoint/OneDrive হোস্টে `download=1` যোগ। প্রতিটি ব্যর্থতা `failed.csv` এ কারণসহ।
- **resume**: রেকর্ডে `{kind}_photo_url` থাকলে বাদ (`--force` ছাড়া); `*_photo_source` খালি থাকলে লিঙ্ক সংরক্ষণ।
- **service_role শুধু `.env` এ, `VITE_` প্রিফিক্স ছাড়া** → Vite বান্ডলে কখনো যাবে না; `.gitignore` এ `.env` আছে।
- বাল্ক পেইজে লগইন গার্ড নেই (লগইন UI পরের ধাপ); `useAuth` দিয়ে হলুদ সতর্কতা; ব্যাকএন্ড RLS আসল সুরক্ষা।

### ৩. স্টোরেজ হিসাব (~১৮০০ রেকর্ড × ২ ছবি)
| আইটেম | আনুমানিক আকার | সংখ্যা | মোট |
|---|---|---|---|
| পূর্ণ ছবি (১৬০০px, WebP ৮০%) — ঘরের ছবি সাধারণত | ১৫০–৩০০ KB (গড় ~২২০ KB) | ৩,৬০০ | ~০.৭৫ GB (সীমা ~১.১ GB) |
| থাম্বনেইল (৪০০px) | ১৫–৩০ KB (গড় ~২২ KB) | ৩,৬০০ | ~০.০৮ GB |
| **মোট** | | | **~০.৮ GB (সর্বোচ্চ ~১.২ GB)** |

Supabase Free tier storage ১ GB → সীমার কাছাকাছি; Pro ($২৫/মাস) ১০০ GB। কমাতে চাইলে `photoSpec.ts` এ `maxWidth: 1280` বা `quality: 75` (~৩৫% কম)। ব্যান্ডউইথ: তালিকা পেইজে শুধু থাম্ব (৫০ সারি × ২ × ২২ KB ≈ ২.২ MB/পেইজ)।

### ৪. পরিচিত সমস্যা ও বাকি কাজ
- প্রকৃত Supabase এ আপলোড/ওভাররাইট যাচাই হয়নি (লোকাল যাচাই: sharp পাইপলাইন, CSV/ফোল্ডার dry-run, ফাইলনাম পার্স, SSR রেন্ডার)।
- বাল্ক পেইজ থেকে আপলোড করতে এডমিন লগইন লাগবে — লগইন পেইজ পরের ধাপে।
- Safari পুরনো সংস্করণে `canvas.toBlob('image/webp')` অসমর্থিত হতে পারে → "এই ব্রাউজারে WebP তৈরি করা যায়নি"; Chrome/Edge/Firefox ঠিক আছে।
- HEIC (iPhone) ইনপুট ব্রাউজারে সমর্থিত নয়; স্ক্রিপ্টে sharp HEIC পড়তে libheif লাগে (Windows prebuilt এ সাধারণত আছে; না হলে JPEG করে দিন)।
- `--local-folder` মোডে সাবফোল্ডার দেখা হয় না।

### ৫. আমাকে (ব্যবহারকারীকে) যা করতে হবে
**ক. লিঙ্ক পরীক্ষা ("খ-১" ইনকগনিটো পরীক্ষা)** — এই নামের নথি আমার কাছে নেই; যেটা বোঝাচ্ছে বলে ধরছি:
1. ব্রাউজারে ইনকগনিটো/প্রাইভেট উইন্ডো খুলুন (কোনো Microsoft লগইন নেই)।
2. শীটের ২–৩টি ছবির লিঙ্ক পেস্ট করুন। **ছবি সরাসরি দেখালে** → স্ক্রিপ্ট ডাউনলোড করতে পারবে। **লগইন পেইজ এলে** → SharePoint/OneDrive এ ফাইল/ফোল্ডার শেয়ার সেটিং "Anyone with the link" (view) করুন, আবার পরীক্ষা করুন। সংস্থার নীতিতে সেটা সম্ভব না হলে **স্থানীয় ফোল্ডার মোড** (নিচে গ) ব্যবহার করুন।
3. লিঙ্কের শেষে `&download=1` (বা `?download=1`) যোগ করে দেখুন ফাইল নামে কি না — স্ক্রিপ্ট এটিই করে।

**খ. CSV তৈরি**
1. Google Sheet → File → Download → CSV (UTF-8)। কলাম থাকতে হবে: সিরিয়াল, পূর্বের ঘরের ছবি (লিঙ্ক), বর্তমান ঘরের ছবি (লিঙ্ক); ঐচ্ছিক: প্রকল্প। হেডার বাংলা/ইংরেজি দুটোই চেনে (`serial_no`/`সিরিয়াল`, `prev`/`পূর্বের ঘরের ছবি`, `current`/`বর্তমান ঘরের ছবি`); না চিনলে `--col-serial "হেডার"` ইত্যাদি দিন। সিরিয়াল বাংলা অঙ্কে থাকলেও চলবে।
2. প্রকল্প কলাম না থাকলে প্রতি প্রকল্পের আলাদা CSV বানান এবং `--project semi_pucca` / `--project tin` দিন।
3. ফাইল রাখুন যেমন `data/semi.csv` (`data/` গিটে দিতে চাইলে `.gitignore` এ যোগ করুন, কারণ এতে ব্যক্তিগত তথ্য)।

**গ. স্ক্রিপ্ট চালানো** (ডাটাবেস সেটআপ ও seed/ইম্পোর্ট হওয়ার পরে — রেকর্ড না থাকলে "রেকর্ড নেই" হবে)
1. প্রজেক্ট রুটে `.env` ফাইল: `SUPABASE_URL=…`, `SUPABASE_SERVICE_ROLE_KEY=…` (Dashboard → Project Settings → API → service_role)। এই ফাইল কাউকে দেবেন না।
2. পরীক্ষা: `npm run migrate-photos -- --csv data/semi.csv --project semi_pucca --dry-run` (কিছু আপলোড হয় না, শুধু পরিকল্পনা)।
3. ১০–২০টি দিয়ে সত্যিকার রান: `npm run migrate-photos -- --csv data/semi.csv --project semi_pucca --limit 10`
4. ব্রাউজারে `/housing/semi-pucca` খুলে ঐ সিরিয়ালের থাম্বনেইল ও লাইটবক্স দেখুন।
5. ঠিক থাকলে সব: `npm run migrate-photos -- --csv data/semi.csv --project semi_pucca` (তারপর tin)। মাঝপথে বন্ধ হলে আবার একই কমান্ড — আগে হওয়াগুলো বাদ পড়বে।
6. স্থানীয় ফোল্ডার মোড (লিঙ্ক কাজ না করলে / ম্যানুয়ালি নামানো ছবি): ছবিগুলো `semi_0001_prev.jpg` নামে এক ফোল্ডারে রেখে `npm run migrate-photos -- --local-folder ./photos --project semi_pucca`।

**ঘ. ব্যর্থগুলো ঠিক করা**
1. রানের শেষে `failed.csv` (সিরিয়াল, ধরন, লিঙ্ক, কারণ) দেখুন। কারণ "লগইন লাগছে" হলে শেয়ার সেটিং ঠিক করে আবার চালান (resume)।
2. বাকিগুলো ম্যানুয়ালি ডাউনলোড করে সিরিয়াল-নামে (`semi_0007_prev.jpg`) রাখুন → হয় `--local-folder`, নয়তো ব্রাউজারে `/housing/admin/photos` এ টেনে ছাড়ুন (লগইন পেইজ আসার পরে)।

**ঙ. ডাটাবেস**: জমা তালিকা সারি ১১–১৩।

### ৬. কিভাবে টেস্ট করতে হবে
ডাটাবেস ছাড়া (এখনই):
- `npm run migrate-photos -- --help` → বাংলা সাহায্য।
- `npm run migrate-photos -- --csv কোনো.csv --project tin --dry-run` → CSV পড়া, অবৈধ সারি রিপোর্ট, কাজের তালিকা (যাচাইকৃত: বাংলা অঙ্কের সিরিয়াল, কোটেশনে কমা, খালি/ভুল লিঙ্ক)।
- `npm run migrate-photos -- --local-folder ফোল্ডার --project semi_pucca --dry-run` → ফাইলনাম মিলানো (যাচাইকৃত: `semi_0001_prev.jpg`, `0002_current.png` মিলেছে; `readme.jpg`, `notes.txt` বাদ)।
- `npm run dev` → `/housing/admin` → "ছবি বাল্ক আপডেট" → ফাইল টেনে ছাড়ুন: টেবিলে ফাইলনাম পার্স, "রেকর্ড মিলানো যায়নি" (ব্যাকএন্ড নেই — প্রত্যাশিত), হলুদ "এডমিন লগইন প্রয়োজন"।
- যাচাইকৃত লোকালি: sharp পাইপলাইন ২৪০০×১৬০০ JPEG → WebP ১৬০০×১০৬৭ ও থাম্ব ৪০০×২৬৭, ছোট ছবি বড় হয় না; HTML শনাক্ত; ফাইলনাম পার্সের ১০ কেস; build/lint পাস; SSR এ দুই এডমিন রুট রেন্ডার।

ডাটাবেস + লগইন হলে:
- বাল্ক পেইজে `semi_0001_prev.jpg` দিলে "মোছাঃ রহিমা খাতুন" মিলবে; আপলোডের পর তালিকায় থাম্ব; একই ফাইল আবার দিলে "ওভাররাইট হবে" ব্যাজ ও নতুন `?v=`।
- Storage → housing-photos → `housing/semi_pucca/0001/` এ ৪টি webp (prev, prev_thumb, current, current_thumb) থাকবে।

### ৭. পরের ধাপে কী করতে হবে
- ধাপ ৮: ভিউ মোড (নিচে দেখুন)।

---

## ধাপ ৮ — ভিউ মোড (বিস্তারিত দেখা)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত ডাটায় যাচাই বাকি (ডাটাবেস তালিকা)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `pages/HousingDetailPage.tsx` — full-screen মডাল: হেডার (প্রকল্প, নাম, সিরিয়াল, "মোট X টির মধ্যে Y", বন্ধ), দুই বড় ছবি (ক্লিকে লাইটবক্স), তথ্য কার্ড (সিরিয়াল, সাল, নাম, পিতা/স্বামী, বিভাগ, জেলা, উপজেলা, ঠিকানা), ফুটারে আগের/পরের
- `pages/listContext.ts` — Outlet context টাইপ

পরিবর্তিত:
- `routes.tsx` — `:serial` child route দুই প্রকল্পের তালিকা রুটের ভেতরে
- `pages/HousingListPage.tsx` — `<Outlet context={{projectType, params, list, page}} />`
- `components/HousingTable.tsx` — "বিস্তারিত" লিঙ্কে বর্তমান query string যুক্ত (ফিল্টার/পেইজ বজায়)

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **URL: `/housing/<slug>/<serial_no>`** (সিরিয়াল-ভিত্তিক; ধাপ ৫ এর প্রস্তাব, ব্যবহারকারীর ধাপ ৮ নির্দেশে নিশ্চিত)। id নয়, কারণ সিরিয়াল স্থায়ী ও পড়ার মতো।
- **nested route + Outlet**: মডাল তালিকার child route, তাই নিচে তালিকা রেন্ডার থাকে, ফিল্টার/পেইজ query string এ থাকে, সরাসরি লিঙ্কেও তালিকা+মডাল দুটোই আসে। ডিটেইল আলাদা করে তালিকা fetch করে না — parent এর `useHousingList` ফলাফল context দিয়ে পায়।
- **আগের/পরের = বর্তমান ফিল্টার করা পেইজের ক্রম**; পেইজের শেষে গেলে `api.list({...params, page±1})` এনে তার প্রথম/শেষ রেকর্ডে যায় এবং URL এ `page` বদলায় → নিচের তালিকাও সেই পেইজে যায় (ঐ পেইজ একবার বাড়তি fetch হয়, গ্রহণযোগ্য)।
- **সরাসরি লিঙ্কে রেকর্ড বর্তমান পেইজে না থাকলে** (যেমন `/housing/tin/300` কিন্তু page=1): `getBySerial` দিয়ে দেখায়; আগের/পরের তখন **সিরিয়াল-ক্রমে** (±১, ডিলেট হওয়া সিরিয়াল ১০টি পর্যন্ত টপকে); ফুটারে "সিরিয়াল ক্রমে" লেখা থাকে। ফিল্টার-ক্রম জানতে সার্ভারে "সিরিয়ালের অবস্থান" endpoint লাগত — এড়ানো হয়েছে।
- **নেভিগেশনে `replace: true`**: আগের/পরের চাপলে হিস্টরি জমে না; Back চাপলে তালিকায় ফেরে। বন্ধ = তালিকার URL এ replace।
- **কীবোর্ড**: ← → Esc window-স্তরে; লাইটবক্স খোলা থাকলে মডাল Esc উপেক্ষা করে (লাইটবক্স নিজে বন্ধ হয়)। **সোয়াইপ**: অনুভূমিক ≥৬০px ও উল্লম্বের ১.৫ গুণ বেশি হলে।
- ছবি: `photo_url` (বড়) `eager` লোড, 4:3 বক্সে `object-cover`; ক্লিকে লাইটবক্স। তুলনা ফিচার পরের ধাপে (ব্যবহারকারীর নির্দেশ)।
- মোবাইলে মডাল পুরো পর্দা, ≥640px এ গোলাকার কার্ড; বডি স্ক্রলযোগ্য, হেডার/ফুটার স্থির।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ফোকাস ট্র্যাপ নেই (Tab মডালের বাইরে যেতে পারে); Esc/ক্লোজ কাজ করে।
- `?page=` ভুল থাকলে (রেকর্ড ঐ পেইজে নেই) সিরিয়াল-ক্রম fallback হয় — প্রত্যাশিত, তবে ব্যবহারকারীকে জানানো শুধু ফুটারের লেখায়।
- প্রকৃত ডাটায় পেইজ-পেরোনো নেভিগেশন যাচাই হয়নি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- কিছু না (ডাটাবেস: জমা তালিকা)।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস ছাড়া: `/housing/tin/5` → তালিকার উপরে মডাল, "রেকর্ড লোড করা যায়নি" (ব্যাকএন্ড নেই); `/housing/tin/abc` → "সিরিয়াল নম্বর অবৈধ"; Esc/✕ → তালিকায় ফেরে।
ডাটাবেস (seed) হলে:
- `/housing/semi-pucca` → যেকোনো সারির "বিস্তারিত" → মডালে নাম, সিরিয়াল, "১২ টির মধ্যে N", দুই ছবির প্লেসহোল্ডার, ৮টি তথ্য কার্ড।
- "পরের"/→ কী: পরের সারি; শেষ সারিতে "পরের" নিষ্ক্রিয় (১ পেইজ)। ৫০+ রেকর্ড হলে শেষ সারিতে "পরের" চাপলে URL এ `page=2` ও পেইজ ২ এর প্রথম রেকর্ড; নিচের তালিকাও পেইজ ২।
- ফিল্টার (যেমন বিভাগ রংপুর) দিয়ে খুললে আগের/পরের শুধু ফিল্টার করা ২টির মধ্যে ঘোরে; URL এ `?division=রংপুর` থাকে।
- সরাসরি `/housing/tin/8` (page ছাড়া) → দেখায়; সরাসরি `/housing/semi-pucca/12?page=5` → রেকর্ড পেইজে নেই → getBySerial এ দেখায়, ফুটারে "সিরিয়াল ক্রমে"।
- মোবাইলে বাম/ডান সোয়াইপ; ছবি ক্লিকে লাইটবক্স, Esc এ শুধু লাইটবক্স বন্ধ।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; SSR এ `/housing/tin/5?division=রংপুর&page=2` → dialog + তালিকা একসাথে, আগের/পরের/বন্ধ বাটন, skeleton; অবৈধ সিরিয়ালে এরর; `/housing/tin?page=2` এ dialog নেই।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ৯: আগে-পরে ছবির তুলনা (নিচে দেখুন)।

---

## ধাপ ৯ — আগে-পরে ছবির তুলনা (Remini স্টাইল)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত ছবিতে যাচাই বাকি (ডাটাবেস + ছবি মাইগ্রেশন)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `components/PhotoCompare.tsx` — স্লাইডার মোড (clip-path), পাশাপাশি মোড, সিঙ্ক জুম/প্যান, টুলবার (মোড টগল, −, %, +, রিসেট, ফুলস্ক্রিন), লেবেল "পূর্বের"/"বর্তমান", একটি/কোনো ছবি না থাকলে fallback

পরিবর্তিত:
- `pages/HousingDetailPage.tsx` — দুই আলাদা ছবির বদলে `<PhotoCompare>`; লাইটবক্স বাদ (তুলনা নিজেই জুম করে); কীবোর্ড ← → হ্যান্ডেলে ফোকাস/ফুলস্ক্রিনে থাকলে মডাল-নেভিগেশন নয়; তুলনা ফ্রেমের টাচ সোয়াইপ-নেভিগেশন থেকে বাদ

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **কোনো লাইব্রেরি নয়**: Pointer Events + CSS transform/clip-path দিয়ে ~৩৫০ লাইনে সব হয়। react-compare-image জাতীয় লাইব্রেরি জুম-সিঙ্ক দেয় না; react-zoom-pan-pinch ভারী ও দুই ফ্রেম সিঙ্ক করতে কাস্টম কোড লাগতই। নির্ভরতা শূন্য, বান্ডল ছোট।
- **এক transform, সব স্তরে**: `{z, tx, ty}` state একটিই; স্লাইডার মোডে দুই স্তর, পাশাপাশি মোডে দুই ফ্রেম — সবাই একই `translate() scale()` পায় → জুম/প্যান সবসময় সিঙ্ক, একই অংশ তুলনা হয়।
- **clip-path transform এর বাইরে**: after-স্তরের wrapper এ `inset(0 0 0 X%)`, ভেতরে transform — তাই হ্যান্ডেলের রেখা জুম করলেও স্থির থাকে।
- **জুম গণিত**: কার্সর/পিঞ্চ-মধ্যবিন্দু স্থির রেখে জুম (`zoomAt`), সীমা ১×–৬×, প্যান ক্ল্যাম্প যাতে ছবি ফ্রেম ছেড়ে না যায়। হুইল factor `exp(-deltaY×0.0022)` (মসৃণ), ডাবল-ক্লিক/ট্যাপ ২.৫× ↔ ১×।
- **পিঞ্চ**: দুই pointer এর দূরত্বের অনুপাত + মধ্যবিন্দুর সরণ = জুম + প্যান একসাথে। `touch-action: none` যাতে ব্রাউজার নিজে স্ক্রল/জুম না করে। হুইল listener native `passive:false` (React এর onWheel passive, preventDefault কাজ করে না)।
- **হ্যান্ডেল আলাদা pointer capture**, ফ্রেম `[data-handle]` টার্গেট উপেক্ষা করে → হ্যান্ডেল টানলে প্যান হয় না। কীবোর্ড: ← → ২% (Shift ১০%), Home/End; `role="slider"` + aria-valuetext।
- **ফুলস্ক্রিন Fullscreen API** পুরো কম্পোনেন্টে (টুলবারসহ); অসমর্থিত হলে বাটন নেই। ফুলস্ক্রিনে ফ্রেম `flex-1` (4:3 নয়), কালো পটভূমি।
- **ভিন্ন আকার/অনুপাত**: দুই ছবিই একই 4:3 ফ্রেমে `object-contain`, কেন্দ্র থেকে transform — অনুপাত ভিন্ন হলে পাশে কালো মার্জিন, তুলনা তবু সঠিক জায়গায়।
- **একটি ছবি নেই**: একক জুমযোগ্য ফ্রেম + লেবেল + বার্তা "…ছবি নেই — তুলনা সম্ভব নয়"; মোড বাটন নিষ্ক্রিয়। দুটোই নেই: "এই উপকারভোগীর কোনো ছবি নেই"।
- **মডালের সাথে সমন্বয়**: তুলনা ফ্রেমের ভেতরের টাচ মডালের সোয়াইপ-নেভিগেশন ট্রিগার করে না (`[data-compare]`); হ্যান্ডেলে ফোকাস/ফুলস্ক্রিনে ← → মডালকে যায় না।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ছবি লোড ব্যর্থ হলে SafeImage প্লেসহোল্ডার দেখায়, কিন্তু স্লাইডার/জুম তবু সক্রিয় থাকে (ক্ষতি নেই)।
- iOS Safari: Fullscreen API element-এ অসমর্থিত → বাটন লুকানো থাকে; পিঞ্চ কাজ করে।
- প্যান ক্ল্যাম্প ফ্রেমের মাপে, ছবির প্রকৃত (contain) মাপে নয় — খুব চওড়া/লম্বা ছবিতে সামান্য বাড়তি সরানো যায়।
- প্রকৃত ছবিতে যাচাই হয়নি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- কিছু না।

### ৫. কিভাবে টেস্ট করতে হবে
ছবি লাগবে (ডাটাবেস + মাইগ্রেশন/বাল্ক আপলোডের পরে), অথবা সাময়িকভাবে seed এ দুটি রেকর্ডের `prev_photo_url`/`current_photo_url` এ যেকোনো পাবলিক ছবির URL বসিয়ে:
- ভিউ মোডে এক ফ্রেমে ছবি, মাঝখানে সাদা রেখা + সবুজ গোল হ্যান্ডেল; টানলে বামে "পূর্বের", ডানে "বর্তমান"।
- মাউস হুইল → কার্সরের জায়গায় জুম, % বদলায়; ডাবল-ক্লিক → ২৫০% ↔ ১০০%; জুম অবস্থায় টেনে সরালে দুই ছবি একসাথে সরে; হ্যান্ডেল স্থির।
- মোবাইলে পিঞ্চ, ডাবল-ট্যাপ; ফ্রেমে সোয়াইপ করলে পরের উপকারভোগীতে যায় না (ফ্রেমের বাইরে সোয়াইপ করলে যায়)।
- "পাশাপাশি দেখুন" → দুই ফ্রেম, একটিতে জুম/প্যান করলে অন্যটিও।
- +/−/রিসেট; ফুলস্ক্রিন → কালো পূর্ণ পর্দা, Esc বা বাটনে ফেরা।
- Tab দিয়ে হ্যান্ডেলে ফোকাস → ← → ভাগ বদলায়, মডাল বদলায় না।
- একটি ছবি null → একক ছবি + বার্তা; দুটোই null → "কোনো ছবি নেই"।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; SSR এ both/one/none তিন অবস্থায় স্লাইডার role, clip-path 50%, লেবেল, মোড বাটন, identity transform, touch-action, fallback বার্তা।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ১০: এডমিন লগইন (নিচে দেখুন)।

---

## ধাপ ১০ — এডমিন অথেন্টিকেশন
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত Supabase Auth এ লগইন যাচাই বাকি (ডাটাবেস তালিকা সারি ২, ৩, ১৪, ১৫)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `pages/HousingLoginPage.tsx` (`/housing/admin/login`), `components/RequireAdmin.tsx`, `components/AdminShell.tsx`
- `backend/rest/http.ts`, `backend/rest/authProvider.ts` — REST অথ অ্যাডাপ্টার (JWT/কুকি) API_CONTRACT §২ অনুযায়ী

পরিবর্তিত:
- `routes.tsx` — `admin/login` পাবলিক; `admin` = `<RequireAdmin>` layout route, তার ভেতরে index (ড্যাশবোর্ড) ও `photos`
- `supabase/sql/03_rls.sql` — `housing_admins.role` (default 'admin', CHECK), `housing_current_admin()` RPC, এডমিন যোগ/বাদের নমুনা; RLS/Storage পলিসি আগের মতোই `is_housing_admin()` (পাবলিক SELECT অপরিবর্তিত)
- `backend/supabase/session.ts` — role cache, `adminRole()`; `authProvider.ts` — login এ role লুকআপ, এডমিন না হলে signOut+FORBIDDEN; `onAuthChange` এ role যাচাইয়ের পর callback
- `backend/interfaces/types.ts` — `AdminRole` টাইপ
- `components/HousingSubnav.tsx` — "এডমিন" লিঙ্ক বাদ (পাবলিক পেইজে এডমিন বাটন নেই)
- `pages/HousingPhotoBulkPage.tsx` — হলুদ সতর্কতা ও সাব-নেভ বাদ (এখন গার্ডের ভেতরে)
- `pages/HousingAdminPage.tsx` — ড্যাশবোর্ড লেআউট
- `docs/API_CONTRACT.md` — ০.৬

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **টেবিলের নাম `housing_admins`** (ব্যবহারকারী `admins` বলেছেন): ধাপ ২ থেকেই এই নাম; সাইটে ভবিষ্যতে অন্য সেকশন এলে নাম-সংঘর্ষ এড়াতে প্রিফিক্স রাখা হয়েছে। কাজ একই: এই টেবিলে সারি = এডমিন। `role` কলাম যোগ হয়েছে (এখন শুধু 'admin'; নতুন role এলে CHECK + পলিসি + `AdminRole` টাইপ বাড়াতে হবে)।
- **দুই স্তরের সুরক্ষা**: (১) UI — `RequireAdmin` লগইন না থাকলে redirect; (২) ব্যাকএন্ড — RLS/Storage পলিসি `is_housing_admin()`। UI গার্ড শুধু সুবিধার জন্য; কেউ কোড বদলালেও ডাটাবেস লেখা আটকায়।
- **লগইন সফল কিন্তু এডমিন নয়** → অ্যাডাপ্টার সাথে সাথে `signOut()` করে FORBIDDEN দেয়, যাতে অ-এডমিন সেশন ব্রাউজারে না থাকে। (Supabase এ সাইন-আপ Dashboard থেকে বন্ধ রাখতে হবে — চেকলিস্ট সারি ২; অ্যাপে সাইন-আপ/রিসেট লিঙ্ক নেই।)
- **role লুকআপ RPC `housing_current_admin()`** (security definer): ফ্রন্টএন্ড সরাসরি টেবিল না পড়ে role পায়; `is_housing_admin()` পলিসির জন্য থাকল।
- **সেশন সংরক্ষণ**: Supabase client `persistSession: true` (localStorage) + auto refresh — রিলোডে লগইন থাকে; `useAuth` `onAuthChange` দিয়ে সব ট্যাবে/কম্পোনেন্টে আপডেট।
- **redirect-back**: গার্ড `state.from` এ মূল পাথ (query সহ) রাখে; লগইনের পর সেখানেই ফেরে; লগইন থাকা অবস্থায় লগইন পেইজে গেলে ড্যাশবোর্ডে।
- **লগআউট** AdminShell এ; সফল হলে `/housing` এ (replace)।
- **REST অথ এখনই বাস্তবায়িত** (stub নয়): চুক্তি স্থির ছিল, কোড ছোট; JWT হলে token localStorage, কুকি হলে `credentials: 'include'` — দুটোই একই কোডে কাজ করে; অন্য ট্যাবে লগআউট হলে `storage` ইভেন্টে সিঙ্ক। `http.ts` ধাপ ১৩ এর HousingApi ও ব্যবহার করবে।
- **পাবলিক পেইজে এডমিন লিঙ্ক নেই**; এডমিন সরাসরি `/housing/admin` টাইপ করবেন (বা বুকমার্ক)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- Supabase Auth এ প্রকৃত লগইন/লগআউট/রিফ্রেশ যাচাই হয়নি।
- `useAuth` প্রতিটি ব্যবহারে আলাদা subscription (RequireAdmin, LoginPage) — ছোট overhead; পরে চাইলে context এ তোলা যায়।
- পাসওয়ার্ড রিসেট ফ্লো নেই (Dashboard থেকে "Send password recovery" বা নতুন পাসওয়ার্ড সেট)।
- সেশন মেয়াদ: Supabase ডিফল্ট (access token ১ ঘণ্টা, refresh token দিয়ে স্বয়ংক্রিয় নবায়ন; Dashboard → Auth → Sessions এ বদলানো যায়)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — প্রথম এডমিন ইউজার তৈরি
(ডাটাবেস সেটআপের সময়, চেকলিস্ট সারি ২–৫ ও ১৪–১৫ এর বিস্তারিত)
1. **সাইন-আপ বন্ধ:** Supabase Dashboard → Authentication → Providers → Email → "Allow new users to sign up" **বন্ধ**; "Confirm email" টেস্টে বন্ধ রাখলে সুবিধা। Save।
2. **ইউজার তৈরি:** Authentication → Users → "Add user" → "Create new user" → ইমেইল ও শক্ত পাসওয়ার্ড দিন → **"Auto Confirm User" টিক** → Create। (ইউজার নিজে সাইন-আপ করতে পারবে না; শুধু আপনি এখান থেকে বানাবেন।)
3. **SQL চালান:** SQL Editor এ `supabase/sql/03_rls.sql` এর সর্বশেষ সংস্করণ (role কলাম ও RPC সহ) — আগে চালানো থাকলেও আবার চালান, নিরাপদ।
4. **এডমিন তালিকায় যোগ:** SQL Editor এ (ইমেইল বদলে):
   ```sql
   insert into public.housing_admins (user_id, email, role)
   select id, email, 'admin' from auth.users where email = 'আপনার@ইমেইল'
   on conflict (user_id) do nothing;
   select * from public.housing_admins;
   ```
5. **লগইন পরীক্ষা:** সাইটে `/housing/admin/login` → ইমেইল/পাসওয়ার্ড → ড্যাশবোর্ড; উপরে হলুদ বারে ইমেইল ও লগআউট।
6. **নতুন এডমিন পরে যোগ করতে** ধাপ ২ ও ৪ আবার; **বাদ দিতে** `delete from public.housing_admins where email = '…';` (চাইলে Users থেকেও মুছুন)।
7. **পাসওয়ার্ড বদল:** Authentication → Users → ইউজার → "Reset password" / "Send password recovery"।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস ছাড়া (`npm run dev`):
- `/housing/admin` বা `/housing/admin/photos` → সংক্ষেপে "লগইন যাচাই হচ্ছে…" → `/housing/admin/login` এ redirect।
- লগইন ফর্মে যেকোনো মান → "ব্যাকএন্ড সংযোগ কনফিগার করা হয়নি"।
- পাবলিক পেইজে (হোম, `/housing`, তালিকা) কোথাও "এডমিন"/"লগআউট" নেই।
- যাচাইকৃত (SSR): লগইন ফর্ম ফিল্ড, সাইন-আপ টেক্সট নেই; `/housing/admin` ও `/housing/admin/photos` গার্ডে আটকায় (ফাইল ইনপুট/ড্যাশবোর্ড রেন্ডার হয় না); পাবলিক পেইজে admin লিঙ্ক নেই; build/lint পাস।

ডাটাবেস + এডমিন থাকলে:
- ভুল পাসওয়ার্ড → "ইমেইল বা পাসওয়ার্ড সঠিক নয়"; `housing_admins` এ নেই এমন ইউজার → "এই অ্যাকাউন্ট এডমিন তালিকায় নেই" এবং সেশন থাকে না (রিলোডে লগইন পেইজ)।
- সঠিক এডমিন → `/housing/admin`; রিলোডে লগইন থাকে; নতুন ট্যাবে `/housing/admin/photos` সরাসরি খোলে; লগআউট → `/housing`, তারপর `/housing/admin` → লগইন পেইজ।
- `/housing/admin/photos?x=1` এ লগইন ছাড়া গেলে লগইনের পর ঠিক সেখানেই ফেরে।
- বাল্ক ছবি আপলোড এখন সত্যিই কাজ করবে (RLS পাস)।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ১১: এডমিন CRUD (নিচে দেখুন)।

---

## ধাপ ১১ — এডমিন ডাটা ম্যানেজমেন্ট (যোগ, এডিট, ডিলেট)
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত Supabase এ যাচাই বাকি (ডাটাবেস তালিকা; সারি ১৬ নতুন)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `src/components/Toast.tsx`, `src/components/useToast.ts` — সাইট-ব্যাপী বাংলা টোস্ট (App.tsx এ প্রোভাইডার)
- `components/ConfirmDialog.tsx`, `components/AdminRecordsTable.tsx`, `components/PhotoField.tsx`, `components/RecordForm.tsx`
- `pages/HousingAdminRecordsPage.tsx` (`/housing/admin/:slug`), `pages/HousingRecordFormPage.tsx` (`…/new`, `…/:serial/edit`)

পরিবর্তিত:
- `routes.tsx` — `/housing/admin` → semi-pucca redirect; নতুন এডমিন রুট; `HousingAdminPage.tsx` মুছে ফেলা
- `components/AdminShell.tsx` — মেনু: সেমিপাকা রেকর্ড / টিন রেকর্ড / ছবি বাল্ক
- `backend/interfaces/types.ts` — `HousingRecordInput.serial_no?`, `ListParams.serial_no?`; `housingApi.ts` — `nextSerial()`, `changeSerial()`; `imageStorage.ts` — `move()`
- `backend/supabase/housingApi.ts` — create এ ঐচ্ছিক সিরিয়াল, `serial_no` ফিল্টার, `nextSerial` (RPC), `changeSerial` (RPC + ছবি সরানো + url আপডেট); `imageStorage.ts` — `move`; `errors.ts` — P0002/404 → NOT_FOUND
- `backend/rest/endpoints.ts`, `rest/index.ts` — নতুন endpoint ও stub
- `hooks/useHousingList.ts` — `reloadToken` (ডিলেটের পর রিফ্রেশ)
- `supabase/sql/02_serial.sql` — `housing_next_serial()`, `housing_change_serial()`, protect-ট্রিগারে সেশন-সেটিং
- `docs/API_CONTRACT.md` — ০.৭

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ট্যাব = আলাদা URL** (`/housing/admin/semi-pucca`, `/housing/admin/tin`), `/housing/admin` redirect করে: ফিল্টার/পেইজ query string এ থাকে, ফর্ম থেকে ফিরে একই অবস্থা, লিঙ্ক শেয়ারযোগ্য।
- **একই ফিল্টার কম্পোনেন্ট**; খোঁজার বক্সে শুধু সংখ্যা (বাংলা/ইংরেজি অঙ্ক) → `serial_no` exact, নইলে নামে `q`। আলাদা সিরিয়াল ইনপুট এড়ানো হয়েছে (UI সরল)।
- **সিরিয়াল স্বয়ংক্রিয় = DB কাউন্টার** (`housing_next_serial` পূর্বাভাস দেখায়, প্রকৃত বরাদ্দ ইনসার্ট ট্রিগারে): "max+1" নয়, কারণ ডিলেট হওয়া সর্বোচ্চ সিরিয়াল পুনরায় ব্যবহার হওয়া চলবে না — কাউন্টার কখনো কমে না। হাতে দিলে: ফর্মে `getBySerial` দিয়ে আগাম যাচাই + DB unique constraint (CONFLICT) দ্বিতীয় রক্ষা।
- **সিরিয়াল লক ও বিশেষ বদল**: সাধারণ update এ serial_no পাঠানোই যায় না (টাইপ `HousingRecordPatch` থেকে বাদ) এবং DB ট্রিগার আটকায়। বদল শুধু `changeSerial()` → RPC `housing_change_serial` (security definer, সেশন-সেটিং দিয়ে ট্রিগার পাস) → তারপর অ্যাডাপ্টার ছবির ৪টি ফাইল `ImageStorage.move()` দিয়ে নতুন সিরিয়ালের পাথে সরায় ও url কলাম আপডেট করে। UI তে লাল ডায়ালগ, সতর্কবার্তা (পুরনো লিঙ্ক ভাঙবে, পুরনো সিরিয়াল আর নয়), নতুন সিরিয়াল ইনপুট।
- **ছবি ফর্মে, সেভের পরে আপলোড**: রেকর্ড সংরক্ষণ → তারপর প্রতিটি নতুন ফাইল processImage → uploadPhoto (সিরিয়াল পাথে ওভাররাইট)। নতুন রেকর্ডে সিরিয়াল সেভের আগে জানা যায় না বলে এই ক্রম। ছবি ব্যর্থ হলে রেকর্ড থাকে, টোস্টে জানায়, ফর্ম **এডিট মোডে** খোলা থাকে (`isEdit = current !== null`) — আবার সেভ চাপলে update হয়, ডুপ্লিকেট create নয় (পর্যালোচনায় ধরা পড়া বাগ, ঠিক করা হয়েছে)।
- **সিরিয়াল বদলের অডিট লগ** `housing_serial_changes(record_id, project_type, old_serial, new_serial, changed_by, changed_at)`: স্থায়ী পরিচয় বদলের ইতিহাস; শুধু RPC লেখে (security definer), এডমিন পড়তে পারে, API দিয়ে কেউ মুছতে পারে না। পরে চাইলে এডমিন UI তে "ইতিহাস" দেখানো যাবে।
- **বিদ্যমান ছবি মোছা** এডিট ফর্ম থেকে তাৎক্ষণিক (ConfirmDialog → deletePhoto) — সেভের অপেক্ষা নয়, কারণ স্টোরেজ অপারেশন আলাদা।
- **ডিলেট**: একক ও বাল্ক একই ConfirmDialog (তালিকা + লাল সতর্কতা)। বাল্ক ক্রমান্বয়ে `api.delete` (অ্যাডাপ্টার ছবিও মোছে); সফল/ব্যর্থ গণনা টোস্টে; নির্বাচন শুধু বর্তমান পেইজের রেকর্ডে কার্যকর।
- **ফর্ম প্রি-ফিলে NFC**: ডাটাবেসের ভৌগোলিক মান ভিন্ন Unicode রূপে থাকলে `<select>` option মিলত না; `initial()` NFC করে (যাচাইকৃত precomposed য়/ড় দিয়ে)।
- **টোস্ট নিজস্ব** (লাইব্রেরি নয়): ~৮০ লাইন, aria-live, ক্লিকে বন্ধ। `useToast` আলাদা ফাইলে (Fast Refresh নিয়ম)।
- ভ্যালিডেশন ক্লায়েন্টে (নাম/সাল/বিভাগ/জেলা/উপজেলা আবশ্যক, সাল ২০০০–২১০০, geo তালিকায় বৈধ, লিঙ্ক http(s)) + সার্ভারে CHECK constraint।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- প্রকৃত Supabase এ create/update/delete/changeSerial/ছবি সরানো যাচাই হয়নি; `housing_change_serial` এ `set_config(..., true)` (ট্রানজ্যাকশন-লোকাল) ট্রিগারে পড়া যাচ্ছে কি না প্রথম রানে দেখতে হবে।
- ছবি সরানোর সময় (changeSerial) মাঝপথে ব্যর্থ হলে কিছু ফাইল পুরনো পাথে থেকে যেতে পারে; সেক্ষেত্রে এডিট ফর্ম থেকে ছবি আবার আপলোড করলেই ঠিক হয়।
- বাল্ক ডিলেট ক্রমান্বয়ে (৫০টি ≈ ৫০ অনুরোধ ×২); বড় সংখ্যায় ধীর।
- ফর্মে "অসংরক্ষিত পরিবর্তন" সতর্কতা নেই (পেইজ ছাড়লে হারায়)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- ডাটাবেস: জমা তালিকা সারি ১৬ (`02_serial.sql` আবার চালানো)।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস + এডমিন লগইন থাকলে:
- `/housing/admin` → সেমিপাকা ট্যাব; টেবিলে সিরিয়াল কলাম; খোঁজার বক্সে "৫" → সিরিয়াল ৫; "রহিমা" → নামে।
- "নতুন যোগ করুন": খালি জমা দিলে লাল বার্তা ও টোস্ট; স্বয়ংক্রিয় সিরিয়ালে "(পরবর্তী: ১৩)"; হাতে "৩" দিলে "আগে থেকেই আছে"; সব ঠিক দিয়ে সেভ → টোস্ট, তালিকায় নতুন সারি; ছবি দিয়ে সেভ করলে থাম্ব দেখা যায় ও Storage এ `housing/semi_pucca/0013/…webp`।
- "এডিট": সব ঘর ভরা, সিরিয়াল লক; নাম বদলে সেভ → টোস্ট; "সিরিয়াল বদলান…" → লাল ডায়ালগ → নতুন সিরিয়াল → সেভ → URL `…/<নতুন>/edit`, Storage এ ফাইল নতুন ফোল্ডারে, পুরনো ফোল্ডার খালি; পাবলিক `/housing/semi-pucca/<নতুন>` কাজ করে।
- "ডিলেট" → "আপনি কি নিশ্চিত?" → মুছুন → টোস্ট "১ টি রেকর্ড (ছবিসহ)…", Storage থেকে ছবি গায়েব; নতুন যোগ করলে মুছে ফেলা সিরিয়াল আর আসে না।
- ৩টি চেকবক্স → "৩ টি নির্বাচিত" → "নির্বাচিতগুলো মুছুন" → তালিকা সহ ডায়ালগ → সব মুছে।
- যাচাইকৃত (ডাটাবেস ছাড়া): build/lint পাস; SSR এ এডিট ফর্ম প্রি-ফিল (নাম, সাল, বিভাগ/জেলা/উপজেলা NFC-সহ), সিরিয়াল লক ও "সিরিয়াল বদলান…", বিদ্যমান ছবি + "মুছুন"; নতুন ফর্মে auto/manual; এডমিন টেবিলে সিরিয়াল, ক্রম (পেইজ ২ → ৫১), এডিট লিঙ্ক, ডিলেট বাটন, চেকবক্স; গার্ডে আটকানো রুট।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ১২: বাল্ক ইম্পোর্ট (নিচে দেখুন)।

---

## ধাপ ১২ — বাল্ক ইম্পোর্ট (Google Sheet থেকে) ও সিরিয়াল সহ এক্সপোর্ট
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** সম্পন্ন (কোড); প্রকৃত শীট ও Supabase এ যাচাই বাকি (ডাটাবেস তালিকা সারি ১৭–১৮)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- npm: `xlsx` (SheetJS ০.১৮.৫) — lazy import, শুধু ইম্পোর্ট পেইজে লোড (আলাদা চাঙ্ক ~১৪০ KB gzip)
- `utils/importParse.ts`, `utils/importColumns.ts`, `utils/importValidate.ts`, `utils/geoMatch.ts`, `utils/csvExport.ts`
- `pages/HousingImportPage.tsx` (`/housing/admin/import`)
- `supabase/sql/07_rpc_bulk.sql` — `housing_bulk_update_by_serial()`; `supabase/README.md` এ সারি ৭

পরিবর্তিত:
- `backend/interfaces/types.ts` — `BulkUpdateInput/Result`; `housingApi.ts` — `bulkUpdateBySerial()`; Supabase বাস্তবায়ন (২০০ করে RPC); REST stub + endpoint (PUT /api/housing/bulk)
- `pages/HousingAdminRecordsPage.tsx` — "সিরিয়াল সহ এক্সপোর্ট (CSV)" ও "বাল্ক ইম্পোর্ট" বাটন
- `routes.tsx`, `components/AdminShell.tsx` (মেনুতে "বাল্ক ইম্পোর্ট")
- `docs/API_CONTRACT.md` — ০.৮

### ২. নেওয়া গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **SheetJS (xlsx) — সুপরিচিত, নির্ভরতাহীন; lazy import** যাতে পাবলিক পেইজের বান্ডল না বাড়ে। CSV হলে `file.text()` দিয়ে UTF-8 পড়ে BOM বাদ দিয়ে পার্স (SheetJS এর কোডপেজ অনুমানে বাংলা ভাঙার ঝুঁকি এড়াতে); xlsx সরাসরি ArrayBuffer। সব সেল টেক্সট হিসেবে (`raw:false`), তাই সাল/সিরিয়ালে বাংলা অঙ্ক বা "২০২৪" স্ট্রিং দুটোই চলে।
- **কলাম অনুমান** নির্দিষ্ট থেকে সাধারণ ক্রমে (ছবি → পিতা → সিরিয়াল → … → নাম), যাতে "পূর্বের ঘরের ছবি" ভুল করে "নাম" না হয়; প্রতিটি ফিল্ড একবার। ব্যবহারকারী ড্রপডাউনে বদলাতে পারেন; একই ফিল্ড অন্য কলামে বসালে আগেরটি খালি হয়।
- **সিরিয়াল**: ফাইলে কলাম থাকলে সেটি (সংখ্যা, ≥১, অনন্য, ফাঁকা নয় — ফাইলের ভেতরে যাচাই; ডাটাবেসে থাকলে CONFLICT); না থাকলে সারির ক্রমে **কাউন্টার+১ থেকে** (`nextSerial`), ধাপ ১১ এর নীতিতে "সর্বোচ্চ+১" নয় (ডিলেট হওয়া নম্বর পুনঃব্যবহার নয়; প্রথমবার ১)। প্রিভিউতে সিরিয়াল আগেই দেখা যায়; ইনসার্ট `use_given_serial` মোডে যায় যাতে প্রিভিউ ও ডাটাবেস এক হয়।
- **দুই মোড**: "নতুন যোগ" = `bulkInsert`; "সিরিয়াল ধরে আপডেট" = নতুন RPC (ফিল্ড না দিলে অপরিবর্তিত; missing তালিকা) + ঐচ্ছিক "মিলছে না এমনগুলো নতুন হিসেবে যোগ"। আপডেট RPC security invoker → RLS ই অনুমতি দেয়।
- **ভৌগোলিক মিল ৩ স্তরে**: হুবহু → loose-key (স্পেস/অদৃশ্য অক্ষর/"জেলা"-শব্দ বাদ, ণ→ন, ী→ি, ূ→ু, শ/ষ→স, ড়→র, য়→য … ; ইংরেজি নামও) = "স্বয়ংক্রিয় সংশোধিত" (সতর্কতা, ইম্পোর্ট হয়) → Levenshtein ≤ max(2, len/3) = পরামর্শ (ভুল, ইম্পোর্ট হয় না যতক্ষণ না বেছে দেন)। জেলা মিললে বিভাগ অনুমান; উপজেলা অনন্য হলে জেলা/বিভাগ অনুমান। ম্যানুয়াল ম্যাপিং `geoFixes` (level|parent|raw → সঠিক নাম) একবার দিলে একই মানের সব সারিতে প্রযোজ্য।
- **ডুপ্লিকেট ব্যক্তি** নাম+পিতা/স্বামী+উপজেলা (ছোট হাতের, স্পেস বাদ) ফাইলের ভেতরে — সতর্কতা, বাধা নয়। ডাটাবেসের সাথে মিলানো হয় না (১৮০০ রেকর্ড টানতে হতো; প্রয়োজনে পরে)।
- **ব্যাচ ২০০, চাঙ্ক-স্তরে ব্যর্থতা**: PostgREST ইনসার্ট চাঙ্কে atomic — এক সারি (যেমন সিরিয়াল CONFLICT) ভুল হলে পুরো চাঙ্ক ব্যর্থ; ফলে ব্যর্থ তালিকায় ঐ চাঙ্কের সব সারি একই কারণে। ক্লায়েন্ট-ভ্যালিডেশন এটাকে বিরল রাখে। ভুল সারি আগেই বাদ যায় এবং ব্যর্থ CSV তে "বাদ (ভুল): …" হিসেবে থাকে।
- **এক্সপোর্ট ক্লায়েন্টে** (`list` ১০০ করে সব পেইজ) — নতুন endpoint লাগেনি; কলামে সিরিয়াল, সব তথ্য, মূল লিঙ্ক, সিস্টেম URL, রেকর্ড আইডি; BOM সহ CSV → Google Sheet এ সরাসরি খোলে।
- ছবির লিঙ্ক শুধু `*_photo_source` এ; ছবি আপলোড ধাপ ৭ এর স্ক্রিপ্ট (এক্সপোর্ট CSV ই স্ক্রিপ্টের ইনপুট হতে পারে — সিরিয়াল ও লিঙ্ক কলাম আছে)।
- প্রিভিউ প্রথম ৩০০ সারি (+ "শুধু ভুল/সতর্কতা" ফিল্টার) — ২০০০ সারির DOM এড়াতে; গণনা সব সারির।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- প্রকৃত Supabase এ ইম্পোর্ট/আপডেট/এক্সপোর্ট চালানো হয়নি।
- `.xls` (পুরনো Excel) SheetJS পড়ে, কিন্তু পরীক্ষা করা হয়নি; `.xlsx`/`.csv` পরীক্ষিত।
- ডাটাবেস-স্তরের ডুপ্লিকেট ব্যক্তি সতর্কতা নেই।
- ইম্পোর্ট চলাকালে পেইজ ছাড়লে বাকি ব্যাচ বাতিল হয় (আগেরগুলো থেকে যায়) — আবার চালালে সিরিয়াল CONFLICT দেখাবে, ঠিক আছে।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. Google Sheet এ "সিরিয়াল" কলাম যোগ করলে খালি রাখলেও চলবে (তখন ম্যাপিংয়ে সেটি "উপেক্ষা" করুন বা কলামটি বাদ দিন); দিলে সব সারিতে সংখ্যা ও অনন্য হতে হবে।
2. File → Download → Microsoft Excel (.xlsx) — সবচেয়ে নিরাপদ (CSV তে Sheet নিজেই UTF-8 দেয়, সেটিও চলে)।
3. ডাটাবেস: সারি ১৭ (`07_rpc_bulk.sql`), সারি ১৮ (ছোট ফাইলে পরীক্ষা → পুরো → এক্সপোর্ট → শীটে সিরিয়াল)।

### ৫. কিভাবে টেস্ট করতে হবে
ডাটাবেস + লগইন হলে:
- `/housing/admin/import` → প্রকল্প, "নতুন যোগ করুন", .xlsx দিন → ধাপ ২ এ আপনার ১০ হেডার স্বয়ংক্রিয় ম্যাপ (যাচাইকৃত) → ধাপ ৩ এ সবুজ/লাল/হলুদ গণনা; ভুল বানানের জেলা থাকলে হলুদ প্যানেলে পরামর্শ → বেছে দিলে সারি সবুজ → ধাপ ৪ এ বাটন "N টি সারি যোগ করুন" → প্রগ্রেস → সারসংক্ষেপ; রেকর্ড পেইজে সারি দেখা যায়।
- একই ফাইল আবার "নতুন যোগ" দিলে সিরিয়াল CONFLICT → ব্যর্থ তালিকা + CSV ডাউনলোড।
- "সিরিয়াল ধরে আপডেট": শীটে নাম বদলে আবার দিন → "N টি আপডেট", না-মেলা সিরিয়াল আলাদা; চেকবক্স দিলে সেগুলো যোগ হয়।
- রেকর্ড পেইজে "সিরিয়াল সহ এক্সপোর্ট" → CSV, Google Sheet এ Import করলে বাংলা ঠিক ও সিরিয়াল কলাম।
- যাচাইকৃত (ডাটাবেস ছাড়া, স্ক্রিপ্টে): geo fuzzy (স্পেস/"জেলা"-শব্দ, ণ/ন, ইংরেজি নাম, টাইপো, পরামর্শ, ম্যানুয়াল fix, জেলা→বিভাগ অনুমান), কলাম অনুমান (বাংলা ও ইংরেজি হেডার), ভ্যালিডেশন (বাংলা অঙ্ক, ভুল সাল, খালি নাম, ডুপ্লিকেট সিরিয়াল/ব্যক্তি, লিঙ্ক, auto সিরিয়াল ১৩ থেকে), প্রকৃত .xlsx (SheetJS দিয়ে বানানো, খালি সারি বাদ) ও BOM+কোটেশন CSV পার্স; build/lint পাস; রুট গার্ডে।

### ৬. পরের ধাপে কী করতে হবে
- ধাপ ১৩ (নিজস্ব সার্ভার) — **অপেক্ষমাণ**, নিচে দেখুন। তার আগে ডাটাবেস (Supabase) সেটআপ ও পুরো প্রবাহ যাচাই করা যায়।

---

## সংযোজন (২০২৬-০৯-৩০) — একটিভিটি লগ
- **উদ্দেশ্য**: প্রতিটি ধাপ ট্র্যাক — কে, কখন, কী করেছে, কী থেকে কী বদলেছে।
- **উৎস ১ — ডাটাবেস ট্রিগার** (`09_activity_log.sql`, `housing_log_record_change()` AFTER INSERT/UPDATE/DELETE): যে পথেই লেখা হোক (এডমিন ফর্ম, বাল্ক ইম্পোর্ট, ছবি স্ক্রিপ্ট, SQL Editor) লগ হয়। action: `create` (সারসংক্ষেপ), `delete` (মোছার আগের তথ্য), `update` (ফিল্ডভিত্তিক old→new), `photo_update` (শুধু ছবি বদল, কোন ধরন), `serial_change`। শুধু `updated_at`/`photo_updated_at` বদলালে লগ নয়। actor: `auth.uid()` + JWT email; service_role (স্ক্রিপ্ট) হলে `actor_email='service_role'`।
- **উৎস ২ — ক্লায়েন্ট-ইভেন্ট** RPC `housing_log_event(action, details, project_type)` (এডমিন-চেক): `login` (LoginPage), `logout` (AdminShell), `import_run` (মোড, ফাইল, সারি, সফল/ব্যর্থ/মিলেনি), `photo_bulk_run` (সারি, সফল, ব্যর্থ, বাদ)। `HousingApi.logActivity()` ব্যর্থ হলে নীরব — মূল কাজ আটকায় না।
- **নিরাপত্তা**: টেবিলে RLS — এডমিন SELECT; কোনো insert/update/delete পলিসি নেই (append-only; শুধু security definer ট্রিগার/RPC লেখে)। `security-check` স্ক্রিপ্টে anon পড়ার চেষ্টা যোগ করা যায় (পরে)।
- **UI** `/housing/admin/activity` (`pages/HousingActivityPage.tsx`, lazy): ফিল্টার (ধরন, প্রকল্প, কে, তারিখ-থেকে/পর্যন্ত, নির্দিষ্ট রেকর্ড) URL এ; এন্ট্রিতে সময় (বাংলা dd/mm/yyyy hh:mm), রঙিন action ব্যাজ, কে, প্রকল্প + সিরিয়াল (এডিট লিঙ্ক) + নাম, "ইতিহাস" লিঙ্ক (সেই রেকর্ডের সব এন্ট্রি), বদলানো ফিল্ড কাটা-পুরনো → নতুন; ৫০/পেইজ। AdminShell মেনুতে "একটিভিটি লগ"।
- **API**: `HousingApi.listActivity(params)`, `logActivity(action, details, projectType)`; REST `GET/POST /api/housing/activity` (চুক্তি ০.৯: সার্ভার নিজে লেখার কাজ লগ করবে)।
- **সীমাবদ্ধতা**: ভিউ/পড়ার কাজ (কে কী দেখেছে) লগ হয় না — শুধু লেখা ও সেশন ইভেন্ট। লগ মুছে ফেলার কোনো UI নেই (ইচ্ছাকৃত)। খুব বড় ইম্পোর্টে প্রতি সারিতে একটি `create` এন্ট্রি (২০০০ সারি → ২০০০ এন্ট্রি) — গ্রহণযোগ্য, `import_run` সারসংক্ষেপও থাকে।

## সংযোজন (২০২৬-০৯-৩০) — প্রকৃত শীট-ডাটার জন্য ইম্পোর্ট/মাইগ্রেশন উন্নতি
ব্যবহারকারীর শীটের নমুনা (চট্টগ্রাম/মীরসরাই, ১০ সারি) ভ্যালিডেটরে চালিয়ে পাওয়া গেছে: হেডারের বাড়তি স্পেস ও "মিরসরাই" বানান স্বয়ংক্রিয় ঠিক হয়; কিন্তু **সাল শুধু প্রথম সারিতে**, নিচে খালি → "সাল ফাঁকা" এরর। সমাধান:
- **ইম্পোর্ট উইজার্ডে fill-down অপশন** (ডিফল্ট চালু): খালি সাল/বিভাগ/জেলা/উপজেলা ঘরে উপরের সারির মান; নাম/ঠিকানা/লিঙ্ক/সিরিয়ালে কখনো নয় (`utils/importValidate.ts › fillDown`, `FILL_DOWN_FIELDS`)। কতটি ঘর ভরা হলো দেখায়।
- **মাইগ্রেশন স্ক্রিপ্টে `--from-db`**: CSV ছাড়াই ডাটাবেসের `*_photo_source` লিঙ্ক থেকে কাজের তালিকা (ছবি নেই এমনগুলো; `--force` এ সব); dry-run এ anon key যথেষ্ট (`.env.local` ও পড়ে), আপলোডে service_role। dry-run এ প্রতিটি কাজের অবস্থা দেখায় (রেকর্ড নেই / আগেই আছে / লোকাল কপি / লিঙ্ক)।
- **Google Drive লিঙ্ক সমর্থন** (২০২৬-০৯-৩০): `file/d/ID`, `open?id=`, `uc?id=` → `uc?export=download&id=`; ফাইল/ফোল্ডার "Anyone with the link (Viewer)" শেয়ার থাকলে সরাসরি নামে (লোকাল কপি লাগে না); নইলে HTML → "লিঙ্ক পাবলিক নয়" কারণে ব্যর্থ। Drive লিঙ্কে ফাইলনাম নেই বলে `--local-root` Drive এ কাজ করে না (বিকল্প: সরাসরি ডাউনলোড বা সিরিয়াল-নামে `--local-folder`)।
- **`--local-only`**: `--local-root` এ ফাইল না পেলে লিঙ্ক ডাউনলোড না করে "বাদ" — ছবি ধাপে ধাপে ফোল্ডারে বসিয়ে বারবার চালানোর জন্য (আগে হওয়াগুলো নিজেই বাদ পড়ে)।
- **ফাইলনামে fallback**: লিঙ্কের ফোল্ডার-কাঠামো লোকালে না মিললে (যেমন ফোল্ডার "মিরসরাই-২৩" বনাম "মিরসরাই-২৪", বা ব্যক্তির সাব-ফোল্ডার ছাড়া সব ছবি এক ফোল্ডারে) root এর নিচে রিকার্সিভ ইনডেক্স করে শুধু ফাইলনামে (IMG_… সময়-ছাপ) খোঁজে; একাধিক হলে পাথ-মিল বেশি যেটির। ব্যবহারকারীর ৩টি টেস্ট ছবিতে যাচাইকৃত।
- **মাইগ্রেশন স্ক্রিপ্টে `--local-root <dir>`**: ব্যবহারকারীর লিঙ্ক OneDrive-for-Business `/:i:/r/personal/…/Documents/<ফোল্ডার>/<উপজেলা>/<নাম>/IMG_….jpg` আকারে (সম্ভবত লগইন লাগে; ফাইলনাম সিরিয়াল নয়)। OneDrive থেকে মূল ফোল্ডার জিপ করে নামালে স্ক্রিপ্ট লিঙ্কের পাথ ধরে লোকাল ফাইল খুঁজে নেয় (root উপরের বা ভেতরের ফোল্ডার — দুটোই চলে; NFC/NFD দুই রূপ), না পেলে ডাউনলোডে ফিরে যায়। যাচাইকৃত (নকল ফোল্ডার-কাঠামো)।
- **`08_reset_test_data.sql`**: প্রকৃত ইম্পোর্টের আগে seed মুছে কাউন্টার ০ (ব্যতিক্রমী; পরে আর কখনো নয়)।
- পরামর্শ (ব্যবহারকারীর প্রশ্নে): AI দিয়ে আগে পুরো শীট "ক্লিন" নয় — ভৌগোলিক নাম উইজার্ডে; নাম/ঠিকানা অফিসিয়াল রেকর্ড অনুযায়ী রাখা; পরে "সিরিয়াল ধরে আপডেট" দিয়ে ধাপে ধাপে সংশোধন।

## সংযোজন (২০২৬-০৯-৩০) — হোম কার্ড ও ইন্টারেক্টিভ উপজেলা মানচিত্র
- **হোম "প্রকল্পসমূহ"**: প্রতি প্রকল্পের প্রথম উপকারভোগীর তথ্য দিয়ে "সফলতার গল্প"-স্টাইল কার্ড (`FeaturedProjects`, `FeaturedProjectCard`, `useFeaturedRecord`); "আরো দেখুন" → তালিকা।
- **উপজেলা মানচিত্র** (তালিকা পেইজে **ফিল্টারের উপরে**, ডিফল্টে লুকানো — সবুজ গ্রেডিয়েন্ট ব্যানার-বাটন "মানচিত্রে দেখুন — কোথায় কোথায় ঘর হয়েছে" + সংখ্যা + সোনালি "মানচিত্র খুলুন"; ক্রম ব্যবহারকারীর সিদ্ধান্ত ২০২৬-০৯-৩০):
  - ডাটা: GADM 4.1 level 3 (৫৪৫ ইউনিট) → `scripts/build-map.mjs` → `public/geo/bd-upazilas.json` (~২৬০ KB TopoJSON, ১২% সরলীকৃত)। ইংরেজি নাম → `bdGeo.ts` এর বাংলা নাম: ৪৩৪ হুবহু + ৪৩ fuzzy (পর্যালোচিত) = ৪৭৭/৪৯৪ উপজেলা; না-মেলা ৬৮টি মূলত ঢাকা/চট্টগ্রাম/খুলনা/রাজশাহী সিটি-কর্পোরেশন থানা (ম্যাপে ধূসর, তালিকায় নেই)। GADM লাইসেন্স: অ-বাণিজ্যিক ফ্রি (দাতব্য ব্যবহারে ঠিক; বাণিজ্যিক হলে দেখতে হবে)।
  - সংখ্যা: `housing_stats().by_location` ("জেলা|উপজেলা") — `by_upazila` নামে অস্পষ্ট হতে পারত। **০৪ SQL আবার চালাতে হবে** (চেকলিস্ট ২১)।
  - রেন্ডার: SVG + d3-geo (Mercator fitExtent 600×760), জেলা/বিভাগ/দেশ সীমানা topojson mesh। **কাজ হওয়া প্রতিটি উপজেলায় পতাকা** (খুঁটি + রঙিন পতাকা, পাশে সাদা পিলে বাংলা সংখ্যা), **পতাকা ও উপজেলার হালকা fill জেলাভেদে আলাদা রঙ** (`utils/districtColors.ts`: ১৪-রঙের প্যালেট, বেশি কাজের জেলা আগে; ১৪+ হলে HSL)। কাজ না-হওয়া উপজেলা ধূসর। hover টুলটিপ (রঙের বিন্দু, উপজেলা, জেলা, বিভাগ, সংখ্যা), ক্লিক → ফিল্টার (বিভাগ+জেলা+উপজেলা; সাল/নাম অটুট), আবার ক্লিক → বাতিল; নির্বাচিত উপজেলা গাঢ় বর্ডার। হুইল/পিঞ্চ জুম (১–৮×; পতাকা 1/√k অনুপাতে), ড্র্যাগ প্যান (ড্র্যাগে ক্লিক গোনা হয় না), +/−/রিসেট। টাইল/লাইব্রেরি নেই (d3-geo ও topojson-client ছোট) — পরিষ্কার ম্যাপ।
  - পারফরম্যান্স: মানচিত্র চাঙ্ক lazy (তালিকা পেইজ খুললে নামে), TopoJSON module cache; ৫৪৫ path SVG এ মসৃণ।
- **যাচাই**: build/lint পাস; seed এর ২০টি জেলা|উপজেলা key মানচিত্রে আছে (NFC); geo ফাইল dev সার্ভারে সার্ভ হয়; SSR এ প্যানেল fallback ও SVG।
- **সীমাবদ্ধতা**: নতুন উপজেলা (ঈদগাঁও, মধ্যনগর, ডাসার — ২০২১–২২) GADM এ আলাদা পলিগন নেই → সেগুলোর সংখ্যা মানচিত্রে দেখাবে না (তালিকায় থাকবে); সিটি এলাকার ঠিকানা থাকলে একই। ভবিষ্যতে নতুন সীমানা-ডাটা পেলে `npm run build-map` আবার চালালেই হবে।

---

## সংযোজন (২০২৬-০৯-৩০) — ভাষা টগল (বাংলা / English)
ব্যবহারকারীর চাহিদা: দেশ-বিদেশের দর্শকের জন্য হেডারে ভাষা টগল; ইংরেজি দিলে **সব কিছু** ইংরেজি।

### কী তৈরি হয়েছে
- **`src/i18n/`** — লাইব্রেরি ছাড়া হালকা i18n (~১২০ লাইন):
  - `t('বাংলা লেখা', vars?)`: **বাংলা লেখাই key**; ইংরেজি মোডে `en.ts` থেকে অনুবাদ, না পেলে বাংলাই (dev এ একবার `console.warn`)। `{n}` প্লেসহোল্ডার: `t('মোট {n} টি', { n })`।
  - `gn('কুড়িগ্রাম')`: বিভাগ/জেলা/উপজেলার নাম ইংরেজি মোডে `bdGeo.ts` এর `en` নাম (৮/৬৪/৪৯৪ সব আছে); ফিল্টার/ফর্মের `<option>` লেবেল ইংরেজি, `value` বাংলাই (ডাটাবেস বাংলা)।
  - সংখ্যা: `toBanglaNumber`/`formatBanglaNumber` এখন ভাষা দেখে — ইংরেজিতে ASCII অঙ্ক ও en-US গ্রুপিং; তারিখও একই পথে।
  - `LanguageProvider`: ভাষা `localStorage` (`asf_lang`) এ মনে রাখে, `<html lang>` বদলায়, **`key={lang}` দিয়ে পুরো অ্যাপ remount** — তাই `t()` সাধারণ ফাংশন (hook নয়), ইউটিলিটি/ভ্যালিডেশন বার্তাতেও চলে।
  - `LanguageToggle` (বাং | EN পিল): হেডারে ডেস্কটপ নেভে ও মোবাইলে হ্যামবার্গারের পাশে (মেনু না খুলেও বদলানো যায়)।
- **কোড**: ৪২৪টি বাংলা UI লেখা `t()`/`gn()` এ মোড়ানো (৩০+ ফাইল; JSX টেক্সট, aria-label/alt/title/placeholder, টোস্ট, ভ্যালিডেশন, ইম্পোর্ট/ছবি-বাল্ক বার্তা, CSV হেডার, ConfirmDialog)। স্থির ম্যাপ (COLUMNS, KIND_LABEL, PROJECT_META, FIELD_LABEL, ACTION_LABEL…) ব্যবহারের জায়গায় `t(LABEL[k])` — মডিউল-লেভেলে নয় (ভাষা তখনো জানা থাকে না)। যেখানে লোকাল `t` ভেরিয়েবল ছিল (PhotoCompare, UpazilaMap, HousingDetailPage, AdminRecordsPage, importValidate) সেখানে `import { t as tr }`।
- **অনুবাদ হয় না (ইচ্ছাকৃত)**: ডাটাবেসের নাম/পিতা/ঠিকানা (বাংলা ডাটা), ব্র্যান্ড সংক্ষেপ "ASF", ইম্পোর্টের হেডার-ম্যাচিং regex (ইংরেজি হেডার আগে থেকেই চেনে), ব্যাকএন্ড অ্যাডাপ্টারের ত্রুটি-বার্তা, `index.html` এর স্থির `<title>`/meta।
- **যাচাইকরণ স্ক্রিপ্ট** `npm run i18n-check`: সব বাংলা লিটারেল বনাম অভিধান — অনুপস্থিত key (exit 1), অব্যবহৃত key, প্লেসহোল্ডার অমিল, `t()` ছাড়া JSX টেক্সট। এখন: ৪২৪/৪২৪ ✓।

### নতুন লেখা যোগ করার নিয়ম (ভবিষ্যতে)
1. কোডে বাংলাতেই লিখুন, `t('…')` এ মুড়ে (ডায়নামিক অংশ `{x}` প্লেসহোল্ডারে)।
2. `src/i18n/en.ts` এ একই বাংলা key দিয়ে ইংরেজি যোগ করুন।
3. `npm run i18n-check` — অনুপস্থিত থাকলে তালিকা দেখাবে।

### যাচাই
- `npx tsc -b`, `npm run lint` (০ warning), `npm run build`, `npm run i18n-check` — সব পাস। বান্ডল: মূল ২৮০ KB (gzip ৮৬ KB; অভিধান ~১৪ KB gzip সহ)।
- **ম্যানুয়াল (আমাকে করতে হবে)**: হেডারে EN চাপুন → হোম, তালিকা (ফিল্টার option, টেবিল, মানচিত্র টুলটিপ/ব্যানার, পেজিনেশন), বিস্তারিত মোডাল, লগইন, এডমিন রেকর্ড/ফর্ম/ইম্পোর্ট/ছবি-বাল্ক/লগ — সব ইংরেজি ও অঙ্ক ASCII; রিলোডে ভাষা থাকে; "বাং" এ ফিরলে সব বাংলা। কোনো বাংলা লেখা ইংরেজি মোডে থেকে গেলে dev console এ `[i18n] EN অনুবাদ নেই: …` দেখাবে — সেটি জানালে যোগ করব।

---

## সংযোজন (২০২৬-১০-০১) — মোবাইল ও ট্যাব অভিজ্ঞতা
ব্যবহারকারীর চাহিদা: সব ডিভাইসে ডাটা মসৃণভাবে দেখা ও পড়া। যাচাই: puppeteer-core + Chrome দিয়ে iPhone (390px, touch) ও iPad (768px) এমুলেশনে স্ক্রিনশট (হোম, তালিকা, ফিল্টার, মানচিত্র, বিস্তারিত, লাইটবক্স, EN মোড, মেনু, লগইন) — কোথাও অনুভূমিক ওভারফ্লো নেই (scrollWidth = innerWidth)। (সাধারণ headless Chrome এর উইন্ডো ৫০০px এর নিচে নামে না — তাই এমুলেশন লাগে।)

### পরিবর্তন
- **তালিকা**: টেবিল এখন শুধু `lg+` (≥১০২৪px); ফোনে ১-কলাম, ট্যাবে ২-কলাম **কার্ড** (আগে ট্যাবে ১১০০px টেবিল অনুভূমিক স্ক্রলে পড়তে হতো)। কার্ডে নাম ১৭px, নাম/ঠিকানা আর কাটা হয় না (truncate বাদ), ছবি `aspect-[4/3]` (প্রস্থ অনুযায়ী বড়), "বিস্তারিত" বাটন ৩৬px উঁচু, ছবি কার্ডের নিচে সারিবদ্ধ (`mt-auto`)।
- **ফিল্টার**: ফোনে (`<sm`) ডিফল্টে ভাঁজ করা — "ফিল্টার" বাটন + সক্রিয় সংখ্যার ব্যাজ + "মুছুন"; ফিল্টার সক্রিয় থাকলে খোলা। ট্যাব/ডেস্কটপে আগের মতো সবসময় খোলা।
- **বিস্তারিত মোডাল**: ফোনে **ফুল-স্ক্রিন শিট** (গোল কোণ/মার্জিন নেই, iOS safe-area প্যাডিং), ছবির ফ্রেম ৪২vh (আগে ৩৬), ক্লোজ ৪৪px, আগের/পরের বাটন ৪৪px, কীবোর্ড-ইঙ্গিত লেখা ফোনে লুকানো; ঠিকানা মোড়ানো (truncate নয়)। ট্যাব/ডেস্কটপে আগের কম্প্যাক্ট মোডাল।
- **লাইটবক্স**: উপরে/নিচে ৮০px+ সোয়াইপে বন্ধ; ফোনে কম প্যাডিং, ছবি ৮২vh।
- **সাব-নেভ পিল**: ফোনে এক সারিতে অনুভূমিক স্ক্রল (স্ক্রলবার লুকানো, edge-to-edge), উচ্চতা বাড়ানো।
- **টাচ টার্গেট**: পেজিনেশন ৪০px, মানচিত্রের +/−/রিসেট ৪০px (ফোনে), মানচিত্র প্যানেলের বাটন ৩৬px, ছবি-তুলনার টুল বাটন ৩৬px; `touch-action: manipulation` + tap-highlight বন্ধ (index.css)।
- **পরিসংখ্যান কার্ড**: লেবেল মোড়ানো (ফোনে "মোট উপকারভোগী" কাটা যেত)।
- **ডেস্কটপ টেবিলে অনুভূমিক স্ক্রল বাদ** (২০২৬-১০-০১, ব্যবহারকারীর রিপোর্ট: বাংলায় হালকা, ইংরেজিতে বেশি স্ক্রল): `min-w-[1100px]` সরানো, শিরোনাম uppercase/nowrap বাদ → দরকারে দুই লাইনে মোড়ে, ছবি কলামের শিরোনাম ছোট ("পূর্বের ছবি"/"বর্তমান ছবি" → Before/Current photo), সেল প্যাডিং px-2। মাপা (puppeteer): 1024/1280/1440px দুই ভাষাতেই scrollWidth = clientWidth, স্ক্রল নেই।
- **হেডার**: ৩৬০px এর নিচে সাইটের নাম লুকানো (লোগো + টগল + মেনু থাকে)। `index.html`: `viewport-fit=cover`, `theme-color` (মোবাইল ব্রাউজারের বার সবুজ)।
- CSS: `scrollbar-none` ইউটিলিটি, `-webkit-text-size-adjust`, reduced-motion এ smooth scroll বন্ধ।

### যাচাই
- tsc / lint / build / i18n-check পাস; এমুলেটেড স্ক্রিনশটে ফোন ও ট্যাব লেআউট প্রত্যাশামতো।
- **ম্যানুয়াল (আসল ডিভাইসে)**: ফোনে তালিকা → ফিল্টার খুলে উপজেলা বাছা → কার্ড → বিস্তারিত (সোয়াইপে আগের/পরের, পিঞ্চ-জুম) → ছবিতে ট্যাপ → লাইটবক্স (নিচে সোয়াইপে বন্ধ); মানচিত্র খুলে পিঞ্চ-জুম ও পতাকায় ট্যাপ। ট্যাবে ২-কলাম কার্ড; ল্যান্ডস্কেপ ট্যাব (≥১০২৪) এ টেবিল।

---

## সংযোজন (২০২৬-১০-০১) — মোবাইলে মানচিত্রে ট্যাপে পেইজ সাদা হওয়া
ব্যবহারকারীর রিপোর্ট: ফোনে মানচিত্রের বিভিন্ন জায়গায় ট্যাপ করলে মাঝে মাঝে পুরো পেইজ সাদা। ডেস্কটপে ঠিক।

### বিশ্লেষণ
- Chrome মোবাইল এমুলেশনে (touch, 390px) ৭০+ এলোমেলো ট্যাপ, পতাকায় ট্যাপ/বাতিল, প্যান, পিঞ্চ, জুম অবস্থায় ট্যাপ — কোনো JS error নেই, root খালি হয়নি (`scratchpad/pup/maptap.mjs`)। অর্থাৎ নির্দিষ্ট ফোন-ব্রাউজারের রেন্ডারিং চাপ/ক্র্যাশের সম্ভাবনা বেশি, JS exception নয়।
- কারণ হিসেবে চিহ্নিত: প্রতিটি ট্যাপ (hover state) ও জুমে **৫৪৫টি উপজেলা `<path>` সবগুলো পুনরায় রেন্ডার** হতো (fill/stroke/strokeWidth বদল + প্রতিটিতে CSS transition) — দুর্বল ফোনে GPU/মেমরি চাপ; iOS Safari-তে বড় SVG লেয়ারে এমন অবস্থায় সাদা হয়ে যাওয়া পরিচিত সমস্যা।

### সমাধান (দুই স্তরে)
1. **মানচিত্র রেন্ডার হালকা** (`UpazilaMap.tsx`):
   - **স্থির বেস-লেয়ার** `useMemo`: ৫৪৫ path শুধু data/counts বদলালে তৈরি; hover/selected/zoom এ অপরিবর্তিত। stroke প্রস্থ `vector-effect="non-scaling-stroke"` (জুমে path attribute বদলাতে হয় না)। প্রতি-path transition বাদ।
   - **হাইলাইট আলাদা overlay**: শুধু hover করা ও নির্বাচিত উপজেলার path উপরে আঁকা হয় (`pointer-events: none`)।
   - **ইভেন্ট ডেলিগেশন**: path-গুলোতে হ্যান্ডলার নেই; parent `<g>` এ একটিই onClick/onPointerOver, `data-id` → feature (`geo.byId`)।
   - **টাচে টুলটিপ নেই** (`pointerType === 'touch'` উপেক্ষা): আঙুলের নিচে ঢাকা পড়ত, আর প্রতিটি ট্যাপে state বদলাত না।
   - পরিমাপ: hover + ক্লিকে DOM mutation ৫৪৫+ → **৭**।
2. **ErrorBoundary** (`src/components/ErrorBoundary.tsx`, নতুন): রেন্ডারে কোনো error হলে পেইজ সাদা না হয়ে লাল বক্সে ত্রুটির বার্তা + "আবার চেষ্টা করুন"/"পেইজ রিলোড করুন"। App-এর Routes ঘিরে (পেইজ-স্তর) এবং মানচিত্রের চারপাশে (`UpazilaMapPanel`, compact) — মানচিত্রে সমস্যা হলে শুধু মানচিত্রের জায়গায় বার্তা, তালিকা ঠিক থাকে। বার্তাটি ব্যবহারকারী পড়ে জানাতে পারবেন।

### আসল কারণ (ব্যবহারকারীর ফোনে ErrorBoundary-র বার্তা থেকে, ২০২৬-১০-০১)
`TypeError: Cannot read properties of null (reading 'tx')` — প্যান করার সময় `setT((cur) => … pan!.tx …)`: React-এর state updater পরে (রেন্ডারের সময়) চলে, ততক্ষণে `pointerup` এ `pan = null` হয়ে গেছে → রেন্ডারে throw → পেইজ সাদা (তখন ErrorBoundary ছিল না)। ফোনে দ্রুত ট্যাপ/ছোট ড্র্যাগে ঘটত; ডেস্কটপে mouse-up সাধারণত দেরিতে আসে বলে দেখা যায়নি। **ফিক্স:** মান (`pan.tx + dx`, `pan.ty + dy`) হ্যান্ডলারেই নিয়ে updater-এ শুধু ঐ সংখ্যা ব্যবহার। ErrorBoundary থাকায় ব্যবহারকারী বার্তাটি পড়ে জানাতে পেরেছেন — এভাবেই ধরা পড়ল।

### যাচাই
- tsc/lint/build/i18n-check পাস। ডেস্কটপ: পতাকায় ক্লিক → ফিল্টার (URL), আবার ক্লিক → বাতিল, hover টুলটিপ, জুম — আগের মতো। ফোন এমুলেশন stress test: blank নেই, error নেই।
- **ম্যানুয়াল (আসল ফোনে)**: মানচিত্র খুলে অনেক জায়গায় দ্রুত ট্যাপ, পিঞ্চ-জুম করে ট্যাপ। যদি এখনো কখনো সাদা হয়: এবার লাল বক্সে বার্তা আসবে — সেটির লেখা ও ফোন/ব্রাউজার (যেমন iPhone Safari / Android Chrome) জানালে পরের ধাপে ঠিক করব।

---

## শেষ ধাপ — পলিশ ও যাচাই
- **তারিখ:** ২০২৬-০৯-২৯
- **স্ট্যাটাস:** কোড-পর্যালোচনা ও স্বয়ংক্রিয় যাচাই সম্পন্ন; ব্রাউজার/ডাটাবেস-নির্ভর যাচাই ব্যবহারকারীর তালিকায় (§৫), কারণ ডাটাবেস এখনো সেটআপ হয়নি ও এই পরিবেশে ব্রাউজার নেই

### ১. যা যাচাই হয়েছে (স্বয়ংক্রিয়, এই পরিবেশে)
| বিষয় | পদ্ধতি | ফল |
|---|---|---|
| অ্যাডাপ্টার-বিচ্ছিন্নতা | grep: `@supabase`/`supabase` import শুধু `backend/supabase/` ও factory এ; `import.meta.env` শুধু factory/client এ | ✅ UI তে সরাসরি Supabase কল নেই |
| গোপন কী | grep সোর্স+বিল্ড (dist) এ `service_role`/JWT-প্যাটার্ন; `.gitignore` এ `.env`, `.env.*`, `!.env.example`; `git status` | ✅ কোথাও নেই; শুধু `.env.example` (খালি মান) |
| ফন্ট | `index.html` Google Fonts লিঙ্ক (Ubuntu Sans + Noto Sans Bengali, `display=swap`); dist CSS এ `--font-sans` টোকেন | ✅ |
| বাংলা সংখ্যা | grep: JSX এ কাঁচা সংখ্যা রেন্ডার — হিট শুধু URL/কী স্ট্রিং | ✅ প্রদর্শনে সব `toBanglaNumber`/`formatBanglaNumber` |
| ইংরেজি UI স্ট্রিং, TODO, console.log | grep | ✅ নেই |
| lazy/থাম্বনেইল | SafeImage `loading="lazy"`, `decoding="async"`; টেবিলে শুধু `*_thumb_url`, বড় ছবি লাইটবক্স/ভিউ মোডে | ✅ |
| build / tsc / lint | | ✅ শূন্য এরর, শূন্য সতর্কতা |
| SSR স্মোক | হোম, তালিকা, ভিউ (lazy fallback), এডমিন গার্ড, ৪০৪ | ✅ |
| সিরিয়াল সঠিকতা (কোড-পর্যালোচনা) | DB unique(project_type, serial_no); ছবির পাথ সবসময় DB থেকে আনা `record.serial_no` দিয়ে (uploadPhoto → getById); বাল্ক ছবি: (project, serial) → getBySerials → `record.id` তে আপলোড; ডুপ্লিকেট লক্ষ্য বাদ; changeSerial এ ফাইল সরানো + অডিট | ✅ |
| নিরাপত্তা (কোড-পর্যালোচনা) | RLS: SELECT সবাই, লেখা `is_housing_admin()`; Storage পলিসি একই; counters/admins/serial_changes API-অগম্য; `housing_change_serial` এডমিন-চেক; bulk-update security invoker; ক্লায়েন্ট `assertAdmin` শুধু UX | ✅ + `scripts/security-check.mjs` (ডাটাবেস হলে চালাতে হবে) |

### ২. এই ধাপে করা উন্নতি/ফিক্স
- **রুট-স্তরে code splitting**: ভিউ মোড ও সব এডমিন পেইজ `React.lazy` (`pages/lazyPages.tsx`) → পাবলিক মূল বান্ডল ৪৪৪ KB → ৩০২ KB (gzip ৯২ KB); এডমিন চাঙ্কগুলো ৪–২৯ KB; xlsx আগেই আলাদা।
- **হোম পেইজ** এখন housing এর `ProjectCard` ব্যবহার করে (ডুপ্লিকেট কার্ড কোড বাদ)।
- **Toast** টাইমার আনমাউন্টে বাতিল (মেমরি/সতর্কতা)।
- **`npm run security-check`**: anon key দিয়ে ১৩টি পরীক্ষা (পড়া খোলা; INSERT/UPDATE/DELETE, কাউন্টার, RPC-লেখা, Storage আপলোড বন্ধ; bucket public) — কোনো লেখা সফল হলে নিজে মুছে FAIL দেখায়।
- README হালনাগাদ।

### ৩. পর্যালোচনায় পাওয়া, ইচ্ছাকৃতভাবে রাখা (উন্নতির তালিকা, ভবিষ্যতের জন্য)
| # | বিষয় | কেন এখন নয় |
|---|---|---|
| ১ | ফর্মের ইনপুটে সাল/সিরিয়াল ASCII অঙ্কে দেখায় (বাংলা অঙ্ক টাইপ করলেও গ্রহণ করে) | সম্পাদনাযোগ্য ইনপুটে ASCII সাধারণ রীতি; প্রদর্শন সব বাংলায় |
| ২ | মডালে ফোকাস ট্র্যাপ নেই | Esc/ক্লোজ আছে; লাইব্রেরি ছাড়া ট্র্যাপ যোগ করা যায় পরে |
| ৩ | ডাটাবেস-স্তরের ডুপ্লিকেট-ব্যক্তি সতর্কতা (ইম্পোর্টে) নেই | ১৮০০ রেকর্ড টানতে হতো; প্রয়োজন হলে RPC |
| ৪ | বাল্ক ডিলেট ক্রমান্বয়ে | ৫০/পেইজ সীমায় গ্রহণযোগ্য |
| ৫ | `useAuth` একাধিক subscription | ছোট overhead; context এ তোলা যায় |
| ৬ | Safari (পুরনো) canvas WebP | Chrome/Edge/Firefox লক্ষ্য; স্ক্রিপ্ট-পথ প্রভাবিত নয় |
| ৭ | ব্র্যান্ড কালার/লোগো প্লেসহোল্ডার | ফাউন্ডেশনের অফিসিয়াল মান দিলে `index.css` টোকেনে বসবে |
| ৮ | গিটে এখনো কোনো কমিট নেই | ব্যবহারকারী বললে প্রথম কমিট (সব ফাইল আনট্র্যাকড; `.env*` ইগনোরড) |

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- ডাটাবেস জমা তালিকা (উপরে) সুপারিশকৃত ক্রমে; বিশেষত সারি ১৯ (`npm run security-check` — সব PASS) ও ২০ (ম্যানুয়াল যাচাই §৫)।
- চাইলে `git add -A && git commit -m "ঘর নির্মাণ প্রকল্প: ধাপ ০–১২"` (আমি নিজে কমিট করিনি)।

### ৫. ম্যানুয়াল যাচাই তালিকা (ডাটাবেস + লগইন হলে; মোবাইল ~৩৭৫px, ট্যাবলেট ~৭৬৮px, ডেস্কটপ ≥১০২৪px)
**বাংলা ও ফন্ট**
- DevTools → Elements → Computed → `font-family` তে বডি টেক্সটে "Noto Sans Bengali" (বাংলা) ও সংখ্যা/ল্যাটিনে "Ubuntu Sans" রেন্ডার; Network ট্যাবে fonts.gstatic.com থেকে দুটি ফন্ট লোড।
- সব সংখ্যা (স্ট্যাট, ক্রম, সিরিয়াল, সাল, "মোট X টির মধ্যে", পেইজ নম্বর, %) বাংলা অঙ্কে।
**লেআউট**
- মোবাইল: হেডারে হ্যামবার্গার; ল্যান্ডিং কার্ড উপর-নিচ; স্ট্যাট ২×২; ফিল্টার এক কলাম; তালিকা কার্ড লেআউট; ভিউ মোড পুরো পর্দা; তুলনা স্লাইডার টাচে; এডমিন টেবিল কার্ড; ইম্পোর্ট টেবিল অনুভূমিক স্ক্রল।
- ট্যাবলেট: স্ট্যাট ২×২, ফিল্টার ২ কলাম, তালিকা টেবিল (স্ক্রল)।
- ডেস্কটপ: স্ট্যাট ১×৪, ফিল্টার ৫ কলাম, টেবিল পূর্ণ, ভিউ মোড গোলাকার কার্ড।
**অবস্থা**
- লোডিং: স্ট্যাট skeleton, তালিকা skeleton (প্রথমবার) / হালকা (পেইজ বদলে), ভিউ skeleton, "লগইন যাচাই হচ্ছে…", lazy "লোড হচ্ছে…"।
- এরর: `.env.local` সরিয়ে → লাল বক্স, ক্র্যাশ নয়; ভুল সিরিয়াল URL → "রেকর্ড পাওয়া যায়নি"; ইম্পোর্টে নষ্ট ফাইল → বার্তা।
- খালি: ফিল্টারে মিল না থাকলে "কোনো তথ্য পাওয়া যায়নি"; রেকর্ড না থাকলে "এখনো কোনো রেকর্ড নেই"; ছবি না থাকলে প্লেসহোল্ডার / "ছবি নেই"।
**পারফরম্যান্স (১৮০০ রেকর্ড, ৩৬০০ ছবি)**
- তালিকা প্রতি পেইজ ১টি list কল (৫০ সারি, count exact) — Network এ ~১০০–২০০ ms; ফিল্টার বদলে ১টি কল (সার্চ ৫০০ ms debounce)।
- Network → Img: টেবিলে শুধু `_thumb.webp` (~২০ KB), স্ক্রল করলে lazy লোড; বড় `.webp` শুধু ভিউ মোড/লাইটবক্সে।
- Lighthouse (মোবাইল) তালিকা পেইজ: Performance ≥ ৮৫ প্রত্যাশিত (মূল JS gzip ~৯২ KB + supabase ~১৭ KB)।
**সিরিয়াল**
- SQL: `select project_type, count(*), count(distinct serial_no) from housing_beneficiaries group by 1;` → দুই সংখ্যা সমান।
- Storage: `housing/<project>/<0001>/` ফোল্ডারের নাম = রেকর্ডের সিরিয়াল; ভিউ মোডে ছবির URL এ একই সিরিয়াল।
- বাল্ক ছবি: `tin_0003_prev.jpg` দিলে প্রিভিউতে সিরিয়াল ৩ এর নামই দেখায়; ভুল সিরিয়াল → "রেকর্ড নেই", আপলোড হয় না।
**নিরাপত্তা**
- ইনকগনিটোতে (লগইন ছাড়া) `/housing/tin`, `/housing/tin/5` দেখা যায়; `/housing/admin` লগইনে পাঠায়; পেইজ সোর্স/Network এ শুধু anon key।
- `npm run security-check` সব PASS (INSERT 401/403, UPDATE/DELETE ০ সারি, RPC 42501, Storage আপলোড 403)।
- DevTools Console এ `localStorage` দেখলে শুধু Supabase সেশন (লগইন থাকলে) — কোনো service_role নেই।

### ৬. পরের ধাপে কী করতে হবে
- ডাটাবেস সেটআপ ও উপরের যাচাই → পাওয়া বাগ থাকলে ঠিক করা → ধাপ ১৩ (সার্ভারের তথ্য এলে)।

---

## ব্যবহার নির্দেশিকা (এডমিনের জন্য)

### ১. প্রথম সেটআপ (একবার)
1. ডাটাবেস জমা তালিকা (ফাইলের শুরুতে) সুপারিশকৃত ক্রমে সম্পন্ন করুন: Supabase প্রজেক্ট, সাইন-আপ বন্ধ, এডমিন ইউজার, SQL 01–07, নিজেকে `housing_admins` এ, `.env.local`।
2. `npm install && npm run dev` → `/housing/admin/login` এ লগইন।
3. `npm run security-check` → সব PASS।
4. ভাষা: হেডারের **বাং | EN** টগল; ব্রাউজারে মনে থাকে। কোডে নতুন লেখা যোগ করলে `src/i18n/en.ts` এ অনুবাদ + `npm run i18n-check`।

### ২. ডাটা ইম্পোর্ট (Google Sheet থেকে)
1. শীটে কলাম: সাল, উপকারভোগীর নাম, পিতা/স্বামীর নাম, বিভাগ, জেলা, উপজেলা, বিস্তারিত ঠিকানা, পূর্বের ঘরের ছবি (লিঙ্ক), বর্তমান ঘরের ছবি (লিঙ্ক); ঐচ্ছিক "সিরিয়াল" (দিলে সব সারিতে অনন্য সংখ্যা)।
2. File → Download → Microsoft Excel (.xlsx)। সেমিপাকা ও টিনের জন্য আলাদা শীট/ফাইল হলে সুবিধা (ইম্পোর্টে প্রকল্প বাছতে হয়)।
3. ~~প্রথম প্রকৃত ইম্পোর্টের আগে `08_reset_test_data.sql`~~ — ২০২৬-০৯-৩০ এ একবার চালানো হয়ে গেছে। এখন লাইভ ডাটা আছে, ফাইলটি `supabase/sql/dev/` এ গার্ডসহ; **আর কখনো চালাবেন না।**
4. `/housing/admin/import` → প্রকল্প → "নতুন যোগ করুন" → ফাইল → কলাম ম্যাপিং দেখে নিন; "খালি সাল/বিভাগ/জেলা/উপজেলা উপরের সারির মান" টিক থাকবে (শীটে সাল একবার লিখে নিচে খালি রাখলে দরকার) → প্রিভিউ: লাল সারি ঠিক করুন (শীটে ঠিক করে আবার আপলোড, বা ভৌগোলিক নাম প্যানেলে সঠিক নাম বেছে) → "N টি সারি যোগ করুন"।
5. প্রথমবার ২০–৫০ সারি দিয়ে পরীক্ষা করুন, তালিকায় দেখুন, তারপর পুরো ফাইল।
6. রেকর্ড পেইজে **"সিরিয়াল সহ এক্সপোর্ট (CSV)"** → Google Sheet এ File → Import → সিরিয়াল কলাম শীটে বসান (ভবিষ্যতের আপডেটে এই সিরিয়ালই ব্যবহার হবে)।
7. পরে শীটে তথ্য বদলালে: একই পেইজে "সিরিয়াল ধরে আপডেট করুন" মোডে ফাইল দিন → শুধু বদলানো ফিল্ড আপডেট হয়; না-মেলা সিরিয়াল আলাদা দেখায়।

### ৩. ছবি আপলোড ও সিরিয়াল ধরে আপডেট
**ক. প্রথমবার, শীটের লিঙ্ক থেকে (স্ক্রিপ্ট, আপনার কম্পিউটারে):**
1. ইনকগনিটো উইন্ডোতে ২–৩টি লিঙ্ক খুলে দেখুন ছবি দেখায় কি না (লগইন পেইজ এলে শেয়ার সেটিং "Anyone with the link")।
2. প্রজেক্ট রুটে `.env`: `SUPABASE_URL=…`, `SUPABASE_SERVICE_ROLE_KEY=…` (Project Settings → API → service_role; এই ফাইল কাউকে দেবেন না, গিটে যায় না)।
3. **সবচেয়ে সহজ — CSV লাগে না**, ইম্পোর্ট করা রেকর্ডের লিঙ্ক থেকেই: `npm run migrate-photos -- --from-db --project semi_pucca --dry-run` (কী কী ছবি তোলা হবে দেখায়; anon key দিয়েই চলে) → ঠিক থাকলে `--dry-run` বাদ দিয়ে চালান (তখন `.env` এ service_role লাগবে)। টিনের জন্য `--project tin`। বিকল্প: `--csv data/semi.csv` (এক্সপোর্ট CSV)।
4. শেষে `failed.csv` দেখুন; কারণ ঠিক করে আবার চালান (আগে হওয়াগুলো নিজে বাদ পড়ে)।
5. লিঙ্ক কাজ না করলে (লগইন লাগলে — ২০২৬-০৯-৩০ পরীক্ষায় ব্যবহারকারীর লিঙ্ক Microsoft লগইনে পাঠায়, তাই এটিই মূল পথ): OneDrive এ "ঘর নির্মাণ-…" মূল ফোল্ডারটি Download (zip) → আনজিপ (যেমন `D:\Charity Website\photos\`, গিটে যায় না) → `npm run migrate-photos -- --from-db --project semi_pucca --dry-run --local-root "D:/Charity Website/photos"` — প্রতিটি ছবির পাশে "লোকাল কপি: …" দেখাবে (⚠ থাকলে ফোল্ডার/পাথ মিলছে না) → ঠিক থাকলে `--dry-run` ছাড়া। স্ক্রিপ্ট লিঙ্কের ফোল্ডার-পাথ ধরে ছবি খুঁজে নেয়, ফাইলের নাম বদলাতে হয় না। বিকল্প: ছবি `semi_0007_prev.jpg` নামে রেখে `--local-folder ./photos --project semi_pucca`।

**খ. পরে ছবি আপডেট/যোগ (ব্রাউজারে):**
- **একটি রেকর্ড:** রেকর্ড পেইজ → "এডিট" → পূর্বের/বর্তমান ছবির ঘরে নতুন ছবি টেনে ছাড়ুন → "সংরক্ষণ করুন" → পুরনো ছবি একই সিরিয়াল-পাথে প্রতিস্থাপিত।
- **অনেক রেকর্ড:** ছবিগুলোর নাম `semi_0001_prev.jpg` / `tin_0012_current.png` (বা `0001_current.jpg` + প্রকল্প ড্রপডাউন) → `/housing/admin/photos` এ সব টেনে ছাড়ুন → প্রিভিউতে কোন ছবি কার সাথে মিলেছে, "ওভাররাইট হবে" ব্যাজ দেখুন → নিশ্চিত করুন → রিপোর্ট।
- ছবি স্বয়ংক্রিয়ভাবে ১৬০০px WebP + ৪০০px থাম্বনেইল হয়; ক্যাশ নিজে ভাঙে (`?v=`)।

### ৪. রেকর্ড যোগ/এডিট/ডিলেট
- `/housing/admin` → প্রকল্প ট্যাব → "নতুন যোগ করুন" (সিরিয়াল স্বয়ংক্রিয়, চাইলে হাতে) / সারিতে "এডিট" / "ডিলেট" (নিশ্চিতকরণ; ছবিও মুছে; সিরিয়াল আর ব্যবহার হয় না) / একাধিক চেকবক্স → "নির্বাচিতগুলো মুছুন"।
- খোঁজার বক্সে সংখ্যা লিখলে সিরিয়াল ধরে, নাম লিখলে নামে।
- সিরিয়াল বদলাতে হলে এডিট ফর্মে "সিরিয়াল বদলান…" (সতর্কতা: পুরনো লিঙ্ক ভাঙে; ছবি নতুন পাথে সরে; লগে থাকে)।

### ৫. নতুন এডমিন যোগ / বাদ
1. Supabase Dashboard → Authentication → Users → Add user (ইমেইল, পাসওয়ার্ড, Auto Confirm)।
2. SQL Editor:
   ```sql
   insert into public.housing_admins (user_id, email, role)
   select id, email, 'admin' from auth.users where email = 'নতুন@ইমেইল' on conflict (user_id) do nothing;
   ```
3. বাদ দিতে: `delete from public.housing_admins where email = '…';` (ও চাইলে Users থেকে মুছুন)। সাইন-আপ সবসময় বন্ধ থাকবে।

### ৬. ডিপ্লয় (ফ্রন্টএন্ড, Supabase ব্যাকএন্ডে)
1. `.env.production` (গিটে নয়) বা হোস্টিংয়ের env সেটিংসে: `VITE_HOUSING_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon, service_role নয়)।
2. `npm run build` → `dist/` স্ট্যাটিক হোস্টিংয়ে (Netlify/Vercel/Cloudflare Pages/nginx)। **SPA fallback আবশ্যক:** সব পাথ → `index.html` (Netlify: `_redirects` এ `/* /index.html 200`; nginx: `try_files $uri /index.html`)।
3. Supabase → Authentication → URL Configuration → Site URL = সাইটের ডোমেইন।
4. আপডেট পদ্ধতি: কোড বদল → `npm run build` → নতুন `dist/` আপলোড (ক্যাশ: Vite ফাইলনামে হ্যাশ, `index.html` no-cache)।
5. নিজস্ব সার্ভারে যাওয়ার সময় (ধাপ ১৩): শুধু `VITE_HOUSING_BACKEND=rest` ও `VITE_API_BASE_URL`; UI কোড অপরিবর্তিত।

### ৭. ব্যাকআপ (Supabase পর্যায়ে)
- ডাটা: মাসে/সপ্তাহে "সিরিয়াল সহ এক্সপোর্ট" CSV সংরক্ষণ (দুই প্রকল্প); Supabase Pro হলে স্বয়ংক্রিয় daily backup।
- ছবি: Storage → housing-photos → ফোল্ডার ডাউনলোড, বা `supabase` CLI দিয়ে bucket সিঙ্ক (ধাপ ১৩ এ স্ক্রিপ্ট)।

---

## ধাপ ১৩ — নিজস্ব সার্ভারে স্থানান্তর — ⏸ অপেক্ষমাণ (সার্ভারের তথ্য পাওয়া যায়নি)
- **তারিখ:** ২০২৬-০৯-২৯ (প্রম্পট পাওয়া গেছে; কাজ শুরু হয়নি)
- **স্ট্যাটাস:** শুরু হয়নি — ব্যবহারকারীর সিদ্ধান্ত: সার্ভারের বিবরণ পাওয়ার পরে। নিয়ম: প্রযুক্তি অজানা থাকলে আন্দাজ নয়, প্রশ্ন।

### ক. সার্ভার-দলের কাছ থেকে যে তথ্য লাগবে (এগুলো পেলে ধাপ ১৩ শুরু হবে)
| # | প্রশ্ন | কেন লাগবে |
|---|---|---|
| ১ | ব্যাকএন্ডের ভাষা/ফ্রেমওয়ার্ক (Node/Express বা Fastify, PHP/Laravel, Python/Django বা FastAPI, .NET, Java …) ও সংস্করণ | পূর্ণ ব্যাকএন্ড কোড ঐ ভাষায় লিখতে হবে |
| ২ | ডাটাবেস (PostgreSQL / MySQL / MariaDB) ও সংস্করণ | স্কিমা: Postgres হলে `supabase/sql/01`, `02`, `07` প্রায় হুবহু; MySQL হলে ট্রিগার/ফাংশন নতুন করে |
| ৩ | ওয়েব সার্ভার/রিভার্স প্রক্সি (nginx / Apache / IIS), HTTPS সার্টিফিকেট কীভাবে (Let's Encrypt?) | ছবির স্ট্যাটিক ডেলিভারি + ক্যাশ হেডার, CORS, HTTPS |
| ৪ | ছবি রাখার জায়গা (লোকাল ডিস্ক পাথ, S3-সামঞ্জস্য স্টোরেজ, অন্য) ও পাবলিক URL কীভাবে (যেমন `https://api.../photos/…`) | ImageStorage বাস্তবায়ন, পাথ নিয়ম `housing/{project}/{0001}/…webp` |
| ৫ | ডোমেইন: ফ্রন্টএন্ড কোথায় হোস্ট হবে (একই সার্ভারে নাকি আলাদা) ও API এর URL | CORS origin, `VITE_API_BASE_URL`, কুকি না JWT (একই ডোমেইন হলে কুকি সহজ) |
| ৬ | ডিপ্লয় অ্যাক্সেস: SSH আছে? প্রসেস ম্যানেজার (pm2/systemd/Docker)? CI আছে? | ডিপ্লয় নির্দেশিকা ও আপডেট পদ্ধতি |
| ৭ | ব্যাকএন্ড কে লিখবে — আমি (Claude) নাকি সার্ভার-দল `docs/API_CONTRACT.md` দেখে? | দুটোই সম্ভব; কে লিখবে তার উপর ধাপের আকার নির্ভর করে |
| ৮ | ব্যাকআপ নীতি: কোথায় (অন্য মেশিন/ক্লাউড), কত ঘন ঘন, কে দেখে | ব্যাকআপ স্ক্রিপ্ট/ক্রন |
| ৯ | লগ ও মনিটরিং: কোথায় লগ রাখা হয়, কেউ দেখে কি | লগ কনফিগ |
| ১০ | সার্ভারের সম্পদ (RAM/ডিস্ক) ও ছবির জন্য জায়গা (~১–২ GB লাগবে, ধাপ ৭ হিসাব — এখন একাধিক প্রকল্প, তাই প্রতি প্রকল্পে আলাদা হিসাব) | সক্ষমতা |

### খ. ইতিমধ্যে প্রস্তুত (সার্ভার-নিরপেক্ষ)
- `docs/API_CONTRACT.md` **v১.৪** (পর্ব ২, M-ধাপ ১৬ অনুযায়ী; বহু-প্রকল্পের চুক্তি **v১.০** থেকে — প্রকল্প, ফিল্ড, গোপন মান, ওভারভিউ, `/api/projects/:key/...` পাথ; পরের সংস্করণে গোপনসহ এক্সপোর্ট, বাল্ক-আপডেটের নিয়ম, ক্লায়েন্ট-ইভেন্ট, কভার ছবি) — সব endpoint, JSON, ভ্যালিডেশন, এরর, অনুমতি, ছবির পাথ, অথ (JWT/কুকি) — সার্ভার-দল এটি দেখে সরাসরি বানাতে পারে। পুরনো v০.৯ এর পাথ → নতুন পাথ: চুক্তির §৯।
- ফ্রন্টএন্ড REST অ্যাডাপ্টার: `rest/http.ts` (fetch helper), `rest/authProvider.ts` (**পূর্ণ**), `rest/endpoints.ts` (সব পাথ); `rest/index.ts` এ HousingApi/ProjectsApi/ImageStorage stub (প্রতিটি মেথডের পাশে endpoint লেখা) — চুক্তি মেনে পূরণ করলেই `VITE_HOUSING_BACKEND=rest` দিয়ে UI অপরিবর্তিত চলবে।
- পোর্টেবল SQL: `01_schema.sql`, `02_serial.sql` (ট্রিগার/RPC), `07_rpc_bulk.sql` — Postgres হলে সরাসরি; বহু-প্রকল্পের `10`–`13` (প্রকল্প, ফিল্ড, গার্ড, project_stats, লগ) ও Postgres-ই, তবে সেগুলোর অনুমতি Supabase এর RLS/`auth.uid()` এ — নিজস্ব সার্ভারে একই নিয়ম সার্ভার-কোডে (চুক্তির অনুমতি-টেবিল)।
- মাইগ্রেশন স্ক্রিপ্ট `scripts/migrate-photos.mjs` অ্যাডাপ্টার-ভিত্তিক — REST অ্যাডাপ্টার এলে ফ্যাক্টরি বদলালেই চলবে।
- Supabase → নিজস্ব সার্ভার ডাটা সরানোর ভিত্তি: "সিরিয়াল সহ এক্সপোর্ট" CSV (সব ফিল্ড + রেকর্ড আইডি) ও ইম্পোর্ট উইজার্ড (`use_given_serial`); ছবি: bucket থেকে একই পাথে কপি (ধাপ ১৩ এ স্ক্রিপ্ট)।

### গ. ধাপ ১৩ এর সম্ভাব্য উপ-ধাপ (তথ্য পেলে)
১৩.১ REST HousingApi + ImageStorage (ফ্রন্টএন্ড) — সার্ভার-নিরপেক্ষ, আগে করা যায়; ১৩.২ ব্যাকএন্ড কোড + স্কিমা; ১৩.৩ অথ/নিরাপত্তা; ১৩.৪ ছবি স্টোরেজ/ডেলিভারি; ১৩.৫ ডাটা ও ছবি স্থানান্তর স্ক্রিপ্ট; ১৩.৬ ডিপ্লয়/ব্যাকআপ/লগ নির্দেশিকা; ১৩.৭ যাচাই তালিকা।

---

# পর্ব ২ — বহু-প্রকল্প প্ল্যাটফর্ম (M-ধাপ)

> শুরু: ২০২৬-১০-০৪। পরিকল্পনা (আসল কপি): `docs/MULTI_PROJECT_PLAN.md` — ১৬টি ধাপ (M-ধাপ ১–১৬, ৫ক/৫খ)। প্রতিটি M-ধাপের আগে পরিকল্পনা আর এই ফাইল পড়তে হবে।
> লক্ষ্য: এডমিন প্যানেল (`/admin`) থেকে বাংলা/ইংরেজি নামসহ নতুন প্রকল্প, নিজস্ব ফিল্ড, ছবির ধরন (আগে-পরে / শুধু পরে), ঠিকানা ইউনিয়ন পর্যন্ত, প্রকল্পভিত্তিক স্ট্যাট (মোট টাকা, মোট ক্যাটাগরি); URL `/housing`, `/self-reliance`, `/skill-based-entrepreneur`; হোম পেইজে সব প্রকল্পের ডায়নামিক কার্ড।

## পর্ব ২ সারসংক্ষেপ (২০২৬-১০-০৬, M-ধাপ ১৬)

**কোডের সব ধাপ (M-ধাপ ১–১৬) শেষ।** সাইট এখন একাধিক প্রকল্প চালায়: প্রকল্প, ফিল্ড, স্ট্যাট কার্ড, ছবি মোড, ঠিকানার স্তর — সব এডমিন প্যানেল থেকে; নতুন প্রকল্প প্রকাশ করলে কোড ছাড়াই পাতা, মেনু ও হোমের কার্ড আসে। ঘর নির্মাণ (সেমিপাকা/টিন) দেখতে আগের হুবহু (প্রতি ধাপে পিক্সেল-তুলনা), লাইভ ডাটা অক্ষত (`npm run baseline-check`: বেসলাইনের ফিঙ্গারপ্রিন্ট হুবহু)।

| অংশ | কী হলো | ধাপ |
|---|---|---|
| ডাটাবেস | প্রকল্প রেজিস্ট্রি, কাস্টম ফিল্ড, গোপন মান, গার্ড, `project_stats`/`projects_overview`, লগ v2 — লাইভে চালানো ও যাচাই (সারি ২৪–৩০ ✅) | M-১–৩ |
| ব্যাকএন্ড স্তর | `src/backend` (Supabase + REST stub), পুরনো-ডাটাবেস ফলব্যাক, API চুক্তি v১.০ → **v১.৪** | M-৪ |
| ভিত্তি | প্রকল্প রেজিস্ট্রি, `pick()/lt()`, ফিল্ড-টাইপ রেজিস্ট্রি, টাকা (৳), রেজিস্ট্রি-চালিত রাউট | M-৫–৬ |
| এডমিন প্যানেল | ড্যাশবোর্ড, উইজার্ড, সেটিংস, ফিল্ড ও স্ট্যাট কার্ড বিল্ডার, রেকর্ড ফর্ম/তালিকা/CSV, ইম্পোর্ট, ছবি বাল্ক, একটিভিটি লগ, কভার ছবি | M-৭–১২, ১৫ |
| ঠিকানা | ইউনিয়নের তালিকা (৪,৫৩৭টি) ও নির্বাচক | M-৯ |
| পাবলিক পাতা | জেনেরিক তালিকা (চার্ট, ইউনিয়ন/ক্যাটাগরি ফিল্টার), বিস্তারিত (ছবি মোড অনুযায়ী), নতুন হোম (এক কলে) | M-১৩–১৫ |
| চালু ও যাচাই | `remove_demo_project.sql`, `baseline-check`, smoke-এ প্রকাশিত সব প্রকল্প, README ও এডমিন নির্দেশিকা | M-১৬ |

**আপনার বাকি কাজ** (বিস্তারিত M-ধাপ ১৬ → §৪): ~~সারি ৩৪ (SQL ১৩)~~ ✅, সারি ৩২ (পরীক্ষা প্রকল্প), **সারি ৩৩ (স্বাবলম্বী ও দক্ষতা ভিত্তিক চালু)**, তারপর সারি ৩০ আবার; প্রশ্ন ১৫ (হিরোর লেখা), ২ ও ১৭; হাতে-দেখার তালিকা। এডমিনদের জন্য: `docs/ADMIN_GUIDE.md`। পুরনো ধাপ ১৩ (নিজস্ব সার্ভার) এখনো স্থগিত — চুক্তি v১.৪ প্রস্তুত।

### ব্যবহারকারীর সিদ্ধান্ত (পরিকল্পনা §১২-এ লগ)
| প্রশ্ন | সিদ্ধান্ত | তারিখ |
|---|---|---|
| ১৪ — SQL কখন | **পথ ক:** সারি ২৫–৩০ চালানো হবে M-ধাপ ২ ও ৩-এর শেষে (ব্যাকআপ ও যাচাইসহ) | ২০২৬-১০-০৫ |
| ১৮ — git | "এই প্রজেক্টেই git করো" → এই রিপোর `main`-এই কাজ (আলাদা ব্রাঞ্চ নয়); প্রতি ধাপে লোকাল কমিট; push শুধু বললে; `puppeteer-core` devDependency | ২০২৬-১০-০৫ |
| ৫ — ক্যাটাগরি | আলাদা তালিকা নয়; শীটের "ক্যাটাগরি" কলামের মানই ক্যাটাগরি (ফিল্ড ধরন `category`) | ২০২৬-১০-০৫ |
| বাকি ১৭টি | পরিকল্পনার সুপারিশকৃত ডিফল্ট (যে ধাপে লাগবে, সেখানে জানানো হবে) | — |

## M-ধাপ ১ — প্রস্তুতি, বেসলাইন ও পরীক্ষার টুল (২০২৬-১০-০৫) ✅

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন:
- `docs/MULTI_PROJECT_PLAN.md` — ডেস্কটপের পরিকল্পনার কপি (v3, আপনার উত্তরসহ); হেডারে "আসল কপি" ও অবস্থা, পরিশিষ্ট ক-তে সারি ২৩ক।
- `supabase/sql/checks/00_baseline.sql` — শুধু পড়ে; একটিই ফলাফল-টেবিল: 09 চালানো আছে কি না, প্রতি প্রকল্পে রেকর্ড সংখ্যা/সর্বোচ্চ সিরিয়াল/**ডাটা-ফিঙ্গারপ্রিন্ট** (পুরনো কলাম, UTC — মাইগ্রেশনের পরেও একই আসবে), ছবিওয়ালা রেকর্ড, কাউন্টার, লগের সংখ্যা ও সর্বোচ্চ id, সিরিয়াল-বদলের লগ, `housing_stats(null)` (total, md5, JSON), **স্কিমা-ফিঙ্গারপ্রিন্ট** (কলাম/constraint/পলিসি/ফাংশন/ট্রিগার), Storage ফাইল সংখ্যা।
- `supabase/sql/09a_fix_photo_log.sql` — **পরিকল্পনার বাইরের জরুরি ফিক্স** (নিচে §২)।
- `scripts/photo-check.mjs` (`npm run photo-check`) — anon হিসেবে সব ছবির URL (সাইটের মতো `?v=` সহ) এ HEAD; প্রকল্পভিত্তিক সারসংক্ষেপ।
- `scripts/smoke.mjs` (`npm run smoke`) — ইনস্টল করা Chrome/Edge দিয়ে ৩৬০/৩৯০/৭৬৮/১০২৪/১২৮০px × বাংলা/ইংরেজি: হোম, `/housing`, সেমিপাকা ও টিন তালিকা, বিস্তারিত মডাল, এডমিন লগইন, একটি অবৈধ URL (404 আসা চাই); ফোন-প্রস্থে touch এমুলেশন; তালিকায় মানচিত্র খুলে ২০টি ট্যাপ/ক্লিক। পরীক্ষা: অনুভূমিক ওভারফ্লো, console/page error, ভুল 404, লাল ErrorBoundary, "লোড করা যায়নি", সাদা পেইজ। `--baseline` (`.smoke/baseline/`, পুরনোটি থাকলে `--force` লাগে), `--quick`, `--base`, `--widths`, `--langs`। `--legacy` (M-ধাপ ৪): পুরনো-ডাটাবেস মোড।

পরিবর্তিত:
- `supabase/sql/06_seed.sql` → `supabase/sql/dev/06_seed.sql`, `08_reset_test_data.sql` → `dev/08_reset_test_data.sql` (`git mv`); দুটিতেই **গার্ড**: টেবিলে রেকর্ড থাকলে ফাইল নিজেই থেমে যায় (`raise exception`, ট্রানজেকশনসহ — কিছুই বদলায় না); ইচ্ছাকৃত হলে `set asf.confirm_seed/confirm_reset = 'YES'`।
- `supabase/sql/09_activity_log.sql` — একই বাগ মূল ফাইলেও ঠিক করা (নতুন সেটআপে সমস্যা না হয়)।
- `scripts/security-check.mjs` — ১৪ → **১৬টি** পরীক্ষা: anon একটিভিটি লগ পড়তে পারে না; anon `housing_log_event` চালিয়ে লগে লিখতে পারে না। টেবিল/ফাংশন না থাকলে FAIL নয়, **SKIP** (সারি ২৩-এর নির্দেশনাসহ, exit 3)।
- `package.json` — `photo-check`, `smoke` স্ক্রিপ্ট; `puppeteer-core` (devDependency)। `.gitignore` — `.smoke/`।
- `supabase/README.md` (চালানোর ক্রম: dev/, checks/, 09a), `README.md` (নতুন স্ক্রিপ্ট), এই ফাইল (উপরের চেকলিস্টে সারি ২৩ ✅, ২৩ক, পর্ব ২ সারি ২৪–৩৩; ফোল্ডার কাঠামো; ব্যবহার নির্দেশিকায় 08-এর সতর্কতা; ধাপ ১৩-এ চুক্তি ০.৮ → ০.৯)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **বাগ পাওয়া গেছে (পরিকল্পনার বাইরে, জরুরি):** বেসলাইন যাচাই করতে লোকাল Postgres (PGlite, WASM) এ SQL ০১–০৯ চালানো হয়েছিল। তখন দেখা গেল, 09-এর লগ-ট্রিগারে `photo_kinds := photo_kinds || 'current'` — Postgres `'current'` কে অ্যারে হিসেবে পড়তে চায় (`text[] || unknown` → array_cat) → `malformed array literal`। ট্রিগার AFTER UPDATE, তাই ত্রুটিতে **পুরো আপডেট বাতিল**: 09 লাইভে চালানো থাকায় এখন রেকর্ডের ছবি যোগ/বদল/মোছা (এডমিন ফর্ম, ছবির বাল্ক আপলোড, `migrate-photos`) ব্যর্থ হওয়ার কথা। ছবি ছাড়া অন্য ফিল্ড বদল, নতুন রেকর্ড, মোছা — এগুলো ঠিক চলে। ফিক্স: `array_append(...)`। লোকালে পুরনো 09 দিয়ে বাগ পুনরুৎপাদন → 09a চালানো → ছবি বদল সফল — যাচাই করা হয়েছে। 09a নিজেই একটি রেকর্ডের ছবির লিংক সাময়িক বদলে পরীক্ষা করে আবার ফিরিয়ে দেয় (সাব-ট্রানজেকশন রোলব্যাক; লাইভ ডাটা ও লগে কিছু থাকে না); পরীক্ষা ব্যর্থ হলে ফিক্সও বসে না।
- **বেসলাইনেও একটি টাইপ-ভুল লোকালে ধরা পড়েছে ও ঠিক করা হয়েছে** (`contype` "char" → `::text`) — আপনাকে দেওয়া ফাইলটি লোকাল Postgres-এ চালিয়ে দেখা: ১৪টি সারি, দুবার চালালে হুবহু একই মান, 09 না থাকলে স্পষ্ট বার্তা।
- **09 লাইভে আছে:** `security-check`-এ anon `housing_log_event` ডাকলে "অনুমতি নেই" (42501) আসে — ফাংশনটি আছে; লগ-টেবিলও আছে (anon ০ সারি পায়)। তাই সারি ২৩ ✅ ধরা হয়েছে; বেসলাইনের সারি ২ চূড়ান্তভাবে নিশ্চিত করবে।
- **dev ফাইলে গার্ড, মুছে ফেলা নয়:** খালি টেস্ট ডাটাবেস বানাতে seed/reset কাজে লাগতে পারে; গার্ড লাইভে ভুল চালানো আটকায় (লোকালে যাচাই: ২০ রেকর্ডে দুটিই থামে, রেকর্ড অক্ষত)।
- **smoke টেস্ট ডাটাবেসে কিছু লেখে না**, লগইন করে না; মানচিত্র-ট্যাপের বিন্দুগুলো নির্ধারিত (প্রতিবার একই), তাই ফল তুলনীয়। বিস্তারিত পেইজের সিরিয়াল anon দিয়ে ডাটাবেস থেকে নেয় (`.env.local`)।
- `security-check` এ "টেবিল নেই" কে FAIL না ধরে SKIP — নিরাপত্তা-ত্রুটি আর "SQL চালানো বাকি" আলাদা থাকে।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- সারি ২৩ক (09a) চালানো না হওয়া পর্যন্ত লাইভে ছবি বদল ব্যর্থ থাকবে।
- বেসলাইনের মান (সারি ২৪) পাওয়ার পর M-ধাপ ২-এ `checks/10_verify.sql` এ বসানো হবে। M-ধাপ ১ আর SQL ১০ চালানোর মাঝে পুরনো প্যানেলে রেকর্ড যোগ/এডিট করলে বেসলাইন আবার নিতে হবে।
- একটিভিটি লগের সর্বোচ্চ id-তে ফাঁক থাকতে পারে (রোলব্যাক হওয়া পরীক্ষাও sequence-এর একটি সংখ্যা খরচ করে) — এটি স্বাভাবিক; তুলনা হবে মোট সারি ও সর্বোচ্চ id দিয়ে, আর রোলব্যাক কোনো সারি রাখে না।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. **সারি ২৩ক (জরুরি):** SQL Editor-এ `supabase/sql/09a_fix_photo_log.sql` পুরোটা চালান (পরিকল্পনা §১.৩-এর নিয়মে)। শেষে একটি সারি আসবে: "✅ ছবি-লগ ফিক্স বসেছে…"। লাল ত্রুটি এলে পুরো বার্তা পাঠান।
2. **সারি ২৪:** `supabase/sql/checks/00_baseline.sql` পুরোটা চালান। ১৪টি সারির টেবিল আসবে; পুরো টেবিল কপি করে (বা স্ক্রিনশট) পাঠান। সারি ২-এ "✅ হ্যাঁ" দেখবেন।
3. নিজের কম্পিউটারে: এক টার্মিনালে `npm run dev`, আরেকটিতে `npm run smoke -- --quick` (প্রায় ৩০ সেকেন্ড) — সব PASS দেখবেন। (পুরো বেসলাইন AI নিয়ে রেখেছে: `.smoke/baseline/`।)
4. M-ধাপ ২-এর আগ পর্যন্ত পুরনো প্যানেলে রেকর্ড যোগ/এডিট না করাই ভালো (করলে জানাবেন — বেসলাইন আবার নিতে হবে)।

### ৫. কিভাবে টেস্ট করতে হবে (AI-এর চালানো ফল, ২০২৬-১০-০৫)
| গেট | ফল |
|---|---|
| `npm run security-check` | PASS ১৬, FAIL ০ |
| `npm run photo-check` | ৮টি URL (৪টি ছবি + থাম্ব) সব 200 `image/webp` |
| `npm run smoke -- --baseline` | PASS ৭৪ (৭০ পেইজ + ৪ মানচিত্র-ট্যাপ), FAIL ০ — `.smoke/baseline/` |
| লোকাল Postgres (PGlite): SQL ০১–০৯ + dev গার্ড + 09a + বেসলাইন | বাগ পুনরুৎপাদিত ও ঠিক; গার্ড থামায়; বেসলাইন স্থির |
| `npx tsc -b`, `npm run lint`, `npm run build`, `npm run i18n-check` | পাস (কমিটের আগে) |

### বেসলাইন মান (লাইভ ডাটাবেস, ২০২৬-১০-০৫ ০৪:৩১ UTC — ব্যবহারকারীর চালানো `00_baseline.sql`)
M-ধাপ ২-এ এই মানগুলো `checks/10_verify.sql` এ বসবে, আর প্রতিটি মাইগ্রেশন ফাইল এগুলোর সাথে মিলিয়ে দেখবে। SQL ১০ চালানোর আগে পুরনো প্যানেলে রেকর্ড যোগ/এডিট হলে বেসলাইন আবার নিতে হবে।

| # | বিষয় | মান |
|---|---|---|
| ২ | 09_activity_log.sql চালানো | ✅ হ্যাঁ |
| ১১ | রেকর্ড: semi_pucca | ১০টি · সর্বোচ্চ সিরিয়াল ১০ · fingerprint `00d0caccb068e709ba485e5b620d065b` |
| — | রেকর্ড: tin | ০টি (সারি আসেনি — প্রত্যাশিত) |
| ২০ | ছবি আছে এমন রেকর্ড (পূর্বের / বর্তমান) | ১ / ৩ |
| ৩১ | কাউন্টার: semi_pucca | ১০ |
| ৩২ | কাউন্টার: tin | ০ |
| ৪০ | একটিভিটি লগ (মোট সারি · সর্বোচ্চ id) | ২ · ২ |
| ৪১ | সিরিয়াল-বদলের লগ | ০ |
| ৫০ | `housing_stats(null)`: total | ১০ |
| ৫১ | `housing_stats(null)`: md5 | `a93bfa85500c86b0e79db9cd201c2776` |
| ৫২ | `housing_stats(null)`: JSON | `{"total": 10, "by_year": {"2024": 10}, "distinct": {"upazilas": 1, "districts": 1, "divisions": 1}, "by_upazila": {"মীরসরাই": 10}, "by_district": {"চট্টগ্রাম": 10}, "by_division": {"চট্টগ্রাম": 10}, "by_location": {"চট্টগ্রাম\|মীরসরাই": 10}}` |
| ৬০ | স্কিমা-ফিঙ্গারপ্রিন্ট | `b9468dd07eb1d3aeb006ccfce8eab643` (৮৩ আইটেম) |
| ৭০ | Storage: housing-photos এ ফাইল | ৮ |

সামঞ্জস্য-যাচাই (AI): রেকর্ড ১০ = কাউন্টার ১০ = সর্বোচ্চ সিরিয়াল ১০; ছবি ১+৩ = ৪টি, প্রতিটির থাম্বসহ ৮টি ফাইল = Storage ৮ = `photo-check` এর ৮টি URL; লগে মাত্র ২টি সারি — অর্থাৎ 09 চালানোর পর থেকে কোনো রেকর্ড বদল হয়নি, তাই ছবি-লগ বাগ এখনো কোনো কাজ আটকায়নি। 09a (সারি ২৩ক) এই মানগুলোর কোনোটি বদলায় না (ফাংশনের বডি স্কিমা-ফিঙ্গারপ্রিন্টে নেই; তার পরীক্ষা রোলব্যাক হয়), তাই আগে বা পরে চালানো দুটোই ঠিক।

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ২** — SQL ১০ ও ১০b (প্রকল্প রেজিস্ট্রি, `union_name`/`extra`, গোপন ফিল্ডের টেবিল, যাচাই-ট্রিগার, গার্ড, RLS) + ব্যাকআপ/verify/selftest/rollback ফাইল। বেসলাইনের ফলাফল (সারি ২৪) আগে লাগবে।
- পেস্ট করুন: `M-ধাপ ২ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ২ — SQL ১০ ও ১০b: প্রকল্প রেজিস্ট্রি, সম্প্রসারণ আর গার্ড (২০২৬-১০-০৫) — ✅ সম্পন্ন (লাইভে চালানো ও যাচাই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন (সব `supabase/sql/` এর ভেতরে):
- `10_projects.sql` — **শুধু সম্প্রসারণ**, এক ট্রানজেকশনে, ভেতরে আগে-পরে ফিঙ্গারপ্রিন্ট মেলানো (না মিললে সব বাতিল), idempotent। পূর্বশর্ত: 09 ও **09a** চালানো (না থাকলে বাংলা বার্তায় থামে)।
  - `projects` (পরিকল্পনা §৫.২-এর সব কলাম, CHECK সহ) + seed: `housing` (গ্রুপ, প্রকাশিত) → `semi_pucca`, `tin` (প্রকাশিত, ছবি মোড আগে-পরে, প্রিফিক্স `semi`/`tin`, একক "ঘর/houses", নাম-বর্ণনা হুবহু `projectType.ts`/`en.ts` থেকে; স্ট্যাট কার্ড এখনকার মতো — তালিকায় "মোট উপকারভোগী/বিভাগ/জেলা/উপজেলা", হোমে `home_label` দিয়ে "মোট ঘর নির্মাণ/জেলা কভার/উপজেলা কভার")।
  - `project_fields` (§৫.৩; ধরন: text, long_text, number, money, **category** (শীটের মুক্ত লেখা), date, phone; phone সবসময় গোপন; গোপন ফিল্ড টেবিল/কার্ড/ফিল্টার/সার্চে যেতে পারে না — CHECK)।
  - `beneficiary_private` (গোপন মান; RLS: শুধু এডমিন; anon এর টেবিল-অনুমতিই নেই)।
  - `housing_beneficiaries`: `project_type` → `projects(key)` FK, তারপর পুরনো CHECK বাদ; `union_name` (text, '') ও `extra` (jsonb, {}, ১৬ KB সীমা) কলাম; ৪টি ইনডেক্স (GIN extra, প্রকল্প+জেলা+উপজেলা, প্রকল্প+ইউনিয়ন, প্রকল্প+তৈরির সময়)।
  - `public_project_keys()` (DEFINER) — প্রকাশিত প্রকল্প, যার গ্রুপও প্রকাশিত।
  - RLS: রেকর্ড পড়ার পুরনো `using (true)` পলিসির বদলে `housing_beneficiaries_read` — প্রকাশিত প্রকল্পের রেকর্ড সবাই, খসড়া শুধু এডমিন। projects/project_fields: প্রকাশিত (ও পাবলিক ফিল্ড) সবাই, বাকি এডমিন; লেখা শুধু এডমিন।
  - `asf_meta` স্কিমা (API-তে খোলা নয়): `data_fingerprint()`, `schema_fingerprint()` — বেসলাইনের হুবহু হিসাব; verify/selftest/মহড়া এগুলো ব্যবহার করে।
- **ব্যবহারকারীর উত্তর (২০২৬-১০-০৫, ফাইল চালানোর আগে) অনুযায়ী সংশোধন:** (ক) ঘর নির্মাণেও ইউনিয়ন থাকবে, আবশ্যক নয় — `semi_pucca`/`tin` এ `geo_depth = union`; (খ) **দুই ভূমিকা** — মূল এডমিন (একজন: যোগ/এডিট/মোছা) ও এডমিন (যোগ/এডিট)। নিচের ১০/১০b এ বসানো।
- `10b_project_guards.sql` — ফাংশন, ট্রিগার আর অনুমতি (রেকর্ডের ডাটা বদলায় না), ফিঙ্গারপ্রিন্টসহ: **ভূমিকা** — `housing_admins.role` এ `main_admin`/`admin`, মূল এডমিন একজনই (unique index), এখনকার সবচেয়ে পুরনো এডমিন মূল এডমিন হন, `is_housing_main_admin()`; **মোছা শুধু মূল এডমিন** — রেকর্ড, প্রকল্প, ফিল্ড, গোপন মান ও Storage ফাইলের delete পলিসি, আর ছবি সরানো (লিংক খালি করা) যাচাই-ট্রিগারে আটকানো; `housing_validate_record()` (গ্রুপে রেকর্ড নিষেধ; বাংলা লেখা NFC + ফাঁকা বাদ — **এখন সার্ভারেও**; core_fields অনুযায়ী আবশ্যক ঘর; ছবি মোড; `extra` যাচাই — অচেনা/গোপন/আর্কাইভ key নিষেধ, টাকা পূর্ণসংখ্যা JSON number, ক্যাটাগরির ফাঁকা এক করা; UPDATE এ শুধু বদলানো মান যাচাই), `housing_field_value()`, `beneficiary_private_validate()` (মোবাইলের বাংলা অঙ্ক → ইংরেজি), `projects_guard()` (§৫.৮-এর সব গার্ড + সংরক্ষিত slug + স্ট্যাট কার্ডের আকার), `projects_after_write()` (নতুন প্রকল্পের কাউন্টার), `project_fields_guard()`।
- `backup/before_10.sql` — `backup` স্কিমায় ৫টি টেবিলের কপি (রেকর্ড, কাউন্টার, লগ, সিরিয়াল-বদল, এডমিন) ও মিলিয়ে দেখা।
- `checks/10_verify.sql` — ১৮টি চেক; M-ধাপ ১-এর লাইভ বেসলাইন মান বসানো; anon হিসেবে পড়ার পরীক্ষা (নিজে ফিরে যায়)।
- `checks/10b_selftest.sql` — ২০টি পরীক্ষা (পরিকল্পনার তালিকার সবগুলো + আবশ্যক ফিল্ড, key বদল, গ্রুপ মোছা, ফিল্ড-গার্ড, গোপন টেবিল, এডমিনের খসড়া দেখা, স্ট্যাট কার্ড, **সাধারণ এডমিন মুছতে পারেন না / মূল এডমিন পারেন**), প্রতিটি নিজের সাব-ট্রানজেকশনে, শেষে প্রমাণ যে লাইভ ডাটা ও এডমিনের ভূমিকা অপরিবর্তিত।
- `rollback/10_12_rollback.sql` (১০ ও ১০b অংশ; ১১/১২ অংশ M-ধাপ ৩-এ) — নতুন ডাটা থাকলে নিজেই থামে; পুরনো পলিসি ও CHECK হুবহু ফেরত।
- `checks/rollback_rehearsal.sql` — `scripts/build-rehearsal.mjs` (`npm run build-rehearsal`) রোলব্যাকের BODY হুবহু বসিয়ে তৈরি করে; মহড়া কিছুই বদলায় না।

পরিবর্তিত: `package.json` (`build-rehearsal`), `supabase/README.md` (ক্রম, এডমিন যোগের নিয়ম), এই ফাইল (চেকলিস্ট ২৫–২৭, ফোল্ডার কাঠামো), `docs/MULTI_PROJECT_PLAN.md` (অবস্থা, `home_label`, §৫.৯ ভূমিকা, §১২-এ প্রশ্ন ১/৩/১১/১২/১৩/১৬), `docs/API_CONTRACT.md` **০.৯.১** (ভূমিকা; DELETE শুধু মূল এডমিন)। ফ্রন্টএন্ডে দুটি ছোট বদল: `AdminRole = 'admin' | 'main_admin'` (`backend/interfaces/types.ts`), আর রেকর্ড মোছায় ০ সারি হলে "রেকর্ড পাওয়া যায়নি" এর বদলে `FORBIDDEN` "শুধু মূল এডমিন রেকর্ড মুছতে পারেন" (`backend/supabase/housingApi.ts`)। সাইট দেখতে হুবহু আগের মতো।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ব্যবহারকারীর উত্তর (২০২৬-১০-০৫):** প্রশ্ন ১ গ্রুপ থাকবে; ৩ সাল সব প্রকল্পে আবশ্যক; ১১/১২ ইউনিয়ন থাকবে (ঘর নির্মাণসহ), আবশ্যক নয়; ১৩ গোপন ফিল্ড — ব্যাখ্যা দেওয়া হয়েছে, এখন কোনো ফিল্ড নয়; ১৬ একজন মূল এডমিন (মোছা) + বাকিরা যোগ/এডিট। **AI-এর ব্যাখ্যা:** "মোছা" মানে রেকর্ড, ছবি, প্রকল্প, ফিল্ড, গোপন মান ও Storage ফাইল মোছা; প্রকল্প/ফিল্ড তৈরি-বদল, প্রকাশ/অপ্রকাশ, সিরিয়াল বদল, ছবি প্রতিস্থাপন = এডিট (সব এডমিন)। এখনকার সবচেয়ে পুরনো এডমিন (সম্ভবত আপনি) মূল এডমিন হন। পরিকল্পনা §১২-এ লেখা।
- **ভূমিকার স্থানীয় পরীক্ষা:** দ্বিতীয় (সাধারণ) এডমিন দিয়ে — রেকর্ড মোছা ০ সারি, Storage ফাইল মোছা ০ সারি, ছবি সরানো আটকায় ("শুধু মূল এডমিন ছবি মুছতে পারেন"), এডিট ও নতুন রেকর্ড চলে; মূল এডমিন Storage ফাইল মুছতে পারেন; দ্বিতীয় মূল এডমিন বানানো যায় না (unique)। selftest ২০/২০ ✅।
- **প্যাচ-স্ক্রিপ্টের সতর্কতা:** JavaScript `String.replace` বদলি-লেখায় `$$` কে `$` বানায় — একবার SQL-এর `$$` ভেঙে গিয়েছিল, লোকাল মহড়ায় ধরা পড়ে ঠিক করা হয়েছে; এখন থেকে প্যাচে `split/join`।
- **লোকাল Postgres-এ পূর্ণ মহড়া (PGlite, Supabase-এর মতো anon/authenticated ভূমিকা, অনুমতি, `auth.uid()`, লাইভের মতো ১০টি রেকর্ড ও ৮টি ছবি-ফাইল):** ব্যাকআপ → ১০ → verify (১৮/১৮ ✅) → ১০b → selftest (১৮/১৮ ✅) → দুটো আবার চালানো (idempotent ✅) → মহড়া (৬/৬ ✅) → পুরনো অ্যাপের কাজ (ফর্মে এডিট, নতুন রেকর্ড — সিরিয়াল ১১, ছবি বদল — লগে `photo_update`, পুরনো বাল্ক RPC, anon পড়া ও লেখা-নিষেধ) ✅ → আসল রোলব্যাক → স্কিমা-ফিঙ্গারপ্রিন্ট হুবহু বেসলাইন ✅ → আবার প্রয়োগ ও selftest ✅ → নতুন ডাটা থাকলে রোলব্যাক থামে ✅।
- **মহড়ায় ধরা পড়া ও ঠিক করা:** (ক) পলিসিতে `key = any((select f()))` Postgres-এ "সারির তালিকা" ধরা হয় → `text = text[]` ত্রুটি; ঠিক: `any((select f())::text[])` (একবার হিসাব হয়, InitPlan)। (খ) রোলব্যাকে `public_project_keys()` টেবিলের পলিসির আগে মোছা যায় না → ক্রম ঠিক করা। (গ) রোলব্যাকে ট্রিগার চালু থাকা অবস্থায় তার ফাংশন মোছা যায় না → আগে ট্রিগার।
- **বাংলা NFC নোট:** "য়/ড়/ঢ়" এর একক-অক্ষর রূপ (U+09DF ইত্যাদি) Unicode-এর নিয়মে NFC-তে **ভেঙে** যায় (য + ়); অন্যদিকে "ো/ৌ" জোড়া লাগে। সার্ভারের `normalize(…, NFC)` আর ক্লায়েন্টের `.normalize('NFC')` একই ফল দেয়, তাই তুলনা ঠিক থাকে (selftest ৫ এটি যাচাই করে)।
- **ট্রিগারের ক্রম:** যাচাই-ট্রিগার (`…_validate`) বর্ণানুক্রমে সিরিয়াল-বরাদ্দের পরে চলে (পরিকল্পনা অনুযায়ী), তাই গ্রুপ-key তে রেকর্ড দিলে প্রথম বার্তাটি আসে সিরিয়াল-ট্রিগার থেকে ("অচেনা project_type: housing") — আটকানো একই।
- **ব্যবহৃত প্রকল্প মোছা:** রেকর্ড থাকলে নিষেধ; রেকর্ড না থাকলেও কাউন্টার > ০ হলে (আগে রেকর্ড ছিল) নিষেধ, শুধু `asf.allow_project_delete = 'on'` সেশন-ফ্ল্যাগে (পরীক্ষা প্রকল্প সরানোর dev ফাইলের জন্য)। কাউন্টার সারি কখনো মোছা হয় না — একই key আবার তৈরি হলেও সিরিয়াল পুনর্ব্যবহার হয় না।
- **স্ট্যাট কার্ডের ফিল্ড-রেফারেন্স** (sum/distinct এর `field`) ট্রিগারে যাচাই হয় না (প্রকল্প তৈরির সময় ফিল্ড তখনো নেই); প্রকাশ-চেকলিস্ট (M-ধাপ ৭) আর `project_stats` (SQL ১১, অচেনা হলে উপেক্ষা) সামলাবে।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- লাইভে চালানো বাকি (সারি ২৫–২৭)। Supabase-এ `postgres` থেকে `set role anon/authenticated` করে পরীক্ষা হয় — লোকালে যাচাই করা, Supabase-এর নথিতেও এভাবেই RLS পরীক্ষা দেখানো; তবু কোনো চেক "পরীক্ষা চালানো যায়নি" দেখালে সেটি পাঠাবেন।
- `asf_meta` আর `backup` স্কিমা রোলব্যাকের পরেও থাকে (ইচ্ছাকৃত; API-তে খোলা নয়)।
- প্রকল্পের key/অবস্থা অনুযায়ী `housing_next_serial` এর খসড়া-সুরক্ষা আসবে SQL ১১-এ (M-ধাপ ৩)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — নিচের ক্রমে, প্রতিটি §১.৩-এর নিয়মে (পুরো ফাইল একবারে)
1. **সারি ২৫ — ব্যাকআপ:** Supabase → Table Editor → `housing_beneficiaries` → Export → CSV; একইভাবে `housing_serial_counters` (ফাইল দুটো কম্পিউটারে রাখুন)। তারপর SQL Editor-এ `supabase/sql/backup/before_10.sql` → ৫টি সারি "✅ মিলেছে"।
2. **সারি ২৬:** `supabase/sql/10_projects.sql` → ৮টি সারি (৭টি ✅ + "পরের কাজ")। তারপর `supabase/sql/checks/10_verify.sql` → ১৮টি সারি, সব ✅। দুটোর টেবিল পাঠান।
3. **সারি ২৭:** `supabase/sql/10b_project_guards.sql` → ৮টি সারি (৭ নম্বরে মূল এডমিনের ইমেইল — আপনার কি না দেখুন)। তারপর `supabase/sql/checks/10b_selftest.sql` → ২১টি সারি, শেষ সারিতে "২০ ✅ · ০ ❌"। তারপর `supabase/sql/checks/rollback_rehearsal.sql` → ৬টি সারি ✅। তিনটির টেবিল পাঠান।
4. কোনো ধাপে লাল ত্রুটি বা ❌ এলে **থামুন**, পুরো বার্তা/টেবিল পাঠান (প্রতিটি ফাইল সব-অথবা-কিছুই-না — ত্রুটিতে কিছু বদলায় না)।
5. এই সময়ে পুরনো এডমিনে কোনো রেকর্ড **সংরক্ষণ করবেন না** (দেখা যাবে)। সাইট দেখতে আগের মতোই থাকবে।
6. ফলাফল পাঠালে AI লাইভে `security-check`, `photo-check` আর `smoke` চালিয়ে মিলিয়ে দেবে।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| লোকাল Postgres (PGlite): before_10 → 10 → verify → 10b → selftest → আবার চালানো → মহড়া → পুরনো অ্যাপের কাজ → রোলব্যাক → আবার প্রয়োগ | সব ✅ (উপরের §২) |
| লাইভে (ব্যবহারকারী, ২০২৬-১০-০৫): ব্যাকআপ ৫/৫, ১০ ৭/৭, verify ১৮/১৮, 10b ৭/৭, selftest ২০/২০ | ✅ |
| লাইভে: রোলব্যাক-মহড়া ৬/৬ (স্কিমা-ফিঙ্গারপ্রিন্ট b9468dd… = বেসলাইন; বর্তমান কাঠামো 48f8bb19… অক্ষত) | ✅ |
| লাইভে (AI): `security-check` PASS ১৬/১৬; `photo-check` ৮/৮; anon দিয়ে API: `projects` ৩টি (semi_pucca/tin `geo_depth = union`), রেকর্ডে `union_name`/`extra` খালি, `beneficiary_private` → permission denied | ✅ |
| লাইভে (AI): `npm run smoke` PASS ৭৪/৭৪; ৭৪টি স্ক্রিনশট M-ধাপ ১-এর বেসলাইনের সাথে পিক্সেল-তুলনায় হুবহু (০.৫%-এর বেশি পার্থক্য একটিতেও নেই) | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- লাইভ ফলাফল পাওয়ার পর **M-ধাপ ৩** — SQL ১১ (`project_stats`, `projects_overview`, wrapper, বাল্ক v2, `housing_next_serial` v2, `project_create`, ক্রম বদল, ফিল্ডের ব্যবহার, ক্যাটাগরির বানান একীকরণ) ও ১২ (লগ v2) + security-check প্রায় ২৮টি পরীক্ষায়।
- পেস্ট করুন: `M-ধাপ ৩ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৩ — SQL ১১ ও ১২: প্রকল্পের RPC আর লগ v2 (২০২৬-১০-০৫) — ✅ সম্পন্ন (লাইভে চালানো ও যাচাই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
নতুন (সব `supabase/sql/` এর ভেতরে; প্রতিটি এক ট্রানজেকশনে, idempotent, ভেতরে আগে-পরে ফিঙ্গারপ্রিন্ট মেলানো — না মিললে সব বাতিল):
- `11_project_rpcs.sql` — পূর্বশর্ত 10b। রেকর্ডের ডাটা বদলায় না।
  - `project_leaf_keys(p_key)` — গ্রুপ দিলে তার উপ-প্রকল্পগুলো, একক দিলে নিজে।
  - `project_stats(p_key, p_light)` (INVOKER — RLS মেনে চলে, তাই খসড়া শুধু এডমিন দেখেন): মোট; সাল/বিভাগ/জেলা/উপজেলা/অবস্থান অনুযায়ী; বিভাগ/জেলা/উপজেলা/**ইউনিয়ন** এর সংখ্যা; উপ-প্রকল্প অনুযায়ী; প্রতিটি টাকা/সংখ্যা ফিল্ডের যোগফল; প্রতিটি **ক্যাটাগরি** ফিল্ডের মোট ক্যাটাগরি আর ক্যাটাগরি অনুযায়ী সংখ্যা ও টাকা (সামনে-পেছনের ফাঁকা বাদ দিয়ে মেলানো)। `p_light = true` হলে হোম কার্ডের হালকা সংস্করণ।
  - `housing_stats(p)` ও `housing_years(p)` — এখন `project_stats` এর wrapper, কিন্তু উত্তর **হুবহু আগের আকারে** (পুরনো সাইট কিছু টের পায় না; stats md5 `a93bfa…` অপরিবর্তিত — ফাইল নিজেই মেলায়)।
  - `housing_next_serial` v2 — খসড়া প্রকল্পে এডমিন ছাড়া কেউ ডাকলে `null` (খসড়ার রেকর্ড-সংখ্যা ফাঁস হয় না)।
  - `projects_overview(p_include_drafts)` — হোম পেইজ ও ড্যাশবোর্ডের জন্য এক কলে সব প্রকল্প, প্রতিটির হালকা স্ট্যাট ও একটি ছবি; এডমিনের জন্য খসড়া ও "ছবি বাকি" সংখ্যা; শেষে মোট (প্রকল্প, উপকারভোগী, জেলা)।
  - এডমিনের RPC (anon চালাতে পারে না): `project_create` (প্রকল্প + ফিল্ড একসাথে, সবসময় খসড়া হিসেবে; একটি ফিল্ড ভুল হলে কিছুই তৈরি হয় না), `projects_reorder`, `project_fields_reorder`, `project_field_usage` (ফিল্ডটি কতগুলো রেকর্ডে ব্যবহৃত), `project_field_rename_value` (ক্যাটাগরির বানান একীকরণ, যেমন "গাভি" → "গরু")।
  - `housing_bulk_update_by_serial` **v2** — signature একই। খালি (`''`) বা `null` মান মানে **অপরিবর্তিত** (আগে update মোডে খালি সেল পিতার নাম/ঠিকানা মুছে দিত — সেই বাগ ঠিক); কিছু মুছতে চাইলে সারিতে `"_clear": ["address", "extra.item_name"]` (আবশ্যক ফিল্ড মোছা যায় না); কাস্টম মান (`extra`) মার্জ হয়; গোপন ফিল্ডের মান `beneficiary_private` এ যায়; গ্রুপ-key দিলে প্রত্যাখ্যান।
- `12_activity_log_v2.sql` — পূর্বশর্ত 11। লগের পুরনো সারিতে হাত দেয় না।
  - `housing_log_record_change()` v2 — এখন `union_name` আর প্রতিটি কাস্টম মানের (`extra.<key>`) আগে→পরে লেখে; তৈরি/মোছার স্ন্যাপশটেও এগুলো।
  - গোপন মানের লগ (`private_update`) — শুধু কোন ফিল্ড বদলেছে তার নাম, **মান কখনো নয়** (`masked: true`)।
  - প্রকল্প ও ফিল্ডের সেটিং বদলের লগ — `project_create/update/publish/unpublish/delete`, `field_create/update/archive/restore/delete` (শুধু ক্রম বদল লগ হয় না)।
- `backup/before_11.sql`, `backup/before_12.sql` — ৮টি টেবিলের কপি (প্রকল্প, ফিল্ড, গোপন মানসহ) ও মিলিয়ে দেখা।
- `checks/11_selftest.sql` — ১২টি পরীক্ষা + শেষ প্রমাণ (একটি অস্থায়ী প্রকল্প `zz_selftest` বানিয়ে, শেষে সব ফেরত): গ্রুপের স্ট্যাট, wrapper হুবহু, টাকা ও ক্যাটাগরির যোগফল, বানান একীকরণ, খারাপ মানেও স্ট্যাট ভাঙে না, নতুন উপ-প্রকল্প, **বাল্ক v2 লাইভ সারিতে "" পাঠালে অপরিবর্তিত**, `_clear`, খসড়ার সিরিয়াল লুকানো, `project_create`, `projects_overview`, ক্রম বদল ও ফিল্ডের ব্যবহার।
- `checks/12_selftest.sql` — ৬টি পরীক্ষা + শেষ প্রমাণ: তৈরি/বদল/মোছার লগ, গোপন মান লুকানো, সেটিং-লগের ক্রম, লগে সরাসরি লেখা নিষেধ, পুরনো লগ-সারি হুবহু।
- `checks/11_perf_optional.sql` — ঐচ্ছিক: অস্থায়ী প্রকল্পে ৫,০০০ রেকর্ড দিয়ে সময় মাপা, তারপর সব ফেরত।

পরিবর্তিত:
- `rollback/10_12_rollback.sql` — ১২ ও ১১ অংশ যোগ: নতুন ট্রিগার/RPC সরানো, পুরনো ৫টি ফাংশন (09/09a-এর লগ-ট্রিগার, 04-এর stats/years, 02-এর next_serial, 07-এর বাল্ক) মূল ফাইল থেকে **হুবহু** কেটে বসানো। `checks/rollback_rehearsal.sql` আবার তৈরি (`npm run build-rehearsal`)।
- `checks/10_verify.sql`, `10b_selftest.sql`, `11_selftest.sql`, `12_selftest.sql` — anon হিসেবে পরীক্ষার সময় এখন লগইন-তথ্যও (JWT claims) স্পষ্টভাবে খালি করে (নিচে §২)।
- `scripts/security-check.mjs` — বহু-প্রকল্পের পরীক্ষা: প্রকল্পের key ডাটাবেস থেকে (হার্ডকোড নয়); খসড়া লুকানো; শুধু পাবলিক ফিল্ড; leak detector (পাবলিক রেকর্ডে অনুমোদিত ফিল্ডের বাইরে কোনো মান নেই); গোপন মান পড়া/লেখা নিষেধ; প্রকল্প/ফিল্ড তৈরি-বদল-মোছা নিষেধ; গ্রুপে রেকর্ড নিষেধ; এডমিন-RPC নিষেধ; `project_stats`/`projects_overview` পড়া যায়; গ্রুপের পরের সিরিয়াল `null`। SQL ১১ চালানোর আগে লাইভে: PASS ৩০ · FAIL ০ · SKIP ৭ (৭টি SQL ১১-এর অপেক্ষায়)।
- `supabase/README.md` (ক্রম ২৮–৩১), `docs/API_CONTRACT.md` **০.৯.২** (বাল্কে খালি = অপরিবর্তিত, `_clear`; খসড়ায় পরের সিরিয়াল `null`), `docs/MULTI_PROJECT_PLAN.md` (অবস্থা)। ফ্রন্টএন্ডের কোড বদলায়নি; সাইট দেখতে হুবহু আগের মতো।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **পরিসংখ্যান INVOKER** — RLS নিজেই ঠিক করে কে কোন প্রকল্প দেখবে; তাই একই ফাংশন anon-কে শুধু প্রকাশিত আর এডমিনকে খসড়াসহ দেখায়, আলাদা নিয়ম লিখতে হয় না। শুধু `housing_next_serial` (কাউন্টার পড়তে হয়) আর `project_field_usage` DEFINER, ভেতরে নিজস্ব চেকসহ।
- **wrapper হুবহু পুরনো আকারে** — পুরনো সাইট M-ধাপ ৫ পর্যন্ত `housing_stats` ব্যবহার করবে; নতুন কী (ইউনিয়ন, উপ-প্রকল্প) শুধু `project_stats` এ।
- **বাল্ক v2-এ খালি = অপরিবর্তিত** (পরিকল্পনা §৫.৬, প্রশ্ন ২০) — এখনকার ইম্পোর্ট পেইজ খালি সেলে `''` পাঠায়; আগে update মোডে তাতে পিতার নাম/ঠিকানা মুছে যেত, এখন থাকে। মোছার জন্য `_clear` — ইম্পোর্টে `(মুছুন)` লেখার সুবিধা আসবে M-ধাপ ১১-এ।
- **লোকাল Postgres-এ পূর্ণ মহড়া (PGlite, লাইভের মতো ১০টি রেকর্ড):** before_10 → 10 → 10b → selftest ২০/২০ → before_11 (৮/৮) → **11** → **11_selftest ১২+১ ✅** → before_12 → **12** → **12_selftest ৬+১ ✅** → ১১/১২ আবার চালানো (idempotent ✅) → verify ১৮/১৮ ও তিনটি selftest আবার ✅ → perf ✅ → **মহড়া ৬/৬ ✅** → পুরনো অ্যাপ: বাল্কে `""` পাঠালে পিতা/ঠিকানা অপরিবর্তিত, লগে শুধু নামের বদল ✅; anon `projects_overview` → ২টি প্রকাশিত প্রকল্প ✅ → **আসল রোলব্যাক → স্কিমা-ফিঙ্গারপ্রিন্ট হুবহু বেসলাইন, stats md5 অপরিবর্তিত ✅** → আবার প্রয়োগ → selftest ✅।
- **মহড়ায় ধরা পড়া ও ঠিক করা:** রোলব্যাক → আবার-প্রয়োগের পরে ১১_selftest-এর দুটি anon পরীক্ষা ব্যর্থ হয়েছিল। কারণ ফাইলে নয়, পরীক্ষার পদ্ধতিতে: আগের ধাপে একই সেশনে এডমিনের লগইন-তথ্য সেট ছিল, আর `set local role anon` শুধু ভূমিকা বদলায়, লগইন-তথ্য মোছে না — ফলে "anon" এডমিন হিসেবে গণ্য হচ্ছিল। Supabase SQL Editor-এ এমন তথ্য থাকে না, তবু এখন প্রতিটি anon পরীক্ষা নিজেই তা খালি করে (চারটি চেক-ফাইলে)।
- **পারফরম্যান্স (লোকাল PGlite — ব্রাউজার-ইঞ্জিনে, আসল সার্ভারের চেয়ে ধীর):** ৫,০০০ রেকর্ডে পূর্ণ `project_stats` ≈ ৫০–৬০ ms, হালকা ≈ ২৮ ms, `projects_overview` ≈ ৫ ms, `housing_stats` ≈ ২ ms। Supabase-এ আরও কম হওয়ার কথা; এখন ডাটা মাত্র ১০টি, তাই ঐচ্ছিক।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- লাইভে সব চালানো ও যাচাই হয়েছে (সারি ২৮–৩০ ✅)। ঐচ্ছিক সারি ৩১ (perf) যেকোনো সময়।
- একটিভিটি পেইজে নতুন ধরনের লগ (`private_update`, `project_*`, `field_*`) এখন কাঁচা নামে দেখাবে (ভাঙে না); বাংলা লেবেল আসবে এডমিন প্যানেলের ধাপে (M-ধাপ ৭)। এখন কোনো প্রকল্প/ফিল্ড/গোপন মান তৈরি হচ্ছে না, তাই এমন সারি আসবেও না।
- ফ্রন্টএন্ড এখনো নতুন RPC ব্যবহার করে না — M-ধাপ ৪ (অ্যাডাপ্টার ও API চুক্তি v1.0) থেকে।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — নিচের ক্রমে, প্রতিটি §১.৩-এর নিয়মে (পুরো ফাইল একবারে, New query তে)
1. **সারি ২৮:** `supabase/sql/backup/before_11.sql` → ৮টি সারি "✅ মিলেছে"। তারপর `supabase/sql/11_project_rpcs.sql` → ৫টি সারি (৪টি ✅ + "পরের কাজ")। তারপর `supabase/sql/checks/11_selftest.sql` → ১৪টি সারি, শেষ সারিতে "১৩ ✅ · ০ ❌"।
2. **সারি ২৯:** `supabase/sql/backup/before_12.sql` → ৮টি সারি ✅। তারপর `supabase/sql/12_activity_log_v2.sql` → ৫টি সারি (৪টি ✅ + "পরের কাজ")। তারপর `supabase/sql/checks/12_selftest.sql` → ৮টি সারি, শেষ সারিতে "৭ ✅ · ০ ❌"।
3. **সারি ৩০:** `supabase/sql/checks/rollback_rehearsal.sql` → ৬টি সারি ✅ (কিছুই বদলায় না)। `npm run security-check` AI চালাবে।
4. (ঐচ্ছিক, সারি ৩১) `supabase/sql/checks/11_perf_optional.sql` → ৬টি সারি; তারপর **আলাদা** New query তে `VACUUM ANALYZE public.housing_beneficiaries;`।
5. সব টেবিল AI-কে পাঠান। কোনো ধাপে লাল ত্রুটি বা ❌ এলে **থামুন**, পুরো বার্তা/টেবিল পাঠান (প্রতিটি ফাইল সব-অথবা-কিছুই-না)।
6. এই সময়ে পুরনো এডমিনে কোনো রেকর্ড **সংরক্ষণ করবেন না**। সাইট দেখতে আগের মতোই থাকবে।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| লোকাল Postgres (PGlite): পুরো ক্রম, আবার চালানো, মহড়া, পুরনো অ্যাপের কাজ, আসল রোলব্যাক, আবার প্রয়োগ | সব ✅ (উপরের §২) |
| লাইভে (ব্যবহারকারী, ২০২৬-১০-০৫): before_11 ৮/৮, ১১ ৪/৪, 11_selftest ১৩/১৩ (বাল্ক v2-এ লাইভ সারি ১-এর পিতা/ঠিকানা অপরিবর্তিত; anon খসড়ার সিরিয়াল null), before_12 ৮/৮, ১২ ৪/৪ | ✅ |
| লাইভে (ব্যবহারকারী): `12_selftest` ৭/৭ — নতুন/বদল/মোছার লগে ইউনিয়ন ও কাস্টম মান, গোপন মান লুকানো (`masked`), সেটিং-লগের ক্রম ঠিক (কে: মূল এডমিন), লগে সরাসরি লেখা RLS-এ আটকায়, পুরনো লগ (২ সারি) হুবহু | ✅ |
| লাইভে: রোলব্যাক-মহড়া ৬/৬ — স্কিমা-ফিঙ্গারপ্রিন্ট b9468dd… (৮৩) = বেসলাইন, semi_pucca 00d0cacc… = বেসলাইন, stats a93bfa… ; বর্তমান কাঠামো 0f656bc2… অক্ষত | ✅ |
| লাইভে (AI): `security-check` PASS ৩৭ · FAIL ০ · SKIP ০; `photo-check` ৮/৮; `smoke` ৭৪/৭৪; ৭৪টি স্ক্রিনশট M-ধাপ ১-এর বেসলাইনের সাথে পিক্সেল-তুলনায় হুবহু | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- লাইভ ফলাফল পাওয়ার পর **M-ধাপ ৪** — ফ্রন্টএন্ড অ্যাডাপ্টারে প্রকল্পের API (`projects`, `project_stats`, `projects_overview` …) ও API চুক্তি v1.0।
- পেস্ট করুন: `M-ধাপ ৪ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৪ — ব্যাকএন্ড স্তর: টাইপ, ProjectsApi, পুরনো-ডাটাবেস ফলব্যাক আর API_CONTRACT v1.0 (২০২৬-১০-০৫) — ✅ সম্পন্ন (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **জরুরি ফিক্স (আলাদা কমিট, M-ধাপ ২-এর ভুল):** 10b-র পর থেকে মূল এডমিনের ভূমিকা `main_admin`, কিন্তু `backend/supabase/session.ts` শুধু `'admin'` মানত — ফলে মূল এডমিন লগইন করলে "এই অ্যাকাউন্ট এডমিন তালিকায় নেই" আসত ও সাথে সাথে লগআউট হতো (ডাটাবেস ঠিক ছিল; শুধু ফ্রন্টএন্ডের যাচাই ভুল)। এখন দুই ভূমিকাই এডমিন (Supabase ও REST দুই অ্যাডাপ্টারে)। smoke লগইন করে না, তাই আগে ধরা পড়েনি।
- **সরানো:** `src/features/housing/backend` → `src/backend` (১৮টি ফাইল `git mv`; ৩৬টি ফাইলের import পাথ codemod দিয়ে পুনর্গণনা; `scripts/migrate-photos.mjs` এর পাথ; `i18n-check` এর IGNORE এখন `src/backend/`)। Windows ফোল্ডারটি একবারে সরাতে দেয়নি (dev সার্ভার/এডিটর খোলা ছিল), তাই ফাইল ধরে সরানো — পুরনো জায়গায় একটি **খালি** `backend` ফোল্ডার থাকতে পারে (গিটে নেই, ক্ষতি নেই; চাইলে মুছে দিন)।
- **টাইপ** (`src/backend/interfaces/types.ts`): `ProjectKey = string` (পুরনো `ProjectType` এখন এর alias; `HousingProjectKey` = 'semi_pucca' | 'tin'); নতুন `Project`, `ProjectField`, `FieldType` (+`FIELD_TYPES`), `PhotoMode`, `GeoDepth`, `GeoLevel`, `CoreFieldsConfig`, `StatCardDef`, `ProjectDisplay`, `ProjectStats` (HousingStats + by_project, by_union, fields, distinct.unions), `ProjectOverview`, `FieldUsage`, `BackendMode`, `ExtraValues`; `HousingRecord` এ `union_name` ও `extra`; ইনপুটে ঐচ্ছিক; `ListParams` এ `union_name`, `fields`, `sort` (`union_name`, `extra.<key>`); বাল্ক আপডেটে `_clear`; `FilterOptions.unions`; লগের নতুন action।
- **ProjectsApi** (`interfaces/projectsApi.ts`, `supabase/projectsApi.ts`, REST stub, `getProjectsApi()`): backendMode, list (খসড়াসহ/ছাড়া), get (৬০ সেকেন্ডের ক্যাশ), overview, create (`project_create` — সবসময় খসড়া), update (`expectedUpdatedAt` → CONFLICT), delete, reorder, createField/updateField/deleteField/reorderFields, fieldUsage, renameFieldValue। লেখার আগে এডমিন যাচাই; মোছায় ০ সারি → "শুধু মূল এডমিন …"।
- **HousingApi** (`supabase/housingApi.ts`):
  - `stats(key, {light})` → `project_stats` (`supabase/stats.ts`); না দিলে 'housing' (পুরনো আচরণ)। উত্তর `ProjectStats` — পুরনো সব কী আছে, তাই এখনকার UI হুবহু চলে।
  - তালিকায় ইউনিয়ন ফিল্টার; কাস্টম ফিল্টার `fields: { category: 'গরু' }` → `extra` contains — **শুধু পাবলিক, সক্রিয়, filterable ফিল্ডের key** (whitelist; বাকি নীরবে বাদ), মান NFC + ফাঁকা এক করে ≤ ১০০; টাকা/সংখ্যা ফিল্ডে number; সার্চে searchable কাস্টম ফিল্ড; `sort: 'extra.<key>'` শুধু পাবলিক ফিল্ডে।
  - `getPrivate(id)` / `setPrivate(id, data)` (গোপন মান; এডমিন)।
  - **লেখার payload নিয়ম:** `union_name` যায় শুধু ইউনিয়ন-স্তরের প্রকল্পে, `extra` শুধু কাস্টম ফিল্ড থাকলে; পুরনো ডাটাবেসে দুটোই সবসময় বাদ। ঘর নির্মাণের ফর্ম এগুলো পাঠায় না, তাই payload হুবহু আগের মতো।
  - **ছবি-মোড:** শুধু-পরের-ছবি প্রকল্পে `prev`, ছবিহীন প্রকল্পে যেকোনো ছবি — আপলোডের **আগেই** VALIDATION_ERROR (ডাটাবেস-ট্রিগারও আটকায়, কিন্তু তখন ফাইল অনাথ থাকত)।
  - পড়া প্রতিটি রেকর্ডে `union_name ?? ''`, `extra ?? {}` (পুরনো ডাটাবেসেও একই শেপ)।
- **পুরনো-ডাটাবেস ফলব্যাক** (`supabase/legacy.ts`, `fallbackProjects.ts`): "টেবিল/ফাংশন/কলাম নেই" (PGRST205/42P01, PGRST202/42883, PGRST204/42703) প্রথমবার দেখে মনে রাখে, সেই সেশনে পুরনো পথে চলে — রেজিস্ট্রি = ফলব্যাকের ৩টি প্রকল্প, স্ট্যাট = `housing_stats` (গ্রুপ 'housing' → null) থেকে নতুন শেপ, ওভারভিউ = প্রতি প্রকল্পে একটি স্ট্যাট-কল (ঘর নির্মাণে ৩টি), গোপন মান {} , প্রকল্প/গোপন মান লেখা → CONFIG_ERROR (বাংলা বার্তা)। dev-এ `VITE_SIMULATE_LEGACY_DB=1` (`.env.example` এ মন্তব্যসহ) — প্রোডাকশন বিল্ডে কাজ করে না।
- **REST:** `rest/endpoints.ts` v1.0 পাথে (`/api/projects/:key/…`, `/api/records/:id/…`, `/api/fields/:id`, `/api/activity`); stub গুলোর মন্তব্যে নতুন endpoint।
- **`docs/API_CONTRACT.md` v1.0** — নতুন করে লেখা: প্রকল্প/ফিল্ড/স্ট্যাট/ওভারভিউ/গোপন মানের মডেল ও endpoint, ফিল্ডের ধরন ও যাচাই, খসড়া লুকানো, অপরিবর্তনীয় জিনিস ও গার্ড (সংরক্ষিত slug/key এর তালিকা সহ), লগের action, Supabase-নির্দিষ্ট অংশ, v০.৯ → v১.০ পাথের তালিকা, খোলা প্রশ্ন। প্রতিটি নিয়ম SQL ১০b/১১ থেকে মিলিয়ে লেখা।
- **স্ক্রিপ্ট:** `smoke.mjs` এ `--legacy` (নিজেই পোর্ট ৫১৭৯ এ সিমুলেশনসহ dev সার্ভার চালায় ও বন্ধ করে) আর প্রতিটি রানে **"backend-path"** পরীক্ষা (পেইজগুলো ডাটাবেসের কোন টেবিল/RPC ডেকেছে); নতুন `content-check.mjs` (`npm run content-check`) আর `adapter-check.mts` (`npm run adapter-check`)।
- UI কোডে কোনো বদল নেই (শুধু import পাথ)। মূল বান্ডেল ৮৬.৩ KB gzip (আগের মতো)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **stats() HousingApi তেই** (পরিকল্পনা §৫.১৪): একই কল পুরনো ও নতুন শেপ দুটোই মেটায়; ProjectsApi তে রেজিস্ট্রি, ওভারভিউ আর সেটিং।
- **একটিই ProjectsApi:** factory একটি বানিয়ে HousingApi কে দেয়, যাতে প্রকল্পের ক্যাশ ও "পুরনো ডাটাবেস" অবস্থা এক থাকে। `migrate-photos` এর মতো স্ক্রিপ্টে না দিলে HousingApi নিজেই বানায়।
- **"projects নেই" = নতুন কলামও নেই** — SQL ১০ একসাথে টেবিল ও কলাম আনে, তাই আলাদা করে কলাম পরীক্ষা করা হয় না (তালিকায় ইউনিয়ন-ফিল্টারে কলাম-নেই এরর এলে সেটিও ধরা হয়)।
- **content-check কখনো ব্যর্থ হয় না** (পরিকল্পনা §৫.১৩) — শুধু সতর্কবার্তা।
- **adapter-check** পরিকল্পনায় ছিল না, যোগ করা হয়েছে: smoke শুধু পড়া দেখে; লেখার নিয়ম আর আসল "নেই" এরর (সিমুলেশন নয়) পরীক্ষার আর কোনো উপায় ছিল না, আর লাইভ ডাটায় লিখে পরীক্ষা নিষেধ।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- UI এখনো নতুন ক্ষমতা ব্যবহার করে না (রেজিস্ট্রি, `pick()`, ইউনিয়ন, কাস্টম ফিল্ড) — M-ধাপ ৫ক থেকে।
- তালিকা পেইজে এখনো ৩টি কল (list, stats, years) — বছর stats.by_year থেকে নেওয়া M-ধাপ ৫-এ।
- পুরনো জায়গায় খালি `src/features/housing/backend` ফোল্ডার থাকতে পারে (উপরে)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. **এডমিন লগইন যাচাই (জরুরি ফিক্সের জন্য):** `npm run dev` চালিয়ে `/housing/admin/login` এ আপনার মূল এডমিন অ্যাকাউন্টে লগইন করুন — এডমিন প্যানেল খোলা উচিত। (কোথাও deploy করা থাকলে নতুন build দিতে হবে।) কোনো রেকর্ড সংরক্ষণ করার দরকার নেই।
2. `npm run content-check` চালিয়ে আউটপুট দেখুন — ৩টি প্রকল্প, হোম ওভারভিউ (মোট ১০, জেলা ১) আর "✓ সব … ইংরেজি আছে" আসার কথা।
3. ডাটাবেসে কিছু চালাতে হবে না।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০ সতর্কবার্তা), `npm run build`, `npm run i18n-check` | ✅ |
| UI থেকে সরাসরি Supabase নেই: `@supabase/supabase-js`, `backend/supabase`, `.rpc(`, `.storage.from`, `getSupabase` — `src/backend/` এর বাইরে কোথাও নেই (grep) | ✅ |
| `npm run smoke` (লাইভ ডাটাবেস): PASS ৭৫/৭৫ — backend-path: `project_stats` ২২০ বার, `housing_stats` ০ বার | ✅ |
| `npm run smoke -- --legacy`: PASS ৭৫/৭৫ — `projects`/`project_fields`/`project_stats`/`projects_overview` এ ০টি কল, `housing_stats` ২২০ বার; স্ট্যাট, বছর-ফিল্টার ও মানচিত্র চলে | ✅ |
| দুই মোডের ৭৪টি করে স্ক্রিনশট M-ধাপ ১-এর বেসলাইনের সাথে পিক্সেল-তুলনায় হুবহু | ✅ |
| `npm run adapter-check` ২৫/২৫: পুরনো DB (আসল PGRST205/PGRST202) — ফলব্যাক রেজিস্ট্রি, housing_stats, "নেই" মনে থাকা, ওভারভিউয়ের মোট দুবার না গোনা, লেখায় union_name/extra বাদ, পড়ায় খালি মান, CONFIG_ERROR, ফিল্টার উপেক্ষা; নতুন DB — project_stats(light), ইউনিয়ন-অপশন, whitelist (গোপন/অচেনা/ফিল্টার-বন্ধ key বাদ, মান স্বাভাবিক), searchable সার্চ, `extra->amount` সাজানো, গোপন ফিল্ডে সাজানো নিষেধ, payload নিয়ম (ঘর নির্মাণে হুবহু আগের মতো), prev ছবি আটকানো, ক্যাশ | ✅ |
| `npm run content-check` (লাইভ, anon): ৩টি প্রকল্প, ওভারভিউ মোট ১০ · জেলা ১, ইংরেজি খালি নেই | ✅ |
| `migrate-photos` এর নতুন import পাথ লোড হয় (tsx) | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৫ক** — প্রকল্প রেজিস্ট্রি (`projectsStore`, স্ন্যাপশট, হুক), `pick()`/`lt()`, আইকন-রেজিস্ট্রি, `PROJECT_META` সরানো। চোখে কোনো পরিবর্তন দেখা যাবে না।
- পেস্ট করুন: `M-ধাপ ৫ক শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৫ক — প্রকল্প রেজিস্ট্রি, `pick()`, আইকন আর পুরনো তালিকা সরানো (২০২৬-১০-০৫) — ✅ সম্পন্ন (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **প্রকল্প রেজিস্ট্রি** (`src/features/projects/registry/`):
  - `projectsStore.ts` — মডিউল-স্তরের অবস্থা (ভাষা টগলের remount এ হারায় না)। প্রথম আঁকা সাথে সাথে: localStorage স্ন্যাপশট `asf_projects_v1`, না থাকলে কোডের ফলব্যাক (`src/backend/fallbackProjects.ts`); পেছনে `getProjectsApi().list()` দিয়ে মিলিয়ে নেয় (একসাথে একটিই কল)। ব্যর্থ হলে আগের তালিকাই থাকে। স্ন্যাপশটে **শুধু পাবলিক** প্রকল্প (খসড়া কখনো ব্রাউজারে জমা থাকে না), কখনো লেখায় ব্যবহার হয় না। `synced` (M-ধাপ ৬-এর 404-এর জন্য), `refreshProjects({ includeDrafts })` (এডমিন/সেভের পর, M-ধাপ ৭)।
  - সহায়ক: `findProject`, `findBySlug`, `childrenOf`, `leafProjects`, `housingProjects`, `projectPath` (`/{group}/{slug}` বা `/{slug}`), `fallbackSlug`; হুক `useRegistry`, `useProjects`, `useProject`।
  - **আইকন-রেজিস্ট্রি** (`icons.ts` + `iconShapes.tsx` + `ProjectIcon.tsx`, পুরনো `ProjectIcons.tsx` এর জায়গায়): house, tin-house, cow, goat, shop, sewing-machine, tools, coins, hands-heart, users + অচেনা key এর fallback; প্রতিটির বাংলা/ইংরেজি বাছাই-নাম (প্যানেলের ড্রপডাউনের জন্য)। ঘর নির্মাণের দুটি আইকন হুবহু আগের SVG।
  - **রঙের তালিকা** (`accents.ts`): brand (সাইটের সবুজ — আগের ক্লাস হুবহু), teal, sky, indigo, amber, rose; `accentOf(key)`, অচেনা হলে brand।
- **`src/i18n/core.ts`:** `pick(bn, en)` — ডাটাবেসের লেখা দেখানোর একমাত্র পথ (ইংরেজি মোডে en খালি না হলে en, নইলে বাংলা); `lt(obj, 'name')` = `pick(obj.name_bn, obj.name_en)`।
- **`PROJECT_META` ও `PROJECT_LIST` সরানো** (`utils/projectType.ts` মুছে `utils/housingProjects.ts`): ১২টি ফাইলে `t(meta.title)`/`t(p.title)`/`t(meta.description)` এর বদলে `lt(project, …)` — হোমের কার্ড ও তালিকা, সাবনেভ, তালিকা ও বিস্তারিত পেইজ, এডমিন রেকর্ড/ফর্ম/ইম্পোর্ট/ছবি-বাল্ক/একটিভিটি, এডমিন টেবিল, রাউট। এডমিনের লিংক `adminPath(key, rest)` দিয়ে। স্থির রাউটের slug `fallbackSlug()` থেকে (রাউট রেজিস্ট্রি-চালিত হবে M-ধাপ ৬-এ)।
- **ছবির ফাইলনাম:** `parsePhotoFilename(name, aliases)` — প্রিফিক্সের তালিকা `buildProjectAliases()` দিয়ে রেজিস্ট্রি থেকে (file_prefix, key, _ ছাড়া key → আগের semi/semi_pucca/semipucca/tin হুবহু)। ছবি-বাল্ক পেইজ রেজিস্ট্রি থেকে, `migrate-photos` কোডের ফলব্যাক থেকে। `photoPath` আগে থেকেই প্রকল্পের key (string) নেয় — পাথের নিয়ম অপরিবর্তিত, তাই বদল লাগেনি।
- `types.ts`: অব্যবহৃত `PROJECT_TYPES` ও `HousingProjectKey` সরানো।
- **`en.ts`:** প্রকল্পের নাম/বর্ণনার ৪টি key মুছে ফেলা (এখন ডাটাবেস থেকে)। EN অভিধান ৪৩১ → ৪২৭।
- **`scripts/i18n-check.mjs`:** (ক) নতুন সতর্কবার্তা — `t(x.name_bn)`, `t(meta.title)`, `t(x.description)` এর মতো ডাটাবেসের লেখা t() দিয়ে দেখালে; (খ) দুই-ভাষার ডাটা-জোড়া (`label_bn: '…'`) অভিধানের লেখা হিসেবে গোনে না; (গ) `//` কমেন্টকে JSX লেখা ভাবার পুরনো ভুল সতর্কবার্তা বন্ধ; (ঘ) মৃত `stripAliasArrays` সরানো।
- নথি: এই অংশ, ফোল্ডার কাঠামো, পরিকল্পনার অবস্থা ও §১২-এ দুটি ব্যাখ্যা।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **`lt()` এর মানে** পরিকল্পনায় লেখা ছিল না — AI-এর ব্যাখ্যা: `_bn`/`_en` জোড়ার ছোট রূপ (`lt(project, 'name')`)। §১২-এ লেখা।
- **প্রথম আঁকায় ফলব্যাক, লোডিং নয়** — তাই নেটওয়ার্ক ধীর বা বন্ধ হলেও ঘর নির্মাণের পেইজ সাথে সাথে আগের মতো আঁকা হয় (চোখে পার্থক্য নেই)।
- **ঘর নির্মাণের পেইজ শুধু `housing` গ্রুপের উপ-প্রকল্প দেখায়** (`housingProjects`) — নতুন প্রকল্প (স্বাবলম্বী …) এলেও ঘর নির্মাণের ট্যাব/ড্রপডাউনে ঢুকবে না; তাদের নিজস্ব পেইজ আসবে M-ধাপ ৬/৮-এ। একটিভিটি পেইজের প্রকল্প-ফিল্টারে সব প্রকল্প (লগ সব প্রকল্পের)।
- **এডমিন মেনুর দুটি লেবেল** ("সেমিপাকা রেকর্ড", "টিন রেকর্ড", `AdminShell.tsx`) এখনো স্থির — এডমিন পুরোটা `/admin` এ সরবে M-ধাপ ৬-এ, তখন রেজিস্ট্রি থেকে।
- **আইকন ফাইল ভাগ** (`iconShapes.tsx` শুধু কম্পোনেন্ট, `icons.ts` শুধু তালিকা) — Vite fast-refresh এর lint নিয়মে (lint ০ সতর্কবার্তা)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- **ভাষা টগলে তালিকা/স্ট্যাট আবার আসে** — রেজিস্ট্রির কোনো নতুন রিকোয়েস্ট যায় না (মাপা হয়েছে), কিন্তু তালিকা পেইজের `housing_beneficiaries`, `project_stats`, `housing_years` আগের মতোই আবার আসে, কারণ টগলে পুরো অ্যাপ remount হয় (এটি ভাষা-টগল তৈরির সময় থেকে; এই ধাপে বদলায়নি; dev-এ React StrictMode প্রতিটি দুবার দেখায়, প্রোডাকশনে একবার)। পরিকল্পনার "ভাষা টগলে কোনো নতুন রিকোয়েস্ট নয়" পুরোপুরি চাইলে ডাটা-হুকে ছোট ক্যাশ লাগবে — আপনি বললে M-ধাপ ৬ বা আলাদাভাবে করা যায়।
- **চলমান `npm run dev` আবার চালু করুন:** এই ধাপে ফাইল সরানো/নাম বদলের পর অনেকক্ষণ ধরে চলা dev সার্ভার পুরনো ফাইল (`icons.tsx`) খুঁজছিল, তাই পেইজ সাদা দেখাচ্ছিল (৪০৪)। নতুন করে চালানো সার্ভারে সব ঠিক (নিচে)। কোডের সমস্যা নয়।
- পরিকল্পনার "DevTools-এ Offline চালু করে রিফ্রেশ" পরীক্ষাটি এভাবে হয় না — Offline এ লোকাল dev সার্ভারও বন্ধ হয়ে যায়, পেইজই খোলে না। সঠিক উপায় নিচে §৪-এ (শুধু Supabase-এর ঠিকানা বন্ধ করা)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. চলমান `npm run dev` বন্ধ করে (Ctrl+C) আবার চালু করুন।
2. **ভাষা টগল:** `/housing`, `/housing/semi-pucca` আর হোম পেইজে বাং ↔ EN করে প্রকল্পের নামগুলো দেখুন — "সেমিপাকা ঘর নির্মাণ" ↔ "Semi-pucca House Construction", "টিনের ঘর নির্মাণ" ↔ "Tin-shed House Construction"।
3. **স্ন্যাপশট (ঐচ্ছিক):** একবার `/housing` খুলুন। তারপর DevTools (F12) → Network ট্যাব → যেকোনো `supabase.co` রিকোয়েস্টে ডান-ক্লিক → "Block request domain" → পেইজ রিফ্রেশ। সাবনেভে প্রকল্পের নামগুলো আসবে (স্ন্যাপশট থেকে), সংখ্যা/তালিকার জায়গায় "লোড করা যায়নি" দেখাবে — এটাই প্রত্যাশিত। শেষে Network ট্যাবের "Request blocking" থেকে ব্লক তুলে দিন।
4. ডাটাবেসে কিছু চালাতে হবে না।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০ সতর্কবার্তা), `npm run build`, `npm run i18n-check` (৪২৭ = ৪২৭, কোনো সতর্কবার্তা নেই) | ✅ |
| `PROJECT_META` / `PROJECT_LIST` কোডে কোথাও নেই (grep; শুধু দুটি মন্তব্যে নাম আছে) | ✅ |
| `npm run smoke` (নতুন dev সার্ভারে): PASS ৭৫/৭৫; রেজিস্ট্রি প্রতি পেইজ-লোডে একবার (`projects` ও `project_fields` ৬৫ বার করে), `project_stats` চলে, `housing_stats` নয় | ✅ |
| `npm run smoke -- --legacy`: PASS ৭৫/৭৫ (রেজিস্ট্রি ফলব্যাক থেকে, `projects` এ কোনো কল নেই) | ✅ |
| স্ক্রিনশট বনাম M-ধাপ ১-এর বেসলাইন: --legacy ৭৪/৭৪ হুবহু; সাধারণ মোডে ৭৩/৭৪ হুবহু — `en-390-map` এ মানচিত্রের ২০টি স্বয়ংক্রিয় ট্যাপের শেষটি পাশের উপজেলায় পড়েছিল (পরশুরাম বনাম মীরসরাই; লেআউট একই); ওই প্রস্থে দুবার আবার চালাতে দুবারই হুবহু | ✅ |
| ব্রাউজার-পরীক্ষা (puppeteer): প্রথম লোডে স্ন্যাপশট লেখা (শুধু পাবলিক ৩টি); ভাষা টগলে রেজিস্ট্রির নতুন রিকোয়েস্ট ০; শিরোনাম ও সাবনেভ ডাটাবেসের name_en এ; Supabase বন্ধেও স্ন্যাপশট থেকে নাম; নতুন ব্রাউজার + Supabase বন্ধ → ফলব্যাক থেকে শিরোনাম — ৬/৬ | ✅ |
| `npm run adapter-check` ২৫/২৫, `npm run content-check` (ইংরেজি খালি নেই), `migrate-photos --help` লোড হয় | ✅ |
| মূল বান্ডেল ৮৬.৩ → ৮০.০ KB gzip (কোড শেয়ার্ড chunk এ সরেছে; হোম পেইজের মোট প্রথম-লোড JS ~১৮১ → ~১৭৭ KB) | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৫খ** — টাকা (`money.ts`), ফিল্ড-টাইপ রেজিস্ট্রি, fuzzy মিল ও `field-types-check`। প্রশ্ন ৯ (ইংরেজিতে টাকা কীভাবে দেখাবে) ওই ধাপে লাগবে — উত্তর না দিলে পরিকল্পনার ডিফল্ট।
- পেস্ট করুন: `M-ধাপ ৫খ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৫খ — টাকা, ফিল্ড-টাইপ রেজিস্ট্রি আর fuzzy মিল (২০২৬-১০-০৫) — ✅ সম্পন্ন (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **`src/lib/money.ts`:** `formatTaka()` — বাংলায় `৳ ১,২৩,৪৫৬`, ইংরেজিতে `৳123,456` (প্রশ্ন ৯-এর ডিফল্ট; লাখ/কোটি সংক্ষেপ নয়); `parseBanglaNumber()` — বাংলা/ইংরেজি অঙ্ক, যেকোনো কমা-রীতি, ফাঁকা, ৳/টাকা/Tk/Taka/BDT, শেষে /- বা /= গ্রহণ করে; খালি → null, সংখ্যা না হলে → NaN; `asciiDigits()`, `MONEY_MAX` (1e11, ডাটাবেসের সমান)।
- **`src/lib/fuzzyMatch.ts`:** `looseKey(raw, { stripWords })`, `levenshtein()`, `nearDuplicates(values)` — ঢিলা key এক হলে সবসময়, দূরত্ব ১ হলে ছোটটি ≥ ৪ অক্ষরে, দূরত্ব ২ হলে ≥ ৮ অক্ষরে (যাতে "গরু"/"গরুর" ভুলে না মেলে)।
- **`geoMatch.ts`** এখন এগুলোই ব্যবহার করে (নিজের looseKey/levenshtein মুছে); আচরণ হুবহু আগের (নিচে §৫)।
- **ফিল্ড-টাইপ রেজিস্ট্রি** (`src/features/projects/fields/`) — সাতটি ধরনের (text, long_text, number, money, category, date, phone) প্রতিটির `parse` (কাঁচা লেখা → সংরক্ষণের মান; ডাটাবেসের `housing_field_value` এর নিয়মে: সীমা, NFC, ফাঁকা, ক্যাটাগরিতে একাধিক ফাঁকা → এক, টাকা পূর্ণসংখ্যা ০–1e11, সংখ্যা ≤ ২ দশমিক, min/max, ফোনে বাংলা অঙ্ক → ইংরেজি, তারিখ DD/MM/YYYY বা ISO → ISO), `format` (বর্তমান ভাষায়; সাল কমা ছাড়া), `toCsv` (ইংরেজি অঙ্ক, কমা নেই, ISO তারিখ — আবার ইম্পোর্টযোগ্য), `toInput`, `Input`, `Cell`; ত্রুটির বার্তা দুই ভাষায় (`fieldErrorMessage`)। `systemFields.ts` (৮টি সিস্টেম ফিল্ড, লেবেল এখনকার ফর্মের হুবহু), `resolveFields(project)` (core_fields অনুযায়ী লেবেল/চালু/আবশ্যক, ইউনিয়ন শুধু ইউনিয়ন-স্তরে, তারপর কাস্টম ফিল্ড; গোপন/আর্কাইভ অপশন), `fieldValue()`।
- **`scripts/field-types-check.mjs`** (`npm run field-types-check`, tsx) — ৭৭টি পরীক্ষা।
- `en.ts`: ফিল্ডের ১১টি ত্রুটি-বার্তা; `i18n-check`: `fuzzyMatch.ts` (মেলানোর ডাটা) বাদের তালিকায়।
- UI তে কোনো বদল নেই — ফর্ম, ইম্পোর্ট, টেবিল, CSV রেজিস্ট্রিতে সরবে পরের ধাপগুলোতে (M-ধাপ ৮–১১)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **প্রশ্ন ৯-এর ডিফল্ট প্রয়োগ** (উত্তর আসেনি): পূর্ণসংখ্যা টাকা; বাংলায় `৳ ১,২৩,৪৫৬`, ইংরেজিতে `৳123,456`; লাখ/কোটি সংক্ষেপ নয়। পরিকল্পনা §১২-এ লেখা।
- **টাকার সর্বোচ্চ সীমায় অসঙ্গতি (জানানো হলো, সিদ্ধান্ত আপনার):** পরিকল্পনা আর ডাটাবেসের বার্তায় "১০০০ কোটি" লেখা, কিন্তু ডাটাবেস যে সংখ্যা মানে (1e11 = ১০০,০০,০০,০০,০০০) তা আসলে **১০,০০০ কোটি**। ক্লায়েন্ট এখন ডাটাবেসের আসল সীমা (1e11) মানে, আর বার্তায় সঠিকভাবে "১০,০০০ কোটি" লেখে। দাতব্য অনুদানে বাস্তবে দুটোর কোনোটির কাছাকাছিও যায় না। আপনি ১০০০ কোটি চাইলে পরের কোনো SQL ধাপে ডাটাবেসের সীমা ও বার্তা আর এখানের `MONEY_MAX` একসাথে বদলানো হবে।
- **format এর ভাষা** পরিকল্পনায় `format(value, def, lang)` লেখা; বাস্তবায়নে ভাষা আসে i18n মডিউল থেকে (t() ও সংখ্যার মতো একই উৎস, ভাষা বদলালে পুরো অ্যাপ remount হয়) — আলাদা প্যারামিটার লাগে না।
- **ফাইল ভাগ** (`fieldValues.ts` React ছাড়া, `fieldComponents.tsx` শুধু কম্পোনেন্ট, `fieldTypes.ts` দুটো মেলায়) — চক্রাকার import এড়াতে ও fast-refresh এর lint নিয়মে; স্ক্রিপ্ট আর Node থেকেও মানের নিয়ম ব্যবহার করা যায়।
- **ক্লায়েন্ট বেশি নমনীয়, সার্ভার কড়া:** ফর্ম/শীটের "১০,০০০/-" বা "15/03/2025" ক্লায়েন্ট পড়ে সংখ্যা/ISO বানিয়ে পাঠায়; সার্ভার শুধু সেই রূপ নেয় — তাই ভুল রূপ কখনো ডাটাবেসে যায় না।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- টাকার সর্বোচ্চ সীমার সিদ্ধান্ত (উপরে) — উত্তর না দিলে এখনকার মতো (1e11) থাকবে।
- পরিকল্পনার "পুরনো নমুনা শীটের প্রিভিউ" — রিপোতে কোনো শীট নেই আর ইম্পোর্ট পেইজে এডমিন লগইন লাগে, তাই একই প্রিভিউ-কোড (`analyzeRows`) সরাসরি চালিয়ে পরীক্ষা করা হয়েছে (নিচে)। চাইলে নিজে একটি পুরনো শীট দিয়ে এডমিন → বাল্ক ইম্পোর্টে শুধু প্রিভিউ দেখতে পারেন (চালাবেন না)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. কিছু চালাতে হবে না।
2. (ঐচ্ছিক) টাকার সর্বোচ্চ সীমা: "১০০০ কোটি" না "১০,০০০ কোটি" — জানালে সেভাবে করা হবে।
3. (ঐচ্ছিক) `npm run field-types-check` চালিয়ে ফলাফল দেখুন — "PASS 77, FAIL 0"।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০ সতর্কবার্তা), `npm run build`, `npm run i18n-check` (৪৩৮ = ৪৩৮) | ✅ |
| `npm run field-types-check`: ৭৭/৭৭ — "১০,০০০/-" → 10000, "Tk 5,000" → 5000, "  গরু  " → "গরু" (NFC), "গাভী" ≈ "গাভি", "abc" → ত্রুটি; প্রতিটি ধরনের parse/format/toCsv/toInput, CSV round-trip, দুই ভাষার বার্তা, resolveFields, fieldValue | ✅ |
| ক্লায়েন্ট বনাম ডাটাবেস (লোকাল Postgres, আসল `housing_field_value`): ৩৩টি মানে ৩২টি হুবহু; বাকি ১টি ইচ্ছাকৃত ("15/03/2025" ক্লায়েন্ট ISO বানায়, সার্ভার শুধু ISO নেয়) | ✅ |
| `geoMatch` আগে বনাম পরে: দেশের সব বিভাগ/জেলা/উপজেলার নাম (বাংলা ও ইংরেজি) × ১৩ রকম ভুল বানান = ১৪,৭২০টি তুলনায় পার্থক্য ০ | ✅ |
| ইম্পোর্টের প্রিভিউ-কোড (`analyzeRows` + `fillDown` + `guessMapping`) একটি এলোমেলো নমুনা শীটে (চট্রগ্রাম/মিরসরাই/Chattogram/উলিপূর/অচেনা উপজেলা): আগের ও নতুন কোডের ফল হুবহু এক | ✅ |
| `npm run smoke` ৭৫/৭৫ ও `--legacy` ৭৫/৭৫; দুই মোডের ৭৪টি করে স্ক্রিনশট বেসলাইনের সাথে হুবহু | ✅ |
| `npm run adapter-check` ২৫/২৫ | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৬** — ডায়নামিক রাউটিং (রেজিস্ট্রি থেকে), `/admin` এ স্থানান্তর, পুরনো লিংকের রিডাইরেক্ট আর হেডারের "প্রকল্পসমূহ ▾" মেনু।
- পেস্ট করুন: `M-ধাপ ৬ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৬ — ডায়নামিক রাউটিং, `/admin`-এ স্থানান্তর, পুরনো লিংকের রিডাইরেক্ট আর হেডার মেনু (২০২৬-১০-০৫) — ✅ সম্পন্ন (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **রাউট এখন রেজিস্ট্রি থেকে** (`src/app/routes/appRoutes.tsx`, `App.tsx`): গ্রুপ `/{slug}` = ল্যান্ডিং, উপ-প্রকল্প `/{group}/{slug}`, একক `/{slug}`, প্রতিটির child `:serial` (মডাল)। পেইজগুলো এখনো ঘর নির্মাণের (জেনেরিক তালিকা M-ধাপ ১৩, ল্যান্ডিং M-ধাপ ১৫)। `features/housing/routes.tsx` মুছে ফেলা।
- **`ConfigAwareNotFound`** (`routeGuards.tsx`): রেজিস্ট্রি নেটওয়ার্কে মিলিয়ে নেওয়া শেষ না হলে 404 নয়, "লোড হচ্ছে…"।
- **এডমিন `/admin`-এ**, URL এ key: `/admin/login`, `/admin` (আপাতত প্রথম প্রকল্পের রেকর্ডে — ড্যাশবোর্ড M-ধাপ ৭), `/admin/records/:key[/new | /:serial/edit]`, `/admin/import?project=`, `/admin/photos?project=`, `/admin/activity`। `RequireAdmin` এর `LOGIN_PATH` = `/admin/login`; লগইনের পর `/admin` (বা ফেরার-পাথ), লগআউটের পর `/`; লগইন পেইজ থেকে সাবনেভ বাদ। এডমিন মেনুর রেকর্ড-লিংক রেজিস্ট্রি থেকে (প্রকল্পের নাম)।
- **`LegacyAdminRedirect`**: `/housing/admin/*` → `/admin/*` (slug → key, query/hash/ফেরার-পাথ সহ)।
- **হেডার:** "ঘর নির্মাণ প্রকল্প" লিংকের বদলে **"প্রকল্পসমূহ ▾"** (`app/layout/ProjectsMenu.tsx`) — ডেস্কটপে ড্রপডাউন (বাইরে ক্লিক/Esc এ বন্ধ), মোবাইল মেনুতে শিরোনামসহ তালিকা; গ্রুপের নিচে উপ-প্রকল্প; খসড়া দেখায় না।
- **ট্যাবের শিরোনাম** (`lib/useDocumentTitle.ts`): `প্রকল্প/পেইজের নাম — সাইটের নাম` — হোম, ল্যান্ডিং, তালিকা, লগইন, এডমিনের প্রতিটি পেইজ, 404। (`LanguageProvider` আর শিরোনাম বসায় না।)
- **`DraftBanner`** (`ProjectFrame.tsx`): প্রকল্প পাবলিক না হলে হলুদ "খসড়া — শুধু এডমিন দেখছেন"। **`RegistryAuthSync`**: এডমিন লগইনে রেজিস্ট্রি খসড়াসহ, লগআউটে শুধু পাবলিক।
- `listContext` এখন পুরো `project` বহন করে; `HousingListPage`, `HousingLandingPage`, `HousingSubnav`, `FeaturedProjects` প্রকল্প/গ্রুপ prop নেয় (যেকোনো গ্রুপে চলে)।
- `smoke.mjs`: নতুন পাতা `/housing/`, `/housing/semi-pucca/1?year=2024`, `/admin/login`; ৭টি রিডাইরেক্ট পরীক্ষা (শেষ ঠিকানা + লগইনের পরে ফেরার-পাথ); প্রতিটি পাতায় "এক মুহূর্তের 404" ধরা; ট্যাবের শিরোনাম আছে কি না।
- `en.ts`: খসড়া-ব্যানারের লেখা; অব্যবহৃত ৪টি key মুছে ফেলা।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **`/admin` আপাতত রিডাইরেক্ট** — পরিকল্পনায় ড্যাশবোর্ড M-ধাপ ৭-এর কাজ; ততদিন আগের `/housing/admin` এর মতোই প্রথম প্রকল্পের রেকর্ডে।
- **নতুন প্রকল্পের পাতাও ঘর নির্মাণের কম্পোনেন্টে** (M-ধাপ ১৩ পর্যন্ত) — এখন কোনো নতুন প্রকল্প নেই; M-ধাপ ৭-এ এডমিন খসড়া বানালে সেটি ঘর নির্মাণের ধাঁচে (আগে-পরে ছবির কলামসহ) দেখাবে, যা M-ধাপ ১৩-এ বদলাবে।
- **এডমিন রেকর্ড/ফর্ম/ইম্পোর্ট/ছবি-বাল্ক এখনো শুধু ঘর নির্মাণের উপ-প্রকল্প নেয়** (অন্য key → 404) — জেনেরিক ফর্ম/ইম্পোর্ট M-ধাপ ১০–১২-এ।
- **মডালে ট্যাবের শিরোনাম বদলায় না** (তালিকার প্রকল্পের নামই থাকে) — child-রাউটের effect আগে চলে বলে সহজ ও নির্ভরযোগ্য।
- **মোবাইল মেনুতে ভাষা-টগল দুই জায়গায়** (বারে ও মেনুতে) — আগের মতোই, বদলানো হয়নি।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- এডমিন লগইন করে খসড়া ও এডমিন পাতাগুলো আমি পরীক্ষা করতে পারিনি (লগইন আমার নেই) — নিচে §৪-এ আপনার পরীক্ষা। খসড়া-ব্যানার আর "খসড়া মিলিয়ে নেওয়ার পর সরে যাওয়া" স্ন্যাপশটে নকল খসড়া দিয়ে পরীক্ষিত।
- বুকমার্ক বা শেয়ার করা পুরনো এডমিন লিংক (`/housing/admin/…`) কাজ করবে (রিডাইরেক্ট), নতুন বুকমার্ক `/admin/…` দিয়ে করুন।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. চলমান `npm run dev` আবার চালু করুন (ফাইল সরানো হয়েছে)।
2. ব্রাউজারে খুলুন (লগইন ছাড়া): `/housing`, `/housing/`, `/housing/semi-pucca/1?year=2024`, `/housing/tin` — আগের মতো দেখাবে; হেডারে "প্রকল্পসমূহ ▾" চাপলে ঘর নির্মাণ, সেমিপাকা, টিন।
3. `/housing/admin/semi-pucca` খুলুন → লগইন পেইজে যাবে; লগইন করলে `/admin/records/semi_pucca` এ (পুরনো লিংকের রিডাইরেক্ট)।
4. লগইনের পর এডমিন মেনু থেকে সেমিপাকা, টিন, বাল্ক ইম্পোর্ট, ছবি বাল্ক আপডেট, একটিভিটি লগ — সব খোলে কি না দেখুন (কিছু সংরক্ষণ করার দরকার নেই); "লগআউট" চাপলে হোমে ফেরে।
5. ফোনে (বা ব্রাউজার ছোট করে) হেডার উপচে পড়ে কি না, মেনু (☰) এ "প্রকল্পসমূহ" অংশ দেখুন।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build`, `npm run i18n-check` | ✅ |
| `npm run smoke` (নতুন dev সার্ভারে): PASS ১২৩/১২৩ — আগের সব পাতা + `/housing/` + `?year=` সহ বিস্তারিত + `/admin/login` + ৭টি রিডাইরেক্ট (`/housing/admin`, `…/login`, `…/semi-pucca`, `…/semi-pucca/new`, `…/tin/3/edit?x=1`, `…/import`, `/admin/records/semi_pucca`) — শেষ ঠিকানা ও ফেরার-পাথ সঠিক; কোনো পাতায় এক মুহূর্তের 404 নেই; ৩৬০/৭৬৮ সহ সব প্রস্থে ওভারফ্লো নেই; প্রতিটি পাতায় ট্যাবের শিরোনাম | ✅ |
| `npm run smoke -- --legacy`: PASS ১২৩/১২৩ | ✅ |
| স্ক্রিনশট বনাম বেসলাইন: ৬৪/৭৪ হুবহু (হেডারের বদল ছোট জায়গায়); ১০টি পার্থক্য সব লগইন পেইজের (সাবনেভ বাদ — পরিকল্পনা অনুযায়ী) | ✅ |
| চোখে দেখা: ড্রপডাউন (১২৮০ বাংলা, ৭৬৮ ইংরেজি), মোবাইল মেনু (৩৬০); ট্যাবের শিরোনাম "সেমিপাকা ঘর নির্মাণ — আস-সুন্নাহ ফাউন্ডেশন" / "Semi-pucca House Construction — As-Sunnah Foundation" | ✅ |
| খসড়া (নকল, স্ন্যাপশটে): পাতায় হলুদ ব্যানার; নেটওয়ার্কের তালিকা এলে খসড়া নেই → 404, স্ন্যাপশট থেকেও মুছে যায় | ✅ |
| `adapter-check` ২৫/২৫, `field-types-check` ৭৭/৭৭ | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৭** — এডমিন লেআউট (সাইডবার), ড্যাশবোর্ড, প্রকল্পের তালিকা, নতুন প্রকল্প উইজার্ড, প্রকল্প সেটিংস, প্রকাশের চেকলিস্ট। লাইভে পরীক্ষার জন্য এডমিন লগইন লাগবে (আপনি করবেন)।
- পেস্ট করুন: `M-ধাপ ৭ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৭ — এডমিন লেআউট, ড্যাশবোর্ড, প্রকল্পের তালিকা আর নতুন প্রকল্প উইজার্ড (২০২৬-১০-০৫) — ✅ কোড ও পরীক্ষা সম্পন্ন · লাইভে এডমিন-পরীক্ষা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **এডমিন লেআউট** (`features/admin/layout/AdminLayout.tsx`, পুরনো `AdminShell` এর জায়গায়): ডেস্কটপে বাম সাইডবার (প্যানেল: ড্যাশবোর্ড, প্রকল্পসমূহ · রেকর্ড: রেজিস্ট্রি থেকে · সরঞ্জাম: ইম্পোর্ট, ছবি, লগ), নিচে ইমেইল, ভূমিকা ("মূল এডমিন"/"এডমিন"), "পাবলিক সাইট দেখুন", লগআউট; ফোন/ট্যাবে উপরের "এডমিন মেনু" → ড্রয়ার (Esc/বাইরে চাপলে বন্ধ, পাতা বদলালে বন্ধ); সব লিংক/বোতাম ≥ ৪৪px।
- **শেয়ার্ড UI** (`features/admin/ui/`): `Field` (লেবেল, সাহায্য, ত্রুটি, aria-describedby), `Badge`, `Step`, `styles` (inputClass = রেকর্ড-ফর্মের হুবহু, বোতাম, কার্ড)।
- **`/admin` ড্যাশবোর্ড** (`AdminDashboardPage`, `projects_overview(true)` — এক কলে): প্রকাশিত সারাংশ (প্রকল্প · উপকারভোগী · জেলা), প্রতিটি প্রকল্পের কার্ড — রেকর্ড, মোট টাকা (টাকা-ফিল্ডের যোগফল), ছবি বাকি, প্রকাশিত/খসড়া, দ্রুত বোতাম (রেকর্ড, সেটিংস, পাবলিক পেইজ/প্রিভিউ); নিচে লগের শেষ ১০টি এন্ট্রি।
- **`/admin/projects`** (`AdminProjectsPage`): গ্রুপের পরে তার উপ-প্রকল্প; ↑↓ দিয়ে একই স্তরে ক্রম বদল (`projects_reorder`); "হোমে দেখান"; প্রকাশ (চেকলিস্ট না মিটলে বন্ধ, কারণসহ) / অপ্রকাশ — **রেকর্ড বা প্রকাশিত উপ-প্রকল্প থাকলে `UnpublishDialog`**: কতটি রেকর্ড আর কোন URL লুকাবে, আর প্রকল্পের বাংলা নাম হুবহু লিখলে তবেই বোতাম চালু।
- **`/admin/projects/new` উইজার্ড** (`ProjectWizardPage` + `projectTemplates.ts`): ৪টি টেমপ্লেট (অনুদান/উপকরণ, ঘর নির্মাণ ধরন, প্রকল্প-গ্রুপ, খালি) → অবস্থান (একক / গ্রুপের উপ-প্রকল্প + গ্রুপ বাছাই / নতুন গ্রুপ) → বাংলা ও ইংরেজি নাম → URL (ইংরেজি নাম থেকে নিজে, সাথে সাথে যাচাই, ঠিকানার প্রিভিউ) → key (শুধু দেখার, "পরে বদলানো যাবে না") → ছবি মোড, ফাইল-প্রিফিক্স (উদাহরণ "sr_0012.jpg"), ঠিকানার স্তর → আইকন ও রং → "খসড়া হিসেবে তৈরি করুন" (`project_create`, টেমপ্লেটের ফিল্ডসহ) → সেটিংস পাতায়।
- **`/admin/projects/:key?tab=general|photos|display`** (`ProjectSettingsPage`): সাধারণ (নাম, ছোট বর্ণনা, পরিচিতি, একক শব্দ — দুই ভাষায়; URL ও অবস্থান — প্রকাশিত হলে নিষ্ক্রিয়, ব্যাখ্যাসহ; প্রিফিক্স; ঠিকানার স্তর; হোমে দেখান; আইকন ও রং), ছবি (মোড, লেবেল), প্রদর্শন (মানচিত্র, ঠিকানার কলাম আলাদা/একসাথে, বিতরণ চার্টের ফিল্ড)। শুধু বদলানো কলাম পাঠানো; **`updated_at` মেলানো** — অন্য কেউ আগে বদলালে CONFLICT বার্তা ও "নতুন অবস্থা আনুন"; ডাটাবেসের গার্ড-ত্রুটি বাংলায় (unique/CHECK এর ইংরেজি বার্তাও অনুবাদ — `projectRules.friendlyProjectError`)। উপরে প্রকাশ/অপ্রকাশ আর চেকলিস্ট।
- **`publishChecklist.ts`**: আটকায় — দুই ভাষায় নাম, ≥ ১টি স্ট্যাট কার্ড, উপ-প্রকল্প হলে গ্রুপ প্রকাশিত; শুধু সতর্কতা — ইংরেজি খালি (বর্ণনা, একক, ছবির লেবেল, কার্ড, ফিল্ড), ক্যাটাগরিতে কাছাকাছি বানান (`nearDuplicates`, ডাটা থেকে)।
- **`projectRules.ts`**: `slugify`, `keyFromSlug`, `suggestPrefix`, `slugError` (ফরম্যাট, ≤ ৬০, শুধু-সংখ্যা, সংরক্ষিত শব্দের তালিকা — 10b এর হুবহু, ডুপ্লিকেট), `keyError`, `prefixError`, `photoNameExample`।
- রাউট: `/admin` এখন ড্যাশবোর্ড (আগের অস্থায়ী রিডাইরেক্ট মুছে ফেলা), `/admin/projects`, `/admin/projects/new`, `/admin/projects/:key` — সব lazy।
- লগের লেবেল (`features/housing/utils/activityLabels.ts`): একটিভিটি পাতা ও ড্যাশবোর্ড একই উৎস; নতুন action (প্রকল্প/ফিল্ড তৈরি, প্রকাশ, অপ্রকাশ, আর্কাইভ, গোপন তথ্য বদল …) এর বাংলা লেবেল ও রং।
- `en.ts`: এডমিন প্যানেলের ১৬০টি লেখার ইংরেজি; `i18n-check`: `import_aliases: [...]` (শীটের কলাম-নাম মেলানোর ডাটা) বাদ।
- নতুন পরীক্ষা `scripts/admin-ui-check.mjs` (`npm run admin-ui-check`)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ডিফল্ট প্রয়োগ (উত্তর আসেনি)**, "অনুদান/উপকরণ" টেমপ্লেটে: প্রশ্ন ৪ — উপকরণের নাম আলাদা লেখার ফিল্ড, ঐচ্ছিক; প্রশ্ন ৬ — "মোট ক্যাটাগরি" = ব্যবহৃত ভিন্ন মান; প্রশ্ন ৮ — টাকা পাবলিক; প্রশ্ন ১০ — একটি ছবি, "উপকরণসহ ছবি" (শুধু পরের)। প্রশ্ন ১৩ — কোনো গোপন ফিল্ড নেই। ইউনিয়ন আবশ্যক নয় (আপনার উত্তর; পরিকল্পনার §৩.২ তে "হ্যাঁ" লেখা ছিল — আপনার উত্তরই মানা হয়েছে)। পরিকল্পনা §১২-এ লেখা।
- **ঘর নির্মাণ টেমপ্লেট ইউনিয়ন-স্তরে** (আবশ্যক নয়) — এখনকার সেমিপাকা/টিনের লাইভ সেটিংয়ের মতো (প্রশ্ন ১২-এর উত্তর)।
- **"গ্রুপ" টেমপ্লেট ⇔ "নতুন গ্রুপ" অবস্থান** সবসময় একসাথে (একটি বাছলে অন্যটি নিজে বদলায়)।
- **key টাইপ করা যায় না** — URL অংশ থেকে তৈরি (`self-reliance` → `self_reliance`); বদলাতে চাইলে URL অংশ বদলান।
- **প্রকাশ/অপ্রকাশের আগে অসংরক্ষিত পরিবর্তন থাকলে বোতাম বন্ধ** — দুটো আলাদা কাজ গুলিয়ে যাতে CONFLICT না হয়।
- **ফিল্ড ও স্ট্যাট কার্ডের ট্যাব** এই ধাপে নেই — M-ধাপ ৮ (ফিল্ড বিল্ডার, স্ট্যাট কার্ড বিল্ডার)।
- **মোছার বোতাম নেই** — পরীক্ষা প্রকল্প সরানো M-ধাপ ১৬-এ (`dev/remove_demo_project.sql`, পরিকল্পনা অনুযায়ী)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে লাইভ পরীক্ষা আমি করতে পারিনি — নিচে §৪ আপনার। লগইন ছাড়া যতটুকু সম্ভব: আসল SQL এ (লোকাল Postgres) টেমপ্লেট ও গার্ড, আর ব্রাউজারে নকল এডমিন সেশনে পুরো UI (পড়া লাইভ, লেখা আটকানো) — নিচে §৫।
- নতুন প্রকল্পের পাবলিক/প্রিভিউ পাতা এখনো ঘর নির্মাণের ধাঁচে (আগে-পরে ছবির কলাম ইত্যাদি) — জেনেরিক তালিকা M-ধাপ ১৩-এ। নতুন প্রকল্পের রেকর্ড-পাতা/ফর্ম M-ধাপ ১০-এ (এখন রেকর্ড-লিংক শুধু ঘর নির্মাণের)।
- ড্যাশবোর্ডের "ছবি বাকি" শুধু এডমিনের আসল সেশনে আসে (নকল সেশনের পরীক্ষায় "—")।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
1. `/admin/login` → লগইন → `/admin` ড্যাশবোর্ড: ঘর নির্মাণ ১০, সেমিপাকা ১০, টিন ০ রেকর্ড; সেমিপাকায় "ছবি বাকি" ৭ (১০টির মধ্যে ৩টিতে বর্তমান ছবি আছে) হওয়ার কথা — মিলিয়ে বলুন।
2. **পরীক্ষা প্রকল্প তৈরি:** "নতুন প্রকল্প" → টেমপ্লেট "অনুদান/উপকরণ ধরন" → অবস্থান "একক প্রকল্প" → বাংলা নাম **পরীক্ষা প্রকল্প**, ইংরেজি নাম **Demo** (URL ও key নিজে "demo" হবে) → "খসড়া হিসেবে তৈরি করুন"। **প্রকাশ করবেন না।**
3. একটি incognito (প্রাইভেট) উইন্ডোতে `/demo` খুলুন → "পেইজটি পাওয়া যায়নি" আসা চাই।
4. উইজার্ডে (তৈরি না করে) URL অংশে `admin`, `src`, `housing`, `123` লিখে দেখুন — প্রতিটিতে লাল ত্রুটি।
5. `/admin/projects/semi_pucca` → URL ঘর নিষ্ক্রিয় দেখুন; "ছবি" ট্যাবে মোড "শুধু পরের ছবি" করে "সংরক্ষণ করুন" → লাল বার্তা "১ টি রেকর্ডে আগের ছবি আছে …" আসবে (কিছু বদলাবে না); তারপর "পরিবর্তন বাতিল"।
6. `/admin/projects` → ঘর নির্মাণের "অপ্রকাশ করুন" → ডায়ালগে ১০টি রেকর্ড ও ৩টি URL দেখুন → **"বাতিল" চাপুন** (নাম লিখবেন না, নিশ্চিত করবেন না)।
7. **দুই ট্যাব:** পরীক্ষা প্রকল্পের সেটিংস দুই ট্যাবে খুলুন; প্রথমটিতে ইংরেজি নাম বদলে সংরক্ষণ; দ্বিতীয়টিতে (রিফ্রেশ না করে) অন্য কিছু বদলে সংরক্ষণ → "অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন" বার্তা আসা চাই।
8. ফোনে `/admin` → "এডমিন মেনু" ড্রয়ার খোলে কি না।
9. ফলাফল (বিশেষত ১, ৩, ৫, ৭) জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build`, `npm run i18n-check` (৫৯৫ = ৫৯৫) | ✅ |
| আসল SQL ১০–১২ (লোকাল Postgres) এ উইজার্ডের ইনপুট: ৪টি টেমপ্লেটই `project_create` এ তৈরি হয় (সবসময় খসড়া); অনুদান টেমপ্লেটে রেকর্ড চলে (ইউনিয়ন ঐচ্ছিক), টাকা আবশ্যক, স্ট্যাটে মোট টাকা ও মোট ক্যাটাগরি; slug `admin`/`src`/ডুপ্লিকেট/`123` আটকায়; প্রকাশিত প্রকল্পের slug বদল আটকায়; semi_pucca ছবি-মোড বদল আটকায় ("1 টি রেকর্ডে আগের ছবি আছে …"); পুরনো `updated_at` এ দ্বিতীয় সংরক্ষণ ০ সারি (→ CONFLICT); anon খসড়া ও তার রেকর্ড দেখে না; তৈরি লগে — ১৫/১৫ | ✅ |
| `npm run admin-ui-check` (নকল মূল এডমিন; পড়া লাইভ, লেখা আটকানো) ৩২/৩২ — ড্যাশবোর্ডের কার্ড ও সংখ্যা, তালিকার ক্রম, অপ্রকাশ-ডায়ালগ (১০টি রেকর্ড, ৩টি URL, ভুল/সঠিক নাম, বাতিলে কোনো লেখা নয়), উইজার্ড (slug/key/প্রিফিক্স নিজে "demo", উদাহরণ, ৫ রকম slug-ত্রুটি, `project_create` এর ইনপুট ও ৩টি ফিল্ড/৫টি কার্ড, সেটিংসে যাওয়া), সেটিংস (প্রকাশিতের URL নিষ্ক্রিয়, শুধু বদলানো কলাম + `updated_at=eq.`, গার্ড-বার্তা, CONFLICT বার্তা), ৩৯০px ড্রয়ার (ওভারফ্লো নেই, সব ≥ ৪৪px), কোনো page error নেই, **অচেনা কোনো লেখা-অনুরোধ নেই** | ✅ |
| চোখে দেখা: ড্যাশবোর্ড, অপ্রকাশ-ডায়ালগ, উইজার্ড, সেটিংসের গার্ড-বার্তা, ফোনের ড্রয়ার (স্ক্রিনশট) | ✅ |
| `npm run smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; পাবলিক স্ক্রিনশট M-ধাপ ৬-এর মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ — M-ধাপ ৬-এর পরিকল্পিত বদল) | ✅ |
| `adapter-check` ২৫/২৫, `field-types-check` ৭৭/৭৭ | ✅ |
| লাইভে আসল এডমিন লগইনে (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৮** — ফিল্ড বিল্ডার আর স্ট্যাট কার্ড বিল্ডার (প্রকল্পের সেটিংসে "ফিল্ড" ও "পরিসংখ্যান" ট্যাব)। §৪-এর পরীক্ষা প্রকল্প (`demo`) সেখানে কাজে লাগবে।
- পেস্ট করুন: `M-ধাপ ৮ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৮ — ফিল্ড বিল্ডার আর স্ট্যাট কার্ড বিল্ডার (২০২৬-১০-০৫) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · লাইভে এডমিন-পরীক্ষা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **প্রকল্পের সেটিংসে দুটি নতুন ট্যাব** (`ProjectSettingsPage`): "ফিল্ড" ও "পরিসংখ্যান" (`?tab=fields|stats`)। গ্রুপে শুধু "সাধারণ" ও "পরিসংখ্যান"। এই দুই ট্যাব নিজে সংরক্ষণ করে, তারপর রেজিস্ট্রি ও পাতা নতুন করে আনে; অন্য ট্যাবে অসংরক্ষিত পরিবর্তন থাকলে বন্ধ থাকে (বার্তাসহ)।
- **`tabs/FieldsTab.tsx`:**
  - প্রথমে **সিস্টেম ফিল্ড 🔒**: দুই ভাষার লেবেল বদলানো যায়। সাল, নাম, বিভাগ-জেলা-উপজেলা সবসময় "🔒 আবশ্যক"। পিতা/স্বামী ও ঠিকানা আবশ্যক/ঐচ্ছিক/বন্ধ; ইউনিয়ন আবশ্যক/ঐচ্ছিক (বন্ধ নেই — ঠিকানার স্তর "সাধারণ" ট্যাবে)। "সিস্টেম ফিল্ড সংরক্ষণ" → `core_fields` (`updated_at` মেলানো)।
  - তারপর **কাস্টম ফিল্ড**: ধরন ও ব্যাজ (আবশ্যক, টেবিলে, কার্ডে, ফিল্টারে, 🔒 শুধু-এডমিন, ইংরেজি নেই, আর্কাইভ); ↑↓ (`project_fields_reorder`); সম্পাদনা; আর্কাইভ/ফেরত আনুন; মুছুন (শুধু মূল এডমিন)।
  - **মোছার আগে `project_field_usage`:** মান থাকলে "«…» মোছা যাবে না — ৩২টি রেকর্ডে মান আছে — মোছা যাবে না, আর্কাইভ করুন" + "আর্কাইভ করুন" বোতাম; না থাকলে "মুছে ফেলবেন?"।
- **`FieldEditorDrawer.tsx`** (ডান দিকের ড্রয়ার; ফোনে পুরো পর্দা):
  - ধরন (লেখা, বড় লেখা, সংখ্যা, টাকা, **ক্যাটাগরি (শীটের লেখা থেকে)** — অপশন-তালিকা নেই, তারিখ, মোবাইল নম্বর), দুই ভাষার লেবেল ও সাহায্য-লেখা।
  - **key নিজে তৈরি** (§৫.৩): ইংরেজি লেবেল থেকে; না থাকলে বাংলার লিপ্যন্তর ("উপকরণের নাম" → `upokoroner_nam`); তাও না হলে `field_<n>`। সংরক্ষিত নাম (`name`, `year` …, `prev_`/`current_`) এড়ায়, একই থাকলে `_2`। হাতে বদলানো যায়, সাথে সাথে যাচাই।
  - **ডাটা থাকলে** (`project_field_usage` > ০) key, ধরন ও পাবলিক/গোপন লক, কারণসহ।
  - পাবলিক / 🔒 শুধু-এডমিন। মোবাইল নম্বর সবসময় শুধু-এডমিন। লেবেলে ফোন/মোবাইল/NID/জাতীয় পরিচয় থাকলে লাল পরামর্শ।
  - কোথায় দেখাবে: আবশ্যক, বিস্তারিত, টেবিলে, মোবাইল কার্ডে, ফিল্টারে, সার্চে, ইম্পোর্টে ফিল-ডাউন। শুধু-এডমিন হলে টেবিল/কার্ড/ফিল্টার/সার্চ বন্ধ।
  - টেবিলের কলাম-গণনা "কলাম: ৭/৯"; ৯টি হলে "টেবিলে" বন্ধ ("টেবিলে সর্বোচ্চ ৯টি কলাম — এখন ৯/৯")। ঠিকানা "একসাথে" হলে বিভাগ-জেলা-উপজেলা-ইউনিয়ন মিলে একটি কলাম।
  - সর্বোচ্চ দৈর্ঘ্য, সর্বনিম্ন/সর্বোচ্চ মান, ইম্পোর্টের বিকল্প শিরোনাম (কমা দিয়ে)।
  - সংরক্ষণে শুধু বদলানো ঘর (`updateField`), নতুনটি তালিকার শেষে (`createField`)। ডাটাবেসের ত্রুটি বাংলায়।
- **`FieldPreview.tsx`:** ফর্ম (নমুনা মানসহ), টেবিলের সারি (কলাম n/৯), মোবাইল কার্ড — ড্রয়ারে আর ফিল্ড ট্যাবের পাশে।
- **`tabs/StatsTab.tsx` + `StatCardPicker.tsx`:**
  - উপরে **আসল সংখ্যায় প্রিভিউ** (`project_stats`) আর "হোম পেইজের কার্ডে: …"।
  - প্রতিটি কার্ড: দুই ভাষার লেবেল, হোমে দেখান (+ হোমের আলাদা লেবেল, ঐচ্ছিক), আইকন (১০টি), ↑↓, সরান। গণনা "মোট ৬/৮ · হোমে ৩/৩"; হোমে ৩টি হলে বাকিগুলোর "হোমে দেখান" বন্ধ; ৮টি হলে নতুন যোগ বন্ধ।
  - নতুন কার্ড: গণনা, এলাকা কভার (বিভাগ/জেলা/উপজেলা/ইউনিয়ন), যোগফল (টাকা/সংখ্যার পাবলিক ফিল্ড), ক্যাটাগরি সংখ্যা। লেবেল ও আইকন নিজে প্রস্তাব হয় ("মোট টাকা"/"Total amount", টাকায় ৳ ফরম্যাট)। গ্রুপে শুধু গণনা ও এলাকা।
  - "কার্ড সংরক্ষণ করুন" → শুধু `stat_cards` (`updated_at` মেলানো; CONFLICT বার্তা)।
- **নতুন সহায়ক:**
  - `admin/projects/fieldRules.ts` — `fieldKeyFrom`, `fieldKeyError`, `RESERVED_FIELD_KEYS` (ডাটাবেসের হুবহু), `SENSITIVE_LABEL`, `tableColumns`, `MAX_TABLE_COLUMNS = 9`, `MAX_FIELDS = 40`।
  - `lib/transliterate.ts` — বাংলা → ল্যাটিন।
  - `projects/stats/statCards.ts` — `cardValue`, `formatCardValue`, `suggestCard`, `newCardId`, `cardSummary`।
  - `projects/registry/statIcons.ts` + `statIconShapes.tsx` + `StatIcon.tsx` — স্ট্যাট কার্ডের আইকন (প্রথম চারটি আগের `StatCards` এর হুবহু)।
- `en.ts`: +১০৭টি লেখা (৭০২ = ৭০২); `i18n-check`: `transliterate.ts` (লিপ্যন্তরের অক্ষর-তালিকা) বাদ।
- পরীক্ষা: `field-types-check` এ key ও কলাম-গণনা আর স্ট্যাট কার্ডের অংশ (৯৩); `admin-ui-check` এ ফিল্ড ও পরিসংখ্যান ট্যাব (৫৪)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **লক তিনটি জিনিসে** (key, ধরন, পাবলিক/গোপন) — ডাটাবেসের `project_fields_guard`-ও ঠিক এগুলো আটকায়; লেবেল, দেখানোর জায়গা, আবশ্যক, সীমা পরে বদলানো যায়।
- **ফিল্টার শুধু লেখা/ক্যাটাগরি/সংখ্যা/টাকায়, সার্চ শুধু লেখা/বড় লেখা/ক্যাটাগরিতে** — তারিখ বা মোবাইলে ফিল্টার/সার্চের মানে হয় না (মোবাইল তো গোপনই)।
- **কলাম-গণনায় ক্রম, ছবি ও "বিস্তারিত" ধরা হয় না** — এগুলো সবসময় থাকে; ৯টি ডাটা-কলাম ডেস্কটপে অনুভূমিক স্ক্রল ছাড়া ধরে (§৫.১৪)। ঘর নির্মাণের এখনকার টেবিল = ৮টি, অনুদান টেমপ্লেট = ৭টি।
- **ইংরেজি লেবেল খালি রাখা যায়** (কার্ড ও ফিল্ড) — শুধু "ইংরেজি নেই" ব্যাজ ও প্রকাশের চেকলিস্টে সতর্কতা; বাংলা লেবেল আবশ্যক।
- **প্রশ্ন ৭ — ডিফল্ট প্রয়োগ (উত্তর আসেনি):** এক রেকর্ডে একটি উপকরণ ও একটি টাকা; একই ব্যক্তি আবার পেলে নতুন রেকর্ড। "অনুদান/উপকরণ" টেমপ্লেট এভাবেই আছে। পরিকল্পনা §১২-এ লেখা।
- **লিপ্যন্তর নিখুঁত নয়:** যেমন "মন্তব্য" → `montobj` (য-ফলা "j")। key হাতে বদলানো যায় (ডাটা আসার আগে), আর ইংরেজি লেবেল দিলে তা থেকেই key হয়।
- **দক্ষতা ভিত্তিকের key:** উইজার্ড key বানায় URL অংশ থেকে (M-ধাপ ৭-এর সিদ্ধান্ত), তাই `skill-based-entrepreneur` দিলে key হতো `skill_based_entrepreneur`, পরিকল্পনার `skill_entrepreneur` নয়। কোড না বদলে উপায়: আগে `skill-entrepreneur` দিয়ে তৈরি, তারপর খসড়া অবস্থায় URL অংশ বদলানো (§৪-এর ধাপ ৭)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে লাইভ পরীক্ষা আমি করতে পারিনি — নিচে §৪ আপনার। লগইন ছাড়া যতটুকু সম্ভব করেছি: আসল SQL এ (লোকাল Postgres) ফিল্ড ও কার্ডের নিয়ম, আর ব্রাউজারে নকল এডমিন সেশনে পুরো UI (পড়া লাইভ, লেখা আটকানো) — §৫।
- নতুন ফিল্ড এখনো রেকর্ডের ফর্ম/ইম্পোর্ট/পাবলিক টেবিলে আসে না — রেকর্ড-ফর্ম M-ধাপ ১০, ইম্পোর্ট M-ধাপ ১১, পাবলিক পাতা M-ধাপ ১৩। নতুন কার্ড পাবলিক পাতায় আসবে M-ধাপ ১৩-এ (প্রিভিউতে এখনই দেখা যায়)।
- ক্যাটাগরির বানান এক করা (`project_field_rename_value`) ও "কাছাকাছি বানান" দেখানো M-ধাপ ১১-এ (ইম্পোর্টের সাথে)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
**ক. পরীক্ষা প্রকল্পে** (M-ধাপ ৭ §৪-এর ধাপ ২-এ বানানো `demo`; না থাকলে আগে বানান) → `/admin/projects/demo`:
1. "ফিল্ড" ট্যাব → "+ ফিল্ড যোগ করুন" → বাংলা লেবেল "উপকরণের নাম" লিখুন → key ঘরে `upokoroner_nam` আসা চাই। তারপর লেবেল "মোবাইল নম্বর" লিখুন → লাল সতর্কতা; ধরন "মোবাইল নম্বর" দিন → "পাবলিক" বাছাই বন্ধ হয়ে যাবে। "বাতিল"।
2. একটি ফিল্ড "নোট" (টেবিলে ✓) যোগ করুন, তারপর আরেকটি "মন্তব্য" (টেবিলে ✓)। তৃতীয়বার "+ ফিল্ড যোগ করুন" → "টেবিলে" বন্ধ, লেখা "এখন ৯/৯"। "বাতিল"।
3. "নোট" এর "মুছুন" → "মুছে ফেলবেন?" → মুছুন (রেকর্ড নেই, তাই মোছা যায়)। "মন্তব্য" এর ↑ চাপুন → ক্রম বদলাবে।
4. "পরিসংখ্যান" ট্যাব → প্রিভিউতে "মোট টাকা ৳ ০" ও "মোট ক্যাটাগরি ০"। "যোগফল" বেছে "+ কার্ড যোগ করুন" → নতুন কার্ড "মোট টাকা"; চতুর্থ কার্ডের "হোমে দেখান" বন্ধ দেখুন। একটি আইকন বদলে "কার্ড সংরক্ষণ করুন" → পাতা নতুন করে আনলেও থাকা চাই।
5. (রেকর্ড দিয়ে লকের পরীক্ষা M-ধাপ ১০-এ, রেকর্ড-ফর্ম এলে — এখন ডাটাবেসের নিয়মগুলো লোকাল Postgres এ যাচাই করা, §৫।)

**খ. আসল দুই প্রকল্প, খসড়া হিসেবে** (প্রশ্ন ২ এর উত্তর আসেনি — পরিকল্পনার প্রস্তাবিত নাম। অন্য নাম চাইলে **তৈরির আগে** জানান, কারণ key পরে বদলানো যায় না):
6. "নতুন প্রকল্প" → "অনুদান/উপকরণ ধরন" → "একক প্রকল্প" → বাংলা **স্বাবলম্বী প্রকল্প**, ইংরেজি **Self-Reliance Project** → URL অংশ `self-reliance` (key নিজে `self_reliance`) → ফাইল-প্রিফিক্স `sr` → "খসড়া হিসেবে তৈরি করুন"।
7. আবার "নতুন প্রকল্প" → একই টেমপ্লেট → বাংলা **দক্ষতা ভিত্তিক উদ্যোক্তা প্রকল্প**, ইংরেজি **Skill-Based Entrepreneur Project** → **URL অংশ প্রথমে `skill-entrepreneur` লিখুন** (তাহলে key হবে পরিকল্পনার `skill_entrepreneur`) → প্রিফিক্স `skill` → তৈরি করুন। তারপর সেটিংসের "সাধারণ" ট্যাবে URL অংশ `skill-based-entrepreneur` করে সংরক্ষণ (খসড়ায় বদলানো যায়)।
8. দুটোতেই "ফিল্ড" ট্যাব দেখে নিন: ক্যাটাগরি (আবশ্যক), উপকরণের নাম/বিবরণ (ঐচ্ছিক), টাকা (আবশ্যক, পাবলিক); ইউনিয়ন ঐচ্ছিক; কোনো গোপন ফিল্ড নেই (প্রশ্ন ৪, ৫, ৭, ৮, ১১, ১৩)। দরকার হলে লেবেল বদলান।
9. **প্রকাশ করবেন না, কোনো রেকর্ড দেবেন না।**
10. ফলাফল জানান (বিশেষত ১, ২, ৪, ৭)।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build` (মূল বান্ডল ৮২.২৬ KB gzip), `npm run i18n-check` (৭০২ = ৭০২) | ✅ |
| আসল SQL ১০–১২ (লোকাল Postgres), ড্রয়ারের হুবহু শেপে: গোপন মোবাইল-ফিল্ড তৈরি হয়; পাবলিক মোবাইল, টেবিলে গোপন ফিল্ড, সংরক্ষিত key `name` আটকায়; বাংলা থেকে বানানো key ও বিকল্প শিরোনাম চলে; একটি রেকর্ডের পর `project_field_usage` = ১; ডাটা থাকা ফিল্ডের মোছা ("1 টি রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন"), ধরন ও key বদল আটকায়; লেবেল/দেখানো বদল ও আর্কাইভ চলে; ডাটা নেই এমন ফিল্ড মোছা যায়; গোপন ফিল্ডের মান পাবলিক `extra` তে আটকায়; ৯টি কার্ড, হোমে ৪টি, ফিল্ড ছাড়া যোগফল-কার্ড আটকায়; ইংরেজি লেবেল ছাড়া বৈধ কার্ড চলে; **anon প্রকাশিত প্রকল্পের শুধু পাবলিক ফিল্ড দেখে** — ১৯/১৯ | ✅ |
| `npm run admin-ui-check` ৫৪/৫৪ (আগের ৩২ + ২২): সিস্টেম ফিল্ডের স্থির আবশ্যক ও ইউনিয়নে "বন্ধ" নেই; "উপকরণের নাম" → `upokoroner_nam`; প্রিভিউ ও "কলাম: ৭/৯"; লাল সতর্কতা; মোবাইল → শুধু-এডমিন বাধ্যতামূলক; ধরনের তালিকায় ক্যাটাগরি; নতুন ফিল্ডের POST; **১০ম টেবিল-কলাম বন্ধ (৯/৯)**; **৩২টি রেকর্ডে মান থাকলে ধরন ও key লক, মোছায় আর্কাইভের প্রস্তাব** → শুধু `is_active=false`; ডাটাহীন ফিল্ডে DELETE; ↓ → `project_fields_reorder`; **প্রিভিউতে মোট টাকা ও মোট ক্যাটাগরি**; "মোট ৫/৮ · হোমে ৩/৩", চতুর্থ হোম বন্ধ; যোগফল-কার্ডের নিজে লেবেল; সংরক্ষণে শুধু `stat_cards` + `updated_at=eq.`; কোনো page error নেই; অচেনা কোনো লেখা-অনুরোধ নেই | ✅ |
| `npm run security-check` ৩৭/৩৭ (লাইভে anon গোপন টেবিল/ফিল্ড পড়তে পারে না) | ✅ |
| `field-types-check` ৯৩/৯৩ (key: ইংরেজি, শুধু বাংলা, সংরক্ষিত, ডুপ্লিকেট, খালি; কলাম: সেমিপাকা ৮, অনুদান ৭; কার্ডের মান ও প্রস্তাবিত লেবেল), `adapter-check` ২৫/২৫ | ✅ |
| `npm run smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; পাবলিক স্ক্রিনশট আগের মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ — M-ধাপ ৬-এর পরিকল্পিত বদল) | ✅ |
| চোখে দেখা: ফিল্ড ট্যাব (ব্যাজ, আর্কাইভ, প্রিভিউ), পরিসংখ্যান ট্যাব (প্রিভিউ, আইকন, হোম-সীমা) — স্ক্রিনশট `.smoke/admin-fields.png`, `.smoke/admin-stats.png` | ✅ |
| লাইভে আসল এডমিন লগইনে (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ৯** — ইউনিয়নের ডাটা আর ঠিকানা নির্বাচক (মূল বান্ডল না বাড়িয়ে)। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ৯ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ৯ — ইউনিয়নের ডাটা আর ঠিকানা নির্বাচক (২০২৬-১০-০৫) — ✅ সম্পন্ন (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **ভূগোল নতুন জায়গায় (`git mv`):** `features/housing/data/bdGeo.ts` → `features/geo/data/bdGeo.ts`; `features/housing/utils/geo.ts` → `features/geo/geo.ts`; `features/housing/utils/geoMatch.ts` → `features/geo/geoMatch.ts`। ৯টি ফাইলের import বদল (`@/features/geo/…`), `scripts/build-map.mjs` সহ। কোড-আচরণ একই।
- **`scripts/build-unions.mjs`** (`npm run build-unions`):
  - উৎস: nuhil/bangladesh-geocode (MIT), পিন করা কমিট `5622f68` (২০২৩-০৩-১৭ — bdGeo.ts এর একই উৎস)। ফাইলগুলো নামিয়ে **sha256 মিলিয়ে** নেয় (উৎস বদলালে থামে); `--src DIR` দিলে নামায় না।
  - পরিষ্কার: ৯০৮টি নাম NFC, ৪টির শুরুতে ফাঁকা, **১টিতে অদৃশ্য অক্ষর** (ব্রা‏হ্মন্দী — U+200F; পরিকল্পনায় ছিল না), ৩টি ডুপ্লিকেট জোড়া (চরফ্যাশন: আওয়াজপুর, বড়লেখা: তালিমপুর, তেতুলিয়া: ভজনপুর), ২টি ভাঙা ইংরেজি নাম (`1nomohadevpur` → Mahadevpur, `Maijchar9` → Maijchar)।
  - bdGeo.ts এর সাথে join: ৪৯৪/৪৯৪ উপজেলা মেলে (না মিললে থামে); তারপর `unionOverrides.json` মেশায়।
  - ফল: **৪,৫৩৭টি ইউনিয়ন, ৪৮৯/৪৯৪ উপজেলা**, ২০০ KB (৫২.৬ KB gzip), এক লাইনে এক উপজেলা (git diff পড়া যায়)। `--check`: ফাইলটি হালনাগাদ কি না।
- **`features/geo/data/bd-unions.json`** আর **`unionOverrides.json`** (add/rename/remove — এখন খালি; শুধু নিশ্চিত সরকারি তালিকা থেকে)।
- **`features/geo/unions.ts`:** `loadUnions()` (lazy `import()` — আলাদা chunk, একবারই নামে, ব্যর্থ হলে পরের বার আবার), `useUnionData(enabled)`, `unionsOf`, `hasUnionList`, **`gnUnion(জেলা, উপজেলা, ইউনিয়ন)`** — ইংরেজি মোডে তালিকার ইংরেজি নাম (পুরো পথ ধরে; একই নাম দেশে ৩২৪টি), "X পৌরসভা" → "X Municipality"।
- **`geoMatch.ts` — ৪র্থ স্তর:** `matchUnion(raw, unions, জেলা, উপজেলা)` আর `unionLooseKey` — বাদ যায় শুধু "ইউনিয়ন", "ইউপি", "union", "UP"; **"পৌরসভা" ও "ওয়ার্ড" বাদ যায় না** ("মীরসরাই পৌরসভা" ইউনিয়ন "মীরসরাই" এর সাথে মেলে না)। `resolveGeo(…, fixes, { union, unions })` → `union: { value, status: exact | corrected | unlisted | no_list | empty, suggestions }` — কখনো ত্রুটি নয়। `union` না দিলে ফল আগের হুবহু।
- **`GeoSelect.tsx`:** বিভাগ → জেলা → উপজেলা (→ ইউনিয়ন); উপরেরটা বদলালে নিচেরগুলো খালি; RecordForm এর ড্রপডাউনের হুবহু চেহারা ও id।
- **`UnionCombobox.tsx`:** নির্বাচিত উপজেলার ইউনিয়ন সাজেশন (≥ ৪৪px); লিখলে ছোট হয়; ↑↓/Enter/Esc (Enter ফর্ম সাবমিট করে না); নিজে লেখা চলে; তালিকায় না থাকলে **হলুদ সতর্কতা** + "কাছাকাছি:" পরামর্শ (সংরক্ষণ আটকায় না); **"+ মীরসরাই পৌরসভা" চিপ**; "করেরহাট ইউনিয়ন" লিখে ঘর ছাড়লে তালিকার বানান "করেরহাট"; তালিকাহীন উপজেলায় "নিজে লিখুন"; ইংরেজি মোডে "Korerhat (করেরহাট)", ডাটায় সবসময় বাংলা।
- **শুধু-dev ডেমো পাতা** `src/dev/geo-demo.html` (+ `GeoDemo.tsx`, `geoDemoMain.tsx`) — `npm run dev` চালিয়ে `http://localhost:5173/src/dev/geo-demo.html`। প্রোডাকশন বিল্ডে নেই।
- `i18n-check` IGNORE: `features/geo/data/` (bdGeo, ইউনিয়নের JSON), `geo/unions.ts` ("পৌরসভা" ডাটার শব্দ), `src/dev/`। `en.ts`: +৯টি লেখা (৭১১ = ৭১১)।
- নতুন পরীক্ষা `scripts/geo-check.mjs` (`npm run geo-check`)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ইউনিয়নের ঘর এখনো কোনো আসল ফর্মে নেই** — পরিকল্পনা অনুযায়ী রেকর্ড-ফর্মে `GeoSelect` (ইউনিয়নসহ) বসবে M-ধাপ ১০-এ। ঘর নির্মাণের লাইভ ফর্মে এই ধাপে হাত দেওয়া হয়নি। তাই পরীক্ষার জন্য শুধু-dev ডেমো পাতা।
- **"৪,৫৪০টি ইউনিয়ন" (পরিকল্পনার পরীক্ষা) = উৎসের সংখ্যা;** ৩টি ডুপ্লিকেট বাদে ফাইলে **৪,৫৩৭**। একইভাবে "দেশে একাধিকবার" নাম উৎসে ৩২৭, ডুপ্লিকেট বাদে ৩২৪।
- **ফাইলের সাথে সাথে sha256:** স্ক্রিপ্ট ইন্টারনেট থেকে নামায়, তাই উৎস বদলে গেলে (বা অন্য কিছু এলে) চুপচাপ নতুন ডাটা না ঢুকে থেমে যায়।
- **বিভাগ/জেলা/উপজেলার মেলানো হুবহু আগের মতো** — ইউনিয়নের জন্য আলাদা নিয়ম (`mode: 'union'`); পুরনো আর নতুন `resolveGeo` ২৭,৫০৯টি ইনপুটে মিলিয়ে দেখা, পার্থক্য ০।
- **পৌরসভা লিখলেও হলুদ সতর্কতা** (পরিকল্পনার পরীক্ষা অনুযায়ী) — তালিকায় পৌরসভা নেই; লেখা থাকে, সংরক্ষণ আটকায় না।
- **ইউনিয়ন ফিল্টারের অপশন** (ডাটাবেসের `stats.by_union` থেকে) পাবলিক পাতার কাজ — M-ধাপ ১৩।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- ৫টি উপজেলার (গুইমারা, নলডাঙ্গা, ঈদগাঁও, মধ্যনগর, ডাসার) ইউনিয়ন-তালিকা নেই — অনুমান করে বানানো হয়নি; সেখানে নিজে লিখতে হবে (প্রশ্ন ১৭)।
- উৎসের কিছু বাংলা নামে উৎসের নিজস্ব বানান (যেমন "জি,এম, হাট", "আবদুল্লাহ"/Abdullahpur) — যেমন আছে রাখা; ভুল জানা থাকলে `unionOverrides.json` এ `rename` দিয়ে ঠিক করা যায়।
- ইম্পোর্টে ইউনিয়নের কলাম M-ধাপ ১১-এ (`resolveGeo` এর ৪র্থ স্তর তৈরি)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. **`npm run dev` বন্ধ করে আবার চালু করুন** (ফাইল সরানো হয়েছে — পুরনো সার্ভার 404 দিতে পারে)।
2. (ঐচ্ছিক) দেখতে চাইলে: `http://localhost:5173/src/dev/geo-demo.html` → চট্টগ্রাম → চট্টগ্রাম → মীরসরাই → ইউনিয়নের ঘরে চাপুন (১৬টি নাম); "+ মীরসরাই পৌরসভা" চাপুন (হলুদ সতর্কতা); উপরে "EN" করে দেখুন।
3. **প্রশ্ন ১৭:** গুইমারা, নলডাঙ্গা, ঈদগাঁও, মধ্যনগর, ডাসার — এই ৫টি উপজেলার ইউনিয়নের **নিশ্চিত** তালিকা (বাংলা ও ইংরেজি নাম) থাকলে দিন; আমি `unionOverrides.json` এ যোগ করব। না থাকলে কিছু করার নেই।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build`, `npm run i18n-check` (৭১১ = ৭১১) | ✅ |
| `npm run build-unions`: উৎস ৪,৫৪০টি ইউনিয়ন / ৪৯৪টি উপজেলা → ফল **৪,৫৩৭টি ইউনিয়ন, ৪৮৯/৪৯৪ উপজেলা**; NFC নয় ৯০৮, ফাঁকা ৪, অদৃশ্য অক্ষর ১, ডুপ্লিকেট ৩, ইংরেজি ঠিক ২; তালিকাহীন ৫টি; ৫২.৬ KB gzip; `--check` ✓ | ✅ |
| `npm run geo-check` ৫৫/৫৫ — ডাটা (সংখ্যা, join, NFC, ডুপ্লিকেট, **মীরসরাই ১৬টি**), মেলানো ("করেরহাট ইউনিয়ন/ইউপি/Union/UP" → করেরহাট; "মীরসরাই পৌরসভা"/"ওয়ার্ড" মেলে না; অন্য উপজেলার নাম মেলে না; `resolveGeo` এর ৪র্থ স্তর ও আগের আচরণ), `gnUnion` (Korerhat, Mirsharai Municipality, একই নাম ভিন্ন পথে ভিন্ন ইংরেজি), **ব্রাউজারে**: পাতা খোলায় ডাটা নামে না, মীরসরাইতে ১৬টি সাজেশন (≥ ৪৪px), লিখলে ছোট হয়, ↓+Enter, বানান-সংশোধন, **"মীরসরাই পৌরসভা" লেখা যায় + হলুদ সতর্কতা**, চিপ, "কাছাকাছি:" পরামর্শ, উপজেলা বদলালে খালি, গুইমারায় নিজে লেখা, **ইংরেজি মোডে ইংরেজি নাম** ("Korerhat (করেরহাট)", ডাটায় বাংলা), ৩৯০px এ ওভারফ্লো নেই, কোনো page error নেই; **বিল্ড**: প্রোডাকশন বিল্ডে ইউনিয়নের ডাটা নেই, **মূল বান্ডল বাড়েনি** (২৭২,৮০৭ বাইট — M-ধাপ ৮ এর হুবহু, hash-ও এক), ডেমোসহ বিল্ডে **ইউনিয়ন আলাদা chunk এ** (`bd-unions-*.js`, ৫২.৬ KB gzip), শুধু lazy `import()` দিয়ে | ✅ |
| `geoMatch` আগে বনাম পরে (`git show HEAD` এর পুরনো ফাইল): দেশের সব বিভাগ/জেলা/উপজেলা × বানান-ভিন্নতা — ২৭,৫০৯টি ইনপুট, পার্থক্য ০ | ✅ |
| `npm run smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; স্ক্রিনশট আগের মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ — M-ধাপ ৬-এর পরিকল্পিত বদল) | ✅ |
| `admin-ui-check` ৫৪/৫৪, `security-check` ৩৭/৩৭, `field-types-check` ৯৩/৯৩, `adapter-check` ২৫/২৫, `content-check` ✓ | ✅ |
| চোখে দেখা: ডেমো পাতা বাংলা/ইংরেজি/৩৯০px (`.smoke/geo-demo*.png`) | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১০** — জেনেরিক রেকর্ড ফর্ম (`GeoSelect` ইউনিয়নসহ, টাকার ঘর, শুধু-এডমিন অংশ), এডমিন রেকর্ড তালিকা, ক্যাটাগরির বানান এক করা আর CSV এক্সপোর্ট। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১০ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১০ — জেনেরিক রেকর্ড ফর্ম, এডমিন রেকর্ড তালিকা আর CSV এক্সপোর্ট (২০২৬-১০-০৫) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · লাইভে এডমিন-পরীক্ষা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **রেকর্ড এখন যেকোনো প্রকল্পের** (খসড়াও; গ্রুপ নয়): `/admin/records/:key` (`useRecordProjectByKey`)। এডমিন মেনুর "রেকর্ড" অংশে সব প্রকল্প — খসড়ায় "(খসড়া)"। ড্যাশবোর্ডের "রেকর্ড" বোতামও সব প্রকল্পে।
- **ফাইল সরানো (`git mv`)** `features/housing` → `features/admin/records/`: `HousingAdminRecordsPage` → `AdminRecordsPage`, `HousingRecordFormPage` → `RecordFormPage`, `RecordForm`, `AdminRecordsTable`।
- **`RecordForm.tsx` — ফিল্ড-চালিত** (`resolveFields`):
  - **অপরিবর্তিত:** সিরিয়াল অংশ, সিরিয়াল বদলের ডায়ালগ, তৈরির পর এডিট মোডে যাওয়া, সংরক্ষণের পর ছবি কম্প্রেস করে আপলোড।
  - পরিচয়: সাল, নাম, পিতা/স্বামী — প্রকল্পের লেবেল, চালু/বন্ধ, আবশ্যক (যেমন "অনুদানের সাল")।
  - **`GeoSelect`**, ইউনিয়ন-স্তরের প্রকল্পে **ইউনিয়নসহ** (M-ধাপ ৯-এর কম্বোবক্স)।
  - বিস্তারিত ঠিকানা; ছবির মূল লিঙ্কের ঘর শুধু প্রকল্পের ছবির ঘরের জন্য।
  - **কাস্টম পাবলিক ফিল্ড** ("প্রকল্পের তথ্য"): ধরন অনুযায়ী ঘর।
    - টাকা: **`MoneyInput`** — "১,২০,০০০", "১২০০০০/-" দুটোই চলে; পাশে লাইভ "৳ ১,২০,০০০"; `inputMode="numeric"`।
    - ক্যাটাগরি: লেখার বক্স, সাথে **আগে ব্যবহৃত মানের সাজেশন** (বেশি ব্যবহৃত আগে)।
  - **"🔒 শুধু এডমিন তথ্য"** (গোপন ফিল্ড):
    - এডিটে আগে আনা হয়; না আসা পর্যন্ত সংরক্ষণ বন্ধ (আগের গোপন মান যেন মুছে না যায়)।
    - বদলালে তবেই আলাদা জায়গায় সংরক্ষণ (`setPrivate`)।
  - **ছবির ঘর ছবি মোড অনুযায়ী** (আগে-পরে: দুটি; শুধু-পরে: একটি; ছবি নেই: কোনোটি নয়), লেবেল প্রকল্প থেকে।
  - কাস্টম মান আগের মানের উপর বসে — **আর্কাইভ করা ফিল্ডের পুরনো মান মুছে যায় না**।
- **`AdminRecordsPage.tsx` + `AdminRecordsTable.tsx`:**
  - কলাম ও মোবাইল কার্ড কনফিগ থেকে (`recordColumns.ts`): পরিচয় → ঠিকানা (ইউনিয়নসহ) → "টেবিলে" চালু কাস্টম ফিল্ড → ছবি; কার্ডে "কার্ডে" চালু ফিল্ড।
  - **টাকার কলামে "এই পাতার মোট"**।
  - ক্যাটাগরি ফিল্টার (`f.<key>`, URL এ; মানের পাশে সংখ্যা)।
  - একই গ্রুপের প্রকল্পের ট্যাব (একক প্রকল্পে নেই)।
  - **মোছা (একটি ও বাল্ক, ছবিসহ) শুধু মূল এডমিনের** — সাধারণ এডমিনের কাছে বোতাম নেই (প্রশ্ন ১৬)।
- **`CategoryValuesPanel.tsx`** ("ক্যাটাগরির মান ও বানান"):
  - প্রতিটি মান ও কতটি রেকর্ডে।
  - কাছাকাছি বানান ("গাভী"/"গাভি") পাশাপাশি।
  - "এক বানানে আনুন" → কোন বানান থাকবে তা বেছে নিশ্চিতকরণ → `project_field_rename_value` (সব রেকর্ডে একসাথে, লগসহ)।
- **CSV এক্সপোর্ট — প্রকল্পভিত্তিক** (`recordsCsv.ts`):
  - হেডার = ফিল্ডের **বাংলা** লেবেল (ইংরেজি মোডেও), যাতে আবার ইম্পোর্ট করা যায়।
  - ক্যাটাগরি যেমন লেখা; টাকা/সংখ্যা ASCII সংখ্যা; আর্কাইভ ফিল্ডের পুরনো মান "(আর্কাইভ)" হেডারে।
  - UTF-8 BOM।
  - **গোপন ফিল্ড থাকলে জিজ্ঞাসা** (ডিফল্ট: গোপন ছাড়া); গোপনসহ হলে ফাইলনামে `-private`।
  - এক্সপোর্ট লগে যায় (`records_export`, শুধু সংখ্যা)।
- **ফর্মুলা-সুরক্ষা** (`csvExport.ts`): লেখার সেল `= + - @`, ট্যাব বা লাইন-ব্রেক দিয়ে শুরু হলে আগে `'`; সংখ্যার সেলে নয়। ইম্পোর্টে `importParse` এই `'` সরায় — এক্সপোর্ট → ইম্পোর্ট ঠিক ঘুরে আসে।
- **API (চুক্তি v১.১):** `HousingApi.getPrivateMany(projectKey, ids)` — অনেক রেকর্ডের গোপন মান এক কলে (≤ ১০০; গোপনসহ এক্সপোর্টের জন্য)। REST: `POST /api/projects/:key/records/private`। নতুন লগ-ইভেন্ট `records_export`। `docs/API_CONTRACT.md` হালনাগাদ।
- `PhotoField` এ `label`; `en.ts`: +২৮টি লেখা, ২টি অব্যবহৃত বাদ (৭৩৭ = ৭৩৭)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ঘর নির্মাণ — যা বদলেছে, ইচ্ছাকৃত:**
  - রেকর্ড-তালিকা আগের হুবহু (পুরনো কোড বনাম নতুন, পিক্সেল মিলিয়ে)।
  - ফর্মে নতুন **"ইউনিয়ন/পৌরসভা"** ঘর — প্রশ্ন ১২-এর উত্তর (ঘর নির্মাণে ইউনিয়ন থাকবে, আবশ্যক নয়)।
  - ছবির বাক্সের শিরোনাম এখন প্রকল্পের ছবির লেবেল থেকে — "পূর্বের ঘর"/"বর্তমান ঘর" (আগে "পূর্বের ঘরের ছবি"/"বর্তমান ঘরের ছবি")। আগের লেখা চাইলে সেটিংসের "ছবি" ট্যাবে লেবেল বদলান।
  - এক্সপোর্টে নতুন "ইউনিয়ন/পৌরসভা" কলাম; ছবির লিঙ্কের হেডার লেবেল থেকে ("পূর্বের ঘর (লিঙ্ক)") — বাল্ক ইম্পোর্ট এগুলো আগের মতোই চেনে।
  - হেডার ইংরেজি মোডেও বাংলা।
- **গোপনসহ এক্সপোর্টের জন্য নতুন API** — প্রতিটি রেকর্ডের জন্য আলাদা কল (শত শত কল) না করে এক পাতায় এক কল। ডাটাবেসে কোনো বদল লাগেনি (RLS-এ `beneficiary_private` শুধু এডমিন পড়েন)।
- **ক্যাটাগরি ফিল্টার শুধু "ফিল্টারে" চালু ক্যাটাগরি ফিল্ডে।** ইউনিয়নের ফিল্টার পাবলিক পাতার সাথে, M-ধাপ ১৩-এ (`stats.by_union` থেকে)।
- **ভুল টাকা ফর্মেই আটকায়** ("শুধু সংখ্যা দিন") — আর সরাসরি API দিয়ে পাঠালে ডাটাবেস বাংলায় আটকায় (§৫)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে লাইভ পরীক্ষা, ছবি আপলোড আর Excel-এ খোলা আমি করতে পারিনি — §৪ আপনার। লগইন ছাড়া যতটুকু সম্ভব: আসল SQL এ (লোকাল Postgres) সার্ভারের নিয়ম; ব্রাউজারে নকল এডমিন সেশনে পুরো CRUD (রেকর্ড, গোপন মান, বানান একীকরণ সব নকল-ভাণ্ডারে; লাইভে কিছু যায়নি)।
- ডাটাবেসের টাকার বার্তায় এখনো "০ থেকে ১০০০ কোটি" লেখা, অথচ আসল সীমা ১০,০০০ কোটি — আপনার উত্তরের অপেক্ষায় (M-ধাপ ৫খ থেকে খোলা প্রশ্ন)।
- কলাম বেশি হলে ডেস্কটপ টেবিল নিজের বাক্সে পাশে স্ক্রল করে (ঘর নির্মাণের টেবিলের মতোই); "পিতা/স্বামীর নাম" এর মতো শিরোনাম ভেঙে কয়েক লাইনে যায়।
- বাল্ক ইম্পোর্ট এখনো শুধু সিস্টেম ফিল্ডের — কাস্টম ফিল্ড ও ইউনিয়নসহ ইম্পোর্ট M-ধাপ ১১-এ।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
**ক. পরীক্ষা প্রকল্পে** (`/admin/records/demo`; মেনুতে "পরীক্ষা প্রকল্প (খসড়া)"):
1. "নতুন যোগ করুন" → ৩টি রেকর্ড যোগ করুন, প্রতিটিতে একটি ছবি ("উপকরণসহ ছবি")।
   - একটিতে টাকা "১,২০,০০০", আরেকটিতে "১২০০০০/-" লিখুন — পাশে "৳ ১,২০,০০০" দেখাবে।
   - একটির নাম দিন **=1+1**।
   - ক্যাটাগরিতে একটিতে "গাভী", আরেকটিতে "গাভি"।
   - (মোবাইলের মতো গোপন ফিল্ড যোগ করে থাকলে একটিতে নম্বর দিন।)
2. তালিকায় দেখুন:
   - টাকার কলাম আর "এই পাতার মোট"।
   - "ক্যাটাগরির মান ও বানান" খুলে "গাভী"/"গাভি" পাশাপাশি → "এক বানানে আনুন" → একটি বেছে নিশ্চিত করুন।
3. একটি রেকর্ড "এডিট" → "সিরিয়াল বদলান…" → নতুন সিরিয়াল দিন → ছবি এখনো দেখা যায় কি না দেখুন।
4. "সিরিয়াল সহ এক্সপোর্ট (CSV)" → ফাইলটি **Excel-এ খুলুন**।
   - বাংলা ঠিক দেখায় কি না।
   - "=1+1" নামটি **2 হয়ে যায় না**, লেখাই থাকে (সামনে ' দেখা যেতে পারে)।
   - টাকা সাধারণ সংখ্যা (120000)।
   - গোপন ফিল্ড থাকলে একবার "গোপন কলামসহ" বেছে দেখুন — ফাইলের নামে `-private`। ফাইলটি কাউকে পাঠাবেন না।

**খ. ঘর নির্মাণে — কিছু সংরক্ষণ করবেন না:**

5. `/admin/records/semi_pucca` খুলে দেখুন তালিকা আগের মতো কি না। একটি রেকর্ডের "এডিট" খুলুন — নতুন "ইউনিয়ন/পৌরসভা" ঘর ও ছবির বাক্সের শিরোনাম দেখুন। তারপর **"ফিরে যান"** চাপুন (সংরক্ষণ নয়)।
6. ফলাফল জানান (বিশেষত ১, ৩, ৪-এর Excel)।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build` (মূল বান্ডল ২৭৩.০৯ kB / ৮২.৪৩ KB gzip — +০.২৯ kB, এডমিন মেনু), `npm run i18n-check` (৭৩৭ = ৭৩৭) | ✅ |
| আসল SQL (লোকাল Postgres), ফর্মের হুবহু শেপে:<br>• **ভুল টাকা সরাসরি API তে** ("abc", ১২.৫, −১, আবশ্যক না দেওয়া, লেখা "১,২০,০০০") আর অচেনা key → **বাংলায় ত্রুটি**<br>• গোপন মান upsert (বাংলা অঙ্ক → ইংরেজি)<br>• পাবলিক key গোপন অংশে রাখা আটকায়<br>• getPrivateMany এর কুয়েরি<br>• এক বানানে আনা<br>• **anon: `beneficiary_private` পড়তে পারে না**, রেকর্ডের extra তে গোপন মান নেই, গোপন ফিল্ডের সংজ্ঞাও দেখে না, লিখতে পারে না | ✅ ১৬/১৬ |
| `npm run admin-ui-check` (আগের ৫৪ + ৩২; সব লেখা নকল-ভাণ্ডারে, লাইভে কিছু নয়):<br>• খসড়া demo এর রেকর্ড-পাতা ও নতুন ফর্ম: ইউনিয়ন, প্রকল্পের তথ্য, শুধু-এডমিন অংশ, একটিই ছবির ঘর "উপকরণসহ ছবি"<br>• **"১,২০,০০০" → পাশে "৳ ১,২০,০০০" ও 120000**; **"১২০০০০/-" → 120000**; ভুল টাকা ফর্মে আটকায়<br>• তৈরিতে extra/ইউনিয়ন ঠিক, মোবাইল আলাদা জায়গায়; ক্যাটাগরির সাজেশন<br>• তালিকায় কনফিগের কলাম, **পাতার মোট ৳ ২,৪০,০০০**, গোপন মান নেই; ক্যাটাগরি ফিল্টার; বানান একীকরণ<br>• এডিটে গোপন মান আসে, না বদলালে পাঠানো হয় না<br>• **এক্সপোর্ট**: BOM, বাংলা হেডার, **"=1+1" → "'=1+1"**, টাকা 150000, গোপন ছাড়া/সহ (`-private`), লগ<br>• বাল্ক ডিলেট (মূল এডমিন); **সাধারণ এডমিনের কাছে মোছার বোতাম নেই**; ৩৯০px কার্ড ও মোট | ✅ ৮৬/৮৬ |
| **ঘর নির্মাণ আগের মতো:** আলাদা git worktree-তে পুরনো কোড চালিয়ে আসল ১০টি রেকর্ডসহ স্ক্রিনশট বনাম নতুন — রেকর্ড-তালিকা ১২৮০px ও ৩৯০px **পিক্সেল-হুবহু**; ফর্ম লম্বা হয়েছে শুধু ইউনিয়নের ঘরে (§২) | ✅ |
| `field-types-check` ১০৬/১০৬ (+১৩: টাকা পার্স, ফর্মুলা-সুরক্ষা ও ঘুরে আসা, toCsv, ঘর নির্মাণ ও অনুদানের কলাম, CSV হেডার/সারি/ফাইলনাম, ইংরেজি মোডেও বাংলা হেডার) | ✅ |
| `geo-check` (প্রোডাকশন বিল্ডে ইউনিয়ন এখন আলাদা chunk এ, শুধু lazy — রেকর্ড-ফর্ম ব্যবহার করে) | ✅ ৩২/৩২ + ব্রাউজার ৫১/৫১ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; পাবলিক স্ক্রিনশট আগের মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ — M-ধাপ ৬-এর পরিকল্পিত বদল) | ✅ |
| `security-check` ৩৭/৩৭ (লাইভে anon গোপন মান পড়তে পারে না), `adapter-check` ২৫/২৫, `content-check` ✓ | ✅ |
| লাইভে আসল এডমিন লগইনে, ছবিসহ, Excel (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১১** — জেনেরিক ইম্পোর্ট উইজার্ড (কাস্টম ফিল্ড, ইউনিয়ন, ক্যাটাগরি, ফিল-ডাউন)। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১১ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১১ — জেনেরিক ইম্পোর্ট উইজার্ড (২০২৬-১০-০৫) — ✅ কোড ও পরীক্ষা সম্পন্ন · লাইভে এডমিন-পরীক্ষা বাকি (আপনি) · SQL ১৩ (টাকার সীমা) ✅ লাইভে চালানো (২০২৬-১০-০৬)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **টাকার সর্বোচ্চ সীমা ১০০০ কোটি** (আপনার উত্তর, ২০২৬-১০-০৫ — বার্তার প্রথম লাইন কাটা ছিল: "টাকার সর্বোচ্চ সীমা "১০০০"; ১০০০ কোটি ধরে নিয়েছি):
  - ক্লায়েন্ট: `MONEY_MAX = 1e10`, বার্তা "০ থেকে ১০০০ কোটির মধ্যে"।
  - ডাটাবেস: নতুন **`supabase/sql/13_money_limit.sql`** — `housing_field_value()` এর শুধু সংখ্যাটি বদলায়; আগে থেকে ১০০০ কোটির বেশি টাকা থাকলে থামে; নিজে-পরীক্ষা ও ফিঙ্গারপ্রিন্ট; আবার চালালে ক্ষতি নেই। ফেরাতে `rollback/13_rollback.sql`। চেকলিস্ট সারি ৩৪।
  - চুক্তিতে ১০০০ কোটি = 1e10 (v১.২)।
- **ইম্পোর্ট এখন যেকোনো প্রকল্পের** (`/admin/import?project=`; প্রকল্পের তালিকা রেজিস্ট্রি থেকে, খসড়াও)। ফাইল সরানো (`git mv`) → `features/admin/import/`: `ImportPage`, `importFields` (আগে importColumns), `importAnalyze` (আগে importValidate), `importParse`।
- **`buildImportFields(project)`:** সিরিয়াল, সিস্টেম ফিল্ড (প্রকল্পের লেবেল/চালু/আবশ্যক — যেমন "অনুদানের সাল"), ইউনিয়ন (ইউনিয়ন-স্তরের প্রকল্পে), ছবির মূল লিঙ্ক (ছবি মোড অনুযায়ী), কাস্টম ফিল্ড (লেবেল, key, ইম্পোর্টের বিকল্প শিরোনাম; গোপন ফিল্ড 🔒)।
- **কলাম মেলানোর ক্রম:** ① এক্সপোর্টের তথ্য-কলাম (সিস্টেম URL, ছবি আপডেট, রেকর্ড আইডি, আর্কাইভ) উপেক্ষা, জানিয়ে ② হুবহু শিরোনাম ③ লম্বা বিকল্প নাম আগে ("উপকরণের নাম" এর আগে "উপকরণ" নয়) ④ বাকিগুলো সিস্টেম ফিল্ডের পুরনো regex। **এক্সপোর্ট করা CSV আবার দিলে সব শিরোনাম নিজে মেলে।**
- **`analyzeRows` ফিল্ড-টাইপ রেজিস্ট্রি দিয়ে:**
  - টাকা: "১,২০,০০০"/"১২০০০০/-" → 120000; পার্স না হলে সারিতে ভুল আর ঘরটি **লাল**।
  - ক্যাটাগরি: শীটের মান যেমন আছে (শুধু NFC আর বাড়তি ফাঁকা এক)।
  - ইউনিয়ন (৪র্থ স্তর): তালিকার বানানে আনে ("করেরহাট ইউনিয়ন" → "করেরহাট"); তালিকায় না থাকলে হলুদ সতর্কতা, রাখা যায়।
  - গোপন মান আলাদা (নিচে)।
  - ডুপ্লিকেট-ব্যক্তি: নাম + পিতা + সবচেয়ে নিচের ঠিকানা-স্তর (ইউনিয়ন থাকলে ইউনিয়ন, নইলে উপজেলা)।
  - ফিল-ডাউন: প্রকল্পের ফিল্ডে "ইম্পোর্টে ফিল-ডাউন" চালু থাকলে (সিস্টেমে সাল/বিভাগ/জেলা/উপজেলা)।
- **`GeoFixPanel` ৪ স্তর:** বিভাগ/জেলা/উপজেলা না মিললে লাল প্যানেল (বাছতে হবে, নইলে সারি বাদ); ইউনিয়ন তালিকায় না থাকলে আলাদা হলুদ প্যানেল (ঐচ্ছিক — "যেমন লেখা তেমন রাখুন" বা তালিকা থেকে)।
- **`CategoryReviewPanel` (ঐচ্ছিক — ইম্পোর্ট আটকায় না):** শীটের প্রতিটি ক্যাটাগরি মান ও কত সারিতে; ডাটাবেসে আগে থেকে আছে (✓) নাকি নতুন; কাছাকাছি বানান পাশাপাশি → "এক বানানে আনুন: «গাভী»" (শীটের মান বদলায়, ডাটাবেস নয়; বাতিল করা যায়); "মোট ক্যাটাগরি (ইম্পোর্টের পর)"।
- **"সিরিয়াল ধরে আপডেট" মোড** (স্ক্রিনে নিয়মের ছোট ব্যাখ্যা):
  - শুধু সিরিয়াল কলাম আবশ্যক; শুধু ম্যাপ করা ও খালি নয় এমন ঘর পাঠানো হয়।
  - খালি ঘর = অপরিবর্তিত।
  - ঘরে **`(মুছুন)`** লিখলে সেই মান মোছে (`_clear`)। আবশ্যক ঘরে (সাল, নাম, ঠিকানার স্তর, আবশ্যক ফিল্ড) `(মুছুন)` → ভুল; গোপন ঘরে চলে না (সতর্কতা)।
  - এই মোডে ফিল-ডাউন নেই (খালি মানে অপরিবর্তিত)।
- **গোপন কলাম আলাদা পাঠানো:** নতুন যোগের পর একই সিরিয়ালে শুধু গোপন মান (ডাটাবেস সেগুলো `beneficiary_private` এ রাখে); আপডেটে `extra` দিয়ে, ডাটাবেস আলাদা করে।
- অ্যাডাপ্টার: `extra` বাদ যায় শুধু প্রকল্পে কোনো কাস্টম ফিল্ডই না থাকলে (আগে "পাবলিক ফিল্ড না থাকলে" — তাতে শুধু-গোপন-ফিল্ডের প্রকল্পে বাল্ক-আপডেটে গোপন মান হারাত)।
- **`docs/API_CONTRACT.md` v১.২:** খালি = অপরিবর্তিত, `_clear` শুধু পাবলিক, শীটের `(মুছুন)` রীতি, গোপন key → গোপন অংশে মার্জ (আগের TBD চূড়ান্ত), টাকার সীমা।
- `en.ts`: +২৭টি লেখা (৭৬২ = ৭৬২)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **পুরনো ম্যাপিং-বাগ ঠিক হয়েছে:** আগে "উপজেলা" শিরোনামে `/জেলা/` regex ও মিলে যেত — শীটে উপজেলার কলাম জেলার আগে থাকলে উপজেলার কলাম "জেলা" হিসেবে বসত। এখন আগে হুবহু শিরোনাম মেলে। পুরনো বনাম নতুন ৪,০০০টি এলোমেলো ঘর-নির্মাণ-শীটের শিরোনামে: ২,০৬৮টি হুবহু এক, ১,৯৩২টিতে শুধু এই বাগটি ঠিক হয়েছে, অন্য কোনো পার্থক্য ০।
- **ঘর নির্মাণের প্রিভিউ — যা বদলেছে:** ছবির লিঙ্কের ম্যাপিং-লেবেল প্রকল্পের লেবেল থেকে ("পূর্বের ঘর (লিঙ্ক)"; M-ধাপ ১০-এর মতো); ভুল সাল ("৩০২৪") এখন সাল-ঘরেই লাল (আগে শুধু অবস্থা-কলামে লেখা থাকত)। বাকি সব আগের মতো (পুরনো কোড আলাদা git worktree-তে চালিয়ে একই শীটে মেলানো: পার্থক্য ১%)।
- **টাকার সীমার ধাপ:** ক্লায়েন্ট এখনই ১০০০ কোটিতে থামায়, ডাটাবেস 13 চালানোর আগ পর্যন্ত ১০,০০০ কোটি পর্যন্ত নেয় — ক্লায়েন্ট বেশি কড়া, তাই ভুল ডাটা ঢোকার ঝুঁকি নেই।
- **ক্যাটাগরির এক-বানান ইম্পোর্টে শুধু শীটের মানে** — ডাটাবেসের পুরনো মান বদলাতে রেকর্ড-পাতার "ক্যাটাগরির মান ও বানান" (M-ধাপ ১০)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে লাইভ ইম্পোর্ট আমি চালাইনি — §৪ আপনার। লগইন ছাড়া: আসল SQL এ (লোকাল Postgres) বাল্ক ইনসার্ট/আপডেটের নিয়ম; ব্রাউজারে নকল এডমিন সেশনে পুরো উইজার্ড (সব লেখা নকল-ভাণ্ডারে)।
- নতুন যোগে "সিরিয়াল কলাম নেই" হলে আগের মতোই প্রিভিউর "পরবর্তী সিরিয়াল" থেকে ক্রমে দেওয়া হয়; এর মধ্যে অন্য কেউ রেকর্ড যোগ করলে সেই চাঙ্ক সিরিয়াল-সংঘর্ষে ব্যর্থ হয় (ব্যর্থ-তালিকায় আসে, আবার চালালে ঠিক হয়)।
- গোপন মান `(মুছুন)` দিয়ে মোছা যায় না — রেকর্ডের ফর্মে মুছুন।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
1. **(ডাটাবেস, সুবিধামতো) চেকলিস্ট সারি ৩৪:** Supabase → SQL Editor → `supabase/sql/13_money_limit.sql` পুরোটা পেস্ট করে Run → ৩ সারি ✅ আসা চাই। ফলাফলটি পাঠান।
2. **পরীক্ষা প্রকল্পে নমুনা শীট (২০–৫০ সারি):** কলাম যেমন — সাল, উপকারভোগীর নাম, পিতা/স্বামীর নাম, বিভাগ, জেলা, উপজেলা, ইউনিয়ন, **ক্যাটাগরি**, উপকরণ, **টাকা** (কিছু "১,২০,০০০", কিছু "১২০০০০/-", একটিতে ইচ্ছে করে "এক লাখ"); ক্যাটাগরিতে "গাভী" আর "গাভি" দুটোই রাখুন।
   - `/admin/import?project=demo` → "নতুন যোগ করুন" → ফাইল দিন → ম্যাপিং নিজে বসেছে কি না দেখুন।
   - প্রিভিউতে: "এক লাখ" সারি লাল; "ক্যাটাগরির মান" প্যানেলে "গাভী"/"গাভি" পাশাপাশি → "এক বানানে আনুন: «গাভী»" চাপুন → "মোট ক্যাটাগরি" এক কমবে।
   - চালান → সারসংক্ষেপ → "ব্যর্থদের তালিকা CSV ডাউনলোড" খুলে দেখুন।
3. **আপডেট:** রেকর্ড-পাতা থেকে এক্সপোর্ট করে শুধু "সিরিয়াল" আর "টাকা" কলাম রাখুন (চাইলে "উপকরণের নাম/বিবরণ" কলামে একটি সারিতে `(মুছুন)`), কিছু টাকা বদলান → "সিরিয়াল ধরে আপডেট করুন" → চালান। তালিকায় দেখুন: শুধু টাকা বদলেছে, `(মুছুন)` দেওয়া মানটিই মুছেছে, আর কিছু নয়।
4. **এক্সপোর্ট → আবার ইম্পোর্ট:** রেকর্ড-পাতার CSV সরাসরি ইম্পোর্টে দিন → সব কলাম নিজে মেলে কি না (তথ্য-কলাম "উপেক্ষা" লেখা থাকবে)। **চালাবেন না** (একই সিরিয়াল আবার যোগ হবে না, ব্যর্থ হবে)।
5. **ঘর নির্মাণে ইম্পোর্ট চালাবেন না** — শুধু একটি ফাইল দিয়ে প্রিভিউ (ধাপ ৩) পর্যন্ত দেখুন।
6. ফলাফল জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build` (মূল বান্ডল ২৭৩.০৩ kB / ৮২.৩৯ KB gzip — M-ধাপ ১০ এর চেয়ে সামান্য কম), `npm run i18n-check` (৭৬২ = ৭৬২) | ✅ |
| **SQL ১৩** (লোকাল Postgres, আসল SQL ১০–১২-এর উপর): ১০০০ কোটির বেশি টাকার রেকর্ড থাকলে থামে (রেকর্ডসহ), না থাকলে চলে (৩ সারি ✅); এরপর ১০০০ কোটি গ্রহণ, তার বেশি বাংলা বার্তায় আটকায় (রেকর্ডেও); ফিঙ্গারপ্রিন্ট অপরিবর্তিত; anon অনুমতি আগের মতো; আবার চালালে "আগেই চালানো"; rollback ও আবার — ১৩/১৩ | ✅ |
| বাল্ক ইম্পোর্টের ডাটাবেস-নিয়ম (লোকাল Postgres): ক্যাটাগরি হুবহু জমা; মোট ক্যাটাগরি ৩ → এক বানানে আনলে ২; সিরিয়াল ধরে আপডেটে খালি = অপরিবর্তিত, `_clear` শুধু সেই মান, গোপন key → গোপন অংশে (বাংলা অঙ্ক ইংরেজিতে), আবশ্যক টাকা `_clear` ও ভুল টাকা বাংলায় আটকায় — ১২/১২ | ✅ |
| `npm run admin-ui-check` ১০৯/১০৯ (+২৩): প্রকল্প-তালিকা রেজিস্ট্রি থেকে; বিকল্প নামে কলাম মেলে (ক্যাটাগরি, উপকরণ, টাকা, ইউনিয়ন, গোপন মোবাইল); ২৫ সারির প্রিভিউ, ফিল-ডাউন ৯৬ ঘর; **ভুল টাকা লাল**; টাকা পার্স; ইউনিয়নের বানান ও ঐচ্ছিক প্যানেল; **"গাভী"/"গাভি" → এক বানানে → মোট ক্যাটাগরি ৪ → ৩**; ইম্পোর্টে **ক্যাটাগরি হুবহু**, টাকা সংখ্যায়, গোপন মান আলাদা; **ব্যর্থ সারির CSV**; আপডেট মোডের নিয়মের ব্যাখ্যা; **আপডেটে শুধু ম্যাপ করা ঘর, অন্য কোনো মান মোছে না, শুধু `(মুছুন)` দেওয়াটি**; আবশ্যক ঘর মোছা আটকায়; মেলেনি এমন সিরিয়াল; **এক্সপোর্ট→ইম্পোর্টে সব শিরোনাম নিজে মেলে**; ঘর নির্মাণের প্রিভিউ; কোনো page error নেই; অচেনা লেখা-অনুরোধ নেই | ✅ |
| **ঘর নির্মাণের প্রিভিউ আগের মতো:** পুরনো কোড (আলাদা git worktree) বনাম নতুন একই শীটে — ম্যাপিং হুবহু, পার্থক্য ১.১২% (ছবির লিঙ্কের লেবেল ও ভুল সালের লাল চিহ্ন, §২) | ✅ |
| কলাম-ম্যাপিং আগে বনাম পরে: ৪,০০০ এলোমেলো শিরোনাম-সেট — অন্য কোনো পার্থক্য ০ (শুধু উপজেলা→জেলা বাগ ঠিক) | ✅ |
| `field-types-check` ১১৭/১১৭ (+১১: এক্সপোর্টের সব শিরোনাম মেলে, লম্বা বিকল্প নাম, উপজেলা≠জেলা, ফিল-ডাউন, টাকা/ক্যাটাগরি/গোপন, ভুল টাকা লাল, ডুপ্লিকেট-ব্যক্তি, আপডেটের নিয়ম) | ✅ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; পাবলিক স্ক্রিনশট আগের মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ) | ✅ |
| `adapter-check` ২৫/২৫, `geo-check` ৩২/৩২ + ব্রাউজার ৫১/৫১, `security-check` ৩৭/৩৭, `content-check` ✓ | ✅ |
| লাইভে আসল এডমিন লগইনে (আপনি, §৪) | ⏳ |
| SQL ১৩ (চেকলিস্ট সারি ৩৪) — লাইভে ৩/৩ ✅ (২০২৬-১০-০৬) | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১২** — ছবির বাল্ক আপলোড, `migrate-photos` আর একটিভিটি লগ পেইজ (সব প্রকল্পের জন্য)। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১২ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১২ — ছবির বাল্ক আপলোড, `migrate-photos` আর একটিভিটি লগ পেইজ (২০২৬-১০-০৬) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · লাইভে এডমিন-পরীক্ষা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **ফাইল সরানো (`git mv`)** → `features/admin/`: `HousingPhotoBulkPage` → `photos/PhotoBulkPage`, `HousingActivityPage` → `activity/ActivityPage`।
- **`photoFilename.ts`:**
  - প্রিফিক্স রেজিস্ট্রির সব প্রকল্প থেকে: `file_prefix`, key, `_` ছাড়া key, slug, `-` ছাড়া slug; প্রিফিক্সে অঙ্কও চলে (`sr2_0004.jpg`)।
  - আগে/পরে না লেখা থাকলে `kind = null`। নতুন `photoTarget(kind, ছবি মোড)`:
    - শুধু-পরে প্রকল্প: `current`; সেখানে `prev` লেখা থাকলে ভুল।
    - আগে-পরে প্রকল্প: আগে/পরে লেখা আবশ্যক।
    - ছবিহীন প্রকল্প: সব ভুল।
  - `photoNameExamples` (প্রকল্পের প্রিফিক্সে উদাহরণ)। আগের সব নাম আগের মতোই পড়ে।
- **`PhotoBulkPage.tsx`:**
  - প্রকল্পের তালিকা রেজিস্ট্রি থেকে (ছবিসহ সব প্রকল্প, খসড়াও); উদাহরণের নাম প্রকল্প অনুযায়ী; শুধু-পরে প্রকল্পে নোট।
  - ছবির ঘরের নাম প্রকল্পের লেবেল থেকে ("উপকরণসহ ছবি")।
  - ভুল ঘর (শুধু-পরে প্রকল্পে `_prev`, বা আগে/পরে না লেখা) **লাল সারি ও বার্তা**, আলাদা গণনা "ভুল ছবির ঘর"।
  - **"ওভাররাইট হবে" ব্যাজ** আর আপলোডের আগে **নিশ্চিতকরণ** — কোন প্রকল্প/সিরিয়াল/ঘর ওভাররাইট হবে তার তালিকা; "বাতিল" করলে কিছুই আপলোড হয় না।
  - `photo_bulk_run` লগ **প্রতিটি প্রকল্পের জন্য আলাদা** (সফল, ব্যর্থ, ওভাররাইট)।
- **`scripts/migrate-photos.mjs`** (`--help` এ নতুন অপশন):
  - প্রকল্পের তালিকা ডাটাবেস থেকে (service_role — খসড়াসহ সব; না পারলে কোডের ফলব্যাক)।
  - `--project` এ key, slug, ফাইল-প্রিফিক্স বা নাম; ভুল হলে প্রকল্পের তালিকাসহ বার্তা।
  - `--from-db` ছবিসহ সব প্রকল্পে (বা একটিতে); শুধু-পরে প্রকল্পে prev বাদ।
  - CSV কলাম সাধারণ শব্দে চেনা: আগের/পূর্বের … ছবি/লিঙ্ক, বর্তমান/পরের … ছবি/লিঙ্ক; শুধু-পরে প্রকল্পে শুধু "ছবি"; এক্সপোর্টের "(সিস্টেম URL)" কলাম কখনো নয়। কোন কলাম ধরা হলো তা ছাপে।
  - ফোল্ডার মোডে ছবি মোড মানা; শুধু-পরে প্রকল্পে CSV এর আগের-ছবির কলাম বাদ (কারণসহ)।
  - বার্তায় পাথ `/admin/photos`।
- **`ActivityPage.tsx`:**
  - বদলের লেবেল **ফিল্ডের সংজ্ঞা থেকে** (প্রকল্পের লেবেল — "উপকরণের ক্যাটাগরি", আর্কাইভ ও গোপনসহ); অচেনা হলে কাঁচা key (`extra.zzz`)।
  - মান ফিল্ডের ধরন অনুযায়ী: **"টাকা: ৳ ৫০,০০০ → ৳ ৬০,০০০"**; হ্যাঁ/না; কোড-মান বাংলায় ("আগে-পরে → শুধু পরে")।
  - **কনফিগ-বদল:** প্রকল্প/ফিল্ড তৈরি, বদল, প্রকাশ, আর্কাইভ … — কোন কলাম কী থেকে কী; লিংক সেটিংসে (`/admin/projects/:key`, ফিল্ডে `?tab=fields`)।
  - গোপন মান বদলে শুধু ফিল্ডের নাম ("🔒 মোবাইল নম্বর — মান লগে রাখা হয় না")।
  - এক্সপোর্ট, ইম্পোর্ট, ছবি বাল্কের সংখ্যা।
  - **ক্যাটাগরির এক-বানান:** "উপকরণের ক্যাটাগরি: «গাভি» → «গরু» · ৩টি রেকর্ড" (নতুন ক্লায়েন্ট-ইভেন্ট `category_merge`, "এক বানানে আনুন" এর পর পাঠানো হয়)।
  - প্রকল্প ফিল্টার ডাটাবেসের তালিকা থেকে: গ্রুপ, তার নিচে উপ-প্রকল্প (↳), একক; খসড়ায় "(খসড়া)"। রেকর্ডের লিংক `/admin/records/...`।
- `docs/API_CONTRACT.md` v১.৩: `category_merge`, `photo_bulk_run` প্রকল্প ধরে, ছবির ফাইলনামের নিয়ম। `en.ts`: +৩৩টি লেখা।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ক্যাটাগরির এক-বানান লগে ক্লায়েন্ট-ইভেন্ট দিয়ে** — ডাটাবেস প্রতিটি রেকর্ডের বদল আলাদা `update` হিসেবে আগেই লগ করে (সেগুলোও দেখায়); "কতটি রেকর্ড" এর এক লাইনের সারসংক্ষেপের জন্য ডাটাবেস বদলানো লাগেনি।
- **অচেনা শব্দ সিরিয়ালের পরে** (যেমন `semi_0001_v2.jpg`) এখন "আগে/পরে নেই" হিসেবে পড়ে — আগে-পরে প্রকল্পে আগের মতোই আপলোড হয় না (কারণসহ লাল); শুধু-পরে প্রকল্পে পরের ছবি হিসেবে যায়।
- **ঘর নির্মাণের ছবি:** কোনো লেখা হয়নি — পরীক্ষায় `semi_0001_prev.jpg` এ "ওভাররাইট" ব্যাজ ও নিশ্চিতকরণ দেখে **বাতিল**; `photo-check` ৮/৮।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে লাইভ পরীক্ষা আমি করিনি — §৪ আপনার। লগইন ছাড়া: ব্রাউজারে নকল এডমিন সেশনে (পড়া লাইভ, লেখা নকল-ভাণ্ডারে — demo এর ছবি নকল স্টোরেজে); `migrate-photos` লাইভে শুধু `--dry-run` (পড়া)।
- লাইভ ডাটাবেসে এখনো শুধু সেমিপাকা ও টিন — `migrate-photos` এর নতুন প্রকল্প পরীক্ষা হবে আপনার খসড়া প্রকল্পগুলো তৈরি হলে।
- `--project` ভুল হলে Windows এ Node একটি নিরীহ "Assertion failed … async.c" লাইন ছাপে (বার্তার পরে, কাজের ক্ষতি নেই)।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
1. পরীক্ষা প্রকল্পে (M-ধাপ ১০/১১ এ যোগ করা রেকর্ড) ৩টি **পরীক্ষার** ছবি `demo_0001.jpg`, `demo_0002.jpg`, `demo_0003.jpg` নামে তৈরি করুন (যেকোনো ছবি কপি করে নাম বদলে) → `/admin/photos?project=demo` → ফাইলগুলো দিন → "উপকরণসহ ছবি" আর রেকর্ডের নাম মিলেছে দেখুন → আপলোড।
2. একটি `demo_0004_prev.jpg` দিন → লাল "এই প্রকল্পে শুধু পরের ছবি — "_prev" ফাইল চলবে না" দেখুন; ✕ দিয়ে বাদ দিন।
3. `semi_0001_prev.jpg` নামের একটি ফাইল দিন → **"ওভাররাইট হবে"** ব্যাজ দেখুন → আপলোড চাপলে নিশ্চিতকরণ আসবে → **"বাতিল" চাপুন** (ঘর নির্মাণের ছবি বদলাবেন না)।
4. `/admin/activity` এ দেখুন: আপনার ছবি আপলোড ("ছবি বাল্ক আপডেট", প্রকল্প ধরে), আগের ধাপের টাকা-বদল ("টাকা: ৳ … → ৳ …") আর সেটিং-বদল; প্রকল্প ফিল্টারে আপনার প্রকল্পগুলো।
5. (ঐচ্ছিক) টার্মিনালে `npm run migrate-photos -- --help` — নতুন অপশন দেখুন; `npm run migrate-photos -- --from-db --dry-run` — শুধু দেখায়, কিছু বদলায় না।
6. ফলাফল জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npm run lint` (০), `npm run build` (মূল বান্ডল ২৭৩.০১ kB / ৮২.৩৮ KB gzip), `npm run i18n-check` | ✅ |
| `npm run admin-ui-check` ১২৮/১২৮ (+১৯): **ছবি বাল্ক** — রেজিস্ট্রির খসড়া demo, উদাহরণ "demo_0001.jpg"; আগে/পরে ছাড়া নাম → "উপকরণসহ ছবি"; **শুধু-পরে প্রকল্পে `_prev` লাল**; `semi_0001_prev.jpg` → **"ওভাররাইট হবে"** → নিশ্চিতকরণ → **বাতিলে কিছু আপলোড নয়**; অচেনা প্রিফিক্স; শুধু demo আপলোড (নকল স্টোরেজ `housing/demo/0001/current.webp`), **লগ প্রকল্প ধরে**; **একটিভিটি লগ** — "টাকা: ৳ ৫০,০০০ → ৳ ৬০,০০০", ফিল্ডের লেবেল সংজ্ঞা থেকে, অচেনা key কাঁচা, "«গাভি» → «গরু» · ৩টি রেকর্ড", ফিল্ড/প্রকল্পের সেটিং-বদল ও লিংক, গোপন মান শুধু নামে, `/admin/records/demo/1/edit`, প্রকল্প ফিল্টার (গ্রুপ ↳ উপ-প্রকল্প, খসড়া) | ✅ |
| `field-types-check` ১২২/১২২ (+৫: আগের নাম আগের মতো, slug/অঙ্কসহ প্রিফিক্স, আগে/পরে না লেখা, ছবি মোড, উদাহরণ) | ✅ |
| `npm run migrate-photos -- --help` নতুন অপশন; লাইভে `--dry-run` (শুধু পড়া): `--from-db` সব প্রকল্প, `--project semi` (প্রিফিক্স), ভুল প্রকল্পে তালিকাসহ বার্তা, ফোল্ডারে আগে/পরে না লেখা ও অচেনা নাম বাদ | ✅ |
| **`npm run photo-check` ৮/৮ — ঘর নির্মাণের ছবি অক্ষত** | ✅ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; পাবলিক স্ক্রিনশট আগের মতো (৬৪/৭৪ হুবহু, বাকি ১০টি লগইন পেইজ) | ✅ |
| `adapter-check` ২৫/২৫, `geo-check` ৩২/৩২, `security-check` ৩৭/৩৭, `content-check` ✓ | ✅ |
| লাইভে আসল এডমিন লগইনে (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১৩** — জেনেরিক তালিকা পেইজ: স্ট্যাট কার্ড, বিতরণ চার্ট, ফিল্টার, টেবিল ও কার্ড। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১৩ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১৩ — জেনেরিক তালিকা পেইজ: স্ট্যাট কার্ড, বিতরণ চার্ট, ফিল্টার, টেবিল ও কার্ড (২০২৬-১০-০৬) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · লাইভে এডমিন-দেখা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **ফাইল সরানো (`git mv`)** → `features/projects/list/`: `HousingListPage` → `ProjectListPage`, `StatCards` → `ProjectStatCards`, `HousingTable` → `ProjectTable`। রাউট (`appRoutes.tsx`) সব প্রকল্পে `<ProjectListPage project={p} />`।
- **`ProjectListPage.tsx`:**
  - সাব-নেভ শুধু গ্রুপের উপ-প্রকল্পে (`parent_key`); নাম ও বর্ণনা `lt()` দিয়ে; খসড়ার ব্যানার আগের মতোই `ProjectFrame` থেকে।
  - **একটিই stats কল** — কার্ড, চার্ট, মানচিত্র, ফিল্টার সবাই এটা পায়। সাল আসে `stats.by_year` থেকে, তাই আলাদা `housing_years` কল আর মানচিত্রের দ্বিতীয় stats কল নেই। মোট API কল ২টি: list আর stats।
  - URL: `?year=&division=&district=&upazila=&q=&page=` আগের মতো; নতুন `union=` (উপজেলা থাকলে) আর `f_<key>=` (ফিল্টার-চালু পাবলিক ক্যাটাগরি)।
- **`ProjectStatCards.tsx`:** `stat_cards` এ যত কার্ড তত; লেবেল `lt()`, আইকন `StatIcon`, টাকা `formatTaka` (৳), count-up, স্কেলেটন। ঘর নির্মাণে আগের ৪টি কার্ড হুবহু।
- **`CategoryBreakdown.tsx` (নতুন):** `display.breakdown_field` এর মান — CSS বার (লাইব্রেরি নয়), সংখ্যা আর প্রতিটি পাবলিক টাকার ফিল্ডের যোগফল (৳); বেশি থেকে কম; সারিতে চাপলে `?f_<key>=` (আবার চাপলে ওঠে); ৬টির বেশি হলে "আরো দেখুন (n)"/"কম দেখান"।
- **`UpazilaMap.tsx` / `UpazilaMapPanel.tsx`:** "ঘর" শব্দের বদলে প্রকল্পের একক (`unit_bn`/`unit_en`); একক "ঘর" হলে আগের বাক্য হুবহু ("কোথায় কোথায় ঘর হয়েছে")। প্যানেল আর নিজে stats আনে না। দেখাবে কি না — `display.show_map`।
- **`ProjectFilters.tsx` + `listFilters.ts` (নতুন):** সাল (`by_year`), বিভাগ → জেলা → উপজেলা → **ইউনিয়ন** (বিকল্প `by_union` থেকে, শুধু ডাটায় ইউনিয়ন থাকলে; উপজেলা বদলালে খালি), **ক্যাটাগরি** ড্রপডাউন (বিকল্প `by_value` থেকে, সংখ্যাসহ), নাম। ঘর নির্মাণে (ইউনিয়ন ও ক্যাটাগরি নেই) আগের ৫টি ঘরই।
- **`ProjectTable.tsx` + `RecordCardList.tsx` (নতুন) + `listColumns.ts` (নতুন):**
  - কলাম কনফিগ থেকে (`show_in_table`); কাস্টম ফিল্ডের ঘর ফিল্ড-টাইপ রেজিস্ট্রির `Cell` দিয়ে (টাকা ৳, ডানে)। `geo_columns: merged` হলে এক "ঠিকানা" কলাম।
  - সিস্টেম কলামের শিরোনাম অভিধান থেকে, প্রকল্পে নিজের লেবেল থাকলে সেটা ("অনুদানের সাল")। আগে-পরে প্রকল্পে ছবির কলাম "পূর্বের ছবি"/"বর্তমান ছবি" আগের মতো; শুধু-পরে প্রকল্পে প্রকল্পের লেবেল ("উপকরণসহ ছবি")।
  - ফোনের কার্ড আগের হুবহু; "কার্ডে" চালু কাস্টম ফিল্ড ঠিকানার নিচে (খালি মান বাদ); শুধু-পরে প্রকল্পে একটিই **পূর্ণ-চওড়া ৪:৩** ছবি।
  - ইংরেজিতে ইউনিয়নের ইংরেজি নাম (তালিকা lazy — শুধু ডাটায় ইউনিয়ন থাকলে নামে)।
- `useHousingStats` এর টাইপ `ProjectStats` (API আগে থেকেই এটা দিত)। `en.ts`: ১৪টি নতুন লেখা, ৭টি অব্যবহৃত বাদ।
- পরীক্ষা: `admin-ui-check` এ নতুন অংশ N (নকল `project_stats('demo')`, নকল রেকর্ডে)। `geo-check` এর বিল্ড-নিয়ম হালনাগাদ (নিচে)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ঘর নির্মাণ হুবহু রাখা:** ইউনিয়নের কলাম/ফিল্টার দেখায় শুধু ডাটায় ইউনিয়ন থাকলে (`distinct.unions > 0`) — ঘর নির্মাণে এখনো নেই, তাই টেবিল আগের ১১ কলামই। মানচিত্রে একক "ঘর" হলে আগের বাক্য। কার্ডের ঠিকানা আগের মতো আলাদা টেক্সট-নোডে (`PlaceText`) — এক স্ট্রিং করলে ব্রাউজার লেখা সামান্য অন্যভাবে আঁকে (পিক্সেল-তুলনায় ধরা পড়েছিল, ঠিক করা হয়েছে)।
- **সাল stats থেকে:** `project_stats.by_year` এ ডাটায় থাকা সব সাল আছে — আলাদা কল লাগে না (ব্লকের "API কল মোট ২টি")।
- **মূল বান্ডল বেড়েছে** ২৭৩,০৯৬ → ২৮২,৯৯৩ বাইট (gzip ~৮২.৪ → ৮৬.২ KB) — জেনেরিক তালিকার নতুন অংশ (চার্ট, ইউনিয়ন/ক্যাটাগরি ফিল্টার, কনফিগ-কলাম)। ইউনিয়নের ডাটা (৫৩ KB gzip) এখনো আলাদা chunk এ, শুধু দরকারে নামে; `geo-check` এ সীমা নতুন মাপে।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল এডমিন লগইনে দেখা আমি করিনি — §৪ আপনার। লগইন ছাড়া: ব্রাউজারে নকল এডমিন সেশনে (পড়া লাইভ, demo এর রেকর্ড ও stats নকল)।
- লাইভ ডাটাবেসে এখনো শুধু সেমিপাকা ও টিন — আসল অনুদান-ধরন প্রকল্পের পাতা দেখা যাবে আপনার খসড়া প্রকল্পগুলো তৈরি হলে।
- মানচিত্রের পতাকার নিচের সংখ্যা-বাক্য "৯ টি উপকারভোগী" — একক অনুযায়ী "টি" থাকে; "জন" চাইলে বলবেন।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — আসল এডমিন লগইনে (`npm run dev` আবার চালু করে)
1. `/housing/semi-pucca` খুলুন — আগের মতোই দেখায় কি না (৪টি কার্ড, মানচিত্র, ফিল্টার, ১১ কলামের টেবিল, ফোনে কার্ড)।
2. `/demo` খুলুন (খসড়া — শুধু এডমিন দেখে, উপরে হলুদ ব্যানার): "মোট টাকা" (৳), "মোট ক্যাটাগরি", "উপকরণের ক্যাটাগরি অনুযায়ী" চার্ট দেখুন; চার্টের একটি সারিতে চাপুন → তালিকা সেই ক্যাটাগরিতে।
3. ফিল্টারে উপজেলা বাছুন → "ইউনিয়ন/পৌরসভা" ড্রপডাউনে আপনার রেকর্ডের ইউনিয়ন; "উপকরণের ক্যাটাগরি" ড্রপডাউনও চেষ্টা করুন।
4. EN চাপুন — সব লেখা ইংরেজিতে, অনুভূমিক স্ক্রল নেই। ফোনে একবার দেখুন (একটি বড় ছবি প্রতি কার্ডে)।
5. ফলাফল জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npx oxlint` (০), `npm run build` (মূল বান্ডল ২৮২.৯৯ kB / ৮৬.১৮ KB gzip), `npm run i18n-check` | ✅ |
| **ঘর নির্মাণ বেসলাইনের সাথে:** M-ধাপ ১২ এর কোড (git worktree, পোর্ট ৫১৮৩) আর নতুন কোডে একই `smoke` → ১২২টি স্ক্রিনশট; **১১২টি পিক্সেল-হুবহু**, বাকিগুলোর পার্থক্য পুরনো কোডের দুই রানের মধ্যেও হুবহু একই (৭–৭৭ পিক্সেল) বা মানচিত্রে ২০টি দ্রুত ট্যাপের সময়-নির্ভর ফল (পুরনো কোডেও রানভেদে ০–৫,০২২) — অর্থাৎ কোনো বদল নেই; টেবিল ১১ কলাম | ✅ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; ডাটাবেস-কল: `housing_years` ৯০ → ০, `project_stats` ৩০০ → ২১২ | ✅ |
| `npm run admin-ui-check` ১৫২/১৫২ (+২৪): **`/demo`** — খসড়া-ব্যানার; **মোট টাকা ৳ (যোগফল মেলে), মোট ক্যাটাগরি ৭**; চার্ট ৬ সারি + "আরো দেখুন (১)" → ৭; কলাম কনফিগ থেকে; **API কল শুধু list ও project_stats**; চার্টে চাপলে `?f_category=` ও ২ জন, আবার চাপলে ওঠে; **ইউনিয়ন** উপজেলা ছাড়া বন্ধ, বিকল্প শুধু ডাটার, `?union=`; ইউনিয়ন + **উপকরণ** একসাথে → ১ জন (অনুরোধে `union_name=eq.` ও `extra=cs.`); উপজেলা বদলালে ইউনিয়ন খালি; **১০২৪px বাংলা ও ইংরেজিতে অনুভূমিক স্ক্রল নেই** (ইংরেজিতে ইউনিয়ন "Korerhat"); ৩৯০px এ পূর্ণ-চওড়া ৪:৩ ছবি | ✅ |
| `field-types-check` ১২২/১২২, `geo-check` ৫৪/৫৪ (বিল্ড-নিয়ম: ইউনিয়নের chunk আলাদা ও শুধু lazy; মূল বান্ডলের সীমা ২৮২,৯৯৩), `adapter-check` ২৫/২৫, `security-check` ৩৭/৩৭, `photo-check` ৮/৮, `content-check` ✓, `build-unions --check` ✓ | ✅ |
| লাইভে আসল এডমিন লগইনে (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১৪** — বিস্তারিত মডাল: ছবি মোড ও কাস্টম ফিল্ড। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১৪ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১৪ — বিস্তারিত মডাল: ছবি মোড ও কাস্টম ফিল্ড (২০২৬-১০-০৬) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · লাইভে দেখা বাকি (আপনি)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **ফাইল সরানো (`git mv`):** `features/housing/pages/HousingDetailPage.tsx` → `features/projects/detail/ProjectDetailPage.tsx` (`LazyProjectDetailPage`, আলাদা lazy chunk)।
- **`PhotoCompare.tsx`:** নতুন `labels` prop (প্রকল্পের আগে/পরের লেবেল — ব্যাজ, alt, "«…» ছবি নেই"); না দিলে আগের লেখা হুবহু। `ZoomFrame`, `Layer`, `Badge`, `ToolButton`, `Transform` export।
- **নতুন `PhotoViewer.tsx`:** শুধু-পরের-ছবির প্রকল্পে একক ছবি — টুলবারে প্রকল্পের লেবেল ("উপকরণসহ ছবি"), −/%/+, রিসেট, ফুলস্ক্রিন; জুম/প্যান/পিঞ্চ/ডাবল-ট্যাপ/হুইল PhotoCompare এর ZoomFrame দিয়েই। পেছনে একই ছবির ঝাপসা কপি (ভিন্ন অনুপাতেও ফ্রেম ভরা, মূল ছবি কাটা যায় না)। স্লাইডার বা "তুলনা সম্ভব নয়" নেই; ছবি না থাকলে "এই উপকারভোগীর কোনো ছবি নেই।"। অন্য রেকর্ডে গেলে জুম শুরু থেকে।
- **`ProjectDetailPage.tsx`:**
  - নেভিগেশন (পাতা পেরিয়ে), কীবোর্ড, সোয়াইপ, স্ক্রল-লক — অপরিবর্তিত।
  - ছবির অংশ ছবি মোড অনুযায়ী: আগে-পরে → PhotoCompare (স্লাইডার), শুধু-পরে → PhotoViewer, ছবি নেই → কিছু নয়।
  - **হাইলাইট কার্ড** উপরে: `show_in_detail` চালু পাবলিক কাস্টম **টাকা ও ক্যাটাগরি** ফিল্ড (ক্রমানুসারে; টাকা ৳)।
  - বাকি `show_in_detail` ঘর `resolveFields` এর ক্রমে `FieldValue` দিয়ে; সিরিয়াল প্রথমে; লম্বা লেখা (ঠিকানা) শেষে পূর্ণ-চওড়া; ইউনিয়ন শুধু মান থাকলে। লেবেল প্রকল্পের (`core_fields`/ফিল্ডের লেবেল) — ইংরেজিতে ইংরেজি; মান (নাম, ক্যাটাগরি) শীটে যেমন লেখা তেমন।
  - স্কেলেটন ছবির সংখ্যা অনুযায়ী (২/১/০)।
- **নতুন `detailLayout.ts`, `FieldValue.tsx`** (উপরের ফোল্ডার কাঠামো দেখুন)। `en.ts`: +১টি লেখা।
- পরীক্ষা: `admin-ui-check` এ নতুন অংশ O (নকল ছবি — পরীক্ষাই PNG বানিয়ে দেয়; নকল তালিকায় এখন পেজিনেশন)।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ঘর নির্মাণ হুবহু:** সিস্টেম ফিল্ডের মান আগের মতোই সরাসরি লেখা (একই DOM); তুলনার ব্যাজ "পূর্বের"/"বর্তমান" থাকে, কারণ প্রকল্পের লেবেল ডিফল্ট ("পূর্বের ঘর"/"বর্তমান ঘর") হলে `compareLabels` কিছু পাঠায় না। অন্য আগে-পরে প্রকল্প নিজের লেবেল দিলে ("মেরামতের আগে") সেটাই ব্যাজে।
- **"তুলনা সম্ভব নয়"** এখন শুধু আগে-পরে প্রকল্পে একটি ছবি না থাকলে — শুধু-পরে প্রকল্পে কখনো নয় (সেখানে PhotoCompare ব্যবহারই হয় না)।
- **কম্পোনেন্টের নাম `FieldValue`** (পরিকল্পনার নাম) — এটি `features/projects/detail/` এ; ফিল্ড-রেজিস্ট্রির একই নামের **টাইপ** `FieldValue` থেকে আলাদা জায়গায়, তাই সংঘাত নেই।
- `i18n-check` "অব্যবহৃত" বলে `পিতা/স্বামীর নাম` ও `বিস্তারিত ঠিকানা` — আসলে সিস্টেম ফিল্ডের লেবেল হিসেবে `t()` দিয়ে চলে (চেকার গতিশীল key দেখে না); রাখা হয়েছে।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- আসল লগইনে/ফোনে দেখা আমি করিনি — §৪ আপনার। লগইন ছাড়া: ব্রাউজারে নকল এডমিন সেশনে (demo এর রেকর্ড ও ছবি নকল)।
- ফুলস্ক্রিন iPhone Safari তে (Fullscreen API নেই) বাটন দেখায় না — আগের তুলনা-ভিউয়ের মতোই; জুম/পিঞ্চ সেখানেও চলে।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে — (`npm run dev` আবার চালু করে)
1. `/housing/semi-pucca` → যেকোনো "বিস্তারিত" — স্লাইডার আগের মতো (ব্যাজ "পূর্বের"/"বর্তমান"), নিচের ৮টি ঘর আগের মতো। ←/→ চাপুন — পাতার শেষে পরের পাতায় যায়।
2. এডমিন লগইনে `/demo` (বা আপনার খসড়া অনুদান-প্রকল্প) → "বিস্তারিত" — একটি বড় ছবি ("উপকরণসহ ছবি"), +/− আর ডাবল-ট্যাপে জুম, ফুলস্ক্রিন; উপরে সবুজ কার্ডে ক্যাটাগরি ও টাকা।
3. EN চাপুন — লেবেল ইংরেজিতে, ক্যাটাগরি ও নাম বাংলায় (যেমন শীটে)।
4. ফোনে দুটোই একবার দেখুন (সোয়াইপে আগের/পরের)।
5. ফলাফল জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npx oxlint` (০), `npm run build` (মূল বান্ডল ২৮১.৬৭ kB / ৮৫.৫৪ KB gzip; বিস্তারিত আলাদা chunk ২৪.৩ kB), `npm run i18n-check` | ✅ |
| **ঘর নির্মাণের বিস্তারিত:** `smoke` এর `detail-semi`/`detail-semi-year` স্ক্রিনশট (৫ প্রস্থ × ২ ভাষা) M-ধাপ ১৩ এর রানের সাথে **পিক্সেল-হুবহু**; মোট ১২২টির ১১৭টি হুবহু, বাকি ৫টি পুরনো কোডের দুই রানেও একই পার্থক্য (মানচিত্রের ট্যাপ-সময়, সাব-নেভের সারি) | ✅ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩ | ✅ |
| `npm run admin-ui-check` ১৭১/১৭১ (+১৯): **শুধু-পরে demo** — একক ছবি লোড, স্লাইডার/পাশাপাশি নেই, **"তুলনা সম্ভব নয়" নেই**, টুলবারে "উপকরণসহ ছবি"; **হাইলাইট** "উপকরণের ক্যাটাগরি ছাগল", "টাকা ৳ ৬০,০০১"; ঘরের ক্রম (ইউনিয়ন, উপকরণের নাম, ঠিকানা শেষে; টাকা/ক্যাটাগরি দুবার নয়); **জুম** "+" ১২৫%, ডাবল-ক্লিক ২৫০%, হুইল; **ফুলস্ক্রিন** চালু, তখন → এ রেকর্ড বদলায় না; **→ /demo/2; পাতার শেষে /demo/51?page=2 ("৫৫ টির মধ্যে ৫১"), ← /demo/50**; ছবিহীন রেকর্ড; **EN** — "Item category ছাগল", "Amount ৳60,001", "Grant year", "Union/Municipality=Korerhat", "Photo with the item", নাম বাংলায়; ৩৯০px পূর্ণ-চওড়া; **আগে-পরে প্রকল্পে নিজের লেবেল** ব্যাজে, একটি ছবি না থাকলে "«মেরামতের আগে» ছবি নেই — তুলনা সম্ভব নয়"; **ছবিহীন প্রকল্প** — ছবির অংশ নেই; **ঘর নির্মাণ** (লাইভ পড়া) — স্লাইডার, ব্যাজ "পূর্বের"/"বর্তমান", আগের ৮টি ঘর একই ক্রমে | ✅ |
| `field-types-check` ১২২/১২২, `geo-check` ৫৪/৫৪, `adapter-check` ২৫/২৫, `security-check` ৩৭/৩৭, `photo-check` ৮/৮, `content-check` ✓ | ✅ |
| লাইভে (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১৫** — নতুন হোম পেইজ (ডায়নামিক কার্ড) ও গ্রুপ ল্যান্ডিং। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১৫ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১৫ — নতুন হোম পেইজ (ডায়নামিক কার্ড) ও গ্রুপ ল্যান্ডিং (২০২৬-১০-০৬) — ✅ কোড ও পরীক্ষা সম্পন্ন (ডাটাবেসের কাজ নেই) · হিরোর লেখার অনুমোদন (প্রশ্ন ১৫) বাকি

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **`src/pages/HomePage.tsx` নতুন করে:** হিরো — "আস-সুন্নাহ ফাউন্ডেশন" / **"আমাদের সেবা প্রকল্পসমূহ"** (প্রশ্ন ১৫ এর প্রস্তাব; চূড়ান্ত লেখা আপনার অনুমোদনসাপেক্ষ), ছোট একটি বাক্য, আর **মোট প্রকল্প, মোট উপকারভোগী, মোট জেলা** (count-up; ওভারভিউর `global`)। নিচে `ProjectCardGrid`।
- **নতুন `features/projects/home/`:** `useProjectsOverview` (একটিই কল), `ProjectCardGrid` (ফোনে ১, md ২, xl ৩ কলাম; লোডে স্কেলেটন), `ProjectCard`, `cover.ts` (ফোল্ডার কাঠামো দেখুন)।
  - কার্ড শুধু **শীর্ষ-স্তরের প্রকাশিত** প্রকল্প যার "হোম পেইজে কার্ড দেখান" চালু; **খসড়া কখনো নয়**। গ্রুপে উপ-প্রকল্পের চিপ (সেমিপাকা · টিন)।
  - ছবি: কভার → সর্বশেষ রেকর্ডের থাম্ব → প্রকল্পের রঙে গ্রেডিয়েন্ট ও বড় আইকন। সংখ্যা: `home: true` কার্ড (≤ ৩টি; টাকা ৳)।
- **হোমের API কল ৬ → ২:** আগে প্রতি কার্ডে list + stats; এখন `projects_overview` একটি। আর **রেজিস্ট্রি এক কলে** — `projects?select=*,project_fields(*)` (ফিল্ড embed; না চললে আগের মতো দুই কল) — তাই প্রতিটি পাতায় একটি কল কম।
- **`GroupLandingPage.tsx`** (`HousingLandingPage` থেকে `git mv`, `features/projects/landing/`): `/housing` দেখতে আগের হুবহু। `FeaturedProjectCard` এর টাইল এখন **প্রকল্পের `home` কার্ড** থেকে (লেবেল `home_label`, টাকা ৳); `FeaturedProjects` এর শিরোনামের নিচের লেখা অন্য গ্রুপে তার সারাংশ।
- **কভার ছবি আপলোড** (প্রকল্প সেটিংস → সাধারণ): নতুন `CoverUpload.tsx` — ব্রাউজারে WebP (≤ ১৬০০px) → `housing/_projects/{key}/cover.webp`, `cover_path` বসে; প্রিভিউ (কভার না থাকলে রঙের পটভূমি); "কভার মুছুন" শুধু মূল এডমিন (নিশ্চিতকরণসহ); অসংরক্ষিত পরিবর্তন থাকলে বন্ধ। API: `ProjectsApi.uploadCover` / `deleteCover` (চুক্তি v১.৪; REST এ এখনো NOT_IMPLEMENTED)।
- `accents.ts` এ প্রতিটি রঙের `gradient`; `statCards.ts` এ `homeCards`, `homeLabel`। `en.ts`: +২৩টি লেখা, ৬টি অব্যবহৃত বাদ।
- পরীক্ষা: `admin-ui-check` অংশ P (হোম ও কভার), `adapter-check` অংশ ৩ (এক-কলের রেজিস্ট্রি), `smoke` এ হোমের কল-গণনা, `geo-check` এর বান্ডল-সীমা।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **"হোমে ২টির বেশি API কল নয়"** — রেজিস্ট্রি (হেডারের মেনুর জন্য সব পাতায় লাগে) আগে ২টি কল করত (প্রকল্প + ফিল্ড), ওভারভিউ যোগে হতো ৩। তাই রেজিস্ট্রি এক কলে করা হলো (PostgREST embed — ডাটাবেস বদল নয়, আগের FK)। লাইভে যাচাই: embed এর উত্তর ২০০, একই প্রকল্প। লগইন থাকলে এডমিন-যাচাইয়ের কলটি আলাদা (দর্শকের নয়)।
- **কভারের ক্যাশ-ভাঙা** প্রকল্পের `updated_at` দিয়ে (রেজিস্ট্রি থেকে) — ওভারভিউতে `updated_at` নেই, আর SQL বদলানো চলবে না।
- **ডাটাবেস কাজ নেই:** `cover_path` এর পাথ-চেক (`10_projects.sql`), স্টোরেজে এডমিনের লেখা (`05`) ও মূল এডমিনের মোছা (`10b`) আগে থেকেই আছে।
- `/housing`: স্ক্রিনশট M-ধাপ ১৪ এর রানের সাথে হুবহু, শুধু ৩৬০px এর প্রথম পিলে ১৮ পিক্সেল অ্যান্টি-এলিয়াসিং (ইংরেজিতে আগে থেকেই একই পার্থক্য আসত)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- **প্রশ্ন ১৫ (হিরোর লেখা) আপনার অনুমোদন বাকি** — এখন প্রস্তাবিত লেখা বসানো; বদলাতে চাইলে লেখাটি পাঠান।
- ঘর নির্মাণ গ্রুপের "সারাংশ" ডাটাবেসে খালি — হোমের কার্ডে বর্ণনা নেই; প্রকল্প সেটিংস → সাধারণ থেকে দিতে পারেন।
- আসল এডমিন লগইনে কভার আপলোড আমি করিনি (নকল স্টোরেজে পরীক্ষা) — §৪।
- মূল বান্ডল ২৮১.৬৭ → ২৮৯.২৫ kB (gzip +১.৯ KB) — নতুন হোম-কার্ড; `geo-check` এর সীমা হালনাগাদ।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. **হিরোর লেখা অনুমোদন করুন (প্রশ্ন ১৫):** শিরোনাম "আমাদের সেবা প্রকল্পসমূহ", নিচে "অসহায় ও দুস্থ মানুষের পাশে আমাদের প্রকল্পগুলোর অগ্রগতি, উপকারভোগীদের তথ্য ও ছবি এখানে সবার জন্য উন্মুক্ত।" — ঠিক আছে, নাকি অন্য লেখা?
2. `npm run dev` → হোম (`/`) দেখুন — ফোন ও ডেস্কটপে; ব্রাউজারের Network ট্যাবে (Fetch/XHR) লগআউট অবস্থায় ২টি কল (`projects`, `projects_overview`)।
3. `/housing` আগের মতো আছে কি না দেখুন।
4. (ঐচ্ছিক) এডমিন লগইনে প্রকল্প সেটিংস → সাধারণ → "কভার ছবি দিন" — **শুধু প্রকাশিত প্রকল্পে আসল ছবি দিন**; হোমের কার্ডে দেখুন। মুছতে চাইলে মূল এডমিন হিসেবে "কভার মুছুন"।
5. ফলাফল জানান।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npx oxlint` (০), `npm run build` (মূল বান্ডল ২৮৯.২৫ kB / ৮৭.৪০ KB gzip), `npm run i18n-check` | ✅ |
| `smoke` ১২৩/১২৩ ও `--legacy` ১২৩/১২৩; নতুন: **হোমে আলাদা আলাদা API কল ≤ ২** (পুরনো ডাটাবেসে ≤ ৩); ডাটাবেস-কল: `project_fields` ১২৩ → ০, `project_stats` ২১২ → ১৭২ | ✅ |
| **`/housing` ও বাকি পাতা M-ধাপ ১৪ এর রানের সাথে:** ১২২টির ১০৫টি পিক্সেল-হুবহু; ১০টি হোম (ইচ্ছাকৃত নতুন), মানচিত্রের ট্যাপ-সময় (পুরনো কোডেও রানভেদে), ৩৬০px পিলের ১৮ পিক্সেল | ✅ |
| `npm run admin-ui-check` ১৮৬/১৮৬ (+১৫): হোমে কার্ড শুধু শীর্ষ-স্তরের প্রকাশিত ও "হোমে" চালু (খসড়া/হোমে-বন্ধ নকল সারি দেখায় না); গ্রুপ-কার্ডে সেমিপাকা · টিন চিপ, ৩টি home সংখ্যা, সর্বশেষ রেকর্ডের থাম্ব; **কভার না থাকলে রঙ + আইকন**; "মোট টাকা ৳ ১২,৫০,০০০", "মোট ক্যাটাগরি ৪"; হিরোর সংখ্যা = ওভারভিউর global; **লগইন ছাড়া হোমে API কল ঠিক ২টি**; ১২৮০px ৩ কলাম; **৩৬০ (বাংলা), ৭৬৮ (ইংরেজি), ১০২৪ px এ ওভারফ্লো নেই** (১/২/২ কলাম); কভার আপলোড → `housing/_projects/demo/cover.webp` + `cover_path`, প্রিভিউ `?v=`; মূল এডমিনের "কভার মুছুন" → ফাইল ও `cover_path` মোছে; সাধারণ এডমিনের মোছার বোতাম নেই | ✅ |
| `adapter-check` ২৮/২৮ (+৩: এক কলের রেজিস্ট্রি, ফিল্ডের ক্রম, PGRST200 এ দুই কলে ফেরা), `geo-check` ৫৪/৫৪, `field-types-check` ১২২/১২২, `security-check` ৩৭/৩৭, `photo-check` ৮/৮, `content-check` ✓ | ✅ |
| হিরোর লেখার অনুমোদন, আসল কভার (আপনি, §৪) | ⏳ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১৬** — চালু করা ও পূর্ণ যাচাই। ✅ নিচে।
- পেস্ট করুন: `M-ধাপ ১৬ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

## M-ধাপ ১৬ — চালু করা ও পূর্ণ যাচাই (২০২৬-১০-০৬) — ✅ AI-এর অংশ সম্পন্ন · লাইভে চালু (সারি ৩২–৩৪) আপনার

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- **পথ খ নয়:** প্রশ্ন ১৪-এ পথ ক — সারি ২৫–৩০ আগেই (M-ধাপ ২–৩) লাইভে চালানো ও যাচাই হয়েছে; তাই এখানে আবার চালানোর কিছু নেই।
- **`supabase/sql/dev/remove_demo_project.sql` (নতুন, ঐচ্ছিক):** পরীক্ষা প্রকল্প সরানো — এক ট্রানজেকশন; থামে যদি: ঘর নির্মাণ/গ্রুপ, প্রকাশিত, রেকর্ড আছে, Storage এ ছবি বা কভার আছে। ফিল্ড ও প্রকল্প মোছে; কাউন্টার ও লগ থাকে; "আগে রেকর্ড ছিল" গার্ড শুধু এই ট্রানজেকশনে খোলে; বাকি ডাটার ছাপ আগে-পরে মেলায়। `supabase/README.md` এ যোগ।
- **`scripts/baseline-check.mjs` (নতুন, `npm run baseline-check`):** ঘর নির্মাণের লাইভ মান M-ধাপ ১ এর বেসলাইনের সাথে — anon হিসেবে শুধু পড়ে, পরিকল্পনা §৬.৩ এর ফিঙ্গারপ্রিন্ট হুবহু (Postgres এর `row()::text` ও `jsonb::text` এর লেখার নিয়ম JS-এ; কঠিন মান দিয়ে PGlite এর সাথে মেলানো)।
- **`scripts/smoke.mjs`:** ঘর নির্মাণ ছাড়া **প্রকাশিত সব প্রকল্প নিজে থেকে** — তালিকা, প্রথম রেকর্ডের বিস্তারিত, গ্রুপের ল্যান্ডিং (যেমন `/self-reliance`, `/skill-based-entrepreneur`); খসড়া বা অপ্রকাশিত গ্রুপের উপ-প্রকল্প নয়।
- **`README.md`** নতুন করে: সব পরীক্ষা-টুল, **রাউট টেবিল** (পাবলিক ও `/admin/...`)। **`docs/ADMIN_GUIDE.md`** (নতুন): এডমিন ব্যবহার নির্দেশিকা — লগইন ও ভূমিকা, প্রকল্প খোলা, সেটিংস, ফিল্ড, রেকর্ড, ইম্পোর্ট, ছবি ও ফাইলনাম, প্রকাশ/অপ্রকাশ, চালুর ক্রম, লগ, যা করবেন না।
- এই ফাইলে পর্ব ২ সারসংক্ষেপ; পুরনো ধাপ ১৩-এর তালিকায় চুক্তি **v১.৪** (বহু-প্রকল্প v১.০ থেকে) ও SQL ১০–১৩ এর উল্লেখ।
- ছোট ঠিক: প্রকল্প সেটিংস → প্রদর্শনে পুরনো লেখা "(ফিল্ড যোগ হবে M-ধাপ ৮-এ)" → «"ফিল্ড" ট্যাবে যোগ করুন।»

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **লাইভে কোনো লেখা নয়:** ইম্পোর্ট, প্রকাশ, ছবি — সব আপনার হাতে (নিয়ম: AI লাইভ ডাটায় লেখে না)। আমি শুধু পড়ে যাচাই করেছি।
- **বেসলাইন যাচাই SQL ছাড়া:** anon যা পড়তে পারে (রেকর্ড, ছবি, stats) তা দিয়ে একই md5 — মিলেছে, তাই ডাটাও অক্ষত আর হিসাবও হুবহু। কাউন্টার/লগ/স্কিমা anon পড়তে পারে না — সেগুলোর জন্য `checks/10_verify.sql` (ঐচ্ছিক)।
- **পরীক্ষা প্রকল্প সরানো ঐচ্ছিক:** অপ্রকাশিত রাখলেও ক্ষতি নেই (দর্শক দেখেন না, হোমে আসে না)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- স্বাবলম্বী ও দক্ষতা ভিত্তিক এখনো লাইভে নেই — তাই smoke এ তাদের পাতা এখন আসে না (প্রকাশের পর নিজে আসবে; নকল সার্ভারে যাচাই করা)।
- প্রশ্ন ১৫ (হিরোর লেখা), ২ (প্রকল্পের আসল নাম), ১৭ (৫ উপজেলার ইউনিয়ন) — আপনার উত্তরের অপেক্ষায়।
- ~~সারি ৩৪ (SQL ১৩)~~ — ✅ লাইভে চালানো (২০২৬-১০-০৬, ৩/৩): টাকার সীমা ডাটাবেসেও এখন ১০০০ কোটি।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
1. ~~**সারি ৩৪:** `supabase/sql/13_money_limit.sql`~~ — ✅ হয়ে গেছে (২০২৬-১০-০৬, ৩/৩ ✅)।
2. **সারি ৩২ (পরীক্ষা প্রকল্প):** লাইভে "পরীক্ষা প্রকল্প" (demo) বানিয়ে থাকলে — মূল এডমিন হিসেবে `/admin/records/demo` থেকে সব রেকর্ড মুছুন, সেটিংস থেকে কভার মুছুন, অপ্রকাশিত রাখুন → SQL Editor এ `supabase/sql/dev/remove_demo_project.sql` → শেষ সারিতে `projects 0`। না চাইলে শুধু অপ্রকাশিত রেখে দিন। (না বানিয়ে থাকলে কিছু করার নেই।)
3. **সারি ৩৩ — স্বাবলম্বী ও দক্ষতা ভিত্তিক চালু** (`docs/ADMIN_GUIDE.md` §৯):
   1. প্রকল্পসমূহ → নতুন প্রকল্প → **অনুদান/উপকরণ ধরন**, একক প্রকল্প। স্বাবলম্বী: slug `self-reliance`। দক্ষতা ভিত্তিক: key ছোট রাখতে প্রথমে slug `skill-entrepreneur` দিয়ে তৈরি করুন (key হবে `skill_entrepreneur`), তারপর সেটিংস → সাধারণ → URL `skill-based-entrepreneur` করে সংরক্ষণ (খসড়ায় বদলানো যায়)।
   2. খসড়া অবস্থায় আসল শীট থেকে **১০–২০ সারির পাইলট ইম্পোর্ট** → প্রিভিউ মিলিয়ে → পুরো শীট।
   3. এডমিন প্রিভিউ: প্রকল্পের পাতা খুলে তালিকা, মোট টাকা/ক্যাটাগরি, চার্ট, কয়েকটি বিস্তারিত — ফোন ও ডেস্কটপে, বাংলা ও ইংরেজিতে।
   4. প্রকাশের চেকলিস্ট পূর্ণ করে **প্রকাশ** → **সাথে সাথে ছবির বাল্ক আপলোড** (ফাইলনাম যেমন `sr_0012.jpg`) → চাইলে কভার।
4. তারপর টার্মিনালে (আগে `npm run dev`): `npm run security-check` (সারি ৩০), `npm run photo-check`, `npm run baseline-check`, `npm run content-check`, `npm run smoke` — সব PASS আর smoke এর শুরুতে "প্রকাশিত অন্য প্রকল্প: /self-reliance, …" দেখা চাই। ফলাফল আমাকে পাঠান।
5. **হাতে দেখার তালিকা** (নিচে §৫ক) — ফোন, ট্যাব ও ডেস্কটপে।
6. প্রশ্ন ১৫, ২, ১৭ এর উত্তর; GitHub এ push চাইলে বলবেন (সব কাজ `main` এ)।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npx oxlint` (০), `npm run build`, `npm run i18n-check` | ✅ |
| `npm run security-check` ৩৭/৩৭, `photo-check` ৮/৮, `content-check` ✓ (লাইভ, শুধু পড়া) | ✅ |
| **`npm run baseline-check` ৫/৫ — ঘর নির্মাণের লাইভ মান অক্ষত:** semi_pucca ১০টি রেকর্ড, সর্বোচ্চ সিরিয়াল ১০, ফিঙ্গারপ্রিন্ট `00d0cacc…` (বেসলাইনের হুবহু), tin ০, ছবি আগের ১ / বর্তমান ৩, `housing_stats` md5 `a93bfa85…`; হিসাবের নিয়ম PGlite এর সাথে ৪/৪ (উদ্ধৃতি, কমা, `\`, ট্যাব, লাইন-ভাঙা, মাইক্রোসেকেন্ড, +০৬:০০, বাংলা jsonb কী) | ✅ |
| **`remove_demo_project.sql` — PGlite এ আসল SQL ১–১৩ এর উপর** ১০/১০: demo নেই → শুধু বার্তা; প্রকাশিত/রেকর্ড/ছবি/কভার থাকলে থামে (কিছু না মুছে); ফ্ল্যাগ ছাড়া সরাসরি মোছা গার্ডে আটকায়; সফল হলে প্রকল্প ও ফিল্ড মোছা, কাউন্টার থাকে, বাকি ছাপ একই, ফ্ল্যাগ খোলা থাকে না, একই key আবার তৈরি হলে সিরিয়াল পুনর্ব্যবহার নয়; semi_pucca/tin/housing/গ্রুপ → থামে; ঘর নির্মাণের ছাপ অক্ষত | ✅ |
| `smoke` ১২৩/১২৩ (৫ প্রস্থ × ২ ভাষা) ও `--legacy` ১২৩/১২৩; প্রকাশিত-প্রকল্প খোঁজা নকল সার্ভারে: `/self-reliance` (+ বিস্তারিত), `/skill-based-entrepreneur`, গ্রুপ ও তার উপ-প্রকল্প আসে; ঘর নির্মাণ ও অপ্রকাশিত গ্রুপের উপ-প্রকল্প আসে না | ✅ |
| `admin-ui-check` ১৮৬/১৮৬ | ✅ |
| লাইভে নতুন প্রকল্প চালু ও পরের পরীক্ষা, হাতে দেখা (আপনি, §৪) | ⏳ |

#### ৫ক. হাতে দেখার তালিকা (ফোন ~৩৯০px, ট্যাব ~৭৬৮px, ডেস্কটপ ≥১২৮০px; বাংলা ও EN)
| # | কোথায় | কী দেখবেন |
|---|---|---|
| ১ | হোম `/` | হিরোর সংখ্যা (মোট প্রকল্প/উপকারভোগী/জেলা); প্রতিটি প্রকাশিত প্রকল্পের কার্ড (ছবি/কভার, সংখ্যা, ৳); কোনো খসড়া নেই; পাশে স্ক্রল নেই |
| ২ | হেডারের "প্রকল্পসমূহ ▾" | সব প্রকাশিত প্রকল্প; ফোনে মেনু খোলে-বন্ধ হয় |
| ৩ | `/housing`, `/housing/semi-pucca` | আগের মতো — ৪টি কার্ড, মানচিত্র, ফিল্টার, ১১ কলামের টেবিল (ফোনে কার্ড) |
| ৪ | `/self-reliance`, `/skill-based-entrepreneur` | মোট টাকা ৳, মোট ক্যাটাগরি, ক্যাটাগরি-চার্ট নেই, ইউনিয়ন ও উপকরণ ফিল্টার, টাকার কলাম; ফোনে বড় একক ছবি |
| ৫ | যেকোনো "বিস্তারিত" | ঘর নির্মাণে স্লাইডার; অনুদানে একক ছবি (জুম, ফুলস্ক্রিন), উপরে ক্যাটাগরি ও টাকা; ←/→ ও সোয়াইপে আগের/পরের |
| ৬ | EN | লেবেল ইংরেজিতে; নাম ও ক্যাটাগরি বাংলায় (শীটে যেমন) |
| ৭ | পুরনো লিংক | `/housing/admin/...` → `/admin/...` |
| ৮ | `/admin` (ফোনেও) | ড্যাশবোর্ড, প্রকল্পের তালিকা, রেকর্ড, ইম্পোর্ট, ছবি, লগ — ফোনে "এডমিন মেনু" |
| ৯ | লগআউট অবস্থায় খসড়া প্রকল্পের ঠিকানা | "পাওয়া যায়নি" |

#### ৫খ. পরিকল্পনার §২ চেকলিস্ট — অবস্থা
| # | চাহিদা | অবস্থা |
|---|---|---|
| ১ | অনেক প্রকল্প চালানোর সিস্টেম | ✅ (M-২–৮) |
| ২ | আগে-পরে / শুধু পরে ছবি | ✅ ছবি মোড (M-১২, ১৪) |
| ৩ | প্যানেল থেকে প্রকল্প তৈরি, দুই ভাষার নাম | ✅ উইজার্ড (M-৭) |
| ৪ | প্যানেল থেকে ফিল্ড যোগ | ✅ ফিল্ড বিল্ডার (M-৮) |
| ৫ | স্বাবলম্বী: টাকা, উপকরণ, কেনার পর ছবি | ✅ অনুদান টেমপ্লেট, শুধু পরের ছবি — **লাইভে চালু: সারি ৩৩ (আপনি)** |
| ৬ | স্বাবলম্বীর ফিল্ড (ইউনিয়ন পর্যন্ত ঠিকানাসহ) | ✅ টেমপ্লেট + ইউনিয়ন (M-৭, ৯) |
| ৭ | দক্ষতা ভিত্তিকও একই রকম | ✅ একই টেমপ্লেট — **লাইভে চালু: সারি ৩৩ (আপনি)** |
| ৮ | ঘর নির্মাণসহ সব প্রকল্প প্যানেল থেকে | ✅ (M-২, ৭–৮) |
| ৯ | যে প্রকল্পে যাব, শুধু তার ডাটা | ✅ (M-৬, ১৩) |
| ১০ | মোট টাকা, মোট ক্যাটাগরি স্ট্যাট | ✅ (M-৩, ৮, ১৩) |
| ১১ | আগের সব সুবিধা সব প্রকল্পে | ✅ (M-১০–১৪) |
| ১২ | URL `/admin`, `/housing/`, `/self-reliance`, `/skill-based-entrepreneur` | ✅ রাউট রেজিস্ট্রি-চালিত — শেষ দুটি প্রকাশের পর (সারি ৩৩) |
| ১৩ | হোমে সব প্রকল্পের ডায়নামিক কার্ড | ✅ (M-১৫) |
| ১৪ | পরিকল্পনা, ধাপে ধাপে কাজ | ✅ |
| — | লাইভ ডাটা অক্ষত, RLS, গোপন key গিটে নয়, ফোন/ট্যাব/ডেস্কটপ, বাংলা+EN, পরে নিজস্ব সার্ভারে যাওয়া যায় | ✅ baseline-check, security-check, smoke; চুক্তি v১.৪ |

### ৬. পরের ধাপে কী করতে হবে
- পরিকল্পনার সব M-ধাপ শেষ। বাকি: উপরের §৪ (লাইভে চালু ও যাচাই) — ফলাফল পাঠালে আমি মিলিয়ে নথি হালনাগাদ করব।
- পুরনো **ধাপ ১৩ (নিজস্ব সার্ভার)** — সার্ভারের তথ্য (উপরে "ধাপ ১৩ → ক") পেলে শুরু।

## পরিবর্তন: ক্যাটাগরি-চার্ট বাদ (২০২৬-১০-০৬) — ✅ (ডাটাবেসের কাজ নেই)

ব্যবহারকারীর সিদ্ধান্ত: তালিকা পাতার "উপকরণের ক্যাটাগরি অনুযায়ী" (By Item category) চার্ট দেখাতে হবে না।
- **সরানো:** `features/projects/list/CategoryBreakdown.tsx` (`git rm`), তালিকা পাতা থেকে চার্ট, সেটিংস → প্রদর্শনের "বিতরণ চার্টের ফিল্ড", অনুদান-টেমপ্লেটের `breakdown_field`, টাইপের `breakdown_field`, ৮টি অব্যবহৃত লেখা (`en.ts`)। ক্যাটাগরি দিয়ে ফিল্টার আগের মতো ড্রপডাউনে (`?f_category=`)।
- **লাইভ ডাটা:** লাইভে প্রকাশিত "স্বাবলম্বী প্রকল্প" (`self_reliance_project`, `/self-reliance-project`, ১৩টি রেকর্ড) এর সেটিংসে পুরনো `breakdown_field` রয়ে গেছে — কোড এখন তা উপেক্ষা করে, তাই চার্ট আর দেখায় না; ডাটাবেসে কিছু বদলানো হয়নি।
- **পরীক্ষা:** `admin-ui-check` ১৮৮/১৮৮ — চার্ট নেই, ক্যাটাগরি-ড্রপডাউনে ফিল্টার, টেমপ্লেট ও সেটিংসে চার্টের অপশন নেই; লাইভে নতুন প্রকাশিত প্রকল্প থাকলেও চলে (প্রত্যাশা লাইভের ওভারভিউ থেকে)। `smoke` ১৪৩/১৪৩ (লাইভের `/self-reliance-project` ও তার বিস্তারিত নিজে যোগ হয়েছে) ও `--legacy` ১২৩/১২৩; গেট সব ✅। ঘর নির্মাণে চার্ট ছিল না — অপরিবর্তিত।

## M-ধাপ ১৭ — ডিফল্ট ক্রম: নতুন সাল আগে (২০২৬-১০-০৬) — ✅ (ডাটাবেসের কাজ নেই)

### ১. কী তৈরি বা পরিবর্তন হয়েছে
- `src/backend/interfaces/types.ts`: নতুন `DEFAULT_LIST_ORDER = { sort: 'year', order: 'desc' }` — এক জায়গায় ডিফল্ট।
- পাবলিক তালিকা (`ProjectListPage`) ও এডমিন রেকর্ড-তালিকা (`AdminRecordsPage`) এখন এটি পাঠায় → **সাল বড় থেকে ছোট, একই সালে সিরিয়াল ছোট থেকে বড়** (অ্যাডাপ্টার আগে থেকেই সিরিয়ালকে দ্বিতীয় ক্রম হিসেবে যোগ করে)। বিস্তারিত মডালের ←/→ ও পাতা পেরোনো একই ক্রমে (তালিকার params থেকে)।
- অপরিবর্তিত (ইচ্ছাকৃত): CSV এক্সপোর্ট সিরিয়াল ক্রমে (আবার ইম্পোর্টের জন্য); গ্রুপ-ল্যান্ডিংয়ের কার্ডে "প্রথম উপকারভোগী" (সিরিয়াল ১)।
- `docs/API_CONTRACT.md` এ এক লাইন (ফ্রন্টএন্ডের ডিফল্ট); চুক্তির নিয়ম আগে থেকেই ছিল — সংস্করণ অপরিবর্তিত।
- পরীক্ষা: `admin-ui-check` (নকল ভাণ্ডার এখন PostgREST এর `order=` মানে), `adapter-check`।

### ২. গুরুত্বপূর্ণ সিদ্ধান্ত ও কারণ
- **ফিল্টার নয়, ক্রম** (প্রশ্ন ২১): সব সালের ডাটা থাকে, শুধু নতুন সাল আগে — বছরের শুরুতে নতুন ডাটা না থাকলেও পাতা খালি দেখায় না।
- ইনডেক্স `(project_type, year)` আগে থেকেই আছে; ১ লাখ রেকর্ডেও এই ক্রমে প্রথম পাতা ~১৭ ms (লোকালে মাপা, পর্ব চ)।

### ৩. পরিচিত সমস্যা ও বাকি কাজ
- লাইভে ঘর নির্মাণের ১০টি রেকর্ডই ২০২৪ আর "স্বাবলম্বী প্রকল্প"-এর ১৩টিই ২০২৬ — তাই এখন চোখে ক্রমের কোনো বদল দেখা যাবে না; একাধিক সালের ডাটা এলে দেখা যাবে।

### ৪. আমাকে (ব্যবহারকারীকে) যা করতে হবে
- কিছু না। পরে একাধিক সালের ডাটা এলে তালিকার শুরুতে নতুন সাল আছে কি না দেখবেন।

### ৫. কিভাবে টেস্ট করতে হবে
| পরীক্ষা | ফল |
|---|---|
| গেট: `npx tsc -b`, `npx oxlint` (০), `npm run build`, `npm run i18n-check` | ✅ |
| `admin-ui-check` ১৯৩/১৯৩ (+৫): পাবলিক তালিকা ২০২৫ → ২০২৪, একই সালে সিরিয়াল (রহিমা, সালমা, আমেনা, রাশেদ, নূর, করিম …); অনুরোধে `order=year.desc,serial_no.asc`; বিস্তারিতে → #১ → #৩, সালের সীমা পেরিয়ে #৯ (২০২৫) → #২ (২০২৪); এডমিন তালিকা ১,৩,৫,৭,৯,২,৪,৬,৮,১০ | ✅ |
| `adapter-check` ২৯/২৯ (+১: `order(year, desc)` তারপর `order(serial_no, asc)`) | ✅ |
| `smoke` ১৪৩/১৪৩ (লাইভের `/self-reliance-project` সহ) ও `--legacy` ১২৩/১২৩; ঘর নির্মাণের স্ক্রিনশট আগের রানের মতো (পার্থক্য শুধু জানা নয়েজ); "স্বাবলম্বী প্রকল্প" ও হোমের পার্থক্য লাইভে নতুন ৩টি ছবির কারণে (রেকর্ড ১–৩, ২০২৬-১০-০৬ ০৬:২৮ UTC) — ক্রম অপরিবর্তিত | ✅ |
| `baseline-check` ৫/৫, `security-check` ৩৭/৩৭, `photo-check` ১৪/১৪, `field-types-check` ১২২/১২২, `geo-check` ৫৪/৫৪ | ✅ |

### ৬. পরের ধাপে কী করতে হবে
- **M-ধাপ ১৮** — SQL ১৪: প্রকল্পভিত্তিক ইউজার ও "মোছার সমান" কাজ শুধু সুপার এডমিন।
- পেস্ট করুন: `M-ধাপ ১৮ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`
