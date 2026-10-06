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

**ব্যতিক্রম — লাইভে চালানো যায় (ঐচ্ছিক, পর্ব ২ M-ধাপ ১৬, চেকলিস্ট সারি ৩২):**
| ফাইল | কী করে | গার্ড (না মিললে কিছুই না মুছে থামে) |
|---|---|---|
| `dev/remove_demo_project.sql` | পরীক্ষা প্রকল্প `demo` এর ফিল্ড ও প্রকল্পের সারি মোছে; সিরিয়াল-কাউন্টার ও লগ থেকে যায় | ঘর নির্মাণ/গ্রুপ কখনো নয়; প্রকাশিত, রেকর্ড আছে, বা Storage এ ছবি/কভার আছে → থামে; বাকি ডাটার ছাপ আগে-পরে মেলায়। আগে প্যানেল থেকে রেকর্ড ও কভার মুছুন, প্রকল্প অপ্রকাশিত রাখুন |

### পর্ব ২ — বহু-প্রকল্প (ক্রম ও নিয়ম: `docs/MULTI_PROJECT_PLAN.md` §৬.৪; নির্দেশনা: `docs/HOUSING_PROGRESS.md` → পর্ব ২)
| ক্রম | ফাইল | কী করে |
|---|---|---|
| ২৫ | `backup/before_10.sql` (আগে Table Editor থেকে CSV এক্সপোর্ট) | `backup` স্কিমায় লাইভ টেবিলের কপি |
| ২৬ | `10_projects.sql` → `checks/10_verify.sql` | প্রকল্প রেজিস্ট্রি, ফিল্ড, গোপন টেবিল, FK, নতুন কলাম, RLS (শুধু সম্প্রসারণ) → বেসলাইনের সাথে মেলানো |
| ২৭ | `10b_project_guards.sql` → `checks/10b_selftest.sql` → `checks/rollback_rehearsal.sql` | যাচাই-ট্রিগার ও গার্ড → ২০টি নিজে-ফিরে-যাওয়া পরীক্ষা → রোলব্যাকের মহড়া |
| ২৮ | `backup/before_11.sql` → `11_project_rpcs.sql` → `checks/11_selftest.sql` | কপি → প্রকল্পের RPC (স্ট্যাট, ওভারভিউ, wrapper, বাল্ক v2, এডমিন RPC) → ১২টি পরীক্ষা |
| ২৯ | `backup/before_12.sql` → `12_activity_log_v2.sql` → `checks/12_selftest.sql` | কপি → লগ v2 → ৬টি পরীক্ষা |
| ৩০ | `checks/rollback_rehearsal.sql` (+ AI: `npm run security-check`) | ১০–১২ এর রোলব্যাকের মহড়া |
| ৩১ (ঐচ্ছিক) | `checks/11_perf_optional.sql`, তারপর আলাদাভাবে `VACUUM ANALYZE public.housing_beneficiaries;` | ৫,০০০ কৃত্রিম রেকর্ডে সময় মাপা (সব ফেরত) |
| (জরুরি) | `rollback/10_12_rollback.sql` | শুধু AI-এর পরামর্শে; নতুন ডাটা থাকলে নিজেই থামে; SQL ১৪ চালানো থাকলে আগে `rollback/14_rollback.sql` |
| ৩৪ | `13_money_limit.sql` | টাকার সীমা ১০০০ কোটি (ফেরাতে `rollback/13_rollback.sql`) |
| ৩৫ (পর্ব চ) | `backup/before_14.sql` → `14_project_users.sql` → `checks/14_selftest.sql` → `checks/14_rollback_rehearsal.sql` | কপি → প্রকল্পভিত্তিক ইউজার, "মোছার সমান" কাজ শুধু মূল এডমিন → ১৭টি নিজে-ফিরে-যাওয়া পরীক্ষা → রোলব্যাকের মহড়া (১৪-এর আগের গভীর ছাপের সাথে) |
| (জরুরি) | `rollback/14_rollback.sql` | ১৪ ফেরানো; বরাদ্দ-সীমা উঠে যায় (প্রকল্পের ইউজার আবার সব প্রকল্পের এডমিন), নিষ্ক্রিয়রা মুছে যায় |

রোলব্যাক উল্টো ক্রমে কাজ করে (১২ → ১১ → ১০b → ১০) এবং পুরনো ফাংশনগুলো মূল ফাইল থেকে হুবহু ফেরত আনে। রোলব্যাক ফাইল বদলালে `npm run build-rehearsal` দিয়ে মহড়া-ফাইল আবার তৈরি করতে হয়।

### এডমিনের ভূমিকা (SQL ১৪ থেকে — পর্ব চ)
- **মূল এডমিন** (`role = 'main_admin'`, একজনই): সব — মোছা, থাকা ছবি বদল, মান ফাঁকা করা, সিরিয়াল বদল, প্রকল্পের সেটিংস, ইউজার।
- **প্রকল্পের ইউজার** (`role = 'editor'`): শুধু বরাদ্দ প্রকল্পে (`housing_admin_projects`; `all_projects = true` হলে সব) যোগ ও এডিট। `is_active = false` হলে কিছুই নয়।
- নতুন ইউজার: Dashboard → Authentication → Users → Add user (Auto Confirm), তারপর প্যানেলের ইউজার-পাতা (M-ধাপ ১৯)। তার আগে SQL Editor-এ (মূল এডমিনের সেশনে নয়, তাই সরাসরি টেবিলে):
  `insert into public.housing_admins (user_id, email, role, all_projects) select id, email, 'editor', false from auth.users where email = 'নতুন@ইমেইল' on conflict (user_id) do nothing;`
  `insert into public.housing_admin_projects (user_id, project_key) select id, 'self_reliance_project' from auth.users where email = 'নতুন@ইমেইল';`
- মূল এডমিন বদল (একই ট্রানজেকশনে, কারণ মূল এডমিন একজনই):
  `begin; update public.housing_admins set role = 'editor', all_projects = true where role = 'main_admin'; update public.housing_admins set role = 'main_admin' where email = 'নতুন-মূল@ইমেইল'; commit;`
- SQL ১৪-এর আগে (পুরনো নিয়ম) ভূমিকা ছিল `main_admin` / `admin`; ১৪ চালানোর পরে `'admin'` দিয়ে যোগ করলে ডাটাবেস আটকায়।

পুরো ধাপে-ধাপে নির্দেশনা: `docs/HOUSING_PROGRESS.md` → ধাপ ২ → "আমাকে যা করতে হবে"।
