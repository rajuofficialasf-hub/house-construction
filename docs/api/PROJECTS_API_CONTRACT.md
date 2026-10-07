# As-Sunnah Foundation প্রকল্প-প্ল্যাটফর্ম — REST API চুক্তি

> এই চুক্তি `server/` এর Express সার্ভার যা দেয়, ঠিক তা-ই বলে। ফ্রন্টএন্ডের `rest` অ্যাডাপ্টার (`src/backend/rest/`, পাথগুলো `src/backend/rest/endpoints.ts` এ) এই চুক্তি মেনে কল করে।
> সংস্করণ: **২.০** — সর্বশেষ আপডেট: ২০২৬-১০-০৭
> কোড আর এই চুক্তি না মিললে কোডই মানদণ্ড; তখন চুক্তি শুধরে মেলাতে হয়। প্রতিটি রাউটের পুরো স্কিমা আছে `GET /api/v1/openapi.json` এ (§১.৫)। নতুন রাউট যোগ হলে এখানে তার লাইনও লাগে: `server/test/http/openapi.test.ts` দেখে নেয়, OpenAPI-র প্রতিটি পাথ এই ফাইলে আছে কি না।

---

## ১. সাধারণ নিয়ম

- **বেস URL:** ফ্রন্টএন্ডের `VITE_API_BASE_URL` (যেমন `https://api.example.org`)। সব পাথ `/api/v1/...` দিয়ে শুরু। এই চুক্তিতে পাথের প্যারামিটার OpenAPI-র মতো লেখা: `{key}`, `{id}`, `{field_key}`, `{n}`, `{slot}`।
- **ফরম্যাট:** JSON, `Content-Type: application/json; charset=utf-8`। ছবি ও কভার আপলোডে `multipart/form-data`।
- **এনকোডিং:** UTF-8 (বাংলা টেক্সট)। সংখ্যা JSON number, তারিখ-সময় ISO 8601 (`2026-09-29T10:15:00.000Z`)।
- **কে কী পারেন** (সব যাচাই সার্ভারে, ফ্রন্টএন্ডের উপর ভরসা নয়):
  - **দর্শক** (এডমিন সেশন নেই): সব পাবলিক GET। শুধু **প্রকাশিত** প্রকল্প (গ্রুপে থাকলে গ্রুপও প্রকাশিত), সেগুলোর রেকর্ড ও ছবি, আর শুধু **পাবলিক** ফিল্ড (§৫.২)।
  - **এডমিন** (`role` = `admin` বা `main_admin`): সব লেখা, খসড়া ও গোপন ফিল্ড পড়া, আর এডমিন-শুধু পড়া (একটিভিটি লগ, গোপন মান, ফিল্ডের ব্যবহার)।
  - **মূল এডমিন** (`role` = `main_admin`, একজনই): সব DELETE — রেকর্ড, রেকর্ডের ছবি, প্রকল্প, ফিল্ড, কভার। অন্য এডমিন DELETE করলে `403 FORBIDDEN`। বাকি সব লেখা যেকোনো এডমিন পারেন (§৫.৭)।
  - এডমিন-শুধু রাউটে সেশন না থাকলে `401 UNAUTHENTICATED`, body পড়া বা যাচাইয়ের আগেই।
- **রাউট ক্রম:** `/api/v1/projects/overview` মেলে `/api/v1/projects/{key}` এর আগে; `…/records/bulk`, `…/records/private`, `…/records/serial/{n}`, `…/records/serials` মেলে সাধারণ রেকর্ড-রাউটের আগে। `{id}` uuid না হলে `400`, তাই ভুল রাউটে গিয়ে চুপচাপ ভুল ডাটা আসে না।
- **Query প্যারামিটার:** অচেনা প্যারাম উপেক্ষিত। একই প্যারাম দুবার (`?year=2023&year=2024`) → `400`। পূর্ণসংখ্যা শুধু দশমিক অঙ্কে (`1e3`, `0x10`, `1.0`, ফাঁকা → `400`), সর্বোচ্চ 2147483647। টেক্সট ফিল্টার trim ও NFC করা হয়, ≤ ১০০ অক্ষর; ফাঁকা মান মানে না দেওয়া।
- **Body কঠোর:** অচেনা key থাকলে `400` (`details.reason: "unrecognized_keys"`)। PATCH এ ফাঁকা body `{}` → `400` (`reason: "empty"`)। সংখ্যা JSON number হতে হবে (`"2025"` → `400`)।
- **একসাথে এডিট:** প্রকল্প বদলে (`PATCH /api/v1/projects/{key}`) `If-Match` হেডার **ঐচ্ছিক**। দিলে তাতে প্রকল্পের `updated_at` (শেষবার যেমন পড়া হয়েছে, খালি বা `"…"` উদ্ধৃতিসহ) থাকে; সার্ভার **মিলিসেকেন্ড পর্যন্ত** তুলনা করে, না মিললে `409 CONFLICT`। মাইক্রোসেকেন্ডের সময় পাঠালে কখনো মিলবে না; JSON এ যা পড়া হয়েছে সেটাই পাঠান। অবৈধ তারিখ → `400` (`reason: "if_match"`)।

### ১.১ সফল উত্তর
```json
{ "data": <object | array>, "meta": { ...শুধু পেইজ করা তালিকায়... } }
```
`204 No Content` এ body নেই।

