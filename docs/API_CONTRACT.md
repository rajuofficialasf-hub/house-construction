# ঘর নির্মাণ প্রকল্প — REST API চুক্তি (API_CONTRACT.md)

> নিজস্ব সার্ভারের ডেভেলপারের জন্য। ফ্রন্টএন্ডের `rest` অ্যাডাপ্টার (`src/features/housing/backend/rest/`) ঠিক এই চুক্তি অনুযায়ী কল করবে।
> সংস্করণ: ০.৯ — সর্বশেষ আপডেট: ২০২৬-০৯-৩০
> সার্ভারের প্রযুক্তি (ভাষা/ফ্রেমওয়ার্ক/DB) অনির্ধারিত; এই চুক্তি প্রযুক্তি-নিরপেক্ষ। "TBD" অংশ এখনো চূড়ান্ত নয়।

---

## ১. সাধারণ নিয়ম

- **বেস URL:** ফ্রন্টএন্ডের `VITE_API_BASE_URL` (যেমন `https://api.example.org`)। সব পাথ `/api/...` দিয়ে শুরু।
- **ফরম্যাট:** JSON, `Content-Type: application/json; charset=utf-8`। ছবি আপলোডে `multipart/form-data`।
- **এনকোডিং:** UTF-8 (বাংলা টেক্সট)। সংখ্যা JSON number, তারিখ ISO 8601 UTC (`2026-09-29T10:15:00Z`)।
- **অনুমতি:** পড়া (সব GET) সবার জন্য উন্মুক্ত, টোকেন লাগে না। লেখা (POST/PUT/DELETE) শুধু এডমিন। **অনুমতি সার্ভারে যাচাই হবে**; ফ্রন্টএন্ডের উপর ভরসা নয়।
- **রাউট ক্রম:** `/api/housing/stats`, `/api/housing/years`, `/api/housing/bulk`, `/api/housing/:project_type/serial/:serial_no` অবশ্যই `/api/housing/:id` এর **আগে** ম্যাচ করতে হবে।
- **CORS:** ওয়েবসাইটের origin অনুমোদিত (তালিকা TBD)। **Rate limit:** TBD।

### ১.১ সফল উত্তর
```json
{ "data": <object | array>, "meta": { ...ঐচ্ছিক... } }
```

