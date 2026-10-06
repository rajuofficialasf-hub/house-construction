# As-Sunnah Foundation প্রকল্প-প্ল্যাটফর্ম — REST API চুক্তি (API_CONTRACT.md)

> **দুটি চুক্তি:** এটি বহু-প্রকল্পের লক্ষ্য-চুক্তি (Supabase এ চলছে; কোনো REST সার্ভার এখনো এটি দেয় না)। নিজস্ব সার্ভার (`server/`) আজ যা দেয় তা [API_CONTRACT.md](API_CONTRACT.md) এ (`/api/v1/housing`, এক-প্রকল্প)।

> নিজস্ব সার্ভারের ডেভেলপারের জন্য। ফ্রন্টএন্ডের `rest` অ্যাডাপ্টার (`src/backend/rest/`, পাথ `src/backend/rest/endpoints.ts`) ঠিক এই চুক্তি অনুযায়ী কল করবে।
> সংস্করণ: **১.৪** — সর্বশেষ আপডেট: ২০২৬-১০-০৬ (পর্ব ২, M-ধাপ ১৫: কভার ছবি `ProjectsApi.uploadCover/deleteCover`; হোম পেইজের কার্ডের নিয়ম)
> সার্ভারের প্রযুক্তি (ভাষা/ফ্রেমওয়ার্ক/DB) অনির্ধারিত; এই চুক্তি প্রযুক্তি-নিরপেক্ষ। "TBD" অংশ এখনো চূড়ান্ত নয়। ধাপ ১৩ (নিজস্ব সার্ভার) স্থগিত।
> রেফারেন্স বাস্তবায়ন: Supabase (`supabase/sql/*.sql` — ট্রিগার ও RLS এ প্রতিটি নিয়ম আছে; `src/backend/supabase/`)। দুই জায়গায় নিয়ম আলাদা হলে **এই চুক্তি সংশোধন করে** মেলাতে হবে।

**v০.৯ থেকে কী বদলেছে (সংক্ষেপে):** সাইট এখন একাধিক প্রকল্প চালায় (ঘর নির্মাণ, স্বাবলম্বী, দক্ষতা ভিত্তিক …) — প্রকল্প, তাদের ফিল্ড ও স্ট্যাট কার্ড এডমিন প্যানেল থেকে তৈরি হয়। তাই পাথ `/api/housing/...` থেকে `/api/projects/:key/...` ও `/api/records/:id/...` এ গেছে (§৯-এ পুরনো → নতুন তালিকা)। রেকর্ডে `union_name` ও `extra` (কাস্টম মান), গোপন মান আলাদা endpoint এ। এখনো কোনো REST সার্ভার চালু নেই, তাই কিছু ভাঙে না।

---

## ১. সাধারণ নিয়ম

- **বেস URL:** ফ্রন্টএন্ডের `VITE_API_BASE_URL` (যেমন `https://api.example.org`)। সব পাথ `/api/...` দিয়ে শুরু।
- **ফরম্যাট:** JSON, `Content-Type: application/json; charset=utf-8`। ছবি আপলোডে `multipart/form-data`।
- **এনকোডিং:** UTF-8 (বাংলা টেক্সট)। সংখ্যা JSON number, তারিখ-সময় ISO 8601 UTC (`2026-09-29T10:15:00Z`)।
- **অনুমতি (সার্ভারে যাচাই হবে, ফ্রন্টএন্ডের উপর ভরসা নয়):**
  - পড়া (সব GET): টোকেন ছাড়া — কিন্তু শুধু **প্রকাশিত** প্রকল্প (যার গ্রুপও প্রকাশিত) ও তার রেকর্ড, আর শুধু **পাবলিক** ফিল্ড। এডমিন খসড়া ও গোপন ফিল্ডও পান (§৫.২)।
  - যোগ ও বদল (POST/PUT/PATCH): সব এডমিন।
  - **মোছা (সব DELETE — রেকর্ড, ছবি, প্রকল্প, ফিল্ড, গোপন মানের সারি, কভার): শুধু মূল এডমিন** (`role = "main_admin"`)। ছবির লিংক খালি করাও মোছা (§৪.৪.১১)।
- **রাউট ক্রম:** নির্দিষ্ট পাথ (`/api/projects/overview`, `/api/projects/order`) অবশ্যই `/api/projects/:key` এর **আগে**; `/records/bulk`, `/records/serial/:n`, `/records/serials` অবশ্যই কোনো সাধারণ প্যাটার্নের আগে ম্যাচ করতে হবে।
- **একসাথে এডিট:** প্রকল্প বদলে (`PATCH /api/projects/:key`) ক্লায়েন্ট `If-Match: <updated_at>` পাঠাতে পারে; সার্ভারের `updated_at` না মিললে `409 CONFLICT` (দুই এডমিনের একসাথে এডিট)।
- **CORS:** ওয়েবসাইটের origin অনুমোদিত (তালিকা TBD)। **Rate limit:** TBD।

### ১.১ সফল উত্তর
```json
{ "data": <object | array>, "meta": { ...ঐচ্ছিক... } }
```
`204 No Content` এ body নেই।

