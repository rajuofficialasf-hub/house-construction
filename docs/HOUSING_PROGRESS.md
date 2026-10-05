# ঘর নির্মাণ প্রকল্প — অগ্রগতি নথি (HOUSING_PROGRESS.md)

> নতুন চ্যাটে কাজ শুরু করার আগে এই ফাইলটি পুরোটা পড়তে হবে।
> প্রতিটি ধাপ শেষে এই ফাইল আপডেট হবে। সর্বশেষ আপডেট: ২০২৬-১০-০৫ (পর্ব ২, M-ধাপ ১)
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
| ২৩ক | **⚠ জরুরি: `09a_fix_photo_log.sql` চালান** (২০২৬-১০-০৫)। 09-এর লগ-ট্রিগারে বাগ: ছবি যোগ/বদল/মোছা হলে "malformed array literal" ত্রুটি, পুরো আপডেট বাতিল — অর্থাৎ 09 চালানোর পর থেকে এডমিন ফর্ম, ছবির বাল্ক আপলোড ও `migrate-photos` এ ছবি বসানো ব্যর্থ। ফাইলটি শুধু ফাংশনটি ঠিক করে, নিজে পরীক্ষা করে (রোলব্যাকসহ), শেষে "✅" দেখায় | M-ধাপ ১ | `supabase/sql/09a_fix_photo_log.sql` |
| ২০ | ব্রাউজারে ম্যানুয়াল যাচাই তালিকা (শেষ ধাপ → §৫) মোবাইল/ট্যাবলেট/ডেস্কটপে | শেষ ধাপ | শেষ ধাপ → §৫ |
| **পর্ব ২** | **বহু-প্রকল্প (docs/MULTI_PROJECT_PLAN.md, পরিশিষ্ট ক)** | | |
| ২৪ | ✅ (২০২৬-১০-০৫ ০৪:৩১ UTC) `supabase/sql/checks/00_baseline.sql` চালানো হয়েছে; মানগুলো পর্ব ২ → M-ধাপ ১ → "বেসলাইন মান"-এ সংরক্ষিত | M-১ | পর্ব ২ → M-ধাপ ১ |
| ২৫ | **ব্যাকআপ:** Table Editor থেকে `housing_beneficiaries` ও `housing_serial_counters` → Export CSV (কম্পিউটারে রাখুন); তারপর SQL Editor-এ `supabase/sql/backup/before_10.sql` → ৫টি সারি "✅ মিলেছে" | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৬ | `supabase/sql/10_projects.sql` চালানো (৮ সারি ✅), তারপর `supabase/sql/checks/10_verify.sql` (১৮ সারি — সব ✅) — দুটোর ফলাফল-টেবিল AI-কে পাঠানো | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৭ | `supabase/sql/10b_project_guards.sql` চালানো (৮ সারি ✅; মূল এডমিনের ইমেইল দেখুন), তারপর `supabase/sql/checks/10b_selftest.sql` (২১ সারি — শেষ সারি "২০ ✅ · ০ ❌"), তারপর `checks/rollback_rehearsal.sql` (৬ সারি ✅) — ফলাফল AI-কে পাঠানো | M-২ | পর্ব ২ → M-ধাপ ২ → §৪ |
| ২৮ | `backup/before_11.sql`, তারপর `11_project_rpcs.sql`, তারপর `checks/11_selftest.sql` | M-৩ | পরিকল্পনা §৬.৪ |
| ২৯ | `backup/before_12.sql`, তারপর `12_activity_log_v2.sql`, তারপর `checks/12_selftest.sql` | M-৩ | পরিকল্পনা §৬.৪ |
| ৩০ | `npm run security-check` (সব PASS) আর `checks/rollback_rehearsal.sql` (সব ✅) | M-৩, M-১৬ | পরিকল্পনা §৬.৬ |
| ৩১ | (ঐচ্ছিক) `checks/11_perf_optional.sql`, তারপর আলাদাভাবে `VACUUM ANALYZE public.housing_beneficiaries` | যেকোনো সময় | পরিকল্পনা §৫.১৬ |
| ৩২ | পরীক্ষা প্রকল্পের রেকর্ড মুছে `supabase/sql/dev/remove_demo_project.sql` (অথবা অপ্রকাশিত রেখে দেওয়া) | M-১৬ | পরিকল্পনা §৬.৮ |
| ৩৩ | স্বাবলম্বী ও দক্ষতা ভিত্তিক চালু: খসড়ায় ইম্পোর্ট (আগে পাইলট), প্রিভিউ, প্রকাশ, তারপর ছবি | M-১৬ | পরিকল্পনা M-ধাপ ১৬ |

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
  i18n/                         # ভাষা টগল (২০২৬-০৯-৩০): key = বাংলা লেখা
    core.ts                     #   t(bn, vars) অনুবাদ, gn(নাম) ভৌগোলিক নাম, getLang()
    en.ts                       #   ইংরেজি অভিধান (বাংলা → English), সব UI লেখা
    langContext.ts              #   useLang()
    LanguageProvider.tsx        #   LanguageProvider (key={lang} remount, localStorage asf_lang, <html lang>), LanguageToggle (বাং | EN)
    index.ts                    #   barrel
  vite-env.d.ts                 # ImportMetaEnv টাইপ (VITE_* ভ্যারিয়েবল)
  app/layout/                   # SiteLayout, SiteHeader (মোবাইল মেনুসহ), SiteFooter
  components/ErrorBoundary.tsx   # রেন্ডার error হলে পেইজ সাদা না হয়ে বার্তা + আবার চেষ্টা/রিলোড (App ও মানচিত্রে)
  components/Toast.tsx          # সাইট-ব্যাপী টোস্ট প্রোভাইডার (App.tsx এ) (ধাপ ১১)
  components/useToast.ts        # useToast(): success/error/info
  pages/                        # HomePage, NotFoundPage
  features/housing/             # ঘর নির্মাণ ফিচার (ধাপ ১ থেকে)
    routes.tsx                  # /housing/* রুট এলিমেন্ট; App.tsx এ {housingRoutes} হিসেবে বসে
    backend/
      index.ts                  # ফিচারের বাইরে থেকে import করার এক দরজা
      factory.ts                # env (VITE_HOUSING_BACKEND) দেখে অ্যাডাপ্টার বাছে; getHousingApi/getAuthProvider/getImageStorage
      interfaces/
        types.ts                # ProjectType, HousingRecord, ListParams, Page, ApiError, HousingApiError ইত্যাদি
        housingApi.ts           # HousingApi ইন্টারফেস
        authProvider.ts         # AuthProvider ইন্টারফেস
        imageStorage.ts         # ImageStorage ইন্টারফেস
        index.ts
      supabase/                 # সব ফ্যাক্টরি `GetClient` (() => SupabaseClient) নেয় — ব্রাউজারে anon, স্ক্রিপ্টে service_role
        client.ts               # getSupabase() (env, anon key, lazy), GetClient টাইপ, TABLE, STORAGE_BUCKET
        errors.ts               # Supabase এরর → HousingApiError
        session.ts              # assertAdmin(getClient), isAdminUser() (rpc is_housing_admin, cache)
        housingApi.ts           # createSupabaseHousingApi(getClient, storage, {trustedServer?})
        authProvider.ts         # createSupabaseAuthProvider(getClient)
        imageStorage.ts         # createSupabaseImageStorage(getClient) — photoPath, upsert, webp
        index.ts
      rest/
        endpoints.ts            # API_CONTRACT এর পাথ
        http.ts                 # restRequest(): JSON, Bearer token (localStorage 'housing_rest_token') / credentials include, এরর ম্যাপিং
        authProvider.ts         # REST AuthProvider (login/logout/me, listeners, cross-tab storage event) — ধাপ ১০
        index.ts                # HousingApi/ImageStorage stub (ধাপ ১৩)
    components/
      HousingSubnav.tsx         # হাউজিং সেকশনের ভেতরের পিল-নেভিগেশন (variant light/dark)
      FeaturedProjects.tsx      # হোম পেইজের "প্রকল্পসমূহ" সেকশন: প্রতি প্রকল্পে এক কার্ড, মোবাইলে স্ক্রল-স্ন্যাপ + তীর (২০২৬-০৯-৩০)
      UpazilaMap.tsx            # SVG উপজেলা মানচিত্র (d3-geo + topojson-client): সংখ্যা অনুযায়ী সবুজ, সংখ্যার বাবল, টুলটিপ, ক্লিক, হুইল/পিঞ্চ জুম, প্যান, +/−/রিসেট, লেজেন্ড (২০২৬-০৯-৩০)
      UpazilaMapPanel.tsx       # তালিকা পেইজে ফিল্টারের উপরে; ডিফল্টে লুকানো — গ্রেডিয়েন্ট ব্যানার-বাটন "মানচিত্রে দেখুন" (উপজেলা/ঘর সংখ্যা); খুললে পতাকা-মানচিত্র; ক্লিক ↔ বিভাগ/জেলা/উপজেলা ফিল্টার
      FeaturedProjectCard.tsx   # "সফলতার গল্প"-স্টাইল কার্ড: প্রথম উপকারভোগীর ছবি, ৩টি পরিসংখ্যান টাইল (মোট ঘর / জেলা কভার / উপজেলা কভার — stats, count-up), "আরো দেখুন", সোনালি বারে নাম/ঠিকানা/প্রকল্প-সাল/সিরিয়াল
      ProjectIcons.tsx          # SVG আইকন: সেমিপাকা / টিনের ঘর
      StatCards.tsx             # ৪টি পরিসংখ্যান কার্ড + skeleton + এরর (ধাপ ৪)
      HousingTable.tsx          # তালিকা: md+ টেবিল / মোবাইল কার্ড, থাম্বনেইল, লাইটবক্স, ভিউ বাটন (ধাপ ৫)
      Pagination.tsx            # আগের/পরের, পেইজ নম্বর (ellipsis), "মোট X টির মধ্যে Y–Z"
      Lightbox.tsx              # বড় ছবির মোডাল (Esc/ব্যাকড্রপে বন্ধ, body স্ক্রল লক)
      SafeImage.tsx             # ছবি নেই/লোড ব্যর্থ হলে প্লেসহোল্ডার; lazy + async decode
      ErrorNotice.tsx           # HousingApiError → বাংলা বার্তা (StatCards ও তালিকায় ব্যবহৃত)
      HousingFilters.tsx        # ফিল্টার বার: সাল, বিভাগ→জেলা→উপজেলা (cascading), নাম খোঁজা (৫০০ms debounce), মুছুন (ধাপ ৬)
      ImageUploader.tsx         # পুনর্ব্যবহারযোগ্য ড্র্যাগ-ড্রপ আপলোডার + StatusPill + ProgressBar (ধাপ ৭; ধাপ ১১ এ ফর্মে)
      PhotoCompare.tsx          # আগে-পরে তুলনা: clip-path স্লাইডার / পাশাপাশি, সিঙ্ক জুম-প্যান (হুইল, ডাবল-ট্যাপ, পিঞ্চ), +/−/রিসেট/ফুলস্ক্রিন (ধাপ ৯)
      RequireAdmin.tsx          # protected layout route: loading → লগইন যাচাই; এডমিন নয় → /housing/admin/login (state.from) (ধাপ ১০)
      AdminShell.tsx            # এডমিন পেইজের উপরের বার: মেনু (সেমিপাকা/টিন রেকর্ড, ছবি বাল্ক), ইমেইল/নাম, লগআউট
      ConfirmDialog.tsx         # নিশ্চিতকরণ ডায়ালগ (danger/primary, busy, confirmDisabled) (ধাপ ১১)
      AdminRecordsTable.tsx     # এডমিন টেবিল: চেকবক্স, ক্রম, সিরিয়াল, …, এডিট/ডিলেট; md+ টেবিল / মোবাইল কার্ড
      PhotoField.tsx            # ফর্মের একক ছবি ফিল্ড: বিদ্যমান ছবি + মুছুন + ImageUploader (একটি)
      RecordForm.tsx            # নতুন/এডিট ফর্ম: ভ্যালিডেশন, cascading geo, সিরিয়াল auto/manual/লক+বদল, ছবি আপলোড, টোস্ট
    hooks/
      useHousingStats.ts        # HousingApi.stats(projectType) → loading/ready/error
      useHousingList.ts         # HousingApi.list(params) → সার্ভার-সাইড পেজিনেশন; আগের ডাটা ধরে রাখে
      useHousingYears.ts        # HousingApi.years(projectType) → সালের ড্রপডাউন
      useCountUp.ts             # count-up অ্যানিমেশন (rAF, reduced-motion সচেতন)
      useAuth.ts                # AuthProvider.currentUser/isAdmin + onAuthChange → {status, user, isAdmin}
      useFeaturedRecord.ts      # প্রকল্পের প্রথম উপকারভোগী (list page_size 1, serial asc) — হোম কার্ডের জন্য
    pages/
      HousingLandingPage.tsx    # /housing — দুই প্রকল্পের বাটন
      HousingListPage.tsx       # শেয়ারড; prop projectType: 'semi_pucca' | 'tin'
      HousingDetailPage.tsx     # /housing/<slug>/:serial — ভিউ মোড মডাল (Outlet child; আগের/পরের, কীবোর্ড, সোয়াইপ, লাইটবক্স)
      listContext.ts            # ListOutletContext: তালিকা → ডিটেইল এ params/list/page
      HousingLoginPage.tsx      # /housing/admin/login — ইমেইল+পাসওয়ার্ড ফর্ম (AuthProvider.login), সাইন-আপ নেই (ধাপ ১০)
      HousingAdminRecordsPage.tsx # /housing/admin/:slug — রেকর্ড ব্যবস্থাপনা (ট্যাব, ফিল্টার, টেবিল, বাল্ক ডিলেট) (ধাপ ১১)
      HousingRecordFormPage.tsx # /housing/admin/:slug/new ও /:serial/edit — RecordForm wrapper (এডিটে সিরিয়াল ধরে লোড)
      HousingImportPage.tsx     # /housing/admin/import — ৪-ধাপ উইজার্ড (ফাইল, ম্যাপিং, প্রিভিউ+geo ঠিক করা, চালানো) (ধাপ ১২)
      HousingActivityPage.tsx   # /housing/admin/activity — একটিভিটি লগ: ফিল্টার, এন্ট্রি (কে/কখন/কী, old→new), পেজিনেশন (২০২৬-০৯-৩০)
      lazyPages.tsx             # ভিউ মোড ও এডমিন পেইজের React.lazy + <Lazy> Suspense wrapper (শেষ ধাপ)
      HousingPhotoBulkPage.tsx  # /housing/admin/photos — ছবি বাল্ক আপডেট (ফাইলনাম → রেকর্ড মিলানো → প্রিভিউ → ব্যাচ আপলোড → রিপোর্ট)
    utils/
      projectType.ts            # PROJECT_META (title, slug, filePrefix), projectPath, projectFromSlug
      imagePath.ts              # photoPath(type, serial, kind, variant) → housing/{type}/{0001}/{kind}[_thumb].webp; padSerial; photoSrc(url, photo_updated_at)
      photoSpec.ts              # PHOTO_SPEC: maxWidth 1600, thumbWidth 400, quality 80, webp — ব্রাউজার ও স্ক্রিপ্ট দুটোতেই
      imageProcessing.ts        # processImage(file) → {photo, thumb} WebP (canvas, EXIF-সচেতন); formatBytes
      photoFilename.ts          # parsePhotoFilename('semi_0001_prev.jpg') → {project_type, serial_no, kind}
      uploadItems.ts            # UploadItem টাইপ, createUploadItems/revokeUploadItems, STATUS_LABEL
      importParse.ts            # parseSpreadsheet(file): xlsx/csv → {headers, rows} (SheetJS lazy, UTF-8 BOM) (ধাপ ১২)
      importColumns.ts          # IMPORT_FIELDS, FIELD_LABEL, REQUIRED_FIELDS, guessMapping(headers)
      importValidate.ts         # analyzeRows(): সিরিয়াল/সাল/নাম/geo ভ্যালিডেশন, ডুপ্লিকেট, unresolvedGeo
      geoMatch.ts               # looseKey, matchDivision/District/Upazila (fuzzy), resolveGeo(fixes), candidatesFor
      csvExport.ts              # toCsv (BOM), downloadText
      mapData.ts                # loadMapData(): /geo/bd-upazilas.json (TopoJSON) → GeoJSON features + জেলা/বিভাগ/দেশ সীমানা mesh (cache); locationKey()
      districtColors.ts         # districtColors(counts) → জেলা → রঙ (মোট অনুযায়ী ক্রম, ১৪-রঙ প্যালেট + HSL fallback); withAlpha()
