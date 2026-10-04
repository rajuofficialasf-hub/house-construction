-- =====================================================================
-- 08_reset_test_data.sql — টেস্ট (seed) ডাটা মুছে প্রকৃত ইম্পোর্টের জন্য পরিষ্কার শুরু
-- ⚠ শুধু প্রকৃত ডাটা তোলার আগে একবার চালান। এটি সব রেকর্ড, সিরিয়াল-বদলের লগ মুছে দেয় এবং
--   কাউন্টার ০ করে (সাধারণ নিয়মে কাউন্টার কখনো কমে না; এখানে ব্যতিক্রম কারণ সবটাই ডামি ডাটা)।
--   Storage এর ছবি (housing-photos bucket) এটি মোছে না — seed এ ছবি ছিল না; থাকলে Dashboard → Storage থেকে মুছুন।
--   এডমিন তালিকা (housing_admins) অপরিবর্তিত থাকে।
-- =====================================================================

begin;

delete from public.housing_serial_changes;
delete from public.housing_beneficiaries;
update public.housing_serial_counters set last_serial = 0;

commit;

-- যাচাই: দুটোই ০ হওয়া উচিত
select (select count(*) from public.housing_beneficiaries) as records,
       (select sum(last_serial) from public.housing_serial_counters) as counters;