### ১.২ এরর উত্তর (সব এররে একই ফরম্যাট)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "মানুষের পড়ার মতো বাংলা বার্তা (ফ্রন্টএন্ড হুবহু দেখায়)",
    "details": { "field": "extra.amount", "reason": "integer" }
  }
}
```
| HTTP | code | কখন |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ভুল/অসম্পূর্ণ ইনপুট বা নিয়ম ভঙ্গ (§৫)। `details.field`: সিস্টেম ফিল্ডে কলামের নাম (`name`, `union_name`), কাস্টম পাবলিক ফিল্ডে `extra.<key>`, গোপন ফিল্ডে `private.<key>`, প্রকল্পে কলামের নাম (`slug`, `stat_cards`); বাল্কে সাথে `details.row_index` |
| 401 | `UNAUTHENTICATED` | টোকেন/সেশন নেই, অবৈধ বা মেয়াদোত্তীর্ণ |
| 403 | `FORBIDDEN` | লগইন আছে কিন্তু এডমিন নয়, অথবা মূল এডমিন নন এমন কেউ মুছতে চাইছেন ("শুধু মূল এডমিন … মুছতে পারেন") |
| 404 | `NOT_FOUND` | প্রকল্প/ফিল্ড/রেকর্ড/ছবি নেই — **বা খসড়া প্রকল্প, আর কলকারী এডমিন নন** (খসড়ার অস্তিত্ব ফাঁস হয় না) |
| 409 | `CONFLICT` | (প্রকল্প, serial_no) ডুপ্লিকেট; `slug`/`key`/`file_prefix` আগে থেকে আছে; `If-Match` মেলেনি |
| 413 | `PAYLOAD_TOO_LARGE` | ছবি ৫ MB এর বেশি বা বাল্ক সারি সীমা ছাড়ালে |
| 500 | `INTERNAL_ERROR` | সার্ভারের ত্রুটি |

ফ্রন্টএন্ড এই code গুলোই `HousingApiError.code` হিসেবে ব্যবহার করে (`src/backend/interfaces/types.ts`)।

---

## ২. অথেন্টিকেশন (v০.৯ থেকে অপরিবর্তিত)

- ধরন: **JWT (Bearer) অথবা HttpOnly কুকি সেশন — সার্ভার ডেভেলপার বেছে নেবেন (TBD)।** ফ্রন্টএন্ড দুটোই সামলাতে পারবে:
  - JWT হলে: `/api/auth/login` উত্তরে `access_token` দিন; ফ্রন্টএন্ড প্রতিটি লেখার রিকোয়েস্টে `Authorization: Bearer <token>` পাঠাবে।
  - কুকি হলে: `access_token` বাদ দিন, `Set-Cookie` (HttpOnly, Secure, SameSite) দিন; ফ্রন্টএন্ড `credentials: 'include'` দিয়ে কল করবে; CSRF সুরক্ষা সার্ভারের দায়িত্ব।
- সেশনের মেয়াদ ও রিফ্রেশ: TBD (প্রস্তাব: ৭ দিন, রিফ্রেশ ছাড়া; মেয়াদ শেষে ৪০১ → ফ্রন্টএন্ড লগইন পেইজে পাঠাবে)।
- **এডমিন তালিকা:** সার্ভারে একটি `admins` টেবিল (Supabase এ `housing_admins`: `user_id, email, role, created_at`)। লগইন সফল হলেও ব্যবহারকারী এই টেবিলে না থাকলে `403 FORBIDDEN` ("এই অ্যাকাউন্ট এডমিন তালিকায় নেই") এবং সেশন তৈরি হবে না। `role` দুই রকম: `"main_admin"` — মূল এডমিন, **একজনই** (ডাটাবেসে unique), যোগ/এডিট/মোছা; `"admin"` — সাধারণ এডমিন, শুধু যোগ/এডিট। ফ্রন্টএন্ড `AuthUser.role` এ পায় (মোছার বোতাম দেখানো/লুকানো)।
- **সাইন-আপ নেই:** কোনো `/api/auth/register` endpoint থাকবে না; নতুন এডমিন শুধু সার্ভার/ডাটাবেস থেকে যোগ হবে। পাসওয়ার্ড রিসেট endpoint ঐচ্ছিক (TBD)।
- ব্রুট-ফোর্স সুরক্ষা (লগইনে rate limit) সার্ভারে থাকা উচিত।
- ফ্রন্টএন্ড আচরণ (`src/backend/rest/authProvider.ts`): JWT মোডে token `localStorage` কী `housing_rest_token` এ; সব অনুরোধ `credentials: 'include'` সহ যায়; অ্যাপ লোডে `GET /api/auth/me` দিয়ে সেশন যাচাই; `401` → লগইন পেইজ।

### POST `/api/auth/login` — পাবলিক
```json
// অনুরোধ
{ "email": "admin@example.org", "password": "********" }
// উত্তর 200
{ "data": {
    "access_token": "eyJ...",            // JWT হলে; কুকি হলে বাদ
    "expires_at": "2026-10-06T10:15:00Z",
    "user": { "id": "u_1", "email": "admin@example.org", "name": "এডমিন", "role": "main_admin" }
} }
```
ভ্যালিডেশন: `email` বৈধ ইমেইল, `password` ১–২০০ অক্ষর। ভুল হলে `401 UNAUTHENTICATED` ("ইমেইল বা পাসওয়ার্ড সঠিক নয়"), কোনটি ভুল তা বলা যাবে না।

### POST `/api/auth/logout` — এডমিন
টোকেন/সেশন বাতিল → `204`।

### GET `/api/auth/me` — এডমিন
```json
{ "data": { "id": "u_1", "email": "admin@example.org", "name": "এডমিন", "role": "admin" } }
```
টোকেন অবৈধ → `401`।

---

## ৩. ডাটা মডেল

ফিল্ডের নাম ডাটাবেস টেবিলের সাথে হুবহু (`supabase/sql/01_schema.sql`, `10_projects.sql`) এবং ফ্রন্টএন্ডের টাইপের সাথে (`src/backend/interfaces/types.ts`)।

### ৩.১ Project (প্রকল্প)
```json
{
  "key": "self_reliance",            // স্থায়ী; ^[a-z][a-z0-9_]{1,39}$; রেকর্ডের project_type এ এটাই; কখনো বদলায় না
  "parent_key": null,                // গ্রুপের key (যেমন semi_pucca → "housing"); একক প্রকল্পে null
  "is_group": false,                 // গ্রুপে রেকর্ড, ফিল্ড, ছবি, file_prefix থাকে না
  "slug": "self-reliance",           // URL অংশ (§৫.৫)
  "name_bn": "স্বাবলম্বী প্রকল্প", "name_en": "Self-reliance Project",   // দুটোই আবশ্যক, ১–১২০ অক্ষর
  "summary_bn": "", "summary_en": "",              // ≤ ৩০০ — কার্ডের ছোট বর্ণনা
  "description_bn": "", "description_en": "",      // ≤ ২০০০, সাধারণ লেখা (HTML নয়)
  "unit_bn": "উপকারভোগী", "unit_en": "beneficiaries",   // ≤ ৪০ — স্ট্যাট/মানচিত্রের একক শব্দ (ঘর নির্মাণে "ঘর"/"houses")
  "photo_mode": "after_only",        // before_after | after_only | none
  "prev_label_bn": "", "prev_label_en": "", "current_label_bn": "উপকরণসহ ছবি", "current_label_en": "With the item",  // ≤ ৬০
  "geo_depth": "union",              // upazila | union (ইউনিয়ন পর্যন্ত ঠিকানা)
  "core_fields": { "union_name": { "required": false }, "address": { "enabled": true, "required": false } },
  "stat_cards": [ { "id": "money", "kind": "sum", "field": "amount", "label_bn": "মোট টাকা", "label_en": "Total amount", "icon": "coins", "home": true, "format": "money" } ],
  "display": { "show_map": true, "geo_columns": "split", "breakdown_field": "category" },
  "file_prefix": "sr",               // ^[a-z][a-z0-9]{0,15}$, unique; গ্রুপে null — ছবির ফাইলনামের শুরু (sr_0012.jpg)
  "icon": "hands-heart", "accent": "brand",   // ফ্রন্টএন্ডের নির্দিষ্ট তালিকার key (কাঁচা CSS নয়)
  "cover_path": null,                // কভার ছবির স্টোরেজ পাথ (URL নয়)
  "sort_order": 30, "is_published": false, "show_on_home": true,
  "created_at": "…", "updated_at": "…",
  "fields": [ ProjectField, … ]      // GET ?include=fields হলে; anon পায় শুধু পাবলিক
}
```
- **সিস্টেম ফিল্ড** (রেকর্ডের নিজস্ব কলাম): `year`, `name`, `division`, `district`, `upazila` **সবসময় চালু ও আবশ্যক** (শুধু লেবেল বদলায়: `core_fields.<k>.label_bn/en`); `father_or_husband_name`, `address`, `union_name` ঐচ্ছিক — `core_fields.<k>.required: true` হলে আবশ্যক, `enabled: false` হলে ফর্মে লুকানো।
- **stat_cards** (সর্বোচ্চ ৮টি; `home: true` সর্বোচ্চ ৩টি — হোম কার্ডে দেখায়; ঐচ্ছিক `home_label_bn/en` = হোমে আলাদা লেবেল)। `kind`: `count` (মোট রেকর্ড), `geo` (`level`: division/district/upazila/union — কভার সংখ্যা), `sum` (`field`: টাকা/সংখ্যা ফিল্ডের যোগফল), `distinct` (`field`: ক্যাটাগরির ভিন্ন মানের সংখ্যা)। সংখ্যা আসে স্ট্যাট থেকে (§৩.৬); কার্ড শুধু উপস্থাপনা।
- প্রকল্প-ভিত্তিক লেখা (নাম, বর্ণনা, লেবেল, একক) ফ্রন্টএন্ড `pick(bn, en)` দিয়ে দেখায়: ইংরেজি মোডে `*_en` খালি না থাকলে সেটি, নইলে বাংলা।

### ৩.২ ProjectField (এডমিনের বানানো ফিল্ড)
```json
{
  "id": "uuid", "project_key": "self_reliance",
  "key": "amount",                   // ^[a-z][a-z0-9_]{0,39}$, প্রকল্পে অনন্য; সংরক্ষিত নাম নিষেধ (§৫.৫)
  "label_bn": "টাকা", "label_en": "Amount", "help_bn": "", "help_en": "",
  "type": "money",                   // §৩.৩
  "options": [],                     // এখন ব্যবহার নেই
  "required": true,
  "visibility": "public",            // public | admin (গোপন — মান আলাদা, §৩.৫)
  "show_in_table": true, "show_in_card": false, "show_in_detail": true,
  "filterable": false, "searchable": false, "fill_down": false,
  "max_length": null, "min_value": null, "max_value": null,
  "import_aliases": ["পরিমাণ"],      // শীটের কলাম-শিরোনামের বিকল্প নাম
  "sort_order": 20, "is_active": true,   // false = আর্কাইভ (নতুন মান নেওয়া যায় না, পুরনো মান থাকে)
  "created_at": "…", "updated_at": "…"
}
```
প্রতি প্রকল্পে সর্বোচ্চ ৪০টি ফিল্ড। গ্রুপে ফিল্ড থাকে না। `type = phone` হলে `visibility` অবশ্যই `admin`; গোপন ফিল্ড `show_in_table`/`show_in_card`/`filterable`/`searchable` হতে পারে না।

### ৩.৩ ফিল্ডের ধরন ও মানের নিয়ম (সার্ভার ও ফর্মে একই)
| `type` | JSON মান | নিয়ম (সার্ভার স্বাভাবিক করে রাখে) |
|---|---|---|
| `text` | string | trim + NFC; ≤ `max_length` (ডিফল্ট ৫০০) |
| `long_text` | string | trim + NFC; ≤ `max_length` (ডিফল্ট ২০০০) |
| `number` | number | ≤ ২ দশমিক; `min_value`/`max_value` |
| `money` | number | **পূর্ণসংখ্যা**, ০ – ১০০০ কোটি (1e10; v১.২ — আগে 1e11 ছিল, যা আসলে ১০,০০০ কোটি); `min/max_value`। (ফর্ম/ইম্পোর্ট বাংলা অঙ্ক, কমা, ৳, টাকা, Tk, /- মুছে সংখ্যা বানিয়ে পাঠায়) |
| `category` | string | trim + NFC + একাধিক ফাঁকা → একটি; ≤ `max_length` (ডিফল্ট ১০০)। কোনো অপশন-তালিকা নেই — শীটে/ফর্মে লেখা মানটিই |
| `date` | string | `YYYY-MM-DD`, বৈধ তারিখ |
| `phone` | string | বাংলা অঙ্ক → ইংরেজি, তারপর `^[0-9+\- ]{6,20}$`; সবসময় গোপন |

খালি লেখা (`""` বা শুধু ফাঁকা) = মান নেই (সংরক্ষিত হয় না)। ভুল হলে `400` (`details.field = "extra.<key>"` বা `"private.<key>"`, বার্তায় ফিল্ডের বাংলা লেবেল)।

### ৩.৪ Record (রেকর্ড / উপকারভোগী)
```json
{
  "id": "3f2c…",                         // uuid
  "project_type": "semi_pucca",          // প্রকল্পের key; অপরিবর্তনীয়
  "serial_no": 1,                        // প্রতি প্রকল্পে ১ থেকে; সার্ভার বরাদ্দ করে; অপরিবর্তনীয়; পুনঃব্যবহার হয় না
  "year": 2024,
  "name": "মোছাঃ রহিমা খাতুন",
  "father_or_husband_name": "মৃত আব্দুল করিম",   // "" = নেই
  "division": "রংপুর", "district": "কুড়িগ্রাম", "upazila": "উলিপুর",
  "union_name": "দলদলিয়া",             // "" = নেই (ইউনিয়ন বা পৌরসভা)
  "address": "গ্রাম: দলদলিয়া, ডাকঘর: উলিপুর",   // "" = নেই
  "extra": { "amount": 25000, "category": "গরু", "item_name": "দুগ্ধবতী গাভী" },   // শুধু পাবলিক কাস্টম ফিল্ড
  "prev_photo_url": "https://…/housing/semi_pucca/0001/prev.webp",   // null হতে পারে
  "prev_thumb_url": "https://…/housing/semi_pucca/0001/prev_thumb.webp",
  "current_photo_url": "https://…/housing/semi_pucca/0001/current.webp",
  "current_thumb_url": "https://…/housing/semi_pucca/0001/current_thumb.webp",
  "prev_photo_source": "https://…sharepoint…",   // শীটের মূল লিংক; শুধু রেফারেন্স
  "current_photo_source": null,
  "photo_updated_at": "2026-09-29T10:15:00Z",     // ছবি বদলালে; null হতে পারে
  "created_at": "…", "updated_at": "…"
}
```
- `extra` এ কখনো গোপন ফিল্ডের মান থাকবে না (§৩.৫); অচেনা/আর্কাইভ/গোপন key দিলে `400`। আকার < ১৬ KB।
- ছবির URL সরাসরি ব্রাউজারে দেখানোর মতো পাবলিক URL, `?v=` ছাড়া। ফ্রন্টএন্ড নিজে `?v=<photo_updated_at>` যোগ করে ক্যাশ ভাঙে।
- **ছবির স্টোরেজ পাথ (সব প্রকল্পে একই, নির্দিষ্ট):** `housing/{project_key}/{serial_no ৪ অঙ্কে}/{slot}.webp` ও `…/{slot}_thumb.webp`; slot `prev` | `current`। উদাহরণ: `housing/semi_pucca/0001/prev.webp`, `housing/self_reliance/0012/current_thumb.webp` ("housing" শুধু ভেতরের নামস্থান)। একই সিরিয়ালের ছবি আপডেট = **একই পাথে ওভাররাইট** + `photo_updated_at` বদল। সব ছবি WebP (পূর্ণ ≤ ১৬০০px চওড়া, মান ~৮০%; থাম্ব ৪০০px)। কভার: `housing/_projects/{key}/cover.webp` (key `_` দিয়ে শুরু হয় না, তাই সংঘর্ষ নেই)।

### ৩.৫ গোপন মান (Private)
গোপন ফিল্ডের (`visibility = admin`, যেমন মোবাইল, NID) মান রেকর্ডে নয়, আলাদা জায়গায়: `{ "phone": "01711987654" }`। শুধু এডমিন পড়েন ও লেখেন; তালিকা, স্ট্যাট, সার্চ, এক্সপোর্টের পাবলিক অংশ বা লগে **মান কখনো যায় না** (লগে শুধু ফিল্ডের নাম, §৪.৫)। Supabase এ টেবিল `beneficiary_private (record_id, data)`, রেকর্ড মুছলে সাথে মোছে।

### ৩.৬ ProjectStats (পরিসংখ্যান)
```json
{
  "total": 1500,
  "by_year":     { "2023": 400, "2024": 700 },
  "by_division": { "ঢাকা": 300 },
  "by_district": { "কুড়িগ্রাম": 120 },
  "by_upazila":  { "উলিপুর": 40 },
  "by_location": { "কুড়িগ্রাম|উলিপুর": 40 },                    // মানচিত্র: "জেলা|উপজেলা"
  "by_union":    { "কুড়িগ্রাম|উলিপুর|দলদলিয়া": 12 },            // "জেলা|উপজেলা|ইউনিয়ন"; light=1 হলে {}
  "by_project":  { "semi_pucca": 1200, "tin": 300 },               // গ্রুপে প্রতিটি উপ-প্রকল্প; একক প্রকল্পে নিজে
  "distinct":    { "divisions": 8, "districts": 45, "upazilas": 120, "unions": 300 },
  "fields": {
    "amount":   { "type": "money", "sum": 37500000, "count": 1500 },
    "category": { "type": "category", "distinct": 12,
                  "by_value": { "গরু": { "n": 600, "sums": { "amount": 18000000 } } } }   // light=1 হলে by_value নেই
  }
}
```
- শুধু রেকর্ড আছে এমন মান থেকে গোনা (স্থির তালিকার মোট নয়)। `distinct.upazilas` = ভিন্ন **(জেলা, উপজেলা)** জোড়া, `unions` = ভিন্ন (জেলা, উপজেলা, ইউনিয়ন) — একই নাম ভিন্ন জায়গায় আলাদা গোনা।
- `fields` এ শুধু **পাবলিক ও সক্রিয়** money/number/category ফিল্ড। সংখ্যা নয় এমন মান যোগফলে আসে না।
- গ্রুপের key দিলে সব উপ-প্রকল্প মিলিয়ে। খসড়া প্রকল্প শুধু এডমিন।
- Supabase এ সমতুল্য: `project_stats(p_key, p_light)` (`supabase/sql/11_project_rpcs.sql`)।

### ৩.৭ ProjectOverview (হোম পেইজ ও ড্যাশবোর্ড — এক কলে)
```json
{
  "projects": [ {
      "key": "housing", "parent_key": null, "is_group": true, "slug": "housing",
      "name_bn": "…", "name_en": "…", "summary_bn": "", "summary_en": "", "unit_bn": "ঘর", "unit_en": "houses",
      "photo_mode": "before_after", "icon": "house", "accent": "brand", "cover_path": null,
      "sort_order": 10, "is_published": true, "show_on_home": true, "stat_cards": [ … ],
      "stats": ProjectStats (light),
      "featured": { "project_type": "semi_pucca", "serial_no": 3, "name": "…", "thumb_url": "https://…", "photo_updated_at": "…" },  // null হতে পারে
      "without_photo": null          // শুধু এডমিনের drafts=1 কলে: ছবি-বাকি রেকর্ড সংখ্যা; বাকিদের null
  } ],
  "global": { "projects": 2, "total": 10, "districts": 1 }   // projects = প্রকাশিত একক/উপ-প্রকল্প (গ্রুপ বাদ)
}
```

---

## ৪. Endpoint

| মেথড | পাথ | অনুমতি | ফ্রন্টএন্ড মেথড |
|---|---|---|---|
| GET | `/api/projects?include=fields&drafts=1` | পাবলিক (খসড়া ও গোপন ফিল্ড শুধু এডমিন) | `ProjectsApi.list` |
| GET | `/api/projects/overview?drafts=1` | পাবলিক | `ProjectsApi.overview` |
| GET | `/api/projects/:key` | পাবলিক | `ProjectsApi.get` |
| POST | `/api/projects` | এডমিন | `ProjectsApi.create` |
| PATCH | `/api/projects/:key` (`If-Match`) | এডমিন | `ProjectsApi.update` |
| DELETE | `/api/projects/:key` | **মূল এডমিন** | `ProjectsApi.delete` |
| PUT | `/api/projects/order` | এডমিন | `ProjectsApi.reorder` |
| PUT / DELETE | `/api/projects/:key/cover` | এডমিন / **মূল এডমিন** | `ProjectsApi.uploadCover` / `deleteCover` (v১.৪) |
| GET | `/api/projects/:key/fields` | পাবলিক (গোপন শুধু এডমিন) | (`list` এর ভেতরে) |
| POST | `/api/projects/:key/fields` | এডমিন | `ProjectsApi.createField` |
| PATCH | `/api/fields/:id` | এডমিন | `ProjectsApi.updateField` |
| DELETE | `/api/fields/:id` | **মূল এডমিন** | `ProjectsApi.deleteField` |
| PUT | `/api/projects/:key/fields/order` | এডমিন | `ProjectsApi.reorderFields` |
| GET | `/api/projects/:key/fields/:fieldKey/usage` | এডমিন | `ProjectsApi.fieldUsage` |
| POST | `/api/projects/:key/fields/:fieldKey/rename-value` | এডমিন | `ProjectsApi.renameFieldValue` |
| GET | `/api/projects/:key/stats?light=1` | পাবলিক | `HousingApi.stats` |
| GET | `/api/projects/:key/years` | পাবলিক | `HousingApi.years` |
| GET | `/api/projects/:key/next-serial` | পাবলিক (খসড়ায় শুধু এডমিন) | `HousingApi.nextSerial` |
| GET | `/api/projects/:key/records` | পাবলিক | `HousingApi.list` |
| POST | `/api/projects/:key/records` | এডমিন | `HousingApi.create` |
| POST | `/api/projects/:key/records/bulk` | এডমিন | `HousingApi.bulkInsert` |
| PUT | `/api/projects/:key/records/bulk` | এডমিন | `HousingApi.bulkUpdateBySerial` |
| GET | `/api/projects/:key/records/serial/:n` | পাবলিক | `HousingApi.getBySerial` |
| GET | `/api/projects/:key/records/serials?nos=1,2,3` | পাবলিক | `HousingApi.getBySerials` |
| GET | `/api/records/:id` | পাবলিক | `HousingApi.getById` |
| PATCH | `/api/records/:id` | এডমিন | `HousingApi.update` |
| DELETE | `/api/records/:id` | **মূল এডমিন** | `HousingApi.delete` |
| GET / PUT | `/api/records/:id/private` | এডমিন | `HousingApi.getPrivate` / `setPrivate` |
| POST | `/api/projects/:key/records/private` | এডমিন | `HousingApi.getPrivateMany` (v১.১) |
| POST | `/api/records/:id/serial` | এডমিন | `HousingApi.changeSerial` |
| PUT | `/api/records/:id/photos/:slot` | এডমিন | `HousingApi.uploadPhoto` |
| DELETE | `/api/records/:id/photos/:slot` | **মূল এডমিন** | `HousingApi.deletePhoto` |
| GET / POST | `/api/activity` | এডমিন | `HousingApi.listActivity` / `logActivity` |

### ৪.১ প্রকল্প

#### ৪.১.১ GET `/api/projects?include=fields&drafts=1`
→ `{ "data": [Project, …] }`, `sort_order` তারপর `key` ক্রমে। `include=fields` দিলে প্রতিটিতে `fields` (sort_order ক্রমে, আর্কাইভসহ)। anon: শুধু প্রকাশিত (গ্রুপও প্রকাশিত) প্রকল্প, শুধু পাবলিক ফিল্ড — `drafts=1` উপেক্ষিত। এডমিন: `drafts=1` দিলে খসড়াও, আর গোপন ফিল্ড সবসময়।

#### ৪.১.২ GET `/api/projects/overview?drafts=1`
→ `{ "data": ProjectOverview }` (§৩.৭)। হোম পেইজ প্রকল্প যতগুলোই থাক **এই একটি কল** (+ রেজিস্ট্রি) করে। প্রতিটি প্রকল্পের `stats` হালকা (light)। `featured`: প্রকল্পের (গ্রুপে উপ-প্রকল্পগুলোর) সবচেয়ে নতুন (`created_at`, তারপর `serial_no` বড় থেকে) যে রেকর্ডে থাম্বনেইল আছে — `thumb_url` = বর্তমান ছবির থাম্ব, না থাকলে আগের ছবির; এমন রেকর্ড না থাকলে `null`। `drafts=1` শুধু এডমিনের জন্য কাজ করে (খসড়া ও `without_photo`)।

#### ৪.১.৩ GET `/api/projects/:key`
→ `{ "data": Project (fields সহ) }`; নেই বা anon এর কাছে খসড়া → `404`।

#### ৪.১.৪ POST `/api/projects` — প্রকল্প তৈরি (এডমিন)
```json
// অনুরোধ
{ "project": { "key": "self_reliance", "slug": "self-reliance", "name_bn": "স্বাবলম্বী প্রকল্প", "name_en": "Self-reliance Project",
               "photo_mode": "after_only", "geo_depth": "union", "file_prefix": "sr", "stat_cards": [ … ] },
  "fields": [ { "key": "amount", "label_bn": "টাকা", "label_en": "Amount", "type": "money", "required": true },
              { "key": "category", "label_bn": "ক্যাটাগরি", "label_en": "Category", "type": "category", "filterable": true } ] }
