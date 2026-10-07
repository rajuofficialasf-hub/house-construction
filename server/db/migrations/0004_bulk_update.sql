-- Bulk update by serial (0006 grants it to housing_app; 0014 replaces it with v2).

-- migrate:up
-- =====================================================================
-- বাল্ক ইম্পোর্টের "সিরিয়াল ধরে আপডেট" মোড
-- p_rows: [{"serial_no": 1, "year": 2024, "name": "...", "father_or_husband_name": "...", "division": "...",
--           "district": "...", "upazila": "...", "address": "...", "prev_photo_source": "...", "current_photo_source": "..."}, ...]
-- যে ফিল্ড JSON এ নেই (null) সেটি অপরিবর্তিত থাকে। (project_type, serial_no) না মিললে সেই সিরিয়াল "missing" তালিকায়।
-- এডমিন যাচাই সার্ভার করে (NE-SEC-03)।
-- এক কলে সর্বোচ্চ ৫০০ সারি পাঠানোর নিয়ম (ফ্রন্টএন্ড ২০০ করে পাঠায়)।
-- =====================================================================

create or replace function public.housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        jsonb;
  s        integer;
  n        integer;
  updated  integer := 0;
  missing  integer[] := '{}';
begin
  if p_project_type not in ('semi_pucca', 'tin') then
    raise exception 'অচেনা project_type: %', p_project_type using errcode = '23514';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    s := (r->>'serial_no')::integer;
    if s is null then
      raise exception 'প্রতিটি সারিতে serial_no লাগবে' using errcode = '23502';
    end if;
    update public.housing_beneficiaries b
       set year                   = coalesce((r->>'year')::integer, b.year),
           name                   = coalesce(nullif(r->>'name', ''), b.name),
           father_or_husband_name = coalesce(r->>'father_or_husband_name', b.father_or_husband_name),
           division               = coalesce(nullif(r->>'division', ''), b.division),
           district               = coalesce(nullif(r->>'district', ''), b.district),
           upazila                = coalesce(nullif(r->>'upazila', ''), b.upazila),
           address                = coalesce(r->>'address', b.address),
           prev_photo_source      = coalesce(r->>'prev_photo_source', b.prev_photo_source),
           current_photo_source   = coalesce(r->>'current_photo_source', b.current_photo_source)
     where b.project_type = p_project_type and b.serial_no = s;
    get diagnostics n = row_count;
    if n = 0 then
      missing := missing || s;
    else
      updated := updated + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', updated, 'missing', to_jsonb(missing));
end;
$$;

-- migrate:down
drop function if exists public.housing_bulk_update_by_serial(text, jsonb);