public/geo/bd-upazilas.json     # ৫৪৫ উপজেলা/থানার সীমানা (GADM 4.1 level 3, ১২% সরলীকৃত TopoJSON, ~২৬০ KB), properties {id, dv, ds, up (বাংলা NFC), en}; scripts/build-map.mjs দিয়ে তৈরি
scripts/build-map.mjs           # GADM json → বাংলা নাম মেলানো (fold + Levenshtein ≤2, alias, MANUAL override) → mapshaper simplify → TopoJSON; রিপোর্ট ছাপে (npm run build-map -- --in <gadm41_BGD_3.json>)
      geo.ts                    # nfc(), getDivisions/getDistricts/getUpazilas, normalizeGeo, isValidGeo, divisionOfDistrict
      filters.ts                # HousingFilters টাইপ, URL ⇄ ফিল্টার, hasActiveFilters, filtersEqual
    data/
      bdGeo.ts                  # স্থির তালিকা: ৮ বিভাগ → ৬৪ জেলা → ৪৯৪ উপজেলা (বাংলা NFC + ইংরেজি নাম); উৎস ফাইলের মাথায়
scripts/
  migrate-photos.mjs            # Node: CSV/ফোল্ডার → ডাউনলোড → sharp WebP → একই Supabase অ্যাডাপ্টার দিয়ে আপলোড (npm run migrate-photos)
  security-check.mjs            # anon key দিয়ে: পড়া খোলা, INSERT/UPDATE/DELETE/RPC/Storage-আপলোড বন্ধ — PASS/FAIL (npm run security-check)
  i18n-check.mjs                # src/ এর সব বাংলা UI লেখা বনাম en.ts — অনুপস্থিত/অব্যবহৃত key, t() ছাড়া JSX টেক্সট (npm run i18n-check)
  photo-check.mjs               # anon হিসেবে প্রতিটি রেকর্ডের ছবির URL (?v= সহ) এ HEAD — সব 200 কি না (npm run photo-check) (M-ধাপ ১)
  build-rehearsal.mjs           # রোলব্যাক ফাইলের BODY থেকে checks/rollback_rehearsal.sql তৈরি (npm run build-rehearsal) (M-ধাপ ২)
  smoke.mjs                     # puppeteer-core + Chrome/Edge: ৩৬০–১২৮০px × বাংলা/ইংরেজি — ওভারফ্লো, console error, ভুল 404, ErrorBoundary, মানচিত্র-ট্যাপ; স্ক্রিনশট .smoke/ (npm run smoke) (M-ধাপ ১)
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
  sql/rollback/10_12_rollback.sql # SQL ১০–১২ উল্টানো (গার্ডসহ; ১১/১২ অংশ M-ধাপ ৩-এ) (M-ধাপ ২)
  sql/checks/rollback_rehearsal.sql # রোলব্যাকের মহড়া — scripts/build-rehearsal.mjs দিয়ে তৈরি, কিছুই বদলায় না (M-ধাপ ২)
  sql/dev/06_seed.sql           # ২০টি ডামি রেকর্ড — শুধু খালি টেস্ট DB; রেকর্ড থাকলে গার্ড থামায় (M-ধাপ ১ এ সরানো)
  sql/dev/08_reset_test_data.sql # ⚠ সব রেকর্ড মুছে কাউন্টার ০ — ২০২৬-০৯-৩০ এ একবার চালানো; এখন গার্ডসহ (M-ধাপ ১ এ সরানো)