// উত্তর 201
{ "data": Project (fields সহ, "is_published": false) }
```
- প্রকল্প ও সব ফিল্ড **এক ট্রানজ্যাকশনে** — একটি ভুল হলে কিছুই তৈরি হয় না (`400`, `details.field`)।
- **সবসময় খসড়া** (`is_published` অনুরোধে থাকলেও উপেক্ষিত); প্রকাশ আলাদা `PATCH` এ।
- ডিফল্ট: `photo_mode` after_only, `geo_depth` upazila, `unit` উপকারভোগী/beneficiaries, `icon` hands-heart, `accent` brand, `sort_order` = সর্বোচ্চ + ১০, `show_on_home` true; ফিল্ডে `visibility` public, `show_in_detail` true, `sort_order` = ক্রম × ১০।
- তৈরির সাথে সাথে প্রকল্পের **সিরিয়াল-কাউন্টার** (০) তৈরি হয় (একক/উপ-প্রকল্পে)।

#### ৪.১.৫ PATCH `/api/projects/:key` — বদল (এডমিন)
body: §৩.১ এর যেকোনো উপসেট (`key`, `fields`, `created_at`, `updated_at` ছাড়া)। হেডার `If-Match: <updated_at>` থাকলে না মিললে `409 CONFLICT` ("অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন")। প্রকাশ/অপ্রকাশ: `{ "is_published": true }`। → `200 { "data": Project }`। নিয়ম §৫.৫।

#### ৪.১.৬ DELETE `/api/projects/:key` — (মূল এডমিন)
→ `204`। আটকায় (`400`, বার্তাসহ): রেকর্ড আছে; আগে কখনো রেকর্ড ছিল (কাউন্টার > ০); গ্রুপে উপ-প্রকল্প আছে। দরকার হলে "অপ্রকাশিত" করুন। কাউন্টার কখনো মোছে না — একই key আবার তৈরি হলেও সিরিয়াল পুনঃব্যবহার হয় না।

#### ৪.১.৭ PUT `/api/projects/order`
body `{ "keys": ["housing", "self_reliance", "skill"] }` → সেই ক্রমে `sort_order` (১০, ২০, …)। অচেনা key উপেক্ষিত। → `204`।

#### ৪.১.৮ PUT / DELETE `/api/projects/:key/cover`
`multipart/form-data` `photo` (WebP, ≤ ৫ MB) → পাথ `housing/_projects/{key}/cover.webp` (একই পাথে ওভাররাইট), `cover_path` আপডেট (ফলে `updated_at` বদলায়) → `200 { "data": Project }`। WebP না হলে `400 VALIDATION_ERROR`, বড় হলে `413 PAYLOAD_TOO_LARGE`। DELETE (মূল এডমিন; অন্যরা `403`) → ফাইল ও `cover_path` মোছে → `200 { "data": Project }`। `cover_path` সবসময় ঠিক এই পাথ বা `null` (অন্য মান `400`)।

ফ্রন্টএন্ড (v১.৪, M-ধাপ ১৫): ব্রাউজারে ছবি WebP করে (সর্বোচ্চ ১৬০০px) পাঠায়; কভারের URL = পাবলিক স্টোরেজ URL + `?v=<প্রকল্পের updated_at>` (ওভাররাইটের পর পুরনো ছবি ক্যাশ থেকে না আসে)। হোম পেইজের কার্ডে ছবির ক্রম: কভার → ওভারভিউর `featured.thumb_url` → প্রকল্পের রঙের পটভূমি ও আইকন। কার্ড আসে শুধু শীর্ষ-স্তরের (গ্রুপ বা একক) প্রকাশিত প্রকল্পের যার `show_on_home` চালু; গ্রুপের প্রকাশিত উপ-প্রকল্প কার্ডে চিপ হিসেবে। কার্ডের সংখ্যা = `stat_cards` এর `home: true` (≤ ৩টি), লেবেল `home_label_*` থাকলে সেটা।

### ৪.২ ফিল্ড

- **POST `/api/projects/:key/fields`** body: ProjectField এর উপসেট (`key`, `label_bn`, `type` আবশ্যক) → `201 { "data": ProjectField }`।
- **PATCH `/api/fields/:id`** → `200 { "data": ProjectField }`। আর্কাইভ: `{ "is_active": false }`, ফেরত: `{ "is_active": true }`।
- **DELETE `/api/fields/:id`** (মূল এডমিন) → `204`; কোনো রেকর্ডে মান থাকলে `400` ("… টি রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন")।
- **PUT `/api/projects/:key/fields/order`** body `{ "ids": ["uuid", …] }` → `204`।
- **GET `/api/projects/:key/fields/:fieldKey/usage`** → `{ "data": { "count": 4, "values": [ { "value": "গরু", "n": 2 }, … ] } }` — ক্যাটাগরিতে মান অনুযায়ী (বেশি থেকে কম); গোপন ফিল্ডে `values: []` (শুধু সংখ্যা)।
- **POST `/api/projects/:key/fields/:fieldKey/rename-value`** body `{ "from": "গাভি", "to": "গরু" }` → `{ "data": { "updated": 1 } }` — শুধু পাবলিক ক্যাটাগরি ফিল্ডে; `to` খালি হলে `400`। প্রতিটি বদলানো রেকর্ড স্বাভাবিক `update` হিসেবে লগ হয়।
- নিয়ম §৫.৫ (ডাটা আসার পর `key`, `type`, `visibility` বদলায় না)।

### ৪.৩ পরিসংখ্যান, বছর, পরের সিরিয়াল

- **GET `/api/projects/:key/stats?light=1`** → `{ "data": ProjectStats }` (§৩.৬)। `light=1`: `by_union` ও ক্যাটাগরির `by_value` বাদ (হোম কার্ড)। গ্রুপের key = উপ-প্রকল্প মিলিয়ে।
- **GET `/api/projects/:key/years`** → `{ "data": [2025, 2024, 2023] }` (নতুন থেকে পুরনো; ডাটা না থাকলে `[]`)।
- **GET `/api/projects/:key/next-serial`** → `{ "data": { "project_type": "tin", "next_serial": 301 } }` — **পূর্বাভাস** (কাউন্টার + ১); প্রকৃত বরাদ্দ POST এ atomic। প্রকল্পটি খসড়া বা গ্রুপ আর কলকারী এডমিন নন → `next_serial: null` (খসড়ার রেকর্ড-সংখ্যা ফাঁস হয় না)।

### ৪.৪ রেকর্ড

#### ৪.৪.১ GET `/api/projects/:key/records` — তালিকা (মোট সংখ্যাসহ)
Query (সব ঐচ্ছিক):

| প্যারাম | নিয়ম |
|---|---|
| `serial_no` | int ≥ 1, ঠিক মিল (এডমিন খোঁজা) |
| `year` | int, ঠিক মিল |
| `division`, `district`, `upazila`, `union_name` | ঠিক মিল (NFC করে তুলনা) |
| `f.<fieldKey>` | কাস্টম ফিল্ডে ঠিক মিল, যেমন `f.category=গরু`, `f.amount=5000`। **শুধু প্রকল্পের পাবলিক, সক্রিয় ও `filterable` ফিল্ড** গৃহীত; অন্য key নীরবে উপেক্ষিত (whitelist)। মান ক্যাটাগরির নিয়মে স্বাভাবিক করে তুলনা |
| `q` | `name`, `father_or_husband_name`, `address` আর প্রকল্পের `searchable` পাবলিক ফিল্ডে আংশিক মিল (case-insensitive); ≤ ১০০ অক্ষর |
| `sort` | `serial_no` (ডিফল্ট) \| `year` \| `name` \| `created_at` \| `union_name` \| `extra.<fieldKey>` (শুধু পাবলিক ফিল্ড; অন্যথায় `serial_no`); দ্বিতীয় ক্রম সবসময় `serial_no asc` |
| `order` | `asc` (ডিফল্ট) \| `desc` |
| `page` | int ≥ 1, ডিফল্ট 1 |
| `page_size` | int 1–100, ডিফল্ট **50** |

```json
// GET /api/projects/self_reliance/records?district=কুড়িগ্রাম&f.category=গরু&page=1
{ "data": [ Record, … ], "meta": { "page": 1, "page_size": 50, "total": 1500, "total_pages": 30 } }
```
`total` = ফিল্টারের পর মোট সারি। খালি হলে `data: []`, `total_pages: 1`। গ্রুপের key দিলে `400`। খসড়া প্রকল্প anon → `404`।

#### ৪.৪.২ GET `/api/projects/:key/records/serial/:n` · GET `…/records/serials?nos=1,2,3`
একটি → `{ "data": Record }`, নেই → `404`। অনেক (ছবি বাল্ক আপডেটে ফাইলনাম মেলাতে): `nos` কমা-বিভক্ত int, সর্বোচ্চ ১০০ (বেশি হলে `400`) → `{ "data": [Record, …] }` `serial_no` ক্রমে; যেগুলো নেই সেগুলো বাদ (এরর নয়)।

#### ৪.৪.৩ GET `/api/records/:id`
→ `{ "data": Record }`; নেই (বা anon এর কাছে খসড়ার রেকর্ড) → `404`।

#### ৪.৪.৪ POST `/api/projects/:key/records` — নতুন রেকর্ড (এডমিন)
```json
// অনুরোধ
{ "year": 2025, "name": "মমতাজ বেগম", "father_or_husband_name": "মোঃ শামসুল হক",
  "division": "ময়মনসিংহ", "district": "শেরপুর", "upazila": "নালিতাবাড়ী", "union_name": "পোড়াগাঁও", "address": "গ্রাম: পোড়াগাঁও",
  "extra": { "amount": 25000, "category": "গরু" },
  "prev_photo_source": null, "current_photo_source": null }
