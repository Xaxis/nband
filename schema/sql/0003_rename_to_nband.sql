-- Migration 0003: rename the schema to nband, and stop hardcoding its name.
--
-- `alter schema ... rename` does not rewrite the text inside function bodies,
-- so ensure_telemetry_partition kept trying to create partitions in a schema
-- that no longer existed. Rewritten to rely on the pinned search_path instead
-- of a literal schema name, so the next rename is free.
--
-- Applied by hand as: alter schema bifrost rename to nband;

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
  -- Unqualified: resolved through the pinned search_path above.
  if to_regclass(part) is null then
    execute format(
      'create table %I partition of telemetry for values from (%L) to (%L)',
      part, start_ts, end_ts
    );
    execute format('grant select on %I to anon, authenticated', part);
    execute format('grant all on %I to service_role', part);
  end if;
end;
$$;

revoke all on function nband.ensure_telemetry_partition(timestamptz) from public;
grant execute on function nband.ensure_telemetry_partition(timestamptz) to service_role;

commit;
