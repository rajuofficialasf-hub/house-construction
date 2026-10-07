# আস-সুন্নাহ ফাউন্ডেশন — প্রকল্প-প্ল্যাটফর্ম (ঘর নির্মাণ, স্বাবলম্বী, দক্ষতা ভিত্তিক …)

React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 8। প্রকল্প, তাদের ফিল্ড ও স্ট্যাট কার্ড এডমিন প্যানেল থেকে তৈরি হয় — নতুন প্রকল্পে কোড লাগে না।
ব্যাকএন্ড নিজস্ব REST সার্ভার (`server/`: Express 5 + PostgreSQL 17); UI তার সাথে কথা বলে শুধু `src/backend/` এর অ্যাডাপ্টার দিয়ে (`VITE_HOUSING_BACKEND`: `rest` ডিফল্ট, `mock` শুধু dev ও টেস্টে)। API চুক্তি: [docs/api/PROJECTS_API_CONTRACT.md](docs/api/PROJECTS_API_CONTRACT.md)।

নতুন ডেভেলপার হলে আগে পড়ুন [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) (ইংরেজিতে): চালানো, নতুন ফিচার যোগ আর কোন টেস্ট কখন।

## চালানো

Docker আর Node 22 (`.nvmrc`) লাগে। এক কমান্ডে সব (ডাটাবেস + মাইগ্রেশন + নমুনা ডেটা + API + UI, ফাইল সেভ করলে নিজে রিলোড হয়):

```bash
docker compose up                 # UI http://localhost:5173 , API http://localhost:3001/api/v1/readyz
VITE_HOUSING_BACKEND=mock docker compose up   # UI কে API ছাড়া মক ব্যাকএন্ডে চালাতে
```

ছবি NAS ড্রাইভারে `housing-storage` ভলিউমে থাকে (`docker compose down -v` এ মুছে যায়)। প্রথমবার কন্টেইনারে `npm ci` চলে বলে একটু সময় লাগে; package-lock বদলালে আবার চলে। নমুনা ডেটা (২০টি রেকর্ড আর খসড়া "demo" প্রকল্প) বসে শুধু একেবারে নতুন ডাটাবেসে; আবার পেতে `docker compose down -v` করে নতুন করে শুরু করুন।

আলাদা করে হোস্টে চালাতে:

```bash
npm install
cp .env.example .env.local        # ডিফল্ট: REST ব্যাকএন্ড, API http://localhost:3001
docker compose up -d db           # শুধু PostgreSQL 17, 127.0.0.1:5432 এ; ডাটাবেস housing (ডেভ) ও housing_test (টেস্ট)
cp server/.env.example server/.env
npm --prefix server install
npm --prefix server run db:migrate   # মাইগ্রেশন (server/db/migrations)
npm --prefix server run db:seed      # ডামি রেকর্ড ও একটি খসড়া "demo" প্রকল্প (শুধু লোকাল ডাটাবেসে চলে)
npm --prefix server run dev          # API http://localhost:3001 (আলাদা টার্মিনালে)
npm run dev                          # http://localhost:5173 (API না চললে "সার্ভারে সংযোগ করা যায়নি")
npm run dev:mock                     # সার্ভার ছাড়া, ইন-মেমরি মক ব্যাকএন্ডে
npm run build                        # টাইপ-চেক + প্রোডাকশন বিল্ড (dist/)
npm run lint
docker compose down -v               # ডাটাবেস ও কন্টেইনারের node_modules মুছে নতুন করে শুরু
```

**এডমিন খোলা:** `docker compose exec api npm run admin -- create --email <ইমেইল> --name <নাম> [--role main_admin]` (হোস্টে চালালে `npm --prefix server run admin -- …`; পাসওয়ার্ড কমান্ডই জিজ্ঞেস করে)। ভূমিকা বদল `set-role`, তালিকা `list`; বিস্তারিত [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) §১ক।