// উত্তর 201
{ "data": { ...Record, "serial_no": 301 } }
```
- `serial_no` **ঐচ্ছিক**: না দিলে সার্ভার পরবর্তী সিরিয়াল দেয় **atomic ভাবে** (প্রতি প্রকল্পে আলাদা কাউন্টার; Postgres হলে `supabase/sql/02_serial.sql` এর ট্রিগার হুবহু ব্যবহারযোগ্য); দিলে int ≥ 1 ও অনন্য (নইলে `409`), কাউন্টার ≥ সেই মান হয়।
- গোপন মান এই body তে নয় — রেকর্ড তৈরির পর `PUT /api/records/:id/private` (§৪.৪.৮)।
- ফ্রন্টএন্ড `union_name` পাঠায় শুধু `geo_depth = union` প্রকল্পে, `extra` শুধু কাস্টম ফিল্ড থাকলে; সার্ভার অন্য প্রকল্পে এগুলো পেলে উপেক্ষা বা `400` — দুটোই গ্রহণযোগ্য।
- যাচাই §৫.১।

#### ৪.৪.৫ PATCH `/api/records/:id` — আংশিক আপডেট (এডমিন)
body: §৪.৪.৪ এর যেকোনো উপসেট। `project_type`/`serial_no` থাকলে `400` (সিরিয়াল বদল শুধু §৪.৪.৯)। `extra` পাঠালে **পুরো `extra` প্রতিস্থাপিত হয়** (ফ্রন্টএন্ড পুরো অবজেক্ট পাঠায়)। শুধু বদলানো মান যাচাই হয় (পুরনো, এখন-আর্কাইভ ফিল্ডের অপরিবর্তিত মান থাকতে পারে)। → `200 { "data": Record }`; নেই → `404`।

#### ৪.৪.৬ DELETE `/api/records/:id` — (মূল এডমিন)
→ `204`। সংশ্লিষ্ট ছবি ও থাম্বনেইল স্টোরেজ থেকেও মুছবে, গোপন মানও (সিরিয়াল পুনঃব্যবহার হয় না, তাই ফাইল অনাথ হয়ে থাকত)। সাধারণ এডমিন → `403`। নেই → `404`।

#### ৪.৪.৭ বাল্ক: POST / PUT `/api/projects/:key/records/bulk` (এডমিন)
**POST — শীট থেকে নতুন যোগ:**
```json
{ "mode": "use_given_serial",            // অথবা "assign_serial"
  "rows": [ { "serial_no": 1, "year": 2023, "name": "…", "division": "…", "district": "…", "upazila": "…",
              "union_name": "…", "address": "…", "extra": { "amount": 5000 } } ] }
