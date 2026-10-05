-- =====================================================================
-- dev/08_reset_test_data.sql — ⚠⚠ বিপজ্জনক: সব রেকর্ড ও সিরিয়াল-বদলের লগ মুছে কাউন্টার ০ করে
-- ইতিহাস: ২০২৬-০৯-৩০ এ একবার চালানো হয়েছিল (seed মুছে প্রকৃত ইম্পোর্টের আগে)। এখন লাইভ ডাটা আছে।
-- M-ধাপ ১ (২০২৬-১০-০৫): supabase/sql/ থেকে dev/ এ সরানো হয়েছে এবং গার্ড বসানো হয়েছে —
--   টেবিলে রেকর্ড থাকলে ফাইলটি নিজেই থেমে যায় (কিছুই মোছে না)।
--   শুধু টেস্ট ডাটাবেসে ইচ্ছাকৃতভাবে চালাতে হলে একদম শুরুতে লিখুন:  set asf.confirm_reset = 'YES';
-- Storage এর ছবি (housing-photos bucket) এটি মোছে না। এডমিন তালিকা (housing_admins) অপরিবর্তিত থাকে।
-- =====================================================================

begin;

do $guard$
begin
  if exists (select 1 from public.housing_beneficiaries)
     and coalesce(current_setting('asf.confirm_reset', true), '') <> 'YES' then
    raise exception 'থামানো হয়েছে: টেবিলে আসল রেকর্ড আছে। এই ফাইল সব রেকর্ড মুছে দিত — কিছুই মোছা হয়নি।'
      using hint = 'লাইভ ডাটাবেসে এটি কখনো চালাবেন না। শুধু টেস্ট ডাটাবেসে: ফাইলের শুরুতে লিখুন set asf.confirm_reset = ''YES'';';
  end if;
end
$guard$;

delete from public.housing_serial_changes;
delete from public.housing_beneficiaries;
update public.housing_serial_counters set last_serial = 0;

commit;

-- যাচাই: দুটোই ০ হওয়া উচিত
select (select count(*) from public.housing_beneficiaries) as records,
       (select sum(last_serial) from public.housing_serial_counters) as counters;
