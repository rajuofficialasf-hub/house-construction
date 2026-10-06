-- Checks a restored housing database (deploy/restore-drill.sh), or a live one to compare with.
-- Read-only. Prints one "check | value" row each; the last check fails the drill if any record's
-- serial is above its project's counter, which would let a serial be handed out twice.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
\pset fieldsep ' | '

select 'records', count(*)::text from public.housing_beneficiaries
union all
select 'records ' || project_type, count(*)::text from public.housing_beneficiaries group by project_type
union all
select 'counter ' || project_type, last_serial::text from public.housing_serial_counters
union all
select 'serial changes', count(*)::text from public.housing_serial_changes
union all
select 'activity rows', count(*)::text from public.housing_activity_log
union all
select 'newest activity', coalesce(max(at)::text, 'none') from public.housing_activity_log
union all
select 'admins', count(*)::text from public.housing_admins
union all
select 'photo files', count(*)::text from public.housing_files where deleted_at is null
order by 1;

select 'serials above counter', count(*)::text
from public.housing_beneficiaries b
join public.housing_serial_counters c using (project_type)
where b.serial_no > c.last_serial;

-- ON_ERROR_STOP turns this into a non-zero psql exit, which fails the drill.
do $$
begin
  if exists (
    select from public.housing_beneficiaries b
    join public.housing_serial_counters c using (project_type)
    where b.serial_no > c.last_serial
  ) then
    raise exception 'a record has a serial above its project counter';
  end if;
end $$;
