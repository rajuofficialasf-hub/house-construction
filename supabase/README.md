# Supabase (টেস্ট ব্যাকএন্ড) — SQL ফাইল

Supabase Dashboard → **SQL Editor** এ ফাইলগুলো **এই ক্রমে** চালান:

| ক্রম | ফাইল | কী করে | পোর্টেবল? |
|---|---|---|---|
| ১ | `sql/01_schema.sql` | `housing_beneficiaries` টেবিল, constraint, ইনডেক্স, updated_at ট্রিগার | হ্যাঁ (Postgres; MySQL নোট ভেতরে) |
| ২ | `sql/02_serial.sql` | সিরিয়াল কাউন্টার টেবিল + বরাদ্দ ট্রিগার + অপরিবর্তনীয়তা ট্রিগার | হ্যাঁ (Postgres) |
| ৩ | `sql/03_rls.sql` | `housing_admins` টেবিল, `is_housing_admin()`, RLS পলিসি | না (Supabase auth) |
| ৪ | `sql/04_rpc_stats.sql` | `housing_stats()`, `housing_years()` RPC | আংশিক (Postgres ফাংশন; নিজস্ব সার্ভারে endpoint) |
| ৫ | `sql/05_storage.sql` | `housing-photos` bucket ও Storage পলিসি | না (Supabase Storage) |
| ৬ | `sql/06_seed.sql` | ২০টি ডামি রেকর্ড | হ্যাঁ |
| ৭ | `sql/07_rpc_bulk.sql` | `housing_bulk_update_by_serial()` — ইম্পোর্টের "সিরিয়াল ধরে আপডেট" মোড | আংশিক (Postgres ফাংশন; নিজস্ব সার্ভারে endpoint) |
| (৮) | `sql/08_reset_test_data.sql` | ⚠ শুধু প্রকৃত ডাটা তোলার আগে একবার: seed মুছে কাউন্টার ০ | হ্যাঁ |
| ৯ | `sql/09_activity_log.sql` | একটিভিটি লগ টেবিল, রেকর্ড-ট্রিগার (create/update/delete/photo/serial আগে→পরে), `housing_log_event()` RPC, RLS (এডমিন SELECT) | আংশিক (Postgres ট্রিগার; actor Supabase JWT থেকে) |

পুরো ধাপে-ধাপে নির্দেশনা: `docs/HOUSING_PROGRESS.md` → ধাপ ২ → "আমাকে যা করতে হবে"।
