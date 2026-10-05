# আস-সুন্নাহ ফাউন্ডেশন — ওয়েবসাইট (ঘর নির্মাণ প্রকল্প)

React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 8। ব্যাকএন্ড অ্যাডাপ্টার-ভিত্তিক: টেস্টে Supabase, প্রোডাকশনে নিজস্ব REST সার্ভার (env দিয়ে বদল)।

## চালানো

```bash
npm install
cp .env.example .env.local        # তারপর Supabase URL ও anon key বসান
npm run dev                       # http://localhost:5173
npm run build                     # টাইপ-চেক + প্রোডাকশন বিল্ড (dist/)
npm run preview                   # বিল্ড করা সাইট দেখা
npm run lint
npm test                          # unit + backend-contract টেস্ট
npm run test:e2e:mock             # Playwright: এডমিন/লেখার ফ্লো (মক ব্যাকএন্ডে) + পাবলিক ফ্লো
npm run test:e2e:live             # Playwright: লাইভ Supabase এ শুধু পড়ার ফ্লো (.env.local এ ক্রেডেনশিয়াল না থাকলে স্কিপ)
npm run test:e2e:rest             # Playwright: একই পাবলিক ফ্লো লোকাল API তে (আগে docker compose up -d db api, npm --prefix server run db:seed)
npm run test:contract:rest        # চুক্তি-স্যুট REST অ্যাডাপ্টার দিয়ে Express সার্ভারে (housing_test; আগে docker compose up -d db)
npm run security-check            # anon key দিয়ে পড়া-খোলা/লেখা-বন্ধ যাচাই (ডাটাবেস সেটআপের পর)
npm run migrate-photos -- --help  # ছবি মাইগ্রেশন স্ক্রিপ্ট (লোকাল, service_role .env এ)
npm run build-map -- --in gadm41_BGD_3.json   # উপজেলা মানচিত্রের TopoJSON পুনর্নির্মাণ (GADM 4.1 level 3 থেকে)
npm run i18n-check                # বাংলা UI লেখা বনাম src/i18n/en.ts ইংরেজি অভিধান — অনুপস্থিত অনুবাদ খোঁজে
```

## নতুন সার্ভার (মাইগ্রেশন চলছে, প্রোডাকশনে এখনো Supabase)

`server/` এ Express + PostgreSQL সার্ভার তৈরি হচ্ছে ([রোডম্যাপ](docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md))। Docker লাগে।

এক কমান্ডে সব (ডাটাবেস + API + UI, ফাইল সেভ করলে নিজে রিলোড হয়):

```bash
docker compose up                 # UI http://localhost:5173 , API http://localhost:3001/api/v1/readyz
VITE_HOUSING_BACKEND=rest docker compose up   # UI কে লোকাল API তে চালাতে (পড়া কাজ করে; লেখা C4 এ, ছবি C5 এ; ডিফল্ট mock)
```

প্রথমবার কন্টেইনারে `npm ci` চলে বলে একটু সময় লাগে; package-lock বদলালে আবার চলে। কন্টেইনার কোনো `.env` ফাইল পড়ে না এবং সোর্স শুধু পড়তে পারে; তাই এখানে Supabase মোড চলে না, সেটি হোস্টে `npm run dev` দিয়ে চালান।

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

| পাথ | কী |
|---|---|
| `/housing` | প্রকল্প ল্যান্ডিং |
| `/housing/semi-pucca`, `/housing/tin` | তালিকা: স্ট্যাট কার্ড, ফিল্টার, টেবিল, পেজিনেশন (URL query তে) |
| `/housing/<slug>/<serial>` | ভিউ মোড: বিস্তারিত + আগে-পরে ছবির তুলনা |
| `/housing/admin/login` | এডমিন লগইন |
| `/housing/admin/...` | রেকর্ড CRUD, বাল্ক ইম্পোর্ট, ছবি বাল্ক আপডেট (লগইন লাগে) |

## নথি

সব নথির সূচি: [docs/README.md](docs/README.md)

- [docs/progress/HOUSING_PROGRESS.md](docs/progress/HOUSING_PROGRESS.md) — স্ট্যাক, স্কিমা, রুট, প্রতিটি ধাপের সিদ্ধান্ত, **ব্যবহার নির্দেশিকা**, ডাটাবেস সেটআপ চেকলিস্ট
- [docs/api/API_CONTRACT.md](docs/api/API_CONTRACT.md) — নিজস্ব REST ব্যাকএন্ডের চুক্তি
- [docs/testing/README.md](docs/testing/README.md) — টেস্ট চালানো, মক ব্যাকএন্ড, নতুন ব্যাকএন্ডে টেস্ট সরানোর ধাপ
- [supabase/README.md](supabase/README.md) — SQL চালানোর ক্রম
