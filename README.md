# আস-সুন্নাহ ফাউন্ডেশন — প্রকল্প-প্ল্যাটফর্ম (ঘর নির্মাণ, স্বাবলম্বী, দক্ষতা ভিত্তিক …)

React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 8। প্রকল্প, তাদের ফিল্ড ও স্ট্যাট কার্ড এডমিন প্যানেল থেকে তৈরি হয় — নতুন প্রকল্পে কোড লাগে না।
ব্যাকএন্ড অ্যাডাপ্টার-ভিত্তিক: এখন Supabase, পরে নিজস্ব REST সার্ভার (`VITE_HOUSING_BACKEND`; চুক্তি `docs/API_CONTRACT.md`)।

## চালানো

```bash
npm install
cp .env.example .env.local        # তারপর Supabase URL ও anon key বসান (শুধু VITE_ দুটি; service_role কখনো নয়)
npm run dev                       # http://localhost:5173
npm run build                     # টাইপ-চেক + প্রোডাকশন বিল্ড (dist/)
npm run preview                   # বিল্ড করা সাইট দেখা
npm run lint
```

### পরীক্ষা ও টুল

```bash
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

## রুট

| পাথ | কী | লগইন |
|---|---|---|
| `/` | হোম: প্রকাশিত সব প্রকল্পের কার্ড, মোট প্রকল্প/উপকারভোগী/জেলা | না |
| `/<গ্রুপ>` (যেমন `/housing`) | গ্রুপ-ল্যান্ডিং: উপ-প্রকল্পের কার্ড | না |
| `/<প্রকল্প>` বা `/<গ্রুপ>/<প্রকল্প>` (যেমন `/self-reliance`, `/skill-based-entrepreneur`, `/housing/semi-pucca`, `/housing/tin`) | তালিকা: স্ট্যাট কার্ড, ক্যাটাগরি চার্ট, মানচিত্র, ফিল্টার (`?year=&division=&district=&upazila=&union=&f_<ফিল্ড>=&q=&page=`), টেবিল/কার্ড | না |
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

- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — **এডমিন ব্যবহার নির্দেশিকা**: প্রকল্প খোলা, ফিল্ড, ইম্পোর্ট, ছবি, প্রকাশ/অপ্রকাশ
- [docs/HOUSING_PROGRESS.md](docs/HOUSING_PROGRESS.md) — স্ট্যাক, ফোল্ডার কাঠামো, প্রতিটি ধাপের সিদ্ধান্ত ও পরীক্ষা, ডাটাবেস সেটআপ চেকলিস্ট
- [docs/MULTI_PROJECT_PLAN.md](docs/MULTI_PROJECT_PLAN.md) — বহু-প্রকল্প পরিকল্পনা (M-ধাপ ১–১৬) ও প্রশ্নোত্তর
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — নিজস্ব REST ব্যাকএন্ডের চুক্তি
- [supabase/README.md](supabase/README.md) — SQL চালানোর ক্রম
