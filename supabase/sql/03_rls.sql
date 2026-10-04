-- =====================================================================
-- 03_rls.sql — Supabase-নির্দিষ্ট: এডমিন তালিকা ও Row Level Security
-- নিয়ম: পড়া সবার জন্য (anon সহ); INSERT/UPDATE/DELETE শুধু লগইন করা এডমিন।
-- "এডমিন" = auth.users এর যে ব্যবহারকারীর সারি housing_admins টেবিলে আছে।
-- (শুধু "লগইন করা যেকোনো ইউজার" ধরলে ইমেইল সাইন-আপ খোলা থাকলে যে কেউ এডমিন হয়ে যেত।)
-- =====================================================================

-- ---------- এডমিন তালিকা ----------
-- role: আপাতত শুধু 'admin' (সবার সমান অধিকার)। ভবিষ্যতে 'editor'/'viewer' ইত্যাদি যোগ করতে
-- CHECK constraint বাড়িয়ে পলিসিতে role অনুযায়ী শর্ত দিলেই হবে; ফ্রন্টএন্ড AuthUser.role এ মান পায়।
create table if not exists public.housing_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint housing_admins_role_check check (role in ('admin'))
);
-- আগে টেবিল তৈরি হয়ে থাকলে (role ছাড়া):
alter table public.housing_admins add column if not exists role text not null default 'admin';

alter table public.housing_admins enable row level security;

-- নিজের সারি নিজে দেখতে পারবে (UI তে "আমি কি এডমিন" দেখানোর জন্য); কেউ লিখতে পারবে না API দিয়ে
drop policy if exists "housing_admins_select_self" on public.housing_admins;
create policy "housing_admins_select_self"
  on public.housing_admins for select
  to authenticated
  using (user_id = auth.uid());

-- বর্তমান ব্যবহারকারী এডমিন কি না (RLS পলিসি ও ফ্রন্টএন্ডের RPC দুটোতেই ব্যবহৃত)
create or replace function public.is_housing_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.housing_admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_housing_admin() to anon, authenticated;

-- বর্তমান ব্যবহারকারীর এডমিন তথ্য (role); এডমিন না হলে খালি। ফ্রন্টএন্ড AuthProvider এটি ডাকে।
create or replace function public.housing_current_admin()
returns table (role text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select a.role, a.email
    from public.housing_admins a
   where a.user_id = auth.uid();
$$;

grant execute on function public.housing_current_admin() to authenticated;

-- ---------- মূল টেবিল ----------
alter table public.housing_beneficiaries enable row level security;

drop policy if exists "housing_beneficiaries_public_read" on public.housing_beneficiaries;
create policy "housing_beneficiaries_public_read"
  on public.housing_beneficiaries for select
  to anon, authenticated
  using (true);

drop policy if exists "housing_beneficiaries_admin_insert" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_insert"
  on public.housing_beneficiaries for insert
  to authenticated
  with check (public.is_housing_admin());

drop policy if exists "housing_beneficiaries_admin_update" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_update"
  on public.housing_beneficiaries for update
  to authenticated
  using (public.is_housing_admin())
  with check (public.is_housing_admin());

drop policy if exists "housing_beneficiaries_admin_delete" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_delete"
  on public.housing_beneficiaries for delete
  to authenticated
  using (public.is_housing_admin());

-- ---------- সিরিয়াল বদলের অডিট লগ (টেবিল 02_serial.sql এ) ----------
drop policy if exists "housing_serial_changes_admin_read" on public.housing_serial_changes;
create policy "housing_serial_changes_admin_read"
  on public.housing_serial_changes for select
  to authenticated
  using (public.is_housing_admin());

-- ---------- কাউন্টার টেবিল ----------
-- RLS চালু, কোনো পলিসি নেই → API দিয়ে কেউ পড়তে/লিখতে পারবে না।
-- ট্রিগার ফাংশন security definer বলে ইনসার্টের সময় ঠিকই আপডেট হয়।
alter table public.housing_serial_counters enable row level security;

-- ---------- এডমিন যোগ করার নমুনা ----------
-- সাইন-আপ বন্ধ (Dashboard → Authentication → Providers → Email → "Allow new users to sign up" off)।
-- নতুন এডমিন শুধু এভাবে: আগে Dashboard → Authentication → Users → Add user (Auto Confirm), তারপর:
-- insert into public.housing_admins (user_id, email, role)
-- select id, email, 'admin' from auth.users where email = 'admin@example.org'
-- on conflict (user_id) do nothing;
-- এডমিন বাদ দিতে: delete from public.housing_admins where email = 'admin@example.org';
-- (auth.users এ ইউজার থাকলেও housing_admins এ না থাকলে লগইন করা যাবে, কিন্তু অ্যাপ সাথে সাথে signOut করে ও RLS লেখা আটকায়)
