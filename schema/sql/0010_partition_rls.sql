-- Migration 0010: close the partition-shaped hole in row level security.
--
-- Every table in the nband schema had RLS enabled and a policy since 0001, and
-- 0004 and 0005 narrowed those policies until a simulated or non-public node
-- was invisible to anon. All of that was applied to nband.telemetry, the
-- partitioned parent. None of it was applied to the partitions themselves.
--
-- Postgres applies the parent's policies when a partitioned table is queried
-- through the parent, and the partition's own policies when the partition is
-- named directly. A partition with RLS disabled therefore answers a direct
-- query with every row it holds, whatever the parent's policy says. Migration
-- 0002 then granted select on each new partition to anon and authenticated,
-- which is what turned a structural detail into a reachable one.
--
-- PostgREST does not currently route to partitions, so the Supabase Data API
-- was not serving these rows. That is a property of one component's schema
-- cache rather than a decision this schema made, and it is not the guarantee
-- the archive claims. The guarantee is that a simulated node's samples are not
-- public, and that has to hold in the database.
--
-- Nothing needs to read a partition directly. Reads go through the parent, and
-- the grants on the partitions were never load-bearing: permission for a
-- partitioned read is checked on the parent alone. So the fix is to enable RLS
-- with no policy, which denies direct access outright, and to drop the grants.
-- Parent reads are unaffected, because the parent's policy is what applies
-- there.
--
-- Writes are unaffected. The ingest path authenticates as service_role, which
-- holds BYPASSRLS.

begin;

-- Enabling RLS and dropping the grants is two statements that have to agree in
-- three places: the backfill below, the ingest path that creates next month's
-- partition, and any partition somebody creates by hand. Defining them once
-- means the three cannot drift apart.
create or replace function nband.secure_telemetry_partition(part regclass)
returns void
language plpgsql
security definer
set search_path = nband, pg_catalog, pg_temp
as $$
begin
  -- Guarded rather than unconditional, because enabling RLS is itself an ALTER
  -- TABLE and the event trigger below fires on ALTER TABLE. By the time that
  -- trigger runs the catalogue already reads true, so the second call stops
  -- here instead of recursing until the stack depth limit.
  if not (select relrowsecurity from pg_class where oid = part) then
    execute format('alter table %s enable row level security', part::text);
  end if;
  -- REVOKE is not a tag the event trigger listens for, so this needs no guard.
  execute format('revoke all on %s from anon, authenticated', part::text);
end;
$$;

revoke all on function nband.secure_telemetry_partition(regclass) from public;

comment on function nband.secure_telemetry_partition(regclass) is
  'Denies direct access to a telemetry partition. RLS with no policy, and no grants to anon or authenticated. Reads go through nband.telemetry, where the policy lives.';

-- Existing partitions, including telemetry_default.
do $$
declare
  part regclass;
begin
  for part in
    select i.inhrelid::regclass
      from pg_inherits i
     where i.inhparent = 'nband.telemetry'::regclass
  loop
    perform nband.secure_telemetry_partition(part);
    raise notice 'secured %', part;
  end loop;
end $$;

-- Partitions created from now on, whoever creates them. The ingest path calls
-- ensure_telemetry_partition, but a partition made by hand during an incident
-- would otherwise arrive exposed, and that is exactly when nobody is reading
-- migration comments. An event trigger is the only place that covers both.
create or replace function nband.secure_partition_on_create()
returns event_trigger
language plpgsql
security definer
set search_path = nband, pg_catalog, pg_temp
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    -- Fires for all DDL in the database, so the parent test has to be the
    -- first thing that runs and has to be cheap.
    if obj.classid = 'pg_class'::regclass
       and exists (
         select 1 from pg_inherits
          where inhrelid = obj.objid
            and inhparent = 'nband.telemetry'::regclass
       )
    then
      perform nband.secure_telemetry_partition(obj.objid::regclass);
      raise notice 'secured new telemetry partition %', obj.object_identity;
    end if;
  end loop;
end;
$$;

-- Both helpers are SECURITY DEFINER and neither is meant to be called by hand.
-- Postgres grants execute to PUBLIC by default, and PostgREST turns anything
-- anon can execute into an RPC endpoint, so leaving the default in place would
-- publish a DDL-performing function as /rest/v1/rpc/.
revoke all on function nband.secure_partition_on_create() from public, anon, authenticated;
revoke all on function nband.secure_telemetry_partition(regclass) from anon, authenticated;

drop event trigger if exists secure_telemetry_partitions;
create event trigger secure_telemetry_partitions
  on ddl_command_end
  when tag in ('CREATE TABLE', 'ALTER TABLE')
  execute function nband.secure_partition_on_create();

-- The ingest path. The grants to anon and authenticated are gone, and the
-- result is verified rather than assumed: 0002 exists because this function
-- failed silently once and the rows went somewhere nobody looked.
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
  secured  boolean;
begin
  if to_regclass(format('nband.%I', part)) is null then
    execute format(
      'create table nband.%I partition of nband.telemetry for values from (%L) to (%L)',
      part, start_ts, end_ts
    );
    execute format('grant all on nband.%I to service_role', part);

    -- The event trigger has already run at this point. Calling it again is
    -- idempotent and keeps this function correct on its own, and the check
    -- below fails the ingest rather than letting an exposed partition collect
    -- a month of samples.
    perform nband.secure_telemetry_partition(format('nband.%I', part)::regclass);

    select relrowsecurity into secured
      from pg_class where oid = format('nband.%I', part)::regclass;
    if not secured then
      raise exception 'partition nband.% was created without row level security', part;
    end if;
  end if;
end;
$$;

revoke all on function nband.ensure_telemetry_partition(timestamptz) from public;
grant execute on function nband.ensure_telemetry_partition(timestamptz) to service_role;

-- ingest_nonces holds replay-protection state and is written only by the ingest
-- path as service_role. It has had RLS with no policy since 0006, so anon could
-- not read it, but it also carried a select grant that said otherwise. Removing
-- the grant makes the intent legible to the next person reading the table list.
revoke all on nband.ingest_nonces from anon, authenticated;

comment on table nband.ingest_nonces is
  'Replay protection. Deliberately has no RLS policy: nothing outside the ingest path may read it, and service_role bypasses RLS.';

-- Asserted here rather than left to the advisor, which reports weekly by email.
do $$
declare
  exposed text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into exposed
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
   where i.inhparent = 'nband.telemetry'::regclass
     and not c.relrowsecurity;
  if exposed is not null then
    raise exception 'telemetry partitions without row level security: %', exposed;
  end if;

  select string_agg(format('%s/%s', table_name, grantee), ', ')
    into exposed
    from information_schema.role_table_grants
   where table_schema = 'nband'
     and grantee in ('anon', 'authenticated')
     and table_name in (
       select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
        where i.inhparent = 'nband.telemetry'::regclass
     );
  if exposed is not null then
    raise exception 'telemetry partitions still granted to public roles: %', exposed;
  end if;

  raise notice 'all telemetry partitions are unreachable except through the parent';
end $$;

commit;