### ১.২ এরর উত্তর (সব এররে একই ফরম্যাট)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "মানুষের পড়ার মতো বাংলা বার্তা (ফ্রন্টএন্ড হুবহু দেখায়)",
    "details": { "field": "extra.amount", "reason": "invalid_type", "row_index": 3 }
  }
}
```
| HTTP | code | কখন |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ভুল বা অসম্পূর্ণ ইনপুট, বা ডাটাবেসের কোনো নিয়ম ভাঙা (§৫); ভাঙা JSON (`reason: "invalid_json"`) |
| 401 | `UNAUTHENTICATED` | সেশন নেই, অচেনা বা মেয়াদ শেষ; ভুল লগইন |
| 403 | `FORBIDDEN` | মূল এডমিনের কাজ অন্য এডমিন করছেন ("শুধু মূল এডমিন … মুছতে পারেন"), বা অনুমোদিত নয় এমন origin থেকে লেখা (§১.৩) |
| 404 | `NOT_FOUND` | প্রকল্প, ফিল্ড, রেকর্ড, ছবি বা রাউট নেই — **বা দর্শকের কাছে খসড়া** (খসড়া আর না-থাকা একই রকম দেখায়) |
| 409 | `CONFLICT` | একই প্রকল্পে একই `serial_no`; `key`, `slug` বা `file_prefix` আগে থেকেই আছে; `If-Match` মেলেনি |
| 413 | `PAYLOAD_TOO_LARGE` | body, ছবি বা বাল্কের সারি সীমা ছাড়ালে (§১.৪) |
| 429 | `RATE_LIMITED` | পড়া, লেখা, ছবি বা ব্যর্থ লগইনের সীমা পার (§১.৪); কিছুক্ষণ পরে আবার চেষ্টা |
| 500 | `INTERNAL_ERROR` | সার্ভারের ভুল; বার্তা সবসময় "সার্ভারে সমস্যা হয়েছে", ভেতরের বিবরণ কখনো নয় |
| 503 | `INTERNAL_ERROR` | শুধু `GET /api/v1/readyz`: ডাটাবেস পাওয়া যাচ্ছে না (§১.৫) |

**`details` এর নিয়ম:**
- `field`: ইনপুট যাচাইয়ে (zod) ভুল ঘরের পাথ, যেমন `name` বা `project.slug`। ডাটাবেসের নিয়মে `field` থাকে **শুধু তখনই, যখন সেটি ফিল্ড-key এর আকারে** — কলামের নাম (`union_name`, `slug`, `stat_cards`), `extra.<key>` বা `private.<key>`; ক্লায়েন্টের পাঠানো কোনো অচেনা key কখনো ফেরত আসে না।
- **দুই রকম ডুপ্লিকেট-key `409`** (প্রকল্পের `key` আর একই প্রকল্পে ফিল্ডের `key`) দুটোতেই `details.field = "key"`; বার্তা দেখে কোনটি তা বোঝা যায়। `slug` ও `file_prefix` এর `409` এ `field` সেই কলাম।
- `row_index`: বাল্ক body তে ব্যর্থ সারি (০ থেকে); তখন `field` সেই সারির ভেতরের ঘর (যেমন `row_index: 3`, `field: "year"`)।
- `reason`: যাচাইয়ের কারণ (`required`, `too_big`, `invalid_type`, `unrecognized_keys`, `duplicate`, `empty`, `group`, `photo_mode`, `constraint` …)।

**বার্তার নিয়ম:** ডাটাবেসের নিয়ম-ভাঙার বার্তায় থাকে শুধু নির্দিষ্ট লেখা, প্রকল্প বা ফিল্ডের বাংলা লেবেল, ফিল্ড-key, এডমিনের ঠিক করা সীমা (যেমন সর্বোচ্চ অক্ষর), আর ডাটাবেস নিজে গুনে বের করা সংখ্যা (যেমন "১২ টি রেকর্ডে আগের ছবি আছে")। ক্লায়েন্টের পাঠানো কোনো মান, টেবিল বা constraint এর নাম বার্তায় আসে না। অন্য constraint ভাঙলে সাধারণ `400` ("ইনপুট সঠিক নয়", `reason: "constraint"`)।

ফ্রন্টএন্ড এই code গুলোই `HousingApiError.code` হিসেবে ব্যবহার করে (`src/backend/interfaces/types.ts`)।

### ১.৩ CORS ও Origin যাচাই
- **দুটি origin তালিকা,** দুটোই হুবহু মিলিয়ে (`*` কখনো নয়); একটি origin একটিই তালিকায় থাকে:
  - `ALLOWED_ORIGINS` (এই সাইট): সব রাউটে CORS, credentials সহ; মেথড GET, POST, PUT, PATCH, DELETE।
  - `PUBLIC_READ_ORIGINS` (অন্য অ্যাপ): শুধু পাবলিক পড়ায় GET/HEAD (ও তার preflight), credentials ছাড়া। পাবলিক পড়া মানে: `/api/v1/projects`, `/api/v1/projects/{key}` (`/api/v1/projects/overview` সহ), `…/fields`, `…/records`, `…/records/serial/{n}`, `…/records/serials`, `…/years`, `…/stats`, `…/next-serial`, `/api/v1/records/{id}`, `/api/v1/photos/{id}` আর `/api/v1/openapi.json`। একটিভিটি লগ, গোপন মান, ফিল্ডের ব্যবহার, `/api/v1/auth/*` আর সব লেখা এই তালিকার বাইরে — সেখানে কোনো CORS উত্তর নেই।
- প্রতিটি উত্তরে `Vary: Origin`, CORS না দিলেও।
- **Origin যাচাই (CSRF):** POST/PUT/PATCH/DELETE এ `Origin` হেডার না থাকলে বা `ALLOWED_ORIGINS` এ না থাকলে `403 FORBIDDEN` ("এই উৎস থেকে অনুরোধ গ্রহণযোগ্য নয়"), body পড়ার আগে, লগইন-লগআউটেও। ব্রাউজার হেডারটি নিজেই পাঠায়; ব্রাউজার ছাড়া অন্য ক্লায়েন্ট (যেমন চুক্তি-টেস্ট) নিজে দেয়।

### ১.৪ রেট লিমিট ও বডির সীমা
- **পড়া:** প্রতি IP মিনিটে ৩০০টি (`READ_RATE_LIMIT` দিয়ে বদলানো যায়)। প্রকল্পের পড়া, রেকর্ডের পড়া, একটিভিটি লগ পড়া আর ফিল্ডের ব্যবহার — প্রতিটি দলের আলাদা গণনা।
- **ছবি** (`GET /api/v1/photos/{id}`): প্রতি IP মিনিটে ১২০০টি।
- **লেখা:** প্রতি এডমিন মিনিটে ১২০টি (POST/PUT/PATCH/DELETE, ছবি ও `POST /api/v1/activity` সহ; একটি বাল্ক অনুরোধ একটি লেখা)।
- **লগইন:** প্রতি IP ১৫ মিনিটে ১০টি **ব্যর্থ** চেষ্টা; তারপর সঠিক পাসওয়ার্ডেও `429`।
- সীমা পার হলে `429 RATE_LIMITED`; উত্তরে `RateLimit` ও `RateLimit-Policy` হেডার (IETF draft-8)। গণনা সার্ভারের মেমোরিতে, তাই এক প্রসেসে চললে সঠিক।
- **JSON body:** সর্বোচ্চ ১০০ KB; বেশি হলে `413`। ব্যতিক্রম বাল্ক (`POST`/`PUT /api/v1/projects/{key}/records/bulk`): ১০ MB, আর সেটা পড়া হয় এডমিন যাচাইয়ের **পরে**, তাই শুধু এডমিনই সার্ভারকে বড় body পড়াতে পারেন।
- **ছবি ও কভার (multipart):** `photo` ≤ ৫ MB, `thumb` ≤ ৫০০ KB, ছবি ≤ ৪ কোটি পিক্সেল; সার্ভার একসাথে ২টি আপলোড প্রক্রিয়া করে, বাকিগুলো অপেক্ষা করে।

### ১.৫ ক্যাশ, health ও OpenAPI
- **ক্যাশ:**
  - প্রকল্প ও রেকর্ডের পাবলিক পড়া: উত্তরে `Vary: Cookie`; দর্শকের উত্তরে কোনো `Cache-Control` নেই, এডমিনের উত্তরে `Cache-Control: private, no-store`।
  - গোপন মান, একটিভিটি লগ আর ফিল্ডের ব্যবহার: সবসময় `private, no-store` (প্রত্যাখ্যানেও)। `/api/v1/auth/*`: `no-store`।
  - ছবি: §৬।
- **GET `/healthz`** (পুরো পাথ `/api/v1/healthz`) — পাবলিক; প্রসেস চলছে কি না → `200 { "data": { "status": "ok" } }`।
- **GET `/readyz`** (`/api/v1/readyz`) — পাবলিক; ডাটাবেস সাড়া দিলে `200 { "data": { "status": "ok" } }`, না দিলে `503` (`INTERNAL_ERROR`, "সার্ভিস এখন পাওয়া যাচ্ছে না")। কারণ কখনো বলে না।
- **GET `/openapi.json`** (`/api/v1/openapi.json`) — পাবলিক; সার্ভারের zod স্কিমা থেকে বানানো OpenAPI 3.1 বিবরণ: এই চুক্তির §৪ ও §৬ এর সব রাউট, health আর এটি নিজে। এডমিন-শুধু রাউট `adminSession` (কুকি) দিয়ে চিহ্নিত। লগইন রাউট (`/api/v1/auth/*`) এতে নেই; সেগুলো §২ এ।
- প্রতিটি উত্তরে `x-request-id` হেডার (সার্ভারের লগে একই id)।

---

## ২. অথেন্টিকেশন

- **ধরন: HttpOnly কুকি সেশন।** লগইনে সার্ভার একটি এলোমেলো টোকেন কুকিতে দেয়, ডাটাবেসে রাখে শুধু তার SHA-256। উত্তরে কোনো টোকেন থাকে না; ফ্রন্টএন্ড `credentials: 'include'` দিয়ে কল করে, JS কুকি পড়তে পারে না।
- **কুকি:** `__Host-housing_session; HttpOnly; Secure; SameSite=Lax; Path=/`। শুধু http-তে চলা লোকাল ডেভেলপমেন্টে (`COOKIE_SECURE=false`) নাম `housing_session`, `Secure` ছাড়া।
- **মেয়াদ:** ৮ ঘণ্টা কোনো অনুরোধ না এলে সেশন শেষ; সক্রিয় থাকলেও লগইনের ৭ দিন পরে শেষ। রিফ্রেশ নেই; মেয়াদ শেষে `401` → ফ্রন্টএন্ড লগইন পেইজে পাঠায়।
- **এডমিন তালিকা:** সার্ভারের `housing_admins` টেবিল (`id` uuid, `email`, `name`, `role`, পাসওয়ার্ড হ্যাশ, `disabled_at`)। শুধু এডমিনরাই অ্যাকাউন্ট পান, তাই আলাদা "এডমিন নয়" অবস্থা নেই; নিষ্ক্রিয় এডমিনের লগইনও সাধারণ `401`।
- **ভূমিকা দুটি:** `admin` আর `main_admin` (মূল এডমিন, **একজনই** — ডাটাবেসে unique)। ভূমিকা প্রতিটি অনুরোধে সেশনের সাথে পড়া হয়, তাই বদলালে নতুন লগইন লাগে না। কে কী পারেন: §১, §৫.৭।
- **সাইন-আপ নেই:** কোনো register endpoint নেই। এডমিন তৈরি, ভূমিকা বদল, নতুন পাসওয়ার্ড, নিষ্ক্রিয়/সক্রিয় করা শুধু সার্ভারের CLI দিয়ে (§৪.৬)। পাসওয়ার্ড বদলালে বা নিষ্ক্রিয় করলে সেই এডমিনের সব সেশন শেষ হয়।
- **পাসওয়ার্ড:** CLI ১২–২০০ অক্ষর নেয়, হ্যাশ শুধু argon2id। অন্য কোনো ধরনের হ্যাশ থাকলে লগইন ভুল পাসওয়ার্ডের মতোই প্রত্যাখ্যাত হয়, সমান সময় নিয়ে।
- লগইন ও লগআউট সার্ভার নিজেই একটিভিটি লগে লেখে (`login`, `logout`)।
- **ফ্রন্টএন্ড আচরণ** (`src/backend/rest/authProvider.ts`): টোকেন কোথাও রাখে না; অ্যাপ লোডে `GET /api/v1/auth/me` দিয়ে সেশন যাচাই; `401` → লগইন পেইজ; অন্য ট্যাবের লগইন/লগআউট `BroadcastChannel` দিয়ে জানে।

### POST `/api/v1/auth/login` — পাবলিক
```json
// অনুরোধ
{ "email": "admin@example.org", "password": "********" }
// উত্তর 200 (সাথে Set-Cookie)
{ "data": {
    "expires_at": "2026-10-14T10:15:00.000Z",   // লগইনের ৭ দিন পরে, সর্বোচ্চ মেয়াদ
    "user": { "id": "uuid", "email": "admin@example.org", "name": "এডমিন", "role": "main_admin" }
} }
```
- যাচাই: `email` বৈধ ইমেইল (বড়-ছোট হাতের অক্ষর ও আশেপাশের ফাঁকা উপেক্ষিত), `password` ১–২০০ অক্ষর; না মিললে `400 VALIDATION_ERROR`।
- অচেনা ইমেইল, ভুল পাসওয়ার্ড বা নিষ্ক্রিয় এডমিন: সবক্ষেত্রে একই `401 UNAUTHENTICATED` ("ইমেইল বা পাসওয়ার্ড সঠিক নয়") আর প্রায় একই সময়ে উত্তর, তাই কোনটি ভুল বোঝা যায় না। বারবার ব্যর্থ হলে `429` (§১.৪)।

### POST `/api/v1/auth/logout`
সেশন থাকলে ডাটাবেস থেকে মুছে একটিভিটি লগে `logout` লেখে, কুকি মুছে দেয় → `204`। সেশন না থাকলে বা মেয়াদ শেষ হলেও `204`, যাতে পুরনো ট্যাবও লগআউট করতে পারে।

### GET `/api/v1/auth/me` — এডমিন
```json
{ "data": { "id": "uuid", "email": "admin@example.org", "name": "এডমিন", "role": "admin" } }
```
সেশন নেই, অচেনা, মেয়াদ শেষ বা এডমিন নিষ্ক্রিয় → `401`।

---

## ৩. ডাটা মডেল

ফিল্ডের নাম ডাটাবেস টেবিলের সাথে হুবহু (`server/db/migrations/0001_housing_schema.sql`, `0011_projects_registry.sql`) আর ফ্রন্টএন্ডের টাইপের সাথেও (`src/backend/interfaces/types.ts`)।

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
  "display": { "show_map": true, "geo_columns": "split" },   // geo_columns: split | merged; breakdown_field নেওয়া হয়, ব্যবহার হয় না
  "file_prefix": "sr",               // ^[a-z][a-z0-9]{0,15}$, unique; একক প্রকল্পে আবশ্যক, গ্রুপে null — ছবির ফাইলনামের শুরু (sr_0012.jpg)
  "icon": "hands-heart", "accent": "brand",   // ^[a-z0-9-]{1,40}$, ফ্রন্টএন্ডের নির্দিষ্ট তালিকার key (কাঁচা CSS নয়)
  "cover_path": null,                // কভারের URL: "https://api.example.org/api/v1/photos/<fileId>"; শুধু কভার-রাউট বসায় (§৪.১.৮)
  "sort_order": 30, "is_published": false, "show_on_home": true,
  "created_at": "…", "updated_at": "…",
  "fields": [ ProjectField, … ]      // GET /projects/{key} এ সবসময়, তালিকায় ?include=fields হলে; দর্শক পান শুধু পাবলিক
}
```
- **সিস্টেম ফিল্ড** (রেকর্ডের নিজস্ব কলাম): `year`, `name`, `division`, `district`, `upazila` **সবসময় চালু ও আবশ্যক** (শুধু লেবেল বদলায়: `core_fields.<k>.label_bn/en`, ≤ ৬০); `father_or_husband_name`, `address`, `union_name` ঐচ্ছিক — `core_fields.<k>.required: true` হলে আবশ্যক, `enabled: false` হলে ফর্মে লুকানো। `core_fields` এ শুধু এই আটটি key, প্রতিটিতে শুধু `label_bn`, `label_en`, `enabled`, `required`।
- **stat_cards** (সর্বোচ্চ ৮টি; `home: true` সর্বোচ্চ ৩টি — হোম কার্ডে দেখায়; ঐচ্ছিক `home_label_bn/en` = হোমে আলাদা লেবেল)। `kind`: `count` (মোট রেকর্ড), `geo` (`level`: division/district/upazila/union — কভার সংখ্যা), `sum` (`field`: টাকা/সংখ্যা ফিল্ডের যোগফল), `distinct` (`field`: ক্যাটাগরির ভিন্ন মানের সংখ্যা); `format`: `money` | `number`। সংখ্যা আসে স্ট্যাট থেকে (§৩.৬); কার্ড শুধু উপস্থাপনা।
- প্রকল্প-ভিত্তিক লেখা (নাম, বর্ণনা, লেবেল, একক) ফ্রন্টএন্ড `pick(bn, en)` দিয়ে দেখায়: ইংরেজি মোডে `*_en` খালি না থাকলে সেটি, নইলে বাংলা।

### ৩.২ ProjectField (এডমিনের বানানো ফিল্ড)
```json
{
  "id": "uuid", "project_key": "self_reliance",
  "key": "amount",                   // ^[a-z][a-z0-9_]{0,39}$, প্রকল্পে অনন্য; সংরক্ষিত নাম নিষেধ (§৫.৫)
  "label_bn": "টাকা", "label_en": "Amount", "help_bn": "", "help_en": "",   // label_bn ১–১২০, label_en ≤ ১২০, help ≤ ৩০০
  "type": "money",                   // §৩.৩
  "options": [],                     // ≤ ১০০টি লেখা; এখন ব্যবহার নেই
  "required": true,
  "visibility": "public",            // public | admin (গোপন — মান আলাদা, §৩.৫)
  "show_in_table": true, "show_in_card": false, "show_in_detail": true,
  "filterable": false, "searchable": false, "fill_down": false,
  "max_length": null, "min_value": null, "max_value": null,   // max_length ১–২০০০; min ≤ max
  "import_aliases": ["পরিমাণ"],      // শীটের কলাম-শিরোনামের বিকল্প নাম, ≤ ২০টি
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
| `number` | number | ≤ ২ ঘর দশমিক; `min_value`/`max_value` |
| `money` | number | **পূর্ণসংখ্যা**, ০ থেকে ১০০০ কোটি (1e10); `min_value`/`max_value`। (ফর্ম ও ইম্পোর্ট বাংলা অঙ্ক, কমা, ৳, টাকা, Tk, /- মুছে সংখ্যা বানিয়ে পাঠায়) |
| `category` | string | trim + NFC + একাধিক ফাঁকা → একটি; ≤ `max_length` (ডিফল্ট ১০০)। কোনো অপশন-তালিকা নেই — শীটে বা ফর্মে লেখা মানটিই |
| `date` | string | `YYYY-MM-DD`, বৈধ তারিখ |
| `phone` | string | বাংলা অঙ্ক → ইংরেজি, তারপর `^[0-9+\- ]{6,20}$`; সবসময় গোপন |

খালি লেখা (`""`, শুধু ফাঁকা) বা `null` = মান নেই (সংরক্ষিত হয় না)। ভুল হলে `400` (`details.field = "extra.<key>"` বা `"private.<key>"`, বার্তায় ফিল্ডের বাংলা লেবেল)।

### ৩.৪ Record (রেকর্ড / উপকারভোগী)
```json
{
  "id": "3f2c…",                         // uuid
  "project_type": "semi_pucca",          // প্রকল্পের key; অপরিবর্তনীয়
  "serial_no": 1,                        // প্রতি প্রকল্পে ১ থেকে; সার্ভার বরাদ্দ করে; পুনঃব্যবহার হয় না
  "year": 2024,
  "name": "মোছাঃ রহিমা খাতুন",
  "father_or_husband_name": "মৃত আব্দুল করিম",   // "" = নেই
  "division": "রংপুর", "district": "কুড়িগ্রাম", "upazila": "উলিপুর",
  "union_name": "দলদলিয়া",             // "" = নেই (ইউনিয়ন বা পৌরসভা)
  "address": "গ্রাম: দলদলিয়া, ডাকঘর: উলিপুর",   // "" = নেই
  "extra": { "amount": 25000, "category": "গরু", "item_name": "দুগ্ধবতী গাভী" },   // শুধু পাবলিক কাস্টম ফিল্ড
  "prev_photo_url": "https://api.example.org/api/v1/photos/6f1c…",    // null হতে পারে
  "prev_thumb_url": "https://api.example.org/api/v1/photos/9a2d…",
  "current_photo_url": "https://api.example.org/api/v1/photos/b7e0…",
  "current_thumb_url": "https://api.example.org/api/v1/photos/c31f…",
  "prev_photo_source": "https://…sharepoint…",   // শীটের মূল লিংক; শুধু রেফারেন্স
  "current_photo_source": null,
  "photo_updated_at": "2026-09-29T10:15:00.000Z",     // ছবি বদলালে বা মুছলে; null হতে পারে
  "created_at": "…", "updated_at": "…"
}
```
- `extra` এ কখনো গোপন ফিল্ডের মান থাকে না (§৩.৫)। দর্শকের কাছে `extra` তে আসে শুধু প্রকল্পের পাবলিক ফিল্ডের key (আর্কাইভ করাগুলোও); এডমিন পান যেমন সংরক্ষিত। আকার < ১৬ KB।
- **ছবির URL:** `{PUBLIC_API_URL}/api/v1/photos/{fileId}` — ছবি সবসময় API দিয়ে আসে (§৬), স্টোরেজের URL বা কী কখনো নয়। প্রতিটি আপলোডে নতুন file id, তাই ছবি বদলালে URL-ই বদলায়; একটি URL এর ছবি কখনো বদলায় না। ফ্রন্টএন্ড `?v=<photo_updated_at>` যোগ করলেও ক্ষতি নেই।
- **স্টোরেজ:** সার্ভার কী বানায় `housing/{uuid}.webp` (পূর্ণ ছবি ও থাম্ব আলাদা ফাইল), সিরিয়াল বা ফাইলের নাম থেকে নয়। প্রতিটি ফাইলের সারি `housing_files` টেবিলে (কী, ড্রাইভার `nas`/`s3`, রেকর্ড বা কভারের প্রকল্প, kind)। **সিরিয়াল বদলালে কোনো ফাইল সরে না, URL ও বদলায় না।**

### ৩.৫ গোপন মান (Private)
গোপন ফিল্ডের (`visibility = admin`, যেমন মোবাইল, NID) মান রেকর্ডে নয়, আলাদা টেবিলে: `housing_beneficiary_private (record_id, data)`, যেমন `{ "phone": "01711987654" }`; রেকর্ড মুছলে সাথে মোছে। শুধু এডমিন পড়েন ও লেখেন (§৪.৪.৮)। তালিকা, স্ট্যাট, সার্চ, ওভারভিউ বা লগে **মান কখনো যায় না** (লগে শুধু ফিল্ডের নাম, §৪.৫)।

### ৩.৬ ProjectStats (পরিসংখ্যান)
```json
{
  "total": 1500,
  "by_year":     { "2023": 400, "2024": 700 },
  "by_division": { "ঢাকা": 300 },
  "by_district": { "কুড়িগ্রাম": 120 },
  "by_upazila":  { "উলিপুর": 40 },
  "by_location": { "কুড়িগ্রাম|উলিপুর": 40 },                    // মানচিত্র: "জেলা|উপজেলা"
  "by_union":    { "কুড়িগ্রাম|উলিপুর|দলদলিয়া": 12 },            // "জেলা|উপজেলা|ইউনিয়ন"; light হলে {}
  "by_project":  { "semi_pucca": 1200, "tin": 300 },               // গণনার প্রতিটি একক প্রকল্প, খালিটিও ০ সহ
  "distinct":    { "divisions": 8, "districts": 45, "upazilas": 120, "unions": 300 },
  "fields": {
    "amount":   { "type": "money", "sum": 37500000, "count": 1500 },
    "category": { "type": "category", "distinct": 12,
                  "by_value": { "গরু": { "n": 600, "sums": { "amount": 18000000 } } } }   // light হলে by_value নেই
  }
}
```
- উত্তরে সবসময় এই সব key থাকে (`filtered` ছাড়া — সেটি শুধু ফিল্টারসহ উত্তরে, §৪.৩)।
- শুধু রেকর্ড আছে এমন মান থেকে গোনা (স্থির তালিকার মোট নয়)। `distinct.upazilas` = ভিন্ন **(জেলা, উপজেলা)** জোড়া, `unions` = ভিন্ন (জেলা, উপজেলা, ইউনিয়ন) — একই নাম ভিন্ন জায়গায় আলাদা গোনা। `by_upazila` শুধু নামে গোনা (§১০)।
- `fields` এ শুধু **পাবলিক ও সক্রিয়** money/number/category ফিল্ড; গোপন বা আর্কাইভ ফিল্ড কখনো নয়। যোগফলে শুধু JSON number মান আসে।
- গ্রুপের key দিলে উপ-প্রকল্পগুলো মিলিয়ে। দর্শকের জন্য গোনা হয় শুধু প্রকাশিত উপ-প্রকল্প, তাই খসড়া উপ-প্রকল্পের রেকর্ড বা ফিল্ড কোথাও আসে না।

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
      "without_photo": null          // শুধু এডমিনের drafts=1 কলে: বর্তমান ছবি নেই এমন রেকর্ডের সংখ্যা; বাকিদের null
  } ],
  "global": { "projects": 2, "total": 10, "districts": 1 }   // শুধু প্রকাশিত একক/উপ-প্রকল্প থেকে (গ্রুপ বাদ), drafts=1 এও
}
```

---

## ৪. Endpoint

অনুমতি: **পাবলিক** = দর্শকসহ সবাই (দর্শক দেখেন §৫.২ অনুযায়ী); **এডমিন** = যেকোনো এডমিন; **মূল এডমিন** = শুধু `main_admin`।

| মেথড | পাথ | অনুমতি | ফ্রন্টএন্ড মেথড |
|---|---|---|---|
| GET | `/api/v1/healthz`, `/api/v1/readyz` | পাবলিক | — (§১.৫) |
| GET | `/api/v1/openapi.json` | পাবলিক | — (§১.৫) |
| POST | `/api/v1/auth/login`, `/api/v1/auth/logout` | পাবলিক | `AuthProvider` (§২) |
| GET | `/api/v1/auth/me` | এডমিন | `AuthProvider` (§২) |
| GET | `/api/v1/projects` (`?include=fields&drafts=1`) | পাবলিক | `ProjectsApi.list` |
| GET | `/api/v1/projects/overview` (`?drafts=1`) | পাবলিক | `ProjectsApi.overview` |
| GET | `/api/v1/projects/{key}` | পাবলিক | `ProjectsApi.get` |
| POST | `/api/v1/projects` | এডমিন | `ProjectsApi.create` |
| PATCH | `/api/v1/projects/{key}` (`If-Match`) | এডমিন | `ProjectsApi.update` |
| DELETE | `/api/v1/projects/{key}` | **মূল এডমিন** | `ProjectsApi.delete` |
| PUT | `/api/v1/projects/order` | এডমিন | `ProjectsApi.reorder` |
| PUT | `/api/v1/projects/{key}/cover` | এডমিন | `ProjectsApi.uploadCover` |
| DELETE | `/api/v1/projects/{key}/cover` | **মূল এডমিন** | `ProjectsApi.deleteCover` |
| GET | `/api/v1/projects/{key}/fields` | পাবলিক | (`list` এর ভেতরে) |
| POST | `/api/v1/projects/{key}/fields` | এডমিন | `ProjectsApi.createField` |
| PATCH | `/api/v1/fields/{id}` | এডমিন | `ProjectsApi.updateField` |
| DELETE | `/api/v1/fields/{id}` | **মূল এডমিন** | `ProjectsApi.deleteField` |
| PUT | `/api/v1/projects/{key}/fields/order` | এডমিন | `ProjectsApi.reorderFields` |
| GET | `/api/v1/projects/{key}/fields/{field_key}/usage` | এডমিন | `ProjectsApi.fieldUsage` |
| POST | `/api/v1/projects/{key}/fields/{field_key}/rename-value` | এডমিন | `ProjectsApi.renameFieldValue` |
| GET | `/api/v1/projects/{key}/stats` (`?light=1`, তালিকার ফিল্টার) | পাবলিক | `HousingApi.stats` |
| GET | `/api/v1/projects/{key}/years` | পাবলিক | `HousingApi.years` |
| GET | `/api/v1/projects/{key}/next-serial` | পাবলিক | `HousingApi.nextSerial` |
| GET | `/api/v1/projects/{key}/records` | পাবলিক | `HousingApi.list` |
| POST | `/api/v1/projects/{key}/records` | এডমিন | `HousingApi.create` |
| POST | `/api/v1/projects/{key}/records/bulk` | এডমিন | `HousingApi.bulkInsert` |
| PUT | `/api/v1/projects/{key}/records/bulk` | এডমিন | `HousingApi.bulkUpdateBySerial` |
| GET | `/api/v1/projects/{key}/records/serial/{n}` | পাবলিক | `HousingApi.getBySerial` |
| GET | `/api/v1/projects/{key}/records/serials` (`?nos=1,2,3`) | পাবলিক | `HousingApi.getBySerials` |
| POST | `/api/v1/projects/{key}/records/private` | এডমিন | `HousingApi.getPrivateMany` |
| GET | `/api/v1/records/{id}` | পাবলিক | `HousingApi.getById` |
| PATCH | `/api/v1/records/{id}` | এডমিন | `HousingApi.update` |
| DELETE | `/api/v1/records/{id}` | **মূল এডমিন** | `HousingApi.delete` |
| GET / PUT | `/api/v1/records/{id}/private` | এডমিন | `HousingApi.getPrivate` / `setPrivate` |
| POST | `/api/v1/records/{id}/serial` | এডমিন | `HousingApi.changeSerial` |
| PUT | `/api/v1/records/{id}/photos/{slot}` | এডমিন | `HousingApi.uploadPhoto` |
| DELETE | `/api/v1/records/{id}/photos/{slot}` | **মূল এডমিন** | `HousingApi.deletePhoto` |
| GET / POST | `/api/v1/activity` | এডমিন | `HousingApi.listActivity` / `logActivity` |
| GET | `/api/v1/photos/{id}` | পাবলিক | (রেকর্ডের ছবি ও কভারের URL, §৬) |

### ৪.১ প্রকল্প

#### ৪.১.১ GET `/api/v1/projects?include=fields&drafts=1`
→ `{ "data": [Project, …] }`, `sort_order` তারপর `key` ক্রমে, সর্বোচ্চ ২০০টি। `include=fields` দিলে প্রতিটিতে `fields` (`sort_order` ক্রমে, আর্কাইভসহ)। দর্শক: শুধু প্রকাশিত প্রকল্প (গ্রুপও প্রকাশিত) আর শুধু পাবলিক ফিল্ড; `drafts=1` উপেক্ষিত। এডমিন: `drafts=1` দিলে খসড়াও; গোপন ফিল্ড সবসময়। `include` শুধু `fields`, `drafts` শুধু `1` নেয় (অন্য মান → `400`)।

#### ৪.১.২ GET `/api/v1/projects/overview?drafts=1`
→ `{ "data": ProjectOverview }` (§৩.৭)। প্রকল্প যতগুলোই থাক, হোম পেইজ **এই একটি কল** (আর রেজিস্ট্রি) করে। প্রতিটি প্রকল্পের `stats` হালকা (light)। `featured`: প্রকল্পের (গ্রুপে উপ-প্রকল্পগুলোর) যে রেকর্ডে থাম্বনেইল আছে তার মধ্যে সবচেয়ে নতুনটি (`created_at`, তারপর `serial_no` বড় থেকে); `thumb_url` = বর্তমান ছবির থাম্ব, না থাকলে আগের ছবির; এমন রেকর্ড না থাকলে `null`।
- `drafts=1` কাজ করে শুধু এডমিনের জন্য: খসড়াও আসে, খসড়া উপ-প্রকল্পও গোনা হয়, আর `without_photo` ভরা থাকে।
- **এডমিন `drafts=1` না দিলে উত্তর হুবহু দর্শকের মতো।**

#### ৪.১.৩ GET `/api/v1/projects/{key}`
→ `{ "data": Project (fields সহ) }`; নেই বা দর্শকের কাছে খসড়া → `404`।

#### ৪.১.৪ POST `/api/v1/projects` — প্রকল্প তৈরি (এডমিন)
```json
// অনুরোধ
{ "project": { "key": "self_reliance", "slug": "self-reliance", "name_bn": "স্বাবলম্বী প্রকল্প", "name_en": "Self-reliance Project",
               "photo_mode": "after_only", "geo_depth": "union", "file_prefix": "sr", "stat_cards": [ … ] },
  "fields": [ { "key": "amount", "label_bn": "টাকা", "label_en": "Amount", "type": "money", "required": true },
              { "key": "category", "label_bn": "ক্যাটাগরি", "label_en": "Category", "type": "category", "filterable": true } ] }
// উত্তর 201
{ "data": Project (fields সহ, "is_published": false) }
```
- `project` এ আবশ্যক `key`, `slug`, `name_bn`, `name_en`; একক প্রকল্পে `file_prefix` আবশ্যক, গ্রুপে (`is_group: true`) নিষেধ। `fields` ≤ ৪০টি, প্রতিটিতে `key`, `label_bn`, `type` আবশ্যক। ভুল ঘর `details.field` এ `project.<ঘর>` বা `fields.<i>.<ঘর>`।
- `cover_path` এই body তে নেওয়া হয় না (`400`) — কভার শুধু §৪.১.৮ দিয়ে।
- প্রকল্প ও সব ফিল্ড **এক ট্রানজ্যাকশনে** — একটি ভুল হলে কিছুই তৈরি হয় না।
- **সবসময় খসড়া** (`is_published` পাঠালেও উপেক্ষিত); প্রকাশ আলাদা `PATCH` এ।
- ডিফল্ট: `photo_mode` after_only, `geo_depth` upazila, `unit` উপকারভোগী/beneficiaries, `icon` hands-heart, `accent` brand, `sort_order` = সর্বোচ্চ + ১০, `show_on_home` true; ফিল্ডে `visibility` public, `show_in_detail` true, বাকি `show_in_*`/`filterable`/`searchable`/`fill_down` false, `sort_order` = ক্রম × ১০।
- একক বা উপ-প্রকল্প তৈরির সাথে সাথে তার **সিরিয়াল-কাউন্টার** (০) তৈরি হয়।
- `key` আগে থেকে থাকলে `409` (`details.field = "key"`); `slug` বা `file_prefix` থাকলে `409` সেই ঘরসহ।

#### ৪.১.৫ PATCH `/api/v1/projects/{key}` — বদল (এডমিন)
- body: §৩.১ এর যেকোনো অ-ফাঁকা উপসেট, **এগুলো ছাড়া**: `key`, `cover_path`, `fields`, `created_at`, `updated_at` (পাঠালে `400`)।
- **প্রকাশ বা অপ্রকাশ:** `{ "is_published": true }` / `{ "is_published": false }` — আলাদা কোনো publish রাউট নেই।
- হেডার `If-Match: <updated_at>` ঐচ্ছিক; থাকলে মিলিসেকেন্ড পর্যন্ত তুলনা, না মিললে `409 CONFLICT` ("অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন") (§১)।
- → `200 { "data": Project (fields সহ) }`; নেই → `404`। নিয়ম §৫.৫।

#### ৪.১.৬ DELETE `/api/v1/projects/{key}` — (মূল এডমিন)
- → `204`; নেই → `404`।
- আটকায় (`400`, বার্তায় প্রকল্পের নাম): রেকর্ড আছে; আগে কখনো রেকর্ড ছিল (কাউন্টার > ০); গ্রুপে উপ-প্রকল্প আছে। দরকার হলে অপ্রকাশিত করুন।
- **মোছা গেলে প্রকল্পের ফিল্ডগুলোও মুছে যায়** (রেকর্ড নেই, তাই কোনো ফিল্ডে মান নেই), আর কভারের ফাইলও।
- কাউন্টার কখনো মোছে না — একই key আবার তৈরি হলেও সিরিয়াল পুনঃব্যবহার হয় না।

#### ৪.১.৭ PUT `/api/v1/projects/order`
body `{ "keys": ["housing", "self_reliance", "skill"] }` (১–২০০টি) → সেই ক্রমে `sort_order` ১০, ২০, … । অচেনা key উপেক্ষিত; ক্রম বদল লগ হয় না। → `204`।

#### ৪.১.৮ PUT / DELETE `/api/v1/projects/{key}/cover`
- **PUT** (যেকোনো এডমিন; থাকা কভার বদলানোও): `multipart/form-data`, ফাইল-ঘর `photo` (আর ঐচ্ছিক `thumb`), রেকর্ডের ছবির মতো একই নিয়মে (§৪.৪.১০): JPEG, PNG বা WebP, ≤ ৫ MB; সার্ভার নতুন করে WebP বানায়, মেটাডাটা বাদ দেয়।
  - প্রকল্প আছে কি না দেখা হয় body পড়ার **আগে**; নেই → `404`, কিছুই রাখা হয় না।
  - নতুন ফাইল রাখে, `cover_path` = তার URL (`{PUBLIC_API_URL}/api/v1/photos/{fileId}`), পুরনো কভারের ফাইল কমিটের পরে মোছে। `updated_at` বদলায়, লগে `project_update`। → `200 { "data": Project }`।
  - ছবি নয় বা নষ্ট → `400`; বড় → `413`।
- **DELETE** (মূল এডমিন; অন্যরা `403` — "শুধু মূল এডমিন কভার ছবি মুছতে পারেন"): ফাইল ও `cover_path` মোছে → `200 { "data": Project }`। কভার না থাকলেও `200`, কিছু বদলায় না, লগও হয় না।
- `cover_path` শুধু এই দুই রাউট বসায় বা মোছে; প্রকল্প তৈরি বা PATCH এর body তে `cover_path` → `400`।
- দর্শকের কাছে খসড়া প্রকল্পের কভারের URL `404` (§৬)।

ফ্রন্টএন্ড (M-ধাপ ১৫): ব্রাউজারে ছবি WebP করে (সর্বোচ্চ ১৬০০px) পাঠায়; কভার দেখায় `cover_path` + `?v=<প্রকল্পের updated_at>` দিয়ে। হোম পেইজের কার্ডে ছবির ক্রম: কভার → ওভারভিউর `featured.thumb_url` → প্রকল্পের রঙের পটভূমি ও আইকন। কার্ড আসে শুধু শীর্ষ-স্তরের (গ্রুপ বা একক) প্রকাশিত প্রকল্পের, যার `show_on_home` চালু; গ্রুপের প্রকাশিত উপ-প্রকল্প কার্ডে চিপ হিসেবে। কার্ডের সংখ্যা = `stat_cards` এর `home: true` (≤ ৩টি), লেবেল `home_label_*` থাকলে সেটা।

### ৪.২ ফিল্ড

- **GET `/api/v1/projects/{key}/fields`** → `{ "data": [ProjectField, …] }` (`sort_order` ক্রমে, আর্কাইভসহ); দর্শক পান শুধু পাবলিক। প্রকল্প নেই বা দর্শকের কাছে খসড়া → `404`।
- **POST `/api/v1/projects/{key}/fields`** body: ProjectField এর উপসেট (`key`, `label_bn`, `type` আবশ্যক; `id`, `project_key`, `is_active`, সময় নয়) → `201 { "data": ProjectField }`। `sort_order` না দিলে শেষ ফিল্ডের পরে। প্রকল্প নেই → `404`; গ্রুপ বা ৪১তম ফিল্ড → `400`; একই key → `409` (`details.field = "key"`); সংরক্ষিত key → `400` (`details.field = "key"`)।
- **PATCH `/api/v1/fields/{id}`** body: অ-ফাঁকা উপসেট (`key` সহ; `project_key` নয়) → `200 { "data": ProjectField }`। আর্কাইভ: `{ "is_active": false }`, ফেরত আনা: `{ "is_active": true }`। নেই → `404`।
- **DELETE `/api/v1/fields/{id}`** (মূল এডমিন) → `204`; নেই → `404`। **কোনো রেকর্ডে মান থাকলে `400`** ("«লেবেল» ফিল্ডের মান রেকর্ডে আছে — মোছা যাবে না; আর্কাইভ করুন")।
- **PUT `/api/v1/projects/{key}/fields/order`** body `{ "ids": ["uuid", …] }` (১–৪০টি) → `204`। অন্য প্রকল্পের id উপেক্ষিত; প্রকল্প নেই → `404`।
- **GET `/api/v1/projects/{key}/fields/{field_key}/usage`** (এডমিন) → `{ "data": { "count": 4, "values": [ { "value": "গরু", "n": 2 }, … ] } }` — কতগুলো রেকর্ডে মান আছে; পাবলিক ফিল্ডে সবচেয়ে বেশি ব্যবহৃত ১০০টি মান (বেশি থেকে কম), গোপন ফিল্ডে `values: []` (শুধু সংখ্যা)। ফিল্ড নেই → `404`।
- **POST `/api/v1/projects/{key}/fields/{field_key}/rename-value`** body `{ "from": "গাভি", "to": "গরু" }` (দুটোই ১–১০০ অক্ষর) → `{ "data": { "updated": 1 } }`। শুধু পাবলিক, সক্রিয় ক্যাটাগরি ফিল্ডে (নইলে `400`); `from` সংরক্ষিত মানের সাথে হুবহু মেলে, `to` সংরক্ষণের নিয়মে স্বাভাবিক হয়। প্রতিটি বদলানো রেকর্ড আলাদা `update` হিসেবে লগ হয়। ফিল্ড নেই → `404`।
- নিয়ম §৫.৫ (মান আসার পর `key`, `type`, `visibility` বদলায় না)।

### ৪.৩ পরিসংখ্যান, বছর, পরের সিরিয়াল

- **GET `/api/v1/projects/{key}/stats?light=1`** → `{ "data": ProjectStats }` (§৩.৬)। `light=1` (বা `true`): `by_union` = `{}` আর ক্যাটাগরিতে `by_value` নেই (হোম কার্ড)। গ্রুপের key = উপ-প্রকল্প মিলিয়ে। প্রকল্প নেই বা **দর্শকের কাছে খসড়া → `404`** (শূন্য নয়)।
- **ফিল্টার অনুযায়ী পরিসংখ্যান** — একই রাউটে তালিকার ফিল্টার, তালিকার নামে ও নিয়মেই (§৪.৪.১): `year`, `division`, `district`, `upazila`, `union_name`, `q`, `f.<key>`।
  - **একটি ফিল্টারেও মান থাকলে** উত্তর ফিল্টারের আকারে: `"filtered": true`, `total`, `distinct`, `by_project`, `fields` (টাকা/সংখ্যায় `{ type, sum, count }`, ক্যাটাগরিতে `{ type, distinct }`, `by_value` নেই); `by_year`, `by_division`, `by_district`, `by_upazila`, `by_location`, `by_union` = `{}`। তখন `light` উপেক্ষিত।
  - ফিল্টার ছাড়া উত্তর ওপরের মতো, `filtered` key ছাড়াই।
  - `q` **আক্ষরিক**: `%`, `_` ও `\` নিজেরাই মেলে, কোনো wildcard নেই (`*` ও সাধারণ অক্ষর)।
  - **অবৈধ মান → `400`**, তালিকার মতোই (যেমন `year=abc`, সংখ্যা-ফিল্ডে `f.amount=অনেক`, ১০টির বেশি `f.` ফিল্টার); নীরবে বাদ পড়ে না।
  - **কোন ফিল্ড গোনা হয়:** একটি ফিল্ড-key ব্যবহার হয় শুধু যদি গণনার **প্রতিটি** একক প্রকল্পে সেটি পাবলিক ও সক্রিয়, আর সবখানে একই ধরনের — `f.<key>` ফিল্টারে (সাথে প্রতিটিতে `filterable`), `q` সার্চে (সাথে প্রতিটিতে `searchable`), আর `fields` এর গণনায়। নইলে key টি উপেক্ষিত, যেমন তালিকা অচেনা key উপেক্ষা করে। ফলে এক উপ-প্রকল্পে গোপন key দিয়ে পাশের উপ-প্রকল্পের মান ছাঁকা বা গোনা যায় না।
  - **শর্ত:** ফিল্টারের `total` = একই ফিল্টারে `GET …/records` এর `meta.total` (একক প্রকল্পে)।
  - দর্শকের কাছে খসড়া → `404`; গ্রুপে দর্শকের জন্য গোনা হয় শুধু প্রকাশিত উপ-প্রকল্প। কোয়েরি চলে ২ সেকেন্ডের সময়সীমায়; ছাড়ালে `500`।
  - ফ্রন্টএন্ড এটি তালিকা-পাতার কার্ডে ব্যবহার করে।
- **GET `/api/v1/projects/{key}/years`** → `{ "data": [2025, 2024, 2023] }` (নতুন থেকে পুরনো; ডাটা না থাকলে `[]`)। গ্রুপে উপ-প্রকল্প মিলিয়ে; দর্শকের জন্য শুধু প্রকাশিতগুলো। প্রকল্প নেই বা দর্শকের কাছে খসড়া → `404`।
- **GET `/api/v1/projects/{key}/next-serial`** → `{ "data": { "project_type": "tin", "next_serial": 301 } }` — **পূর্বাভাস** (কাউন্টার + ১); আসল বরাদ্দ POST এ atomic (একই সময়ে দুজন যোগ করলে একজন 302 পান)। গ্রুপ, অচেনা key, বা দর্শকের কাছে খসড়া → `200` আর `next_serial: null` (খসড়ার রেকর্ড-সংখ্যা ফাঁস হয় না)।

### ৪.৪ রেকর্ড

#### ৪.৪.১ GET `/api/v1/projects/{key}/records` — তালিকা (মোট সংখ্যাসহ)
Query (সব ঐচ্ছিক):

| প্যারাম | নিয়ম |
|---|---|
| `serial_no` | int ≥ 1, ঠিক মিল (এডমিন খোঁজা) |
| `year` | int ২০০০–২১০০, ঠিক মিল |
| `division`, `district`, `upazila`, `union_name` | ঠিক মিল (trim ও NFC করে তুলনা) |
| `f.<fieldKey>` | কাস্টম ফিল্ডে ঠিক মিল, যেমন `f.category=গরু`, `f.amount=5000`। **শুধু প্রকল্পের পাবলিক, সক্রিয় ও `filterable` ফিল্ড** গৃহীত; অন্য key নীরবে উপেক্ষিত। মান সংরক্ষণের নিয়মে স্বাভাবিক করে তুলনা (ক্যাটাগরিতে ফাঁকা এক করে); সংখ্যা-ফিল্ডে সংখ্যা না হলে `400` (`details.field = "f.<key>"`)। সর্বোচ্চ ১০টি `f.` ফিল্টার, মান ≤ ১০০ অক্ষর |
| `q` | `name`, `father_or_husband_name`, `address` আর প্রকল্পের পাবলিক, সক্রিয় ও `searchable` ফিল্ডে আংশিক মিল (case-insensitive); ≤ ১০০ অক্ষর। `%`, `_`, `\` আক্ষরিক অর্থে মেলে, wildcard নয় |
| `sort` | `serial_no` (ডিফল্ট) \| `year` \| `name` \| `created_at` \| `union_name` \| `extra.<fieldKey>` (শুধু পাবলিক সক্রিয় ফিল্ড, মান না থাকা রেকর্ড শেষে; অচেনা key হলে `serial_no`); পরের ক্রম সবসময় `serial_no asc, id asc`। ফ্রন্টএন্ডের তালিকা (পাবলিক ও এডমিন) পাঠায় `sort=year&order=desc` — নতুন সাল আগে, একই সালে সিরিয়াল (M-ধাপ ১৭); CSV এক্সপোর্ট `serial_no` |
| `order` | `asc` (ডিফল্ট) \| `desc` |
| `page` | int ≥ 1, ডিফল্ট 1 |
| `page_size` | int ১–১০০, ডিফল্ট **৫০** (সীমার বাইরে `400`; সার্ভার clamp করে না) |

```json
// GET /api/v1/projects/self_reliance/records?district=কুড়িগ্রাম&f.category=গরু&page=1
{ "data": [ Record, … ], "meta": { "page": 1, "page_size": 50, "total": 1500, "total_pages": 30 } }
```
`total` = ফিল্টারের পর মোট সারি। খালি হলে `data: []`, `total_pages: 1`; শেষ পেইজের পরের পেইজে `data: []`, আসল `total` সহ। গ্রুপের key → `400` (`details.reason: "group"`)। প্রকল্প নেই বা দর্শকের কাছে খসড়া → `404`।

#### ৪.৪.২ GET `/api/v1/projects/{key}/records/serial/{n}` · GET `/api/v1/projects/{key}/records/serials?nos=1,2,3`
- একটি: `{n}` int ≥ ১ → `{ "data": Record }`; নেই → `404`।
- অনেক (ছবি বাল্ক আপডেটে ফাইলনাম মেলাতে): `nos` কমা-বিভক্ত int ≥ ১, ১–১০০টি; ফাঁকা, অ-সংখ্যা, খালি অংশ (`1,,2`) বা ১০০ এর বেশি → `400`। পুনরাবৃত্তি চলে (একবারই আসে) → `{ "data": [Record, …] }` `serial_no` ক্রমে; যেগুলো নেই সেগুলো বাদ (এরর নয়)।
- দুটোতেই প্রকল্প নেই বা দর্শকের কাছে খসড়া → `404`; গ্রুপ → `400`।

#### ৪.৪.৩ GET `/api/v1/records/{id}`
→ `{ "data": Record }`; `id` uuid না হলে `400`; নেই বা দর্শকের কাছে খসড়ার রেকর্ড → `404`।

#### ৪.৪.৪ POST `/api/v1/projects/{key}/records` — নতুন রেকর্ড (এডমিন)
```json
// অনুরোধ
{ "year": 2025, "name": "মমতাজ বেগম", "father_or_husband_name": "মোঃ শামসুল হক",
  "division": "ময়মনসিংহ", "district": "শেরপুর", "upazila": "নালিতাবাড়ী", "union_name": "পোড়াগাঁও", "address": "গ্রাম: পোড়াগাঁও",
  "extra": { "amount": 25000, "category": "গরু" },
  "prev_photo_source": null, "current_photo_source": null }
// উত্তর 201
{ "data": { ...Record, "serial_no": 301 } }
```
- `serial_no` **ঐচ্ছিক**: না দিলে সার্ভার পরের সিরিয়াল দেয় **atomic ভাবে** (প্রতি প্রকল্পে আলাদা কাউন্টার); দিলে int ≥ ১ ও অনন্য (নইলে `409`), কাউন্টার ≥ সেই মান হয়।
- **অচেনা প্রকল্প → `404`** (key পাথে, তাই খসড়ার মতোই); গ্রুপ → `400`।
- গোপন মান এই body তে নয় — রেকর্ড তৈরির পর `PUT /api/v1/records/{id}/private` (§৪.৪.৮)।
- ছবির ঘর (`*_photo_url`, `*_thumb_url`, `photo_updated_at`) body তে দিলে `400` (§৫.১)।
- যাচাই §৫.১।

#### ৪.৪.৫ PATCH `/api/v1/records/{id}` — আংশিক আপডেট (এডমিন)
- body: §৪.৪.৪ এর যেকোনো অ-ফাঁকা উপসেট, `serial_no` ছাড়া। `project_type`, `serial_no` বা কোনো ছবির ঘর থাকলে `400` (সিরিয়াল বদল শুধু §৪.৪.৯, ছবি শুধু §৪.৪.১০–৪.৪.১১)।
- `extra` পাঠালে **পুরো `extra` প্রতিস্থাপিত হয়** (ফ্রন্টএন্ড পুরো অবজেক্ট পাঠায়)। শুধু বদলানো মান যাচাই হয় (আর্কাইভ ফিল্ডের অপরিবর্তিত পুরনো মান থাকতে পারে)।
- → `200 { "data": Record }`; নেই → `404`।

#### ৪.৪.৬ DELETE `/api/v1/records/{id}` — (মূল এডমিন)
→ `204`। গোপন মানও মোছে, আর রেকর্ডের ছবি ও থাম্বের ফাইল মোছে ট্রানজ্যাকশন কমিটের পরে; স্টোরেজ তখন সাড়া না দিলেও উত্তর `204`, ফাইলটি পরে আবার মোছার চেষ্টা হয় (`npm --prefix server run files:sweep`)। অন্য এডমিন → `403` ("শুধু মূল এডমিন মুছতে পারেন")। নেই → `404`।

#### ৪.৪.৭ বাল্ক: POST / PUT `/api/v1/projects/{key}/records/bulk` (এডমিন)
**POST — শীট থেকে নতুন যোগ:**
```json
{ "mode": "use_given_serial",            // অথবা "assign_serial"
  "rows": [ { "serial_no": 1, "year": 2023, "name": "…", "division": "…", "district": "…", "upazila": "…",
              "union_name": "…", "address": "…", "extra": { "amount": 5000, "phone": "01711987654" } } ] }
// উত্তর 200
{ "data": { "inserted": 500, "failed": [] } }
```
- `rows` ১–৫০০; বেশি হলে `413` (সারি যাচাইয়ের আগেই); ফাঁকা → `400`। ফ্রন্টএন্ড ২০০ করে পাঠায়। body সীমা ১০ MB (§১.৪)।
- `use_given_serial`: প্রতিটি সারিতে `serial_no` (int ≥ ১) আবশ্যক; ব্যাচে একই সিরিয়াল দুবার → পুরো ব্যাচ `400` (`reason: "duplicate"`); ডাটাবেসে আগে থেকে থাকলে পুরো ব্যাচ `409` (`details.row_index`, `field: "serial_no"`)। পরে কাউন্টার ≥ সর্বোচ্চ সিরিয়াল।
- `assign_serial`: `serial_no` উপেক্ষিত; সার্ভার ক্রমানুসারে দেয়।
- **`extra` তে গোপন ফিল্ডের key থাকলে সার্ভার সেগুলো গোপন টেবিলে রাখে** (রেকর্ডের পাবলিক `extra` তে কখনো নয়)।
- প্রতিটি সারিতে §৫.১ এর যাচাই; কোনো সারি অবৈধ হলে **পুরো ব্যাচ** `400` (`details.row_index`, `details.field`)। এক ট্রানজ্যাকশন (সব বা কিছুই না), তাই `failed` সবসময় খালি।
- `*_photo_source` শুধু রাখা হয়; সার্ভার এখানে ছবি নামায় না।

**PUT — সিরিয়াল ধরে আপডেট:**
```json
{ "rows": [ { "serial_no": 1, "name": "…", "address": "", "extra": { "amount": 6000 }, "_clear": ["union_name", "extra.item_name"] } ] }
// উত্তর 200
{ "data": { "updated": 180, "missing": [205, 310] } }
```
- `rows` ১–৫০০ (বেশি হলে `413`); প্রতিটিতে `serial_no` আবশ্যক। অন্য ঘর **না দিলে, `null` বা খালি `""` দিলে অপরিবর্তিত** (শীটের খালি ঘর কখনো মান মোছে না); `extra` এর ভেতরেও একই।
- কোনো ঐচ্ছিক মান **মুছতে** স্পষ্ট তালিকা `_clear` (≤ ৫০টি): `father_or_husband_name`, `address`, `union_name`, `prev_photo_source`, `current_photo_source`, `extra.<key>` (পাবলিক কাস্টম ফিল্ড)। অন্য কিছু → `400`; আবশ্যক মান মোছা গেলে ডাটাবেসের নিয়মে `400`। শীটে ব্যবহারকারী ঘরে **`(মুছুন)`** লিখলে ফ্রন্টএন্ড সেটিকে `_clear` বানায় (সার্ভার শব্দটি কখনো দেখে না); আবশ্যক ঘরে `(মুছুন)` ফ্রন্টএন্ডেই আটকায়।
- `extra` **মার্জ** হয় (শুধু দেওয়া key বদলায়)। **গোপন ফিল্ডের key `extra` এ দিলে সার্ভার সেগুলো গোপন অংশে মার্জ করে**; ফ্রন্টএন্ডের ইম্পোর্ট এভাবেই গোপন মান পাঠায়। `_clear` গোপন মান মোছে না — সেজন্য `PUT /api/v1/records/{id}/private`।
- (প্রকল্প, serial_no) মিললে আপডেট; না মিললে `missing` এ (এরর নয়, ইনসার্ট হয় না)। এক ট্রানজ্যাকশন। ফ্রন্টএন্ড চাইলে `missing` গুলো POST (`use_given_serial`) দিয়ে যোগ করে।
- দুই রাউটেই অচেনা প্রকল্প → `404`, গ্রুপ → `400`।

#### ৪.৪.৮ GET / PUT `/api/v1/records/{id}/private` — গোপন মান (এডমিন)
- **GET** → `{ "data": { "phone": "01711987654" } }`; কিছু না থাকলে `{}`; রেকর্ড নেই → `404`। প্রতিটি পড়া সার্ভারের নিরাপত্তা-লগে যায় (মান নয়, রেকর্ডের id)।
- **PUT** body `{ "data": { "phone": "০১৭১১৯৮৭৬৫৪" } }` → পুরোটা **প্রতিস্থাপন** (যে key বাদ, তার মান মুছে যায়; খালি বা `null` মান রাখা হয় না) → `200 { "data": { "phone": "01711987654" } }` (স্বাভাবিক করা মান)। শুধু প্রকল্পের **গোপন ও সক্রিয়** ফিল্ডের key; পাবলিক, অচেনা বা আর্কাইভ key → `400` (`details.field = "private.<key>"`)। আর্কাইভ ফিল্ডের অপরিবর্তিত পুরনো মান আবার পাঠালে চলে। লগে `private_update` (শুধু key এর নাম)।
- **POST `/api/v1/projects/{key}/records/private`** (গোপনসহ CSV এক্সপোর্টের জন্য) body `{ "ids": ["3f2c…", "9a1b…"] }` (≤ ১০০টি uuid; বেশি → `400`) → `200 { "data": { "3f2c…": { "phone": "01711987654" } } }` — শুধু মান থাকা রেকর্ড; অন্য প্রকল্পের id নীরবে বাদ। অচেনা প্রকল্প → `404`, গ্রুপ → `400`। একটিভিটি লগে পড়া লেখা হয় না (নিরাপত্তা-লগে সংখ্যাটি যায়); ক্লায়েন্ট এক্সপোর্ট শেষে `records_export` ইভেন্ট পাঠায় (§৪.৫)।
- তিনটি উত্তরই `Cache-Control: private, no-store`।

#### ৪.৪.৯ POST `/api/v1/records/{id}/serial` — সিরিয়াল বদল (এডমিন)
```json
{ "serial_no": 350 }   // → 200 { "data": Record } — নতুন serial_no সহ; ছবির URL অপরিবর্তিত
```
- `serial_no` int ≥ ১; একই প্রকল্পে আগে থাকলে `409`; রেকর্ড নেই → `404`; একই সিরিয়াল দিলে রেকর্ড অপরিবর্তিত `200`, লগও হয় না।
- এক ট্রানজ্যাকশনে: সিরিয়াল আপডেট, কাউন্টার ≥ নতুন মান, অডিট সারি (`housing_serial_changes`: record_id, project_type, old_serial, new_serial, changed_by, changed_at), লগে `serial_change`।
- **কোনো ফাইল সরে না:** ছবির URL সিরিয়ালের উপর নির্ভর করে না, তাই `*_photo_url`, `*_thumb_url`, `photo_updated_at` যেমন ছিল তেমনই থাকে। পুরনো সিরিয়ালের শেয়ার করা লিংক (`<প্রকল্পের পাথ>/<পুরনো সিরিয়াল>`) আর কাজ করে না, আর পুরনো সিরিয়াল আর কাউকে দেওয়া হয় না।
- সার্ভার যেকোনো এডমিনকে এটি করতে দেয়; UI দেখায় শুধু মূল এডমিনকে (§৫.৭)।

#### ৪.৪.১০ PUT `/api/v1/records/{id}/photos/{slot}` — ছবি আপলোড/প্রতিস্থাপন (এডমিন)
`{slot}` = `prev` | `current` (অন্য কিছু → `400`)। `multipart/form-data`:

| ঘর | নিয়ম |
|---|---|
| `photo` | আবশ্যক, ≤ ৫ MB। ফ্রন্টএন্ড সবসময় WebP পাঠায় (≤ ১৬০০px চওড়া, ~৮০%)। সার্ভার JPEG, PNG বা WebP নেয়, ধরন ঠিক করে ফাইলের প্রথম বাইট দেখে (`Content-Type` বা নাম নয়), আর সবসময় নতুন করে WebP বানায় (≤ ১৬০০px চওড়া, মান ৮০%); EXIF, GPS ও অন্য সব মেটাডাটা বাদ যায় |
| `thumb` | ঐচ্ছিক, ≤ ৫০০ KB। সার্ভার এটি পড়ে ফেলে দেয় আর `photo` থেকে নিজেই থাম্ব বানায় (৪০০px, WebP), যাতে মেটাডাটা না ঢোকে |

- অন্য কোনো ঘর বা ফাইল (`kind` সহ — slot আসে পাথ থেকে) → `400`।
- **ছবি-মোড মানতে হয়:** প্রকল্প `after_only` হলে `prev` → `400`; `none` হলে যেকোনো slot → `400` (`reason: "photo_mode"`)। যাচাই হয় body পড়ার **আগে**, তাই কিছুই রাখা হয় না। রেকর্ড নেই → `404`, একইভাবে আগে।
- নতুন ফাইল রাখে, রেকর্ডের `<slot>_photo_url`, `<slot>_thumb_url` (নতুন URL) আর `photo_updated_at = now()` বসায়, লগে `photo_update` → `200 { "data": Record }`। পুরনো ফাইল মোছে কমিটের পরে; আপলোড ব্যর্থ হলে নতুন ফাইলও মোছে, রেকর্ড অপরিবর্তিত থাকে।
- এরর: `400` এর `details.reason` — `unsupported_type` (ছবি নয় বা অন্য ধরন), `invalid_image` (নষ্ট বা ৪ কোটি পিক্সেলের বেশি), `required` (`photo` নেই), `unexpected_field`/`unexpected_file`, `not_multipart`, `malformed_multipart`, `too_many_parts`; `photo` ৫ MB বা `thumb` ৫০০ KB এর বেশি → `413`।
- **থাকা ছবি বদলানো** সার্ভার যেকোনো এডমিনকে করতে দেয়; UI দেখায় শুধু মূল এডমিনকে (§৫.৭)।
- ছবি বাল্ক টুল ব্রাউজারে একবারে ২টি অনুরোধ পাঠায়; সার্ভার একসাথে ২টি প্রক্রিয়া করে (§১.৪)।

#### ৪.৪.১১ DELETE `/api/v1/records/{id}/photos/{slot}` — (মূল এডমিন)
- মূল এডমিন ছাড়া → `403` ("শুধু মূল এডমিন ছবি মুছতে পারেন")।
- ছবি ও থাম্বের URL `null`, `photo_updated_at = now()`, লগে `photo_update`; ফাইল মোছে কমিটের পরে → `200 { "data": Record }`।
- ছবি না থাকলেও `200`; তখন রেকর্ড অপরিবর্তিত (`photo_updated_at` ও), লগও হয় না। রেকর্ড নেই → `404`।
- **ছবি সরানোর আর কোনো পথ নেই:** রেকর্ড তৈরি, PATCH বা বাল্কের body ছবির URL বা থাম্বের কোনো ঘর নেয় না, কোনো ভূমিকা থেকেই নয় (§৫.১)।

### ৪.৫ একটিভিটি লগ (এডমিন)
সার্ভার **প্রতিটি লেখা নিজে লগ করে**, একই ট্রানজ্যাকশনে, ক্লায়েন্টের উপর নির্ভর না করে — বদলানো মানের আগে→পরে সহ। লগ append-only: সম্পাদনা বা মোছা যায় না।

| action | কখন | details |
|---|---|---|
| `create` / `delete` | রেকর্ড | রেকর্ডের সারসংক্ষেপ: year, division, district, upazila, union_name, extra, `has_*_photo` (create); delete এ আরও address, father_or_husband_name, `had_*_photo` |
| `update` | রেকর্ড | `{ "changes": { "name": {"old","new"}, "union_name": {…}, "extra.amount": {"old": 10000, "new": 12000} }, "photo_kinds": [] }` — `extra` এর প্রতিটি key আলাদা |
| `photo_update` | ছবি যোগ, বদল বা মোছা | একই `changes` আকারে (`current_photo: {old: false, new: true}`), `photo_kinds: ["current"]` |
| `serial_change` | সিরিয়াল বদল | `changes.serial_no` |
| `private_update` | গোপন মান | `{ "fields": ["phone"], "masked": true }` — **মান কখনো নয়** |
| `project_create` / `project_update` / `project_publish` / `project_unpublish` / `project_delete` | প্রকল্পের সেটিং (কভারসহ) | `record_id: null`, `project_type` = প্রকল্পের key, `record_name` = বাংলা নাম; তৈরি ও মোছায় `snapshot`, বদলে `changes`; শুধু ক্রম বদল লগ হয় না |
| `field_create` / `field_update` / `field_archive` / `field_restore` / `field_delete` | ফিল্ডের সেটিং | একই, সাথে `field_key` |
| `login` / `logout` | সার্ভার নিজে (§২) | — |
| `import_run` / `photo_bulk_run` / `records_export` / `category_merge` | ক্লায়েন্ট-ইভেন্ট (POST দিয়ে) | ক্লায়েন্ট যা পাঠায়, যেমন `records_export`: `{ "rows": 120, "private": true }`; `category_merge`: `{ "field": "category", "from": "গাভি", "to": "গরু", "records": 3 }`; `photo_bulk_run` প্রতিটি প্রকল্পের জন্য আলাদা এন্ট্রি |

**GET `/api/v1/activity`** — query: `action` (`^[a-z_]{1,40}$`), `project_type` (প্রকল্পের key), `record_id` (uuid), `actor_email` (আংশিক, বড়-ছোট হাতের অক্ষর উপেক্ষিত, `%`/`_` আক্ষরিক), `from`/`to` (ISO 8601, **অফসেটসহ**, যেমন `2026-10-01T00:00:00+06:00`; দুই প্রান্তই অন্তর্ভুক্ত), `page` (১–১০,০০০), `page_size` (১–১০০, ডিফল্ট ৫০)। ভুল মান → `400`। নতুন আগে (`at` তারপর `id`, দুটোই উল্টো ক্রমে)। সব এডমিন পুরো লগ দেখেন।
```json
{ "data": [ { "id": 1024, "at": "2026-09-30T05:06:22.000Z", "actor_id": "uuid", "actor_email": "admin@example.org",
              "action": "update", "project_type": "semi_pucca", "record_id": "3f2c…", "serial_no": 12, "record_name": "…",
              "details": { … } } ],
  "meta": { "page": 1, "page_size": 50, "total": 1024, "total_pages": 21 } }
```

**POST `/api/v1/activity`** — body `{ "action": "import_run", "project_type": "tin", "details": { "mode": "insert", "rows": 200 } }` → `201 { "data": { "id": 1025 } }`।
- `action` শুধু ক্লায়েন্ট-ইভেন্ট: `import_run`, `photo_bulk_run`, `records_export`, `category_merge`; অন্য কিছু (সার্ভার নিজে যা লগ করে তা-সহ) → `400`, যাতে কিছু জাল করা না যায় বা দুবার না আসে।
- `project_type` ঐচ্ছিক; `details` অবজেক্ট, JSON হিসেবে ≤ ৮ KB (`reason: "too_big"`)।
- actor সার্ভার সেশন থেকে নেয়, body থেকে নয় (body তে actor দিলে অচেনা ঘর হিসেবে `400`)। ক্লায়েন্ট-ইভেন্টের `details` ব্রাউজারের নিজের সারসংক্ষেপ, যা ঘটেছে তার প্রমাণ নয়।

### ৪.৬ ইউজার-ব্যবস্থাপনা
এই API এখনো ইউজার-ব্যবস্থাপনা দেয় না। এডমিন ও তাদের ভূমিকা সামলানো হয় সার্ভারের CLI দিয়ে:
```
npm --prefix server run admin -- create --email <e> --name <n> [--role main_admin]
npm --prefix server run admin -- set-role --email <e> --role admin|main_admin
npm --prefix server run admin -- list
```
(আরও আছে `set-password`, `disable`, `enable`; মূল এডমিন একজনই থাকতে পারেন।) ফ্রন্টএন্ডের `AdminUsersApi` তাই `NOT_IMPLEMENTED` দেয়। পরের ধাপ (P9b) মূল এডমিনের জন্য `GET` ও `PUT /api/v1/admin/users` যোগ করবে; তখন এই অংশ লেখা হবে।

---

## ৫. সার্ভারের নিয়ম

নিয়মগুলো আছে zod স্কিমায় (`server/src/projects/schemas.ts`, `server/src/records/schemas.ts`) আর ডাটাবেসের ট্রিগারে (`server/db/migrations/0013_record_rules.sql`, `0014_record_functions_v2.sql`, `0015_project_guards.sql`, `0017_photo_mode_guard_count.sql`); দুই জায়গাতেই একই নিয়ম, ট্রিগার শেষ পাহারা।

### ৫.১ রেকর্ড যাচাই
- সব টেক্সট **trim + Unicode NFC** করে রাখা ও তুলনা করা হয় (বাংলা ড়/ঢ়/য় দুই রূপে লেখা যায়; NFC এক করে)। ফিল্টারের মানও NFC করে তুলনা।
- `year` আবশ্যক, int ২০০০–২১০০; `name` আবশ্যক ১–২০০; `division`/`district`/`upazila` আবশ্যক ১–১০০ (মান আসে ফ্রন্টএন্ডের স্থির তালিকা `bdGeo.ts` ৮/৬৪/৪৯৪ থেকে; সার্ভার শুধু খালি কি না দেখে); `father_or_husband_name` ০–২০০; `union_name` ০–১০০; `address` ০–১০০০; `*_photo_source` লেখা বা null, ≤ ২০০০ (trim হয়, ফাঁকা হলে `null`; URL কি না যাচাই হয় না, UI এটি লিংক বানায় না)।
- প্রকল্পের `core_fields.<k>.required = true` হলে সেই ঐচ্ছিক সিস্টেম ফিল্ড আবশ্যক (`400`, যেমন "ইউনিয়ন আবশ্যক" — `union_name` এর ক্ষেত্রে শুধু `geo_depth = union` প্রকল্পে)। পুরনো রেকর্ডে আগে থেকেই খালি মান থাকলে অন্য কিছু এডিট করায় আটকায় না — শুধু নতুন রেকর্ডে বা মান মুছতে গেলে।
- `extra`: JSON object, < ১৬ KB, প্রতিটি key ফিল্ড-key এর আকারে (`__proto__` এর মতো key → `400`); প্রতিটি key প্রকল্পের **পাবলিক ও সক্রিয়** ফিল্ড হতে হয় (§৩.৩ এর নিয়মে স্বাভাবিক); আবশ্যক কাস্টম ফিল্ড খালি → `400`। আপডেটে শুধু বদলানো মান যাচাই।
- গ্রুপ-প্রকল্পে রেকর্ড রাখা যায় না (`400`)।
- **রেকর্ডের body ছবির কোনো ঘর নেয় না:** `*_photo_url`, `*_thumb_url`, `photo_updated_at` তৈরি, PATCH বা বাল্কে পাঠালে `400`, যেকোনো ভূমিকা থেকেই। ছবি বদলায় শুধু §৪.৪.১০–৪.৪.১১ দিয়ে; ছবি-মোডের বাইরের ছবি রাখা যায় না।

### ৫.২ খসড়া লুকানো
- "পাবলিক প্রকল্প" = `is_published = true` এবং (থাকলে) তার গ্রুপও প্রকাশিত।
- দর্শকের কাছে অন্য সব প্রকল্প **নেই**: প্রকল্প, ফিল্ড, রেকর্ড, স্ট্যাট, বছর, রেকর্ডের ছবি ও কভারের ফাইল → `404`, আর তালিকা থেকে বাদ; পরের সিরিয়াল `null`। খসড়া আর না-থাকা key একই উত্তর পায়।
- গ্রুপের স্ট্যাট, বছর ও ওভারভিউতে দর্শকের জন্য গোনা হয় শুধু প্রকাশিত উপ-প্রকল্প।
- গোপন ফিল্ডের **সংজ্ঞাও** দর্শক দেখেন না, আর রেকর্ডের `extra` তে পান শুধু পাবলিক ফিল্ডের key।

### ৫.৩ সিরিয়াল ও কাউন্টার
প্রতিটি একক বা উপ-প্রকল্পে আলাদা কাউন্টার, প্রকল্প তৈরির সাথে সাথে (০)। বরাদ্দ atomic, ১ থেকে, ফাঁক থাকতে পারে, কখনো পুনঃব্যবহার নয় — রেকর্ড বা প্রকল্প মুছলেও না। কাউন্টার কখনো মোছে না।

### ৫.৪ গোপন মান আলাদা
গোপন ফিল্ডের মান পড়া ও লেখা শুধু §৪.৪.৮ এ, আর বাল্কের `extra` থেকে গোপন টেবিলে (§৪.৪.৭); রেকর্ডের `extra`, তালিকা, সার্চ, স্ট্যাট, ওভারভিউ বা লগে কখনো নয়।

### ৫.৫ প্রকল্প ও ফিল্ডের গার্ড (কী অপরিবর্তনীয়)
- **প্রকল্প `key`** কখনো বদলায় না (সিরিয়াল, ছবি ও লগ এর ওপর নির্ভর করে)।
- **`slug`**: trim ও ছোট হাতের করে `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ ৬০, শুধু অঙ্ক নয়, unique; সংরক্ষিত শব্দ নিষেধ: admin, api, auth, login, logout, assets, geo, static, src, public, node-modules, favicon, icons, dev, projects, records, search, about, contact, donate, news, en, bn, new, edit, import, photos, activity, settings, users, preview, index।
- **প্রকাশিত** প্রকল্পের `slug` বা `parent_key` বদলায় না (শেয়ার করা লিংক ভাঙবে) — আগে অপ্রকাশিত করতে হয়।
- `parent_key` থাকলে সেটি অবশ্যই একটি গ্রুপ (সর্বোচ্চ ২ স্তর); গ্রুপের নিজের `parent_key` থাকে না। রেকর্ড, উপ-প্রকল্প বা ফিল্ড থাকলে `is_group` বদলায় না।
- ছবি-মোড বদল: আগের ছবিসহ রেকর্ড থাকলে `after_only`/`none` নয়; যেকোনো ছবিসহ রেকর্ড থাকলে `none` নয়। বার্তায় থাকে কয়টি রেকর্ডে সেই ছবি আছে, যাতে এডমিন জানেন কী আগে সরাতে হবে।
- `stat_cards` ≤ ৮, `home: true` ≤ ৩, প্রতিটিতে `id`, `kind` ও `label_bn`; `sum`/`distinct` এ `field`, `geo` তে `level` লাগে।
- **ফিল্ড:** প্রতি প্রকল্পে ≤ ৪০; গ্রুপে নয়; অন্য প্রকল্পে সরানো যায় না। `key` সংরক্ষিত নাম নিষেধ — id, project_type, serial_no, year, name, father_or_husband_name, division, district, upazila, union_name, address, extra, created_at, updated_at, photo_updated_at, q, page, sort, f, আর `prev_*`/`current_*`।
- কোনো রেকর্ডে ফিল্ডের মান আসার পর তার `key`, `type`, `visibility` বদলায় না, আর ফিল্ড মোছা যায় না (`400`; আর্কাইভ করুন)।
- প্রকল্প মুছলে তার ফিল্ডও মোছে (§৪.১.৬)।

### ৫.৬ লগ
§৪.৫ — প্রতিটি লেখা সার্ভারেই লগ হয়, একই ট্রানজ্যাকশনে।

### ৫.৭ অনুমতি: সার্ভার যা দেয়, UI যা দেখায়
সার্ভার মূল এডমিনের জন্য রাখে শুধু DELETE (§১)। নিচের তিনটি কাজ সার্ভার **যেকোনো এডমিনকে** করতে দেয়, কিন্তু UI এগুলো সাধারণ এডমিনের কাছ থেকে লুকিয়ে রাখে, মূল এডমিনকেই দেখায়:
- সিরিয়াল বদল (§৪.৪.৯),
- থাকা ছবি বদলানো (§৪.৪.১০),
- বাল্ক আপডেটে শীটের `(মুছুন)` শব্দ, অর্থাৎ `_clear` (§৪.৪.৭)।

এই লুকানো শুধু UI এর সুবিধা, নিরাপত্তার সীমা নয়।

---

## ৬. ছবি — GET `/api/v1/photos/{id}` (পাবলিক)
- রেকর্ডের ছবি, থাম্ব আর প্রকল্পের কভার সবই এই রাউট দিয়ে আসে, যে স্টোরেজেই থাকুক (`STORAGE_DRIVER`: NAS ফোল্ডার, বা S3 বাকেট)। ব্রাউজার শুধু এই রাউট দেখে, স্টোরেজের URL বা কী কখনো নয়।
- **লেখা** শুধু §৪.১.৮ ও §৪.৪.১০–৪.৪.১১ দিয়ে; ক্লায়েন্ট সরাসরি স্টোরেজে লেখে না।
- **কে পান:** ফাইলটি যতক্ষণ কোনো রেকর্ড বা কভারে ব্যবহৃত। দর্শক পান শুধু পাবলিক প্রকল্পের ফাইল; **খসড়ার ফাইল দর্শকের কাছে `404`**। এডমিন সেশন যেকোনো চালু ফাইল পায়। বদলে দেওয়া বা মোছা ছবি, বা অচেনা id → `404`; `{id}` uuid না হলে `400`।
- **উত্তরের হেডার:** `Content-Type: image/webp`, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin` (অন্য origin এর `<img>` এ দেখানোর জন্য)।
- **ক্যাশ:** দর্শকের উত্তরে `Cache-Control: public, max-age=86400` (একটি id এর ছবি কখনো বদলায় না, তবে মোছা ছবি এক দিনের মধ্যে ক্যাশ থেকে সরে যায়); এডমিনের উত্তরে `private, no-store`; `404` সহ সব প্রত্যাখ্যানে `no-store`, যাতে প্রকাশের পর ছবি "নেই" হয়ে আটকে না থাকে।
- HEAD চলে। প্রতি IP মিনিটে ১২০০টি (§১.৪)।

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
| ২০২৬-০৯-২৯ | ০.৫ | ছবির পাথ নিয়ম (সব WebP, ওভাররাইট); `serials?nos=` endpoint |
| ২০২৬-০৯-২৯ | ০.৬ | অথ: admins টেবিল ও role নিয়ম, সাইন-আপ নেই |
| ২০২৬-০৯-২৯ | ০.৭ | এডমিন CRUD: create এ ঐচ্ছিক `serial_no`; `next-serial`; সিরিয়াল বদল; list এ `serial_no` ফিল্টার |
| ২০২৬-০৯-২৯ | ০.৮ | সিরিয়াল ধরে বাল্ক আপডেট (ইম্পোর্টের আপডেট মোড); ফ্রন্টএন্ড ধাপ ০–১২ এর সাথে সঙ্গতিপূর্ণ |
| ২০২৬-০৯-৩০ | ০.৯ | একটিভিটি লগ; সার্ভার-সাইড লগিং বাধ্যতামূলক; `stats.by_location` (মানচিত্র) |
| ২০২৬-১০-০৫ | ০.৯.১ | এডমিনের দুই ভূমিকা: `main_admin` (একজন; মোছা) ও `admin` (যোগ/এডিট) |
| ২০২৬-১০-০৫ | ০.৯.২ | বাল্ক আপডেটে খালি `""` = অপরিবর্তিত, মোছার জন্য `_clear`; `next-serial` খসড়ায় `null` |
| ২০২৬-১০-০৫ | **১.০** | **বহু-প্রকল্প (পর্ব ২, M-ধাপ ৪):** প্রকল্প, ফিল্ড, ওভারভিউ endpoint; পাথ `/api/projects/:key/...` ও `/api/records/:id/...`; রেকর্ডে `union_name`, `extra`; গোপন মান endpoint; ফিল্ডের ধরন ও যাচাই; `ProjectStats` শেপ (by_union, by_project, fields, distinct.unions); কাস্টম ফিল্টার `f.<key>` (whitelist), `sort=extra.<key>`; ছবি-মোড; খসড়া লুকানো; অপরিবর্তনীয় জিনিসের তালিকা; লগের নতুন action; PUT এর বদলে PATCH (আংশিক আপডেট); ছবি endpoint `PUT/DELETE …/photos/:slot` |
| ২০২৬-১০-০৫ | ১.১ | `POST /api/projects/:key/records/private` (অনেক রেকর্ডের গোপন মান একসাথে, ≤ ১০০; গোপনসহ CSV এক্সপোর্ট — M-ধাপ ১০); ক্লায়েন্ট-ইভেন্ট `records_export` |
| ২০২৬-১০-০৫ | ১.২ | বাল্ক আপডেট: গোপন key → গোপন অংশে মার্জ, `_clear` শুধু পাবলিক, শীটের `(মুছুন)` রীতি (ফ্রন্টএন্ড → `_clear`); টাকার সীমা ১০০০ কোটি = 1e10 — M-ধাপ ১১ |
| ২০২৬-১০-০৬ | ১.৩ | ক্লায়েন্ট-ইভেন্ট `category_merge`; `photo_bulk_run` প্রকল্প ধরে আলাদা; ছবির ফাইলনাম: প্রিফিক্স = file_prefix/key/slug (অঙ্কসহ), শুধু-পরের-ছবি প্রকল্পে আগে/পরে না লিখলে `current`, `prev` হলে ভুল — M-ধাপ ১২ |
| ২০২৬-১০-০৬ | ১.৪ | কভার ছবি: `ProjectsApi.uploadCover` / `deleteCover` (§৪.১.৮), কভারের ক্যাশ-ভাঙা ও হোম কার্ডের নিয়ম — M-ধাপ ১৫ |
| ২০২৬-১০-০৬ | ১.৫ | প্রকল্পভিত্তিক ইউজারের প্রস্তাব (M-ধাপ ১৮–১৯): `editor` ভূমিকা ও `/api/admin/users`; সার্ভারে এখনো নেই (§৪.৬) |
| ২০২৬-১০-০৬ | ১.৬ | ফিল্টার অনুযায়ী পরিসংখ্যান: `stats` এ তালিকার ফিল্টার (§৪.৩), হালকা শেপ + `filtered: true` |
| ২০২৬-১০-০৭ | **২.০** | **সার্ভার যেমন বানানো, তেমন:** সব পাথ `/api/v1` এর নিচে, OpenAPI-র `{param}` নামে; একমাত্র চুক্তি (এক-প্রকল্পের পুরনো চুক্তি বাদ); নতুন §১.৩ CORS, §১.৪ রেট লিমিট ও বডির সীমা, §১.৫ ক্যাশ, health ও OpenAPI; কুকি সেশন ও দুই ভূমিকা (§২); ছবি ও কভারের URL `/api/v1/photos/{id}`, সিরিয়াল বদলে ফাইল সরে না; `cover_path` শুধু কভার-রাউটে; খসড়ার স্ট্যাট, রেকর্ড ও ফাইল দর্শকের কাছে `404`; ফিল্টারের স্ট্যাটে আক্ষরিক `q`, অবৈধ মান `400`, প্রতিটি উপ-প্রকল্পে মেলা ফিল্ড; বাল্ক ইনসার্টে গোপন key; প্রকল্প মুছলে ফিল্ডও; `details.field` এর নিয়ম; ইউজার-ব্যবস্থাপনা CLI তে (§৪.৬); §৫.৭ সার্ভার বনাম UI এর অনুমতি |

## ৯. পুরনো → নতুন পাথ
নেই। সব পাথ `/api/v1` এর নিচে (§১); আগের পাথগুলো সার্ভারে আর নেই।

## ১০. খোলা প্রশ্ন
1. `by_upazila` শুধু নামে গোনা (একই নামের উপজেলা ভিন্ন জেলায় একসাথে); `distinct.upazilas` আর মানচিত্রের `by_location` সঠিক। `by_upazila` UI তে ব্যবহারের আগে সিদ্ধান্ত লাগবে।