docs/
  HOUSING_PROGRESS.md
  API_CONTRACT.md
  MULTI_PROJECT_PLAN.md         # পর্ব ২: বহু-প্রকল্প প্ল্যাটফর্মের পরিকল্পনা (আসল কপি, M-ধাপ ১ থেকে)
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
| `/housing/admin/login` | এডমিন লগইন (ইমেইল + পাসওয়ার্ড); লগইন থাকলে `/housing/admin` এ | না | ✅ ধাপ ১০ |
| `/housing/admin` | → `/housing/admin/semi-pucca` (redirect) | হ্যাঁ | ✅ ধাপ ১১ |
| `/housing/admin/<slug>?…` | এডমিন রেকর্ড: প্রকল্প ট্যাব, ফিল্টার (সংখ্যা → সিরিয়াল খোঁজা), সিরিয়াল কলামসহ টেবিল, এডিট/ডিলেট, বাল্ক ডিলেট, "নতুন যোগ করুন" | হ্যাঁ | ✅ ধাপ ১১ |
| `/housing/admin/<slug>/new` | নতুন রেকর্ড ফর্ম (সিরিয়াল স্বয়ংক্রিয়/হাতে, ভ্যালিডেশন, cascading, দুই ছবি) | হ্যাঁ | ✅ ধাপ ১১ |
| `/housing/admin/<slug>/:serial/edit` | এডিট ফর্ম (প্রি-ফিল, সিরিয়াল লক + বিশেষ বদল, ছবি প্রতিস্থাপন/মোছা) | হ্যাঁ | ✅ ধাপ ১১ |
| `/housing/admin/import` | বাল্ক ইম্পোর্ট উইজার্ড: xlsx/csv → কলাম ম্যাপিং → প্রিভিউ/ভ্যালিডেশন/ভৌগোলিক সংশোধন → ব্যাচে ইম্পোর্ট (নতুন / সিরিয়াল ধরে আপডেট) → সারসংক্ষেপ + ব্যর্থ CSV | হ্যাঁ | ✅ ধাপ ১২ |
| `/housing/admin/activity?action=&project=&actor=&from=&to=&record=&page=` | একটিভিটি লগ: কে, কখন, কী বদলেছে (old→new); রেকর্ডভিত্তিক ইতিহাস | হ্যাঁ | ✅ (২০২৬-০৯-৩০) |
| `/housing/admin/photos` | ছবি বাল্ক আপডেট (ড্র্যাগ-ড্রপ, ফাইলনাম মিলানো, প্রিভিউ, ব্যাচ আপলোড) | হ্যাঁ (RequireAdmin; লেখা ব্যাকএন্ডেও যাচাই) | ✅ ধাপ ৭ |