// উত্তর 200
{ "data": { "inserted": 500, "failed": [] } }
```
- `rows` ১–৫০০; বেশি হলে `413`। ফ্রন্টএন্ড ২০০ করে পাঠায়।
- `use_given_serial`: প্রতিটি সারিতে `serial_no` (int ≥ 1) আবশ্যক; ব্যাচে ডুপ্লিকেট → পুরো ব্যাচ `400`; ডাটাবেসে আগে থেকে থাকলে `409`। পরে কাউন্টার ≥ সর্বোচ্চ সিরিয়াল।
- `assign_serial`: `serial_no` উপেক্ষা; সার্ভার ক্রমানুসারে দেয়।
- প্রতিটি সারিতে §৫.১ এর যাচাই; কোনো সারি অবৈধ হলে **পুরো ব্যাচ** `400` (`details.row_index`, `details.field`)। এক ট্রানজ্যাকশন (all-or-nothing)।

**PUT — সিরিয়াল ধরে আপডেট:**
```json
{ "rows": [ { "serial_no": 1, "name": "…", "address": "", "extra": { "amount": 6000 }, "_clear": ["union_name", "extra.item_name"] } ] }
// উত্তর 200
{ "data": { "updated": 180, "missing": [205, 310] } }
```
- প্রতিটি সারিতে `serial_no` আবশ্যক; অন্য ফিল্ড **না দিলে, `null` বা খালি `""` দিলে অপরিবর্তিত** (শীটের খালি ঘর কখনো মান মোছে না)। ফ্রন্টএন্ড শুধু ম্যাপ করা ও খালি নয় এমন ঘর পাঠায় (v১.২)।
- কোনো ঐচ্ছিক মান **মুছতে** স্পষ্ট তালিকা `_clear`: `father_or_husband_name`, `address`, `union_name`, `prev_photo_source`, `current_photo_source`, `extra.<key>` (শুধু পাবলিক কাস্টম ফিল্ড)। আবশ্যক ফিল্ড মোছা যায় না (`400`)। শীটে ব্যবহারকারী ঘরে **`(মুছুন)`** লিখলে ফ্রন্টএন্ড সেটিকে `_clear` বানায় (শীটের রীতি — সার্ভার এই শব্দ কখনো দেখে না); আবশ্যক ঘরে `(মুছুন)` ফ্রন্টএন্ডেই ভুল হিসেবে আটকায়।
- `extra` **মার্জ** হয় (শুধু দেওয়া key বদলায়)। **গোপন ফিল্ডের key `extra` এ দিলে সার্ভার সেগুলো গোপন অংশে মার্জ করে** (রেকর্ডের পাবলিক `extra` তে কখনো নয়) — v১.২ এ চূড়ান্ত; ফ্রন্টএন্ডের ইম্পোর্ট এভাবেই গোপন মান পাঠায়, নতুন যোগের পরেও (POST এর পরে একই সিরিয়ালে PUT, শুধু গোপন key)। `_clear` গোপন মান মোছে না — গোপন মান মুছতে `PUT /api/records/:id/private`।
- (প্রকল্প, serial_no) মিললে আপডেট; না মিললে `missing` এ (এরর নয়, ইনসার্ট হয় না)। এক ট্রানজ্যাকশন। ফ্রন্টএন্ড চাইলে `missing` গুলো POST (`use_given_serial`) দিয়ে যোগ করে।
- গ্রুপের key দিলে `400`। Supabase সমতুল্য: `housing_bulk_update_by_serial` v2 (`supabase/sql/11_project_rpcs.sql`)।

#### ৪.৪.৮ GET / PUT `/api/records/:id/private` — গোপন মান (এডমিন)
- GET → `{ "data": { "phone": "01711987654" } }`; কিছু না থাকলে `{}`।
- **POST `/api/projects/:key/records/private`** (v১.১, গোপনসহ CSV এক্সপোর্টের জন্য) body `{ "ids": ["3f2c…", "9a1b…"] }` (≤ ১০০টি) → `200 { "data": { "3f2c…": { "phone": "01711987654" } } }` — শুধু মান থাকা রেকর্ড; অন্য প্রকল্পের id নীরবে বাদ; ১০০-র বেশি → `400`। পড়া লগ হয় না; ক্লায়েন্ট এক্সপোর্ট শেষে `records_export` ইভেন্ট পাঠায় (§৪.৫)।
- PUT body `{ "data": { "phone": "০১৭১১৯৮৭৬৫৪" } }` → পুরোটা **প্রতিস্থাপন** (যে key বাদ, তার মান মুছে যায়; খালি/null মান সংরক্ষিত হয় না) → `200 { "data": { "phone": "01711987654" } }` (স্বাভাবিক করা মান)। শুধু প্রকল্পের **গোপন ও সক্রিয়** ফিল্ডের key; পাবলিক/অচেনা/আর্কাইভ key → `400` (`details.field = "private.<key>"`)। অপরিবর্তিত পুরনো মান (আর্কাইভ ফিল্ডেরও) আবার পাঠালে গ্রহণযোগ্য।

#### ৪.৪.৯ POST `/api/records/:id/serial` — সিরিয়াল বদল (এডমিন, বিশেষ)
```json
{ "serial_no": 350 }   // → 200 { "data": Record } — নতুন serial_no ও নতুন পাথের ছবির url সহ
```
`serial_no` int ≥ 1; একই প্রকল্পে আগে থাকলে `409`; রেকর্ড নেই → `404`। এক ট্রানজ্যাকশনে: সিরিয়াল আপডেট, কাউন্টার ≥ নতুন মান, **ছবির ফাইল নতুন সিরিয়ালের পাথে সরানো** ও `*_photo_url`/`*_thumb_url`/`photo_updated_at` আপডেট, আর **অডিট সারি** (record_id, old_serial, new_serial, changed_by, changed_at — Supabase এ `housing_serial_changes`)। পুরনো সিরিয়াল আর কাউকে দেওয়া হবে না।

#### ৪.৪.১০ PUT `/api/records/:id/photos/:slot` — ছবি আপলোড/প্রতিস্থাপন (এডমিন)
`slot` = `prev` | `current`। `multipart/form-data`:

| ফিল্ড | নিয়ম |
|---|---|
| `photo` | আবশ্যক। ফ্রন্টএন্ড সবসময় `image/webp` পাঠায় (≤ ১৬০০px, ~৮০%), ≤ ৫ MB। সার্ভার jpeg/png নিয়ে WebP বানাতে পারে (ঐচ্ছিক) |
| `thumb` | ঐচ্ছিক, `image/webp`, ৪০০px, ≤ ৫০০ KB; না এলে সার্ভার নিজে বানাবে |

- **ছবি-মোড মানতে হবে:** প্রকল্প `after_only` হলে `prev` → `400`; `none` হলে যেকোনো slot → `400`। ফাইল রাখার **আগেই** যাচাই (অনাথ ফাইল নয়)।
- ফাইল §৩.৪ এর পাথে (**ওভাররাইট**), রেকর্ডের `<slot>_photo_url`, `<slot>_thumb_url`, `photo_updated_at = now()` আপডেট → `200 { "data": Record }`। ভুল slot/টাইপ → `400`; বড় ফাইল → `413`; রেকর্ড নেই → `404`।
- মাইগ্রেশন/বাল্ক টুল ব্রাউজারে একবারে ২টি, স্ক্রিপ্টে ৪টি সমান্তরাল অনুরোধ পাঠায়।

#### ৪.৪.১১ DELETE `/api/records/:id/photos/:slot` — (মূল এডমিন)
সাধারণ এডমিন → `403` ("শুধু মূল এডমিন ছবি মুছতে পারেন"); নতুন ছবি দিয়ে **প্রতিস্থাপন** (§৪.৪.১০) সব এডমিন পারেন। ছবি ও থাম্ব মুছে, url `null`, `photo_updated_at = now()` → `200 { "data": Record }`। ছবি না থাকলেও `200` (idempotent)। **একই নিয়ম PATCH এও:** সাধারণ এডমিন `*_photo_url` কে `null` করতে পারেন না।

### ৪.৫ একটিভিটি লগ (এডমিন)
সার্ভার **প্রতিটি লেখার কাজ নিজে লগ করবে** (ক্লায়েন্টের উপর নির্ভর না করে), বদলানো মানের আগে→পরেসহ। লগ append-only — সম্পাদনা/মোছা যায় না, এডমিনও সরাসরি লিখতে পারেন না।

| action | কখন | details |
|---|---|---|
| `create` / `delete` | রেকর্ড | রেকর্ডের সারসংক্ষেপ: year, division, district, upazila, union_name, address, father_or_husband_name, extra, had_*_photo (delete) / has_*_photo (create) |
| `update` | রেকর্ড | `{ "changes": { "name": {"old","new"}, "union_name": {…}, "extra.amount": {"old": 10000, "new": 12000} }, "photo_kinds": [] }` — `extra` প্রতিটি key আলাদা |
| `photo_update` | ছবি যোগ/বদল/মোছা | একই `changes` আকারে (`current_photo: {old: false, new: true}`), `photo_kinds: ["current"]` |
| `serial_change` | সিরিয়াল বদল | `changes.serial_no` |
| `private_update` | গোপন মান | `{ "fields": ["phone"], "masked": true }` — **মান কখনো নয়** |
| `project_create` / `project_update` / `project_publish` / `project_unpublish` / `project_delete` | প্রকল্পের সেটিং | `record_id: null`, `project_type` = প্রকল্পের key; শুধু ক্রম বদল লগ হয় না |
| `field_create` / `field_update` / `field_archive` / `field_restore` / `field_delete` | ফিল্ডের সেটিং | একই |
| `login` / `logout` / `import_run` / `photo_bulk_run` | ক্লায়েন্ট-ইভেন্ট (POST দিয়ে) | যেকোনো |
| `records_export` (v১.১) | ক্লায়েন্ট-ইভেন্ট: CSV এক্সপোর্ট | `{ "rows": 120, "private": true }` — কোন রেকর্ড বা মান নয় |
| `category_merge` (v১.৩) | ক্লায়েন্ট-ইভেন্ট: ক্যাটাগরির বানান একীকরণের সারসংক্ষেপ (প্রতিটি রেকর্ডের বদল সার্ভার আলাদা `update` হিসেবে লগ করে) | `{ "field": "category", "from": "গাভি", "to": "গরু", "records": 3 }` |
| `photo_bulk_run` | ক্লায়েন্ট-ইভেন্ট: ছবি বাল্ক — **প্রতিটি প্রকল্পের জন্য আলাদা** এন্ট্রি (v১.৩) | `{ "rows": 2, "done": 1, "failed": 0, "overwrite": 0 }` |

**GET `/api/activity`** — query: `action`, `project_type`, `record_id`, `actor_email` (আংশিক), `from`/`to` (ISO), `page`, `page_size` (≤ ১০০)। নতুন আগে।
```json
{ "data": [ { "id": 1024, "at": "2026-09-30T05:06:22Z", "actor_id": "u_1", "actor_email": "admin@example.org",
              "action": "update", "project_type": "semi_pucca", "record_id": "3f2c…", "serial_no": 12, "record_name": "…",
              "details": { … } } ],
  "meta": { "page": 1, "page_size": 50, "total": 1024, "total_pages": 21 } }