### পরীক্ষা ও টুল

```bash
npm test                          # unit + মক ব্যাকএন্ডে চুক্তি-টেস্ট
npm --prefix server run typecheck && npm --prefix server test   # সার্ভার টেস্ট (housing_test; আগে docker compose up -d db)
npm run test:contract:rest        # চুক্তি-স্যুট REST অ্যাডাপ্টার দিয়ে Express সার্ভারে (housing_test)
npm run test:e2e:rest-admin       # Playwright: এডমিন ফ্লো, নিজে চালানো API তে (housing_test)
npm run test:e2e:rest             # Playwright: পাবলিক ফ্লো লোকাল API তে (আগে docker compose up -d db api)
npm run test:e2e:mock             # Playwright: এডমিন/লেখার ফ্লো আর পাবলিক ফ্লো, মক ব্যাকএন্ডে
npm run test:all                  # i18n, unit, প্রোডাকশন বান্ডল যাচাই আর মক Playwright একসাথে
npm run check:prod-bundle         # প্রোডাকশন বিল্ডে মক কোড বা "supabase" নেই
npm run i18n-check                # বাংলা UI লেখা বনাম src/i18n/en.ts — অনুপস্থিত অনুবাদ
npm run field-types-check         # ফিল্ড-টাইপের পার্স/ফরম্যাট/CSV
npm run geo-check                 # ভূগোল ও ইউনিয়ন, বিল্ডে ইউনিয়নের chunk ও বান্ডলের আকার
npm run build-unions -- --check   # ইউনিয়নের তালিকা হালনাগাদ কি না
npm run build-map -- --in gadm41_BGD_3.json   # উপজেলা মানচিত্রের TopoJSON পুনর্নির্মাণ
```

housing_test ব্যবহার করা তিনটি স্যুট (সার্ভার টেস্ট, `test:contract:rest`, `test:e2e:rest-admin`) একসাথে চালাবেন না; সবাই একই ডাটাবেস রিসেট করে। বিস্তারিত: [docs/testing/README.md](docs/testing/README.md)।

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
| `/admin/users` | ইউজার-পাতা: ভূমিকা বদল, প্রকল্পের ইউজারকে প্রকল্প দেওয়া, লগইন বন্ধ ও চালু (নতুন লগইন খোলা হয় CLI দিয়ে) | মূল এডমিন |
| `/housing/admin/...` | পুরনো লিংক → নতুন `/admin/...` এ নিজে থেকে যায় | — |

খসড়া প্রকল্পের পাতা শুধু এডমিন দেখেন (উপরে হলুদ "খসড়া" ব্যানার); সাধারণ দর্শক পান "পাওয়া যায়নি"।

## নথি

সব নথির সূচি: [docs/README.md](docs/README.md)

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) — **ডেভেলপার নির্দেশিকা** (ইংরেজিতে): চালানো, নতুন ফিচার যোগ, কোন টেস্ট কখন, CI কী দেখে
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — **এডমিন ব্যবহার নির্দেশিকা**: ভূমিকা, এডমিন খোলা, প্রকল্প, ফিল্ড, ইম্পোর্ট, ছবি, প্রকাশ/অপ্রকাশ
- [docs/api/PROJECTS_API_CONTRACT.md](docs/api/PROJECTS_API_CONTRACT.md) — REST সার্ভারের চুক্তি
- [docs/architecture/migration-notes.md](docs/architecture/migration-notes.md) — স্থাপত্যের সিদ্ধান্ত, মাইগ্রেশনের তালিকা, হোস্টিংয়ের শর্ত
- [docs/testing/README.md](docs/testing/README.md) — কোন টেস্ট কখন, মক ব্যাকএন্ড, CI
- [docs/history/README.md](docs/history/README.md) — আগের Supabase সংস্করণের নথি ও সরানো জিনিস কোথা থেকে ফেরানো যায়