### ১.২ এরর উত্তর (সব এররে একই ফরম্যাট)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "মানুষের পড়ার মতো বার্তা",
    "details": { "field": "name", "reason": "required" }
  }
}
```
| HTTP | code | কখন |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ভুল/অসম্পূর্ণ ইনপুট; `details.field`, `details.reason` দিন |
| 401 | `UNAUTHENTICATED` | টোকেন/সেশন নেই, অবৈধ বা মেয়াদোত্তীর্ণ |
| 403 | `FORBIDDEN` | লগইন আছে কিন্তু এডমিন নয় |
| 404 | `NOT_FOUND` | রেকর্ড/ছবি নেই |
| 409 | `CONFLICT` | (project_type, serial_no) ডুপ্লিকেট |
| 413 | `PAYLOAD_TOO_LARGE` | ছবি ৫ MB এর বেশি বা bulk সারি সীমা ছাড়ালে |
| 500 | `INTERNAL_ERROR` | সার্ভারের ত্রুটি |

ফ্রন্টএন্ড এই code গুলোই `HousingApiError.code` হিসেবে ব্যবহার করে (`backend/interfaces/types.ts`)।

---

## ২. অথেন্টিকেশন

- ধরন: **JWT (Bearer) অথবা HttpOnly কুকি সেশন — সার্ভার ডেভেলপার বেছে নেবেন (TBD)।** ফ্রন্টএন্ড দুটোই সামলাতে পারবে:
  - JWT হলে: `/api/auth/login` উত্তরে `access_token` দিন; ফ্রন্টএন্ড প্রতিটি লেখার রিকোয়েস্টে `Authorization: Bearer <token>` পাঠাবে।
  - কুকি হলে: `access_token` বাদ দিন, `Set-Cookie` (HttpOnly, Secure, SameSite) দিন; ফ্রন্টএন্ড `credentials: 'include'` দিয়ে কল করবে; CSRF সুরক্ষা সার্ভারের দায়িত্ব।
- সেশনের মেয়াদ ও রিফ্রেশ: TBD (প্রস্তাব: ৭ দিন, রিফ্রেশ ছাড়া; মেয়াদ শেষে ৪০১ → ফ্রন্টএন্ড লগইন পেইজে পাঠাবে)।
- **এডমিন তালিকা:** সার্ভারে একটি `admins` টেবিল (Supabase এ `housing_admins`: `user_id, email, role, created_at`)। লগইন সফল হলেও ব্যবহারকারী এই টেবিলে না থাকলে `403 FORBIDDEN` ("এই অ্যাকাউন্ট এডমিন তালিকায় নেই") এবং সেশন তৈরি হবে না। `role` এখন সবসময় `"admin"` (সবার সমান অধিকার); ভবিষ্যতে নতুন role যোগ হলে ফ্রন্টএন্ড `AuthUser.role` এ পাবে।
- **সাইন-আপ নেই:** কোনো `/api/auth/register` endpoint থাকবে না; নতুন এডমিন শুধু সার্ভার/ডাটাবেস থেকে যোগ হবে। পাসওয়ার্ড রিসেট endpoint ঐচ্ছিক (TBD)।
- ব্রুট-ফোর্স সুরক্ষা (লগইনে rate limit) সার্ভারে থাকা উচিত।
- ফ্রন্টএন্ড আচরণ (রেফারেন্স বাস্তবায়ন `src/features/housing/backend/rest/authProvider.ts`): JWT মোডে token `localStorage` কী `housing_rest_token` এ; সব অনুরোধ `credentials: 'include'` সহ যায় (কুকি মোডে কাজ করে); অ্যাপ লোডে `GET /api/auth/me` দিয়ে সেশন যাচাই; `401` → লগইন পেইজ।

### POST `/api/auth/login` — পাবলিক
```json
// অনুরোধ
{ "email": "admin@example.org", "password": "********" }
// উত্তর 200
{ "data": {
    "access_token": "eyJ...",            // JWT হলে; কুকি হলে বাদ
    "expires_at": "2026-10-06T10:15:00Z",
    "user": { "id": "u_1", "email": "admin@example.org", "name": "এডমিন", "role": "admin" }
} }
```
ভ্যালিডেশন: `email` বৈধ ইমেইল, `password` ১–২০০ অক্ষর। ভুল হলে `401 UNAUTHENTICATED` ("ইমেইল বা পাসওয়ার্ড সঠিক নয়"), কোনটি ভুল তা বলা যাবে না।

### POST `/api/auth/logout` — এডমিন
টোকেন/সেশন বাতিল → `204 No Content`।

### GET `/api/auth/me` — এডমিন
```json
{ "data": { "id": "u_1", "email": "admin@example.org", "name": "এডমিন", "role": "admin" } }
```
টোকেন অবৈধ → `401`।

---

## ৩. ডাটা মডেল

### ৩.১ ProjectType
`"semi_pucca"` (সেমিপাকা ঘর) | `"tin"` (টিনের ঘর)

### ৩.২ Beneficiary (রেকর্ড)
ডাটাবেস টেবিল `housing_beneficiaries` এর সাথে ফিল্ড হুবহু মেলে (`supabase/sql/01_schema.sql`)।
```json
{
  "id": "3f2c…",                         // uuid
  "project_type": "semi_pucca",
  "serial_no": 1,                        // int; প্রতি project_type এ ১ থেকে; সার্ভার বরাদ্দ করে; অপরিবর্তনীয়; পুনঃব্যবহার হয় না
  "year": 2024,
  "name": "মোছাঃ রহিমা খাতুন",
  "father_or_husband_name": "মৃত আব্দুল করিম",
  "division": "রংপুর",
  "district": "কুড়িগ্রাম",
  "upazila": "উলিপুর",
  "address": "গ্রাম: দলদলিয়া, ডাকঘর: উলিপুর",
  "prev_photo_url": "https://…/semi/semi_0001_prev.jpg",        // null হতে পারে
  "prev_thumb_url": "https://…/semi/semi_0001_prev_thumb.jpg",
  "current_photo_url": "https://…/semi/semi_0001_current.jpg",
  "current_thumb_url": "https://…/semi/semi_0001_current_thumb.jpg",
  "prev_photo_source": "https://…sharepoint…",                 // শীটের মূল লিঙ্ক; শুধু রেফারেন্স
  "current_photo_source": null,
  "photo_updated_at": "2026-09-29T10:15:00Z",                   // ছবি বদলালে; null হতে পারে
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-09-29T10:15:00Z"
}
```
- ছবির URL সরাসরি ব্রাউজারে দেখানোর মতো পাবলিক URL, `?v=` ছাড়া। ফ্রন্টএন্ড নিজে `?v=<photo_updated_at>` যোগ করে ক্যাশ ভাঙে। CDN থাকলে query string দিয়ে ক্যাশ কী আলাদা হওয়া চাই।
- **ছবির স্টোরেজ পাথ (সিরিয়াল-ভিত্তিক, নির্দিষ্ট):** `housing/{project_type}/{serial_no ৪ অঙ্কে}/{kind}.webp` এবং `…/{kind}_thumb.webp`; kind `prev` | `current`। উদাহরণ: `housing/semi_pucca/0001/prev.webp`, `housing/tin/0012/current_thumb.webp`। একই সিরিয়ালের ছবি আপডেট = **একই পাথে ওভাররাইট** + `photo_updated_at` বদল। সব ছবি WebP (পূর্ণ: সর্বোচ্চ ১৬০০px চওড়া, মান ~৮০%; থাম্ব: ৪০০px চওড়া)।

### ৩.৩ লেখার ইনপুট ও ভ্যালিডেশন
| ফিল্ড | নিয়ম |
|---|---|
| `project_type` | আবশ্যক (create), `semi_pucca` \| `tin`; update এ পাঠালে `400` |
| `serial_no` | create এ **ঐচ্ছিক**: না দিলে সার্ভার পরবর্তী সিরিয়াল দেয়; দিলে int ≥ 1 ও অনন্য (নইলে `409 CONFLICT`), কাউন্টার ≥ সেই মান হয়। update (PUT) এ পাঠালে `400` — সিরিয়াল বদল শুধু `POST /:id/serial` দিয়ে |
| `year` | আবশ্যক, int, ২০০০–২১০০ |
| `name` | আবশ্যক, trim করে ১–২০০ অক্ষর |
| `father_or_husband_name` | ঐচ্ছিক, ০–২০০ অক্ষর, ডিফল্ট `""` |
| `division`, `district`, `upazila` | আবশ্যক, ১–১০০ অক্ষর (ফ্রন্টএন্ডে স্থির তালিকা থেকে আসে; সার্ভার শুধু খালি নয় তা দেখলেই চলবে) |
| `address` | ঐচ্ছিক, ০–১০০০ অক্ষর, ডিফল্ট `""` |
| `prev_photo_source`, `current_photo_source` | ঐচ্ছিক, URL বা null, ≤ ২০০০ অক্ষর |
| `*_photo_url`, `*_thumb_url`, `photo_updated_at` | ক্লায়েন্ট কখনো পাঠায় না; শুধু ছবি endpoint বদলায় |

সব টেক্সট trim করে এবং **Unicode NFC-নরমালাইজ** করে সংরক্ষণ ও তুলনা (বাংলা ড়/ঢ়/য় দুই রূপে লেখা যায়; NFC দুটোকে এক করে)। ফিল্টারের `division`/`district`/`upazila` exact-match, তাই সার্ভারও query মান NFC করে তুলনা করবে। `division`/`district`/`upazila` এর মান ফ্রন্টএন্ডের স্থির তালিকা (`src/features/housing/data/bdGeo.ts`, ৮/৬৪/৪৯৪) থেকে আসে; সার্ভার চাইলে একই তালিকা দিয়ে ভ্যালিডেট করতে পারে (ঐচ্ছিক)।

---

## ৪. রেকর্ড endpoint

| মেথড | পাথ | অনুমতি | ফ্রন্টএন্ড মেথড |
|---|---|---|---|
| GET | `/api/housing` | পাবলিক | `list` |
| GET | `/api/housing/stats` | পাবলিক | `stats` |
| GET | `/api/housing/years` | পাবলিক | `years` |
| GET | `/api/housing/next-serial?project_type=` | পাবলিক | `nextSerial` |
| POST | `/api/housing/:id/serial` | এডমিন | `changeSerial` |
| GET | `/api/housing/:project_type/serial/:serial_no` | পাবলিক | `getBySerial` |
| GET | `/api/housing/:project_type/serials?nos=1,2,3` | পাবলিক | `getBySerials` |
| GET | `/api/housing/:id` | পাবলিক | `getById` |
| POST | `/api/housing` | এডমিন | `create` |
| PUT | `/api/housing/:id` | এডমিন | `update` |
| DELETE | `/api/housing/:id` | এডমিন | `delete` |
| POST | `/api/housing/bulk` | এডমিন | `bulkInsert` |
| PUT | `/api/housing/bulk` | এডমিন | `bulkUpdateBySerial` |
| GET | `/api/housing/activity` | এডমিন | `listActivity` |
| POST | `/api/housing/activity` | এডমিন | `logActivity` |
| POST | `/api/housing/:id/photo` | এডমিন | `uploadPhoto` |
| DELETE | `/api/housing/:id/photo?kind=` | এডমিন | `deletePhoto` |

### ৪.১ GET `/api/housing` — তালিকা (মোট সংখ্যাসহ)
Query প্যারামিটার (সব ঐচ্ছিক):

| প্যারাম | টাইপ | নিয়ম |
|---|---|---|
| `project_type` | `semi_pucca` \| `tin` | না দিলে দুই প্রকল্পই |
| `serial_no` | int ≥ 1 | ঠিক মিল (এডমিন খোঁজা); দিলে `q` উপেক্ষা করা যায় |
| `year` | int | ঠিক মিল |
| `division`, `district`, `upazila` | string | ঠিক মিল (case-sensitive, বাংলা) |
| `q` | string | `name`, `father_or_husband_name`, `address` এ আংশিক মিল (case-insensitive, `ILIKE '%q%'`); ≤ ১০০ অক্ষর |
| `page` | int ≥ 1 | ডিফল্ট 1 |
| `page_size` | int 1–100 | ডিফল্ট **50** |
| `sort` | `serial_no` \| `year` \| `name` \| `created_at` | ডিফল্ট `serial_no`; দ্বিতীয় ক্রম সবসময় `serial_no asc` |
| `order` | `asc` \| `desc` | ডিফল্ট `asc` |

অবৈধ মান → `400`।

```json
// GET /api/housing?project_type=semi_pucca&division=রংপুর&page=1&page_size=50
{
  "data": [ { ...Beneficiary... }, { ...Beneficiary... } ],
  "meta": { "page": 1, "page_size": 50, "total": 1500, "total_pages": 30 }
}
```
`total` = ফিল্টারের পর মোট সারি (পেইজ নয়)। খালি হলে `data: []`, `total_pages: 1`।

### ৪.২ GET `/api/housing/:id`
→ `{ "data": Beneficiary }`; নেই → `404`।

### ৪.৩ GET `/api/housing/:project_type/serial/:serial_no`
`serial_no` int ≥ 1, `project_type` বৈধ না হলে `400`। → `{ "data": Beneficiary }`; নেই → `404`।

### ৪.৩ক GET `/api/housing/:project_type/serials?nos=1,2,3`
একসাথে অনেক সিরিয়ালের রেকর্ড (ছবি বাল্ক আপডেটে ফাইলনাম মিলাতে)। `nos` কমা-বিভক্ত int, সর্বোচ্চ ১০০ (বেশি হলে `400`); ফ্রন্টএন্ড ১০০ করে ভাগ করে পাঠায়। উত্তর `{ "data": [Beneficiary, …] }` `serial_no` ক্রমে; যেগুলো নেই সেগুলো বাদ (এরর নয়)।

### ৪.৪ GET `/api/housing/stats?project_type=`
`project_type` না দিলে দুই প্রকল্প মিলিয়ে। সব সংখ্যা int।
```json
{ "data": {
    "total": 1500,
    "by_year":     { "2023": 400, "2024": 700, "2025": 400 },
    "by_division": { "ঢাকা": 300, "রংপুর": 450 },
    "by_district": { "কুড়িগ্রাম": 120, "গাইবান্ধা": 90 },
    "by_upazila":  { "উলিপুর": 40, "সাঘাটা": 25 },
    "distinct":    { "divisions": 8, "districts": 45, "upazilas": 120 },
    "by_location": { "কুড়িগ্রাম|উলিপুর": 40, "গাইবান্ধা|সাঘাটা": 25 }
} }
```
- `by_location`: key `"জেলা|উপজেলা"` (pipe দিয়ে জোড়া) → সংখ্যা; ইন্টারেক্টিভ মানচিত্র এটি দিয়ে উপজেলা রঙ করে ও সংখ্যা দেখায়। `by_upazila` (শুধু নামে) অস্পষ্ট হতে পারে, তাই মানচিত্র এটিই ব্যবহার করে।
- `distinct`: ডাটাবেসে থাকা রেকর্ডের ঠিকানা থেকে distinct সংখ্যা (স্থির তালিকার মোট নয়)। `divisions` = `count(distinct division)`, `districts` = `count(distinct district)`, `upazilas` = distinct **(district, upazila)** জোড়া — একই নামের উপজেলা ভিন্ন জেলায় আলাদা গোনা হয়। ফ্রন্টএন্ডের স্ট্যাট কার্ড এগুলোই দেখায়।
- `by_*` কী গুলো বর্ণানুক্রমে সাজানো থাকলে ভালো (আবশ্যক নয়)।
- Supabase এ সমতুল্য: `housing_stats(p_project_type)` (`supabase/sql/04_rpc_stats.sql`)।

### ৪.৫ GET `/api/housing/years?project_type=`
```json
{ "data": [2025, 2024, 2023] }
```
নতুন থেকে পুরনো। ডাটা না থাকলে `[]`।

### ৪.৫ক GET `/api/housing/next-serial?project_type=`
```json
{ "data": { "project_type": "tin", "next_serial": 301 } }
```
পরবর্তী স্বয়ংক্রিয় সিরিয়ালের **পূর্বাভাস** (কাউন্টার + ১); প্রকৃত বরাদ্দ POST এ atomic ভাবে হয় (একই সময়ে দুজন যোগ করলে একজন 302 পাবে)। `project_type` আবশ্যক।

### ৪.৫খ POST `/api/housing/:id/serial` — সিরিয়াল বদল (এডমিন, বিশেষ)
```json
// অনুরোধ
{ "serial_no": 350 }
// উত্তর 200
{ "data": Beneficiary }   // নতুন serial_no ও নতুন পাথের ছবির url সহ
```
নিয়ম: `serial_no` int ≥ 1; একই project_type এ আগে থাকলে `409`; রেকর্ড নেই → `404`। সার্ভার এক ট্রানজ্যাকশনে: সিরিয়াল আপডেট, কাউন্টার ≥ নতুন মান, **ছবির ফাইল নতুন সিরিয়ালের পাথে সরানো** (`housing/{pt}/{old}/…` → `housing/{pt}/{new}/…`) ও `*_photo_url`/`*_thumb_url`/`photo_updated_at` আপডেট, এবং **অডিট লগে সারি** (record_id, old_serial, new_serial, changed_by, changed_at — Supabase এ `housing_serial_changes`)। পুরনো সিরিয়াল আর কাউকে দেওয়া হবে না। ফ্রন্টএন্ড এটি শুধু সতর্কবার্তাসহ আলাদা নিশ্চিতকরণের পর ডাকে।

### ৪.৬ POST `/api/housing` — নতুন রেকর্ড (এডমিন)
```json
// অনুরোধ
{
  "project_type": "tin", "year": 2025, "name": "মমতাজ বেগম", "father_or_husband_name": "মোঃ শামসুল হক",
  "division": "ময়মনসিংহ", "district": "শেরপুর", "upazila": "নালিতাবাড়ী", "address": "গ্রাম: পোড়াগাঁও",
  "prev_photo_source": null, "current_photo_source": null
}
// উত্তর 201
{ "data": { ...Beneficiary, "serial_no": 301 } }
```
`serial_no` না দিলে সার্ভার বরাদ্দ করবে **atomic ভাবে** (প্রতি project_type এ আলাদা কাউন্টার, ট্রানজ্যাকশন/লক; Postgres হলে `supabase/sql/02_serial.sql` এর ট্রিগার হুবহু ব্যবহারযোগ্য); দিলে (এডমিন ফর্মে "হাতে দিন") অনন্যতা যাচাই করে সেটিই রাখবে ও কাউন্টার তুলবে। ডিলেট হওয়া সিরিয়াল পুনঃব্যবহার হবে না।

### ৪.৭ PUT `/api/housing/:id` — আপডেট (এডমিন)
body: ৩.৩ এর ফিল্ডের যেকোনো উপসেট (আংশিক আপডেট গ্রহণযোগ্য; PUT নাম হলেও semantics PATCH এর মতো)। `project_type`/`serial_no` থাকলে `400`। → `200 { "data": Beneficiary }`; নেই → `404`।

### ৪.৮ DELETE `/api/housing/:id` — (এডমিন)
→ `204`। সংশ্লিষ্ট ছবি ও থাম্বনেইল স্টোরেজ থেকেও মুছবে (সিরিয়াল পুনঃব্যবহার হয় না, তাই ফাইল অনাথ হয়ে থাকত)। নেই → `404`।

### ৪.৯ POST `/api/housing/bulk` — শীট থেকে ইম্পোর্ট (এডমিন)
```json
// অনুরোধ
{
  "project_type": "semi_pucca",
  "mode": "use_given_serial",              // অথবা "assign_serial"
  "rows": [
    { "serial_no": 1, "year": 2023, "name": "…", "father_or_husband_name": "…",
      "division": "…", "district": "…", "upazila": "…", "address": "…",
      "prev_photo_source": "https://…", "current_photo_source": "https://…" }
  ]
}
// উত্তর 200
{ "data": { "inserted": 500, "failed": [] } }
// আংশিক ব্যর্থতা
{ "data": { "inserted": 200, "failed": [ { "row_index": 200, "error": { "code": "CONFLICT", "message": "serial_no 201 আগে থেকেই আছে" } } ] } }
```
নিয়ম:
- `rows` ১–৫০০ টি; বেশি হলে `413`। ফ্রন্টএন্ড ২০০ করে চাঙ্ক পাঠায়।
- `use_given_serial`: প্রতিটি সারিতে `serial_no` (int ≥ 1) আবশ্যক, ব্যাচের ভেতরে ডুপ্লিকেট থাকলে পুরো ব্যাচ `400`। ডাটাবেসে আগে থেকে থাকলে `CONFLICT`। ইনসার্টের পর কাউন্টার ≥ সর্বোচ্চ সিরিয়াল করতে হবে।
- `assign_serial`: `serial_no` উপেক্ষা; সার্ভার ক্রমানুসারে দেয়।
- প্রতিটি সারিতে ৩.৩ এর ভ্যালিডেশন; কোনো সারি অবৈধ হলে **পুরো ব্যাচ** `400` (`details.row_index`, `details.field`)। ইনসার্ট এক ট্রানজ্যাকশনে (all-or-nothing)। `failed` তাই সাধারণত খালি; রাখা হয়েছে ভবিষ্যতের আংশিক-সাফল্য মোডের জন্য।
- `*_photo_source` শুধু সংরক্ষণ; সার্ভার এই endpoint এ ছবি নামায় না।

### ৪.৯খ PUT `/api/housing/bulk` — সিরিয়াল ধরে বাল্ক আপডেট (এডমিন)
```json
// অনুরোধ
{
  "project_type": "semi_pucca",
  "rows": [
    { "serial_no": 1, "year": 2023, "name": "…", "father_or_husband_name": "…", "division": "…", "district": "…", "upazila": "…",
      "address": "…", "prev_photo_source": "https://…", "current_photo_source": null }
  ]
}
// উত্তর 200
{ "data": { "updated": 180, "missing": [205, 310] } }
```
নিয়ম: `rows` ১–৫০০; প্রতিটিতে `serial_no` আবশ্যক; অন্য ফিল্ড **ঐচ্ছিক — না দিলে (বা null) অপরিবর্তিত**, দিলে ৩.৩ এর ভ্যালিডেশন। (project_type, serial_no) মিললে আপডেট; না মিললে `missing` এ (এরর নয়, ইনসার্ট হয় না)। এক ট্রানজ্যাকশন। ফ্রন্টএন্ড ইম্পোর্ট উইজার্ড ২০০ করে পাঠায় এবং চাইলে `missing` গুলো `POST /bulk` (`use_given_serial`) দিয়ে যোগ করে। Supabase এ সমতুল্য RPC `housing_bulk_update_by_serial` (`supabase/sql/07_rpc_bulk.sql`)।

### ৪.৯গ একটিভিটি লগ (এডমিন)
সার্ভার **প্রতিটি লেখার কাজ নিজে লগ করবে** (create/update/delete/photo_update/serial_change), ক্লায়েন্টের উপর নির্ভর না করে — বদলানো ফিল্ডের আগে→পরে মানসহ। ক্লায়েন্ট শুধু ইভেন্ট পাঠায় (login/logout/import_run/photo_bulk_run)।

**GET `/api/housing/activity`** — query: `action`, `project_type`, `record_id`, `actor_email` (আংশিক), `from`/`to` (ISO), `page`, `page_size` (≤100)। নতুন আগে।
```json
{ "data": [ {
    "id": 1024, "at": "2026-09-30T05:06:22Z",
    "actor_id": "u_1", "actor_email": "admin@example.org",      // স্ক্রিপ্ট/সার্ভার-কাজ হলে "service_role"
    "action": "update",                                          // create|update|delete|photo_update|serial_change|login|logout|import_run|photo_bulk_run
    "project_type": "semi_pucca", "record_id": "3f2c…", "serial_no": 12, "record_name": "…",
    "details": { "changes": { "name": { "old": "…", "new": "…" }, "current_photo": { "old": false, "new": true } }, "photo_kinds": ["current"] }
} ], "meta": { "page": 1, "page_size": 50, "total": 1024, "total_pages": 21 } }
```
`create`/`delete` এ `details` = রেকর্ডের সারসংক্ষেপ (year, division, district, upazila, address, had_*_photo)। লগ কখনো সম্পাদনা/মোছা যায় না (append-only)।

**POST `/api/housing/activity`** — body `{ "action": "import_run", "project_type": "tin", "details": { "mode": "insert", "rows": 200, "inserted": 198, "failed": 2 } }` → `201 { "data": { "id": 1025 } }`। `action` `^[a-z_]{1,40}$`; actor সার্ভার JWT/সেশন থেকে নেয় (body তে নয়)।

### ৪.১০ POST `/api/housing/:id/photo` — ছবি আপলোড/প্রতিস্থাপন (এডমিন)
`multipart/form-data`:

| ফিল্ড | নিয়ম |
|---|---|
| `kind` | আবশ্যক, `prev` \| `current` |
| `photo` | আবশ্যক। ফ্রন্টএন্ড সবসময় `image/webp` পাঠায় (≤১৬০০px চওড়া, ~৮০%), ≤ ৫ MB। সার্ভার `image/jpeg`/`image/png` ও গ্রহণ করে WebP এ রূপান্তর করতে পারে (ঐচ্ছিক) |
| `thumb` | ঐচ্ছিক, `image/webp`, ৪০০px চওড়া, ≤ ৫০০ KB। ফ্রন্টএন্ড পাঠায়; না এলে সার্ভার নিজে তৈরি করবে (৪০০px, webp) |

সার্ভার: ফাইল ৩.২ এর পাথ নিয়মে রাখে (একই পাথে **ওভাররাইট**), রেকর্ডের `<kind>_photo_url`, `<kind>_thumb_url`, `photo_updated_at = now()` আপডেট করে। মাইগ্রেশন/বাল্ক টুল ব্রাউজারে একবারে ২টি এবং স্ক্রিপ্টে ৪টি সমান্তরাল অনুরোধ পাঠায়।
```json
// উত্তর 200
{ "data": { ...Beneficiary (আপডেটেড url ও photo_updated_at সহ) } }
```
এরর: ভুল টাইপ/kind → `400`; বড় ফাইল → `413`; রেকর্ড নেই → `404`।

### ৪.১১ DELETE `/api/housing/:id/photo?kind=prev|current` — (এডমিন)
ছবি ও থাম্বনেইল মুছে, `<kind>_photo_url`/`<kind>_thumb_url = null`, `photo_updated_at = now()`। → `200 { "data": Beneficiary }`। ছবি না থাকলেও `200` (idempotent)। রেকর্ড নেই → `404`।

---

## ৫. ছবির স্টোরেজ (সার্ভার-সাইড নোট)
- পাবলিক পড়া: ছবির URL টোকেন ছাড়া খোলা যাবে (স্ট্যাটিক ফাইল/CDN)।
- লেখা শুধু উপরের endpoint দিয়ে; ক্লায়েন্ট সরাসরি স্টোরেজে লেখে না।
- `Cache-Control: public, max-age=86400` বা বেশি চলবে, কারণ ফ্রন্টএন্ড `?v=` দিয়ে ক্যাশ ভাঙে।

---

## ৬. পরিবর্তন লগ
| তারিখ | সংস্করণ | পরিবর্তন |
|---|---|---|
| ২০২৬-০৯-২৯ | ০.১ | প্রাথমিক খসড়া |
| ২০২৬-০৯-২৯ | ০.২ | পাথ `/api/...` এ; ফিল্ড নাম DB টেবিলের সাথে মেলানো (name, father_or_husband_name, address, *_photo_url, *_thumb_url, *_photo_source, photo_updated_at); `years` endpoint; ছবি endpoint `/:id/photo` (থাম্বনেইলসহ); `page_size` ডিফল্ট ৫০; ভ্যালিডেশন টেবিল; bulk all-or-nothing |
| ২০২৬-০৯-২৯ | ০.৩ | `GET /api/housing/stats` উত্তরে `distinct` {divisions, districts, upazilas} যোগ (স্ট্যাট কার্ডের জন্য) |
| ২০২৬-০৯-২৯ | ০.৪ | টেক্সট NFC-নরমালাইজেশনের নিয়ম; ভৌগোলিক মানের উৎস (স্থির তালিকা) উল্লেখ |
| ২০২৬-০৯-২৯ | ০.৫ | ছবির পাথ নিয়ম `housing/{project_type}/{serial}/{kind}[_thumb].webp` (সব WebP, ওভাররাইট); `GET /:project_type/serials?nos=` endpoint; photo endpoint এ webp |
| ২০২৬-০৯-২৯ | ০.৬ | অথ: admins টেবিল ও role নিয়ম, সাইন-আপ নেই, ফ্রন্টএন্ডের JWT/কুকি আচরণ ও token কী |
| ২০২৬-০৯-২৯ | ০.৭ | এডমিন CRUD: create এ ঐচ্ছিক `serial_no`; `GET /next-serial`; `POST /:id/serial` (সিরিয়াল বদল + ছবি সরানো); list এ `serial_no` ফিল্টার |
| ২০২৬-০৯-২৯ | ০.৮ | `PUT /api/housing/bulk` — সিরিয়াল ধরে বাল্ক আপডেট (ইম্পোর্টের আপডেট মোড) |
| ২০২৬-০৯-৩০ | ০.৯ | একটিভিটি লগ: `GET/POST /api/housing/activity`; সার্ভার-সাইড লগিং বাধ্যতামূলক; `stats.by_location` (মানচিত্র) |
| ২০২৬-০৯-২৯ | ০.৮ (চূড়ান্ত পর্যালোচনা) | ফ্রন্টএন্ড ধাপ ০–১২ সম্পন্ন; এই চুক্তি ফ্রন্টএন্ডের REST অ্যাডাপ্টার (`rest/endpoints.ts`, `rest/http.ts`, `rest/authProvider.ts`) ও Supabase বাস্তবায়নের সাথে সঙ্গতিপূর্ণ। ধাপ ১৩ (সার্ভার) শুরুর আগে §৭ এর TBD গুলো ঠিক করতে হবে |

## ৭. খোলা প্রশ্ন (TBD)
1. JWT না কুকি সেশন; মেয়াদ ও রিফ্রেশ।
2. CORS origin তালিকা, rate limit।
3. `by_upazila` শুধু নামে গোনা (একই নামের উপজেলা ভিন্ন জেলায় একসাথে); `distinct.upazilas` সঠিক। `by_upazila` UI তে ব্যবহারের আগে সিদ্ধান্ত লাগবে।
