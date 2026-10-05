-- What the runtime role housing_app may do (DB-ROLE-01). Nothing is granted to PUBLIC.
-- housing_app reads everything, writes only housing_beneficiaries, and calls the functions.
-- Counters, serial changes and the activity log are written only by the security definer
-- functions owned by housing_owner, so the app can't rewrite history.
-- A migration that adds a table or function must grant housing_app what it needs.

-- migrate:up
revoke create on schema public from public;
grant usage on schema public to housing_app;

revoke all on public.housing_beneficiaries, public.housing_serial_counters,
  public.housing_serial_changes, public.housing_activity_log from public;
grant select, insert, update, delete on public.housing_beneficiaries to housing_app;
grant select on public.housing_serial_counters, public.housing_serial_changes,
  public.housing_activity_log to housing_app;

revoke execute on all functions in schema public from public;
grant execute on function
  public.housing_next_serial(text),
  public.housing_change_serial(uuid, integer),
  public.housing_stats(text),
  public.housing_years(text),
  public.housing_bulk_update_by_serial(text, jsonb),
  public.housing_log_event(text, jsonb, text)
  to housing_app;

-- migrate:down
revoke all on public.housing_beneficiaries, public.housing_serial_counters,
  public.housing_serial_changes, public.housing_activity_log from housing_app;
revoke execute on all functions in schema public from housing_app;
revoke usage on schema public from housing_app;
