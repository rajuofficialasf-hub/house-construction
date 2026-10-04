-- =====================================================================
-- 05_storage.sql — Supabase Storage: ছবির bucket ও পলিসি
-- bucket: housing-photos (public read)। ফাইল পাথ (ধাপ ৭ নিয়ম, utils/imagePath.ts › photoPath):
--   housing/{project_type}/{serial ৪ অঙ্ক}/prev.webp | prev_thumb.webp | current.webp | current_thumb.webp
--   যেমন housing/semi_pucca/0001/prev.webp, housing/tin/0012/current_thumb.webp
-- একই সিরিয়ালের ছবি আপডেট = একই পাথে ওভাররাইট (upsert); রেকর্ডের photo_updated_at বদলায় (?v= ক্যাশ-বাস্টিং)।
-- সব ছবি ক্লায়েন্ট/স্ক্রিপ্টে WebP হয়ে আসে; allowed_mime_types এ jpeg/png রাখা আছে ভবিষ্যতের নমনীয়তার জন্য।
-- পড়া সবার জন্য; আপলোড/প্রতিস্থাপন/মোছা শুধু এডমিন (is_housing_admin, 03_rls.sql)।
-- মাইগ্রেশন স্ক্রিপ্ট (scripts/migrate-photos.mjs) service_role key দিয়ে চলে — RLS/পলিসি বাইপাস করে (শুধু লোকাল মেশিনে)।
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'housing-photos',
  'housing-photos',
  true,
  5242880,                                       -- ৫ MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "housing_photos_public_read" on storage.objects;
create policy "housing_photos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'housing-photos');

drop policy if exists "housing_photos_admin_insert" on storage.objects;
create policy "housing_photos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'housing-photos' and public.is_housing_admin());

drop policy if exists "housing_photos_admin_update" on storage.objects;
create policy "housing_photos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_admin())
  with check (bucket_id = 'housing-photos' and public.is_housing_admin());

drop policy if exists "housing_photos_admin_delete" on storage.objects;
create policy "housing_photos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_admin());