### বর্তমানে চালু অ্যাডাপ্টার
ফ্যাক্টরি (`features/housing/backend/factory.ts`) `VITE_HOUSING_BACKEND` পড়ে; অচেনা/খালি হলে ডিফল্ট `supabase`।
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
| ১০ | সার্ভারের সম্পদ (RAM/ডিস্ক) ও ছবির জন্য জায়গা (~১–২ GB লাগবে, ধাপ ৭ হিসাব) | সক্ষমতা |

### খ. ইতিমধ্যে প্রস্তুত (সার্ভার-নিরপেক্ষ)
- `docs/API_CONTRACT.md` ০.৯ — সব endpoint, JSON, ভ্যালিডেশন, এরর, অনুমতি, ছবির পাথ, অথ (JWT/কুকি) — সার্ভার-দল এটি দেখে সরাসরি বানাতে পারে। (পর্ব ২-এর M-ধাপ ৪-এ বহু-প্রকল্পের জন্য v1.0 হবে।)
- ফ্রন্টএন্ড REST অ্যাডাপ্টার: `rest/http.ts` (fetch helper), `rest/authProvider.ts` (**পূর্ণ**), `rest/endpoints.ts` (সব পাথ); `rest/index.ts` এ HousingApi/ImageStorage stub — চুক্তি মেনে পূরণ করলেই `VITE_HOUSING_BACKEND=rest` দিয়ে UI অপরিবর্তিত চলবে।
- পোর্টেবল SQL: `01_schema.sql`, `02_serial.sql` (ট্রিগার/RPC), `07_rpc_bulk.sql` — Postgres হলে সরাসরি।
- মাইগ্রেশন স্ক্রিপ্ট `scripts/migrate-photos.mjs` অ্যাডাপ্টার-ভিত্তিক — REST অ্যাডাপ্টার এলে ফ্যাক্টরি বদলালেই চলবে।
- Supabase → নিজস্ব সার্ভার ডাটা সরানোর ভিত্তি: "সিরিয়াল সহ এক্সপোর্ট" CSV (সব ফিল্ড + রেকর্ড আইডি) ও ইম্পোর্ট উইজার্ড (`use_given_serial`); ছবি: bucket থেকে একই পাথে কপি (ধাপ ১৩ এ স্ক্রিপ্ট)।