```
স্ক্রিপ্ট/সার্ভার-কাজ হলে `actor_email = "service_role"`।

**POST `/api/activity`** — body `{ "action": "import_run", "project_type": "tin", "details": { "mode": "insert", "rows": 200 } }` → `201 { "data": { "id": 1025 } }`। `action` `^[a-z_]{1,40}$`; actor সার্ভার সেশন থেকে নেয় (body তে নয়)।

---

## ৫. সার্ভারের নিয়ম (প্রযুক্তি-নিরপেক্ষ — যেকোনো সার্ভারে একই হতে হবে)

Supabase রেফারেন্সে এগুলো `supabase/sql/10b_project_guards.sql` (ট্রিগার), `03_rls.sql`/`10_projects.sql` (RLS) ও `11_project_rpcs.sql` এ আছে।

### ৫.১ রেকর্ড যাচাই
- সব টেক্সট **trim + Unicode NFC** করে সংরক্ষণ ও তুলনা (বাংলা ড়/ঢ়/য় দুই রূপে লেখা যায়; NFC এক করে)। ফিল্টারের মানও NFC করে তুলনা।
- `year` আবশ্যক, int ২০০০–২১০০; `name` আবশ্যক ১–২০০; `division`/`district`/`upazila` আবশ্যক ১–১০০ (মান ফ্রন্টএন্ডের স্থির তালিকা `bdGeo.ts` ৮/৬৪/৪৯৪ থেকে; সার্ভার চাইলে একই তালিকায় যাচাই করতে পারে); `father_or_husband_name` ০–২০০; `union_name` ০–১০০ (প্রস্তাব; Supabase এ এখনো সীমা নেই); `address` ০–১০০০; `*_photo_source` URL বা null, ≤ ২০০০।
- প্রকল্পের `core_fields.<k>.required = true` হলে সেই ঐচ্ছিক সিস্টেম ফিল্ড আবশ্যক (`400`, যেমন "ইউনিয়ন আবশ্যক" — `union_name` এর ক্ষেত্রে শুধু `geo_depth = union` প্রকল্পে)। পুরনো রেকর্ডে আগে থেকেই খালি থাকা মান অন্য কিছু এডিট করলে আটকায় না — শুধু নতুন রেকর্ডে বা মান মুছতে গেলে।
- `extra`: JSON object, < ১৬ KB; প্রতিটি key প্রকল্পের **পাবলিক ও সক্রিয়** ফিল্ড হতে হবে (§৩.৩ এর ধরন-নিয়মে স্বাভাবিক); আবশ্যক কাস্টম ফিল্ড খালি → `400`। UPDATE এ শুধু বদলানো মান যাচাই।
- গ্রুপ-প্রকল্পে রেকর্ড রাখা যায় না (`400`)।
- `*_photo_url`, `*_thumb_url`, `photo_updated_at` ক্লায়েন্ট কখনো সরাসরি পাঠায় না (শুধু ছবি endpoint); ছবি-মোডের বাইরের ছবি রাখা যায় না।

### ৫.২ খসড়া লুকানো
- "পাবলিক প্রকল্প" = `is_published = true` এবং (থাকলে) তার গ্রুপও প্রকাশিত। anon এর কাছে অন্য সব প্রকল্প, তাদের ফিল্ড, রেকর্ড, স্ট্যাট, ছবির তালিকা ও পরের সিরিয়াল — **নেই** (`404` বা তালিকা থেকে বাদ)।
- গোপন ফিল্ডের **সংজ্ঞাও** anon দেখে না (নাম থেকেও কিছু বোঝা না যায়)।

### ৫.৩ সিরিয়াল ও কাউন্টার
প্রতিটি একক/উপ-প্রকল্পে আলাদা কাউন্টার, প্রকল্প তৈরির সাথে সাথে (০)। বরাদ্দ atomic, ১ থেকে, ফাঁক থাকতে পারে, কখনো পুনঃব্যবহার নয় — রেকর্ড বা প্রকল্প মুছলেও না। কাউন্টার কখনো মোছে না।

### ৫.৪ গোপন মান আলাদা
গোপন ফিল্ডের মান শুধু §৪.৪.৮ এ; রেকর্ডের `extra`, তালিকা, সার্চ, স্ট্যাট, ওভারভিউ, লগে কখনো নয়।

### ৫.৫ প্রকল্প ও ফিল্ডের গার্ড (কী অপরিবর্তনীয়)
- **প্রকল্প `key`** কখনো বদলায় না (সিরিয়াল, ছবির পাথ ও লগ এর ওপর নির্ভর করে)।
- **`slug`**: `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ ৬০, শুধু অঙ্ক নয়, unique; সংরক্ষিত শব্দ নিষেধ: admin, api, auth, login, logout, assets, geo, static, src, public, node-modules, favicon, icons, dev, projects, records, search, about, contact, donate, news, en, bn, new, edit, import, photos, activity, settings, users, preview, index।
- **প্রকাশিত** প্রকল্পের `slug` বা `parent_key` বদলায় না (শেয়ার করা লিংক ভাঙবে) — আগে অপ্রকাশিত করতে হয়।
- `parent_key` থাকলে সেটি অবশ্যই একটি গ্রুপ (সর্বোচ্চ ২ স্তর)। রেকর্ড, উপ-প্রকল্প বা ফিল্ড থাকলে `is_group` বদলায় না।
- ছবি-মোড বদল: আগের ছবিসহ রেকর্ড থাকলে `after_only`/`none` নয়; যেকোনো ছবিসহ রেকর্ড থাকলে `none` নয়।
- `stat_cards` ≤ ৮, `home: true` ≤ ৩, প্রতিটিতে `id`, `kind` ও লেবেল।
- **ফিল্ড:** প্রতি প্রকল্পে ≤ ৪০; গ্রুপে নয়; `key` সংরক্ষিত নাম নিষেধ — id, project_type, serial_no, year, name, father_or_husband_name, division, district, upazila, union_name, address, extra, created_at, updated_at, photo_updated_at, q, page, sort, f, আর `prev_*`/`current_*`। কোনো রেকর্ডে মান আসার পর `key`, `type`, `visibility`, `project_key` বদলায় না, ফিল্ড মোছা যায় না (আর্কাইভ করুন)।

