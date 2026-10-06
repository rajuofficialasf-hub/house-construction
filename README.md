# আস-সুন্নাহ ফাউন্ডেশন — প্রকল্প-প্ল্যাটফর্ম (ঘর নির্মাণ, স্বাবলম্বী, দক্ষতা ভিত্তিক …)

React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 8। প্রকল্প, তাদের ফিল্ড ও স্ট্যাট কার্ড এডমিন প্যানেল থেকে তৈরি হয় — নতুন প্রকল্পে কোড লাগে না।
ব্যাকএন্ড অ্যাডাপ্টার-ভিত্তিক: ডিফল্ট নিজস্ব REST সার্ভার (`server/`), dev-এ মক; Supabase মোড পর্ব P9 এ সরবে (`VITE_HOUSING_BACKEND`; চুক্তি `docs/api/PROJECTS_API_CONTRACT.md`)।

## চালানো

```bash
npm install
cp .env.example .env.local        # ডিফল্ট: REST ব্যাকএন্ড, API http://localhost:3001
docker compose up -d db           # PostgreSQL
npm --prefix server install && npm --prefix server run db:migrate && npm --prefix server run db:seed
npm --prefix server run dev       # API http://localhost:3001 (আলাদা টার্মিনালে)
npm run dev                       # http://localhost:5173 (API না চললে "সার্ভারে সংযোগ করা যায়নি")
npm run dev:mock                  # সার্ভার ছাড়া, ইন-মেমরি মক ব্যাকএন্ডে
npm run build                     # টাইপ-চেক + প্রোডাকশন বিল্ড (dist/)
npm run preview                   # বিল্ড করা সাইট দেখা
npm run lint
```

### পরীক্ষা ও টুল

```bash
npm test                          # unit + backend-contract টেস্ট
npm run test:e2e:mock             # Playwright: এডমিন/লেখার ফ্লো (মক ব্যাকএন্ডে) + পাবলিক ফ্লো
npm run test:e2e:live             # Playwright: লাইভ Supabase এ শুধু পড়ার ফ্লো (.env.local এ ক্রেডেনশিয়াল না থাকলে স্কিপ)
npm run test:e2e:rest             # Playwright: একই পাবলিক ফ্লো লোকাল API তে (আগে docker compose up -d db api, npm --prefix server run db:seed)
npm run test:contract:rest        # চুক্তি-স্যুট REST অ্যাডাপ্টার দিয়ে Express সার্ভারে (housing_test; আগে docker compose up -d db)
npm run security-check            # anon দিয়ে: পাবলিক পড়া খোলা, খসড়া/গোপন লুকানো, লেখা বন্ধ
npm run photo-check               # লগইন ছাড়া সব ছবির URL খোলে কি না (HEAD → 200)
npm run baseline-check            # ঘর নির্মাণের লাইভ মান M-ধাপ ১ এর বেসলাইনের সাথে (ফিঙ্গারপ্রিন্ট) — শুধু পড়ে
npm run content-check             # সব প্রকল্প/ফিল্ড/স্ট্যাট কার্ডে ইংরেজি আছে কি না
npm run i18n-check                # বাংলা UI লেখা বনাম src/i18n/en.ts — অনুপস্থিত অনুবাদ
npm run smoke                     # Chrome/Edge: ৩৬০–১২৮০px × বাংলা/ইংরেজি, প্রকাশিত সব প্রকল্পসহ (.smoke/); আগে npm run dev
npm run smoke -- --legacy         # পুরনো-ডাটাবেস মোড (নিজেই আলাদা dev সার্ভার চালায়)
npm run admin-ui-check            # এডমিন প্যানেলের UI — নকল এডমিন সেশন, সব লেখা নকল (লাইভে কিছু যায় না)
npm run adapter-check             # Supabase অ্যাডাপ্টারের নিয়ম (নকল ক্লায়েন্ট)
npm run field-types-check         # ফিল্ড-টাইপের পার্স/ফরম্যাট/CSV
npm run geo-check                 # ভূগোল ও ইউনিয়ন, বিল্ডে ইউনিয়নের chunk ও বান্ডলের আকার
npm run migrate-photos -- --help  # ছবি মাইগ্রেশন (লোকাল, service_role .env এ — গিটে নয়)
npm run build-unions -- --check   # ইউনিয়নের তালিকা হালনাগাদ কি না
npm run build-map -- --in gadm41_BGD_3.json   # উপজেলা মানচিত্রের TopoJSON পুনর্নির্মাণ
```

## নতুন সার্ভার (মাইগ্রেশন চলছে, প্রোডাকশনে এখনো Supabase)

`server/` এ Express + PostgreSQL সার্ভার তৈরি হচ্ছে ([রোডম্যাপ](docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md))। Docker লাগে।

এক কমান্ডে সব (ডাটাবেস + API + UI, ফাইল সেভ করলে নিজে রিলোড হয়):

```bash
docker compose up                 # UI http://localhost:5173 , API http://localhost:3001/api/v1/readyz
VITE_HOUSING_BACKEND=mock docker compose up   # UI কে API ছাড়া মক ব্যাকএন্ডে চালাতে (ডিফল্ট rest: লোকাল API)
```