### গ. ধাপ ১৩ এর সম্ভাব্য উপ-ধাপ (তথ্য পেলে)
১৩.১ REST HousingApi + ImageStorage (ফ্রন্টএন্ড) — সার্ভার-নিরপেক্ষ, আগে করা যায়; ১৩.২ ব্যাকএন্ড কোড + স্কিমা; ১৩.৩ অথ/নিরাপত্তা; ১৩.৪ ছবি স্টোরেজ/ডেলিভারি; ১৩.৫ ডাটা ও ছবি স্থানান্তর স্ক্রিপ্ট; ১৩.৬ ডিপ্লয়/ব্যাকআপ/লগ নির্দেশিকা; ১৩.৭ যাচাই তালিকা।

---

# পর্ব ২ — বহু-প্রকল্প প্ল্যাটফর্ম (M-ধাপ)

> শুরু: ২০২৬-১০-০৪। পরিকল্পনা (আসল কপি): `docs/MULTI_PROJECT_PLAN.md` — ১৬টি ধাপ (M-ধাপ ১–১৬, ৫ক/৫খ)। প্রতিটি M-ধাপের আগে পরিকল্পনা আর এই ফাইল পড়তে হবে।
> লক্ষ্য: এডমিন প্যানেল (`/admin`) থেকে বাংলা/ইংরেজি নামসহ নতুন প্রকল্প, নিজস্ব ফিল্ড, ছবির ধরন (আগে-পরে / শুধু পরে), ঠিকানা ইউনিয়ন পর্যন্ত, প্রকল্পভিত্তিক স্ট্যাট (মোট টাকা, মোট ক্যাটাগরি); URL `/housing`, `/self-reliance`, `/skill-based-entrepreneur`; হোম পেইজে সব প্রকল্পের ডায়নামিক কার্ড।

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
- `scripts/smoke.mjs` (`npm run smoke`) — ইনস্টল করা Chrome/Edge দিয়ে ৩৬০/৩৯০/৭৬৮/১০২৪/১২৮০px × বাংলা/ইংরেজি: হোম, `/housing`, সেমিপাকা ও টিন তালিকা, বিস্তারিত মডাল, এডমিন লগইন, একটি অবৈধ URL (404 আসা চাই); ফোন-প্রস্থে touch এমুলেশন; তালিকায় মানচিত্র খুলে ২০টি ট্যাপ/ক্লিক। পরীক্ষা: অনুভূমিক ওভারফ্লো, console/page error, ভুল 404, লাল ErrorBoundary, "লোড করা যায়নি", সাদা পেইজ। `--baseline` (`.smoke/baseline/`, পুরনোটি থাকলে `--force` লাগে), `--quick`, `--base`, `--widths`, `--langs`। (`--legacy` আসবে M-ধাপ ৪-এ।)

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

