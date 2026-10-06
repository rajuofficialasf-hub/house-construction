-- Times the reads that grow with the data: the default list page, a search, and activity pages
-- filtered by project and by actor (server/src/housing/reads.ts, server/src/housing/activity.ts).
-- Read-only. Run it against a database that holds production-sized data (the C7 rehearsal on staging,
-- docs/operations/runbook.md section 19) as housing_app; any "Execution Time" over 50 ms is a finding.
--   psql "$DATABASE_URL" -v q='<a common name fragment>' -v actor='<part of an admin email>' -f deploy/sql/perf-check.sql
\set ON_ERROR_STOP on
\if :{?q}
\else
  \set q 'রহিম'
\endif
\if :{?actor}
\else
  \set actor '@'
\endif

\echo '== default list page (sort by serial) =='
explain (analyze, buffers, costs off)
select id, project_type, serial_no, name from public.housing_beneficiaries
order by serial_no asc, project_type asc, id asc limit 50;
explain (analyze, buffers, costs off)
select count(*) from public.housing_beneficiaries;

\echo '== search =='
explain (analyze, buffers, costs off)
select id, project_type, serial_no, name from public.housing_beneficiaries
where name ilike '%' || :'q' || '%' or father_or_husband_name ilike '%' || :'q' || '%' or address ilike '%' || :'q' || '%'
order by serial_no asc, project_type asc, id asc limit 50;

\echo '== activity by project =='
explain (analyze, buffers, costs off)
select id from public.housing_activity_log where project_type = 'tin' order by at desc, id desc limit 50;

\echo '== activity by actor =='
explain (analyze, buffers, costs off)
select id from public.housing_activity_log where actor_email ilike '%' || :'actor' || '%' order by at desc, id desc limit 50;
