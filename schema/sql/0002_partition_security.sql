-- Migration 0002: let the ingest path actually create partitions.
--
-- ensure_telemetry_partition performs DDL, and the service role that the API
-- authenticates as does not own the nband schema, so the function was failing
-- with "permission denied for schema nband" on every call. Because the caller
-- did not check the result, rows quietly landed in telemetry_default instead --
-- exactly the outcome the function exists to prevent, and invisible until
-- someone looked at pg_tables.
--
-- SECURITY DEFINER runs it as the owner. search_path is pinned because a
-- SECURITY DEFINER function with a mutable search_path is a privilege
-- escalation waiting to happen.

begin;

create or replace function nband.ensure_telemetry_partition(for_time timestamptz)
returns void
language plpgsql
security definer
set search_path = nband, pg_temp
as $$
declare
  start_ts date := date_trunc('month', for_time)::date;
  end_ts   date := (date_trunc('month', for_time) + interval '1 month')::date;
  part     text := format('telemetry_%s', to_char(start_ts, 'YYYY_MM'));
begin
  if to_regclass(format('nband.%I', part)) is null then
    execute format(
      'create table nband.%I partition of nband.telemetry for values from (%L) to (%L)',
      part, start_ts, end_ts
    );
    execute format('grant select on nband.%I to anon, authenticated', part);
    execute format('grant all on nband.%I to service_role', part);
  end if;
end;
$$;

revoke all on function nband.ensure_telemetry_partition(timestamptz) from public;
grant execute on function nband.ensure_telemetry_partition(timestamptz) to service_role;

commit;