## M-ধাপ ২ — SQL ১০ ও ১০b: প্রকল্প রেজিস্ট্রি, সম্প্রসারণ আর গার্ড (২০২৬-১০-০৫) — 🟡 ফাইল তৈরি ও লোকালে যাচাই, লাইভে চালানো বাকি

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
| লাইভে (আপনি চালানোর পরে): verify ১৮ ✅, selftest ১৮ ✅, মহড়া ৬ ✅ | বাকি |
| লাইভে (AI): `npm run security-check` (১৬ PASS), `npm run photo-check` (৮/৮), `npm run smoke -- --quick` | বাকি |
| পুরনো সাইট হাতে: তালিকা, বিস্তারিত, ম্যাপ, স্ট্যাট কার্ড আগের মতো | বাকি |

### ৬. পরের ধাপে কী করতে হবে
- লাইভ ফলাফল পাওয়ার পর **M-ধাপ ৩** — SQL ১১ (`project_stats`, `projects_overview`, wrapper, বাল্ক v2, `housing_next_serial` v2, `project_create`, ক্রম বদল, ফিল্ডের ব্যবহার, ক্যাটাগরির বানান একীকরণ) ও ১২ (লগ v2) + security-check প্রায় ২৮টি পরীক্ষায়।
- পেস্ট করুন: `M-ধাপ ৩ শুরু করো (পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md)`