ছবি NAS ড্রাইভারে `housing-storage` ভলিউমে থাকে (`docker compose down -v` এ মুছে যায়)। প্রথমবার কন্টেইনারে `npm ci` চলে বলে একটু সময় লাগে; package-lock বদলালে আবার চলে। কন্টেইনার কোনো `.env` ফাইল পড়ে না এবং সোর্স শুধু পড়তে পারে; তাই এখানে Supabase মোড চলে না, সেটি হোস্টে `npm run dev` দিয়ে চালান।

আলাদা করে হোস্টে চালাতে:

```bash
docker compose up -d db           # শুধু PostgreSQL 17, 127.0.0.1:5432 এ; ডাটাবেস housing (ডেভ) ও housing_test (টেস্ট)
docker compose down -v            # ডাটাবেস ও কন্টেইনারের node_modules মুছে নতুন করে শুরু
cp server/.env.example server/.env
npm --prefix server install
npm --prefix server run db:migrate   # মাইগ্রেশন (server/db/migrations)
npm --prefix server run db:seed      # ২০টি ডামি রেকর্ড (শুধু লোকাল ডাটাবেসে চলে)
npm --prefix server run dev          # http://localhost:3001/api/v1/readyz
npm --prefix server test             # সার্ভার টেস্ট (housing_test ডাটাবেসে)
```

সার্ভারের জন্য Node 22 লাগে (`.nvmrc`)।

## রুট

| পাথ | কী | লগইন |
|---|---|---|
| `/` | হোম: প্রকাশিত সব প্রকল্পের কার্ড, মোট প্রকল্প/উপকারভোগী/জেলা | না |
| `/<গ্রুপ>` (যেমন `/housing`) | গ্রুপ-ল্যান্ডিং: উপ-প্রকল্পের কার্ড | না |
| `/<প্রকল্প>` বা `/<গ্রুপ>/<প্রকল্প>` (যেমন `/self-reliance`, `/skill-based-entrepreneur`, `/housing/semi-pucca`, `/housing/tin`) | তালিকা: স্ট্যাট কার্ড, মানচিত্র, ফিল্টার (`?year=&division=&district=&upazila=&union=&f_<ফিল্ড>=&q=&page=`), টেবিল/কার্ড | না |
| `…/<প্রকল্প>/<সিরিয়াল>` | বিস্তারিত (মডাল): আগে-পরে প্রকল্পে তুলনা-স্লাইডার, শুধু-পরে প্রকল্পে একক ছবি; ←/→ | না |
| `/admin/login` | এডমিন লগইন | — |
| `/admin` | ড্যাশবোর্ড | এডমিন |
| `/admin/projects`, `/admin/projects/new`, `/admin/projects/<key>?tab=general\|fields\|stats\|photos\|display` | প্রকল্পের তালিকা, নতুন প্রকল্প উইজার্ড, সেটিংস (ফিল্ড, স্ট্যাট কার্ড, ছবি, প্রদর্শন, কভার, প্রকাশ) | এডমিন |
| `/admin/records/<key>`, `…/new`, `…/<সিরিয়াল>/edit` | রেকর্ডের তালিকা, যোগ, এডিট; CSV এক্সপোর্ট | এডমিন (মোছা মূল এডমিন) |
| `/admin/import?project=<key>` | বাল্ক ইম্পোর্ট (নতুন যোগ / সিরিয়াল ধরে আপডেট) | এডমিন |
| `/admin/photos?project=<key>` | ছবির বাল্ক আপলোড (ফাইলনাম দিয়ে মেলানো) | এডমিন |
| `/admin/activity` | একটিভিটি লগ | এডমিন |
| `/housing/admin/...` | পুরনো লিংক → নতুন `/admin/...` এ নিজে থেকে যায় | — |

খসড়া প্রকল্পের পাতা শুধু এডমিন দেখেন (উপরে হলুদ "খসড়া" ব্যানার); সাধারণ দর্শক পান "পাওয়া যায়নি"।

## নথি

সব নথির সূচি: [docs/README.md](docs/README.md)

- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — **এডমিন ব্যবহার নির্দেশিকা**: প্রকল্প খোলা, ফিল্ড, ইম্পোর্ট, ছবি, প্রকাশ/অপ্রকাশ
- [docs/progress/HOUSING_PROGRESS.md](docs/progress/HOUSING_PROGRESS.md) — স্ট্যাক, স্কিমা, রুট, প্রতিটি ধাপের সিদ্ধান্ত, **ব্যবহার নির্দেশিকা**, ডাটাবেস সেটআপ চেকলিস্ট
- [docs/MULTI_PROJECT_PLAN.md](docs/MULTI_PROJECT_PLAN.md) — বহু-প্রকল্প পরিকল্পনা (M-ধাপ ১–১৬) ও প্রশ্নোত্তর
- [docs/api/API_CONTRACT.md](docs/api/API_CONTRACT.md) — নিজস্ব REST ব্যাকএন্ডের চুক্তি
- [docs/testing/README.md](docs/testing/README.md) — টেস্ট চালানো, মক ব্যাকএন্ড, নতুন ব্যাকএন্ডে টেস্ট সরানোর ধাপ
- [docs/operations/runbook.md](docs/operations/runbook.md) — সার্ভারে (PM2 + nginx) স্টেজিং ও প্রোডাকশন সেটআপ, ডিপ্লয়, রোলব্যাক, ব্যাকআপ ও রিস্টোর ড্রিল
- [supabase/README.md](supabase/README.md) — SQL চালানোর ক্রম
