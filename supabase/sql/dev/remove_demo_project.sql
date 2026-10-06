-- =====================================================================
-- dev/remove_demo_project.sql — পরীক্ষা প্রকল্প ("demo") সরানো (পর্ব ২, M-ধাপ ১৬ · চেকলিস্ট সারি ৩২) — ঐচ্ছিক
--
-- কী করে: পরীক্ষা প্রকল্পের ফিল্ড আর প্রকল্পের সারিটি মোছে। সিরিয়াল-কাউন্টারের সারি ইচ্ছাকৃতভাবে থেকে যায়
-- (একই key আবার তৈরি হলে সিরিয়াল পুনর্ব্যবহার হয় না); একটিভিটি লগের পুরনো সারি থাকে (ইতিহাস)।
--
-- আগে যা করবেন (এডমিন প্যানেল থেকে, মূল এডমিন):
--   ১. /admin/records/demo → সব রেকর্ড বাছাই করে মুছুন (ছবিসহ মোছে)।
--   ২. /admin/projects/demo → কভার ছবি থাকলে "কভার মুছুন"।
--   ৩. প্রকল্পটি অপ্রকাশিত থাকতে হবে।
-- না করলে ফাইলটি নিজেই থেমে যায় — কিছুই মোছে না (পুরো ফাইল একটি ট্রানজেকশন)।
--
-- নিরাপত্তা (সবগুলো না মিললে থামে):
--   - শুধু `rm_key` প্রকল্প (ডিফল্ট 'demo'); housing / semi_pucca / tin বা কোনো গ্রুপ কখনো নয়
--   - প্রকাশিত হলে থামে; রেকর্ড বা গোপন মান থাকলে থামে; Storage এ এর ছবি/কভার থাকলে থামে
--   - ঘর নির্মাণসহ সব রেকর্ডের ফিঙ্গারপ্রিন্ট, ছবির সংখ্যা, কাউন্টার ও stats আগে-পরে মেলায় — না মিললে সব বাতিল
--   - প্রকল্প-মোছার গার্ডের "আগে রেকর্ড ছিল" নিষেধ শুধু এই ট্রানজেকশনে খোলে (asf.allow_project_delete, local)
--
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run। অন্য প্রকল্প সরাতে নিচের rm_key বদলান।
-- পরে: নিচের শেষ select এ প্রকল্প ০, কাউন্টার ১ (থেকে যায়) দেখাবে।
-- =====================================================================

begin;

create temp table asf_rm_key on commit drop as select 'demo'::text as rm_key;  -- ← শুধু এখানে বদলান

do $rm$
declare
  k        text := (select rm_key from asf_rm_key);
  p        public.projects%rowtype;
  cnt      bigint;
  before_d jsonb;
  after_d  jsonb;
begin
  if k is null or k in ('housing', 'semi_pucca', 'tin') then
    raise exception 'থামানো হয়েছে: «%» ঘর নির্মাণের প্রকল্প — এই ফাইল দিয়ে কখনো সরানো যাবে না। কিছুই মোছা হয়নি।', k;
  end if;

  select * into p from public.projects where key = k;
  if not found then
    raise notice '«%» নামে কোনো প্রকল্প নেই — কিছু করার নেই (আগেই সরানো হয়েছে?)।', k;
    return;
  end if;
  if p.is_group then
    raise exception 'থামানো হয়েছে: «%» একটি প্রকল্প-গ্রুপ — এই ফাইল শুধু পরীক্ষা প্রকল্পের জন্য। কিছুই মোছা হয়নি।', p.name_bn;
  end if;
  if p.is_published then
    raise exception 'থামানো হয়েছে: «%» প্রকাশিত — আগে প্যানেল থেকে অপ্রকাশিত করুন। কিছুই মোছা হয়নি।', p.name_bn;
  end if;

  select count(*) into cnt from public.housing_beneficiaries where project_type = k;
  if cnt > 0 then
    raise exception 'থামানো হয়েছে: «%» প্রকল্পে এখনো % টি রেকর্ড আছে — আগে /admin/records/% থেকে মুছুন (ছবিসহ)। কিছুই মোছা হয়নি।', p.name_bn, cnt, k;
  end if;
  select count(*) into cnt from public.beneficiary_private bp
   where not exists (select 1 from public.housing_beneficiaries b where b.id = bp.record_id);
  if cnt > 0 then
    raise notice 'তথ্য: % টি গোপন-মানের সারির রেকর্ড নেই (অন্য কারণে) — এই ফাইল সেগুলোতে হাত দেয় না।', cnt;
  end if;
  select count(*) into cnt from storage.objects
   where bucket_id = 'housing-photos'
     and (name like 'housing/' || k || '/%' or name like 'housing/_projects/' || k || '/%');
  if cnt > 0 then
    raise exception 'থামানো হয়েছে: Storage এ «%» প্রকল্পের % টি ছবি/কভার ফাইল আছে — আগে প্যানেল থেকে রেকর্ড ও কভার মুছুন (বা Storage → housing-photos → housing/% ও housing/_projects/% ফোল্ডার)। কিছুই মোছা হয়নি।', p.name_bn, cnt, k, k;
  end if;

  -- আগে-পরে মেলানোর ছাপ (লগ বাদ — মোছার লগ যোগ হওয়া স্বাভাবিক)
  before_d := asf_meta.data_fingerprint() - 'log';

  perform set_config('asf.allow_project_delete', 'on', true);  -- শুধু এই ট্রানজেকশনে
  delete from public.project_fields where project_key = k;
  delete from public.projects where key = k;
  perform set_config('asf.allow_project_delete', '', true);

  after_d := asf_meta.data_fingerprint() - 'log';
  if after_d is distinct from before_d then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি (পুরো ফাইল বাতিল)। ফলাফল AI-কে পাঠান। আগে: % · পরে: %', before_d, after_d;
  end if;
  raise notice '«%» (%) সরানো হয়েছে — ফিল্ড ও প্রকল্প মোছা; কাউন্টার ও লগ থেকে গেছে; বাকি সব ডাটা অক্ষত ✅', p.name_bn, k;
end
$rm$;

commit;

-- যাচাই: projects = 0 (সরানো হয়েছে), fields = 0, counter = 1 (ইচ্ছাকৃতভাবে থাকে)
select k.rm_key                                                                      as key,
       (select count(*) from public.projects where key = k.rm_key)                   as projects,
       (select count(*) from public.project_fields where project_key = k.rm_key)     as fields,
       (select count(*) from public.housing_serial_counters where project_type = k.rm_key) as counter
  from (select 'demo'::text as rm_key) k;  -- ← উপরে বদলালে এখানেও
