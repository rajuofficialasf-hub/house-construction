# Supabase (টেস্ট ব্যাকএন্ড) — SQL ফাইল

Supabase Dashboard → **SQL Editor** এ ফাইলগুলো **এই ক্রমে** চালান:

| ক্রম | ফাইল | কী করে | পোর্টেবল? |
|---|---|---|---|
| ১ | `sql/01_schema.sql` | `housing_beneficiaries` টেবিল, constraint, ইনডেক্স, updated_at ট্রিগার | হ্যাঁ (Postgres; MySQL নোট ভেতরে) |
| ২ | `sql/02_serial.sql` | সিরিয়াল কাউন্টার টেবিল + বরাদ্দ ট্রিগার + অপরিবর্তনীয়তা ট্রিগার | হ্যাঁ (Postgres) |
| ৩ | `sql/03_rls.sql` | `housing_admins` টেবিল, `is_housing_admin()`, RLS পলিসি | না (Supabase auth) |
| ৪ | `sql/04_rpc_stats.sql` | `housing_stats()`, `housing_years()` RPC | আংশিক (Postgres ফাংশন; নিজস্ব সার্ভারে endpoint) |
| ৫ | `sql/05_storage.sql` | `housing-photos` bucket ও Storage পলিসি | না (Supabase Storage) |
| ৭ | `sql/07_rpc_bulk.sql` | `housing_bulk_update_by_serial()` — ইম্পোর্টের "সিরিয়াল ধরে আপডেট" মোড | আংশিক (Postgres ফাংশন; নিজস্ব সার্ভারে endpoint) |
| ৯ | `sql/09_activity_log.sql` | একটিভিটি লগ টেবিল, রেকর্ড-ট্রিগার (create/update/delete/photo/serial আগে→পরে), `housing_log_event()` RPC, RLS (এডমিন SELECT) | আংশিক (Postgres ট্রিগার; actor Supabase JWT থেকে) |
| ৯ক | `sql/09a_fix_photo_log.sql` | জরুরি ফিক্স (২০২৬-১০-০৫): লগ-ট্রিগারে ছবি বদলালে "malformed array literal" — 09 আগে চালানো থাকলে এটি একবার চালান (নতুন সেটআপে 09-এ ফিক্স আছে, তবু চালালে ক্ষতি নেই) | আংশিক |

### যাচাই ফাইল (`sql/checks/`) — শুধু পড়ে বা নিজে রোলব্যাক করে
| ফাইল | কখন | কী করে |
|---|---|---|
| `checks/00_baseline.sql` | পর্ব ২, M-ধাপ ১ (চেকলিস্ট সারি ২৪) | এখনকার রেকর্ড/কাউন্টার/লগ/স্ট্যাট/স্কিমার ফিঙ্গারপ্রিন্ট — বহু-প্রকল্প মাইগ্রেশনের আগে-পরে তুলনার জন্য। কিছু বদলায় না। |

### ⚠ শুধু টেস্ট ডাটাবেসের জন্য (`sql/dev/`) — লাইভে কখনো নয়
| ফাইল | কী করে | গার্ড |
|---|---|---|
| `dev/06_seed.sql` | ২০টি ডামি রেকর্ড | টেবিলে রেকর্ড থাকলে থামে; ইচ্ছাকৃত হলে শুরুতে `set asf.confirm_seed = 'YES';` |
| `dev/08_reset_test_data.sql` | সব রেকর্ড ও সিরিয়াল-বদলের লগ মুছে কাউন্টার ০ (২০২৬-০৯-৩০ এ একবার চালানো হয়েছিল) | টেবিলে রেকর্ড থাকলে থামে; ইচ্ছাকৃত হলে শুরুতে `set asf.confirm_reset = 'YES';` |

পর্ব ২ (বহু-প্রকল্প) এর নতুন SQL (১০, ১০b, ১১, ১২, ব্যাকআপ, রোলব্যাক) আসবে M-ধাপ ২–৩-এ — ক্রম ও নিয়ম: `docs/MULTI_PROJECT_PLAN.md` §৬.৪।

পুরো ধাপে-ধাপে নির্দেশনা: `docs/HOUSING_PROGRESS.md` → ধাপ ২ → "আমাকে যা করতে হবে"।
