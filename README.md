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
npm run security-check            # anon key দিয়ে পড়া-খোলা/লেখা-বন্ধ যাচাই (ডাটাবেস সেটআপের পর)
npm run migrate-photos -- --help  # ছবি মাইগ্রেশন স্ক্রিপ্ট (লোকাল, service_role .env এ)
npm run build-map -- --in gadm41_BGD_3.json   # উপজেলা মানচিত্রের TopoJSON পুনর্নির্মাণ (GADM 4.1 level 3 থেকে)
npm run i18n-check                # বাংলা UI লেখা বনাম src/i18n/en.ts ইংরেজি অভিধান — অনুপস্থিত অনুবাদ খোঁজে
npm run photo-check               # লগইন ছাড়া সব ছবির URL খোলে কি না (HEAD → 200)
npm run smoke                     # Chrome/Edge দিয়ে ৩৬০–১২৮০px × বাংলা/ইংরেজি পেইজ-পরীক্ষা + স্ক্রিনশট (.smoke/); আগে npm run dev
npm run smoke -- --quick          # দ্রুত (৩৯০ ও ১২৮০px, শুধু বাংলা)
```

## রুট

| পাথ | কী |
|---|---|
| `/housing` | প্রকল্প ল্যান্ডিং |
| `/housing/semi-pucca`, `/housing/tin` | তালিকা: স্ট্যাট কার্ড, ফিল্টার, টেবিল, পেজিনেশন (URL query তে) |
| `/housing/<slug>/<serial>` | ভিউ মোড: বিস্তারিত + আগে-পরে ছবির তুলনা |
| `/housing/admin/login` | এডমিন লগইন |
| `/housing/admin/...` | রেকর্ড CRUD, বাল্ক ইম্পোর্ট, ছবি বাল্ক আপডেট (লগইন লাগে) |

## নথি

- [docs/HOUSING_PROGRESS.md](docs/HOUSING_PROGRESS.md) — স্ট্যাক, স্কিমা, রুট, প্রতিটি ধাপের সিদ্ধান্ত, **ব্যবহার নির্দেশিকা**, ডাটাবেস সেটআপ চেকলিস্ট
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — নিজস্ব REST ব্যাকএন্ডের চুক্তি
- [supabase/README.md](supabase/README.md) — SQL চালানোর ক্রম
