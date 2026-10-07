-- =====================================================================
-- rollback/15_rollback.sql — SQL ১৫ (ফিল্টার অনুযায়ী পরিসংখ্যান) ফেরানো
-- শুধু নতুন ফাংশনটি মোছে; ডাটা বা অন্য কিছু বদলায় না। আবার চালালে ক্ষতি নেই।
-- ফেরানোর পরেও সাইট চলে: তালিকা-পাতার কার্ড আগের মতো সবসময় মোট দেখায় (ফ্রন্টএন্ড নিজে বুঝে নেয়)।
-- =====================================================================

begin;
drop function if exists public.project_stats_filtered(text, jsonb);
notify pgrst, 'reload schema';
commit;

select 1 as "#", 'project_stats_filtered মোছা' as "চেক",
       case when to_regprocedure('public.project_stats_filtered(text,jsonb)') is null then '✅' else '❌' end as "ফল",
       'project_stats অপরিবর্তিত' as "বিস্তারিত";