### ৫.৬ লগ
§৪.৫ — প্রতিটি লেখা সার্ভারেই লগ হয়, একই ট্রানজ্যাকশনে।

### ৫.৭ Supabase-নির্দিষ্ট অংশ (নিজস্ব সার্ভারে সমতুল্য বানাতে হবে)
`auth.uid()` (লগইন করা ব্যবহারকারী), RLS পলিসি (অনুমতি), Storage bucket `housing-photos` (পাবলিক পড়া, এডমিন লেখা, মূল এডমিন মোছা)।

---

## ৬. ছবির স্টোরেজ (সার্ভার-সাইড নোট)
- পাবলিক পড়া: ছবির URL টোকেন ছাড়া খোলা যাবে (স্ট্যাটিক ফাইল/CDN) — শুধু পাবলিক প্রকল্পের রেকর্ডে লিংক দেখা যায়।
- লেখা শুধু উপরের endpoint দিয়ে; ক্লায়েন্ট সরাসরি স্টোরেজে লেখে না।
- `Cache-Control: public, max-age=86400` বা বেশি চলবে, কারণ ফ্রন্টএন্ড `?v=` দিয়ে ক্যাশ ভাঙে। CDN থাকলে query string দিয়ে ক্যাশ কী আলাদা হওয়া চাই।

---

## ৭. পারফরম্যান্সের লক্ষ্য
হোম পেইজ ≤ ২টি কল (রেজিস্ট্রি + overview); তালিকা পেইজ list + stats; `stats` ৫০ হাজার সারিতে < ৩০০ ms।

---

## ৮. পরিবর্তন লগ
| তারিখ | সংস্করণ | পরিবর্তন |
|---|---|---|
| ২০২৬-০৯-২৯ | ০.১ | প্রাথমিক খসড়া |
| ২০২৬-০৯-২৯ | ০.২ | পাথ `/api/...` এ; ফিল্ড নাম DB টেবিলের সাথে মেলানো; `years` endpoint; ছবি endpoint (থাম্বনেইলসহ); `page_size` ডিফল্ট ৫০; ভ্যালিডেশন টেবিল; bulk all-or-nothing |
| ২০২৬-০৯-২৯ | ০.৩ | `stats` উত্তরে `distinct` {divisions, districts, upazilas} |
| ২০২৬-০৯-২৯ | ০.৪ | টেক্সট NFC-নরমালাইজেশনের নিয়ম; ভৌগোলিক মানের উৎস (স্থির তালিকা) |
| ২০২৬-০৯-২৯ | ০.৫ | ছবির পাথ নিয়ম `housing/{project_type}/{serial}/{kind}[_thumb].webp` (সব WebP, ওভাররাইট); `serials?nos=` endpoint |
| ২০২৬-০৯-২৯ | ০.৬ | অথ: admins টেবিল ও role নিয়ম, সাইন-আপ নেই, ফ্রন্টএন্ডের JWT/কুকি আচরণ |
| ২০২৬-০৯-২৯ | ০.৭ | এডমিন CRUD: create এ ঐচ্ছিক `serial_no`; `next-serial`; সিরিয়াল বদল + ছবি সরানো; list এ `serial_no` ফিল্টার |
| ২০২৬-০৯-২৯ | ০.৮ | সিরিয়াল ধরে বাল্ক আপডেট (ইম্পোর্টের আপডেট মোড); ফ্রন্টএন্ড ধাপ ০–১২ এর সাথে সঙ্গতিপূর্ণ |
| ২০২৬-০৯-৩০ | ০.৯ | একটিভিটি লগ; সার্ভার-সাইড লগিং বাধ্যতামূলক; `stats.by_location` (মানচিত্র) |
| ২০২৬-১০-০৫ | ০.৯.১ | এডমিনের দুই ভূমিকা: `main_admin` (একজন; মোছা) ও `admin` (যোগ/এডিট) |
| ২০২৬-১০-০৫ | ০.৯.২ | বাল্ক আপডেটে খালি `""` = অপরিবর্তিত, মোছার জন্য `_clear`; `next-serial` খসড়ায় `null` |
| ২০২৬-১০-০৫ | **১.০** | **বহু-প্রকল্প (পর্ব ২, M-ধাপ ৪):** প্রকল্প, ফিল্ড, ওভারভিউ endpoint; পাথ `/api/projects/:key/...` ও `/api/records/:id/...` (§৯); রেকর্ডে `union_name`, `extra`; গোপন মান endpoint; ফিল্ডের ধরন ও যাচাই; `ProjectStats` শেপ (by_union, by_project, fields, distinct.unions); কাস্টম ফিল্টার `f.<key>` (whitelist), `sort=extra.<key>`; ছবি-মোড; খসড়া লুকানো; অপরিবর্তনীয় জিনিসের তালিকা; লগের নতুন action; PUT এর বদলে PATCH (আংশিক আপডেট); ছবি endpoint `PUT/DELETE …/photos/:slot` |
| ২০২৬-১০-০৫ | ১.১ | `POST /api/projects/:key/records/private` (অনেক রেকর্ডের গোপন মান একসাথে, ≤ ১০০; গোপনসহ CSV এক্সপোর্ট — M-ধাপ ১০); ক্লায়েন্ট-ইভেন্ট `records_export` |
| ২০২৬-১০-০৫ | ১.২ | বাল্ক আপডেট: গোপন key → গোপন অংশে মার্জ (TBD ৪ চূড়ান্ত), `_clear` শুধু পাবলিক, শীটের `(মুছুন)` রীতি (ফ্রন্টএন্ড → `_clear`); টাকার সীমা ১০০০ কোটি = 1e10 (আগে 1e11 লেখা ছিল, যা আসলে ১০,০০০ কোটি; Supabase: `13_money_limit.sql`) — M-ধাপ ১১ |
| ২০২৬-১০-০৬ | ১.৪ | কভার ছবি: `ProjectsApi.uploadCover` / `deleteCover` (§৪.১.৮ — WebP ≤ ৫ MB, ত্রুটির কোড, মোছা মূল এডমিন), কভারের ক্যাশ-ভাঙা ও হোম কার্ডের নিয়ম — M-ধাপ ১৫। (রেজিস্ট্রি আগে থেকেই এক কলে: `GET /api/projects?include=fields`; Supabase অ্যাডাপ্টারও এখন এক কলে — ফিল্ড embed) |
| ২০২৬-১০-০৬ | ১.৩ | ক্লায়েন্ট-ইভেন্ট `category_merge`; `photo_bulk_run` প্রকল্প ধরে আলাদা; ছবির ফাইলনাম: প্রিফিক্স = file_prefix/key/slug (অঙ্কসহ), শুধু-পরের-ছবি প্রকল্পে আগে/পরে না লিখলে `current`, `prev` হলে ভুল — M-ধাপ ১২ |

## ৯. পুরনো (v০.৯) → নতুন (v১.০) পাথ
| v০.৯ | v১.০ |
|---|---|
| `GET /api/housing?project_type=tin&…` | `GET /api/projects/tin/records?…` (সব প্রকল্প মিলিয়ে তালিকা আর নেই — গ্রুপ পেইজ উপ-প্রকল্প অনুযায়ী আলাদা কল করে) |
| `GET /api/housing/stats?project_type=` (না দিলে দুই প্রকল্প) | `GET /api/projects/:key/stats` (দুই প্রকল্প = গ্রুপ `housing`) |
| `GET /api/housing/years?project_type=` | `GET /api/projects/:key/years` |
| `GET /api/housing/next-serial?project_type=` | `GET /api/projects/:key/next-serial` |
| `GET /api/housing/:project_type/serial/:n`, `…/serials?nos=` | `GET /api/projects/:key/records/serial/:n`, `…/records/serials?nos=` |
| `GET/PUT/DELETE /api/housing/:id` | `GET/PATCH/DELETE /api/records/:id` |
| `POST /api/housing` | `POST /api/projects/:key/records` |
| `POST/PUT /api/housing/bulk` (body তে project_type) | `POST/PUT /api/projects/:key/records/bulk` |
| `POST /api/housing/:id/serial` | `POST /api/records/:id/serial` |
| `POST /api/housing/:id/photo` (kind form-field), `DELETE …/photo?kind=` | `PUT /api/records/:id/photos/:slot`, `DELETE /api/records/:id/photos/:slot` |
| `GET/POST /api/housing/activity` | `GET/POST /api/activity` |

## ১০. খোলা প্রশ্ন (TBD)
1. JWT না কুকি সেশন; মেয়াদ ও রিফ্রেশ।
2. CORS origin তালিকা, rate limit।
3. `by_upazila` শুধু নামে গোনা (একই নামের উপজেলা ভিন্ন জেলায় একসাথে); মানচিত্র `by_location` ব্যবহার করে। `by_upazila` UI তে ব্যবহারের আগে সিদ্ধান্ত লাগবে।
4. ~~বাল্ক আপডেটে গোপন ফিল্ডের মান~~ — v১.২ এ চূড়ান্ত (§৪.৪.৭): গোপন অংশে মার্জ।
