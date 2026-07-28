-- Stream the things worth interrupting for, and nothing else.
--
-- Two different needs live under the word "realtime", and conflating them
-- produces something that serves neither.
--
-- Detections, events, verdicts and heartbeats are rare, individually
-- meaningful, and worth pushing the moment they happen. A detection is the
-- product; a verdict changing is the archive changing its mind. These get a
-- genuine row-level subscription.
--
-- Telemetry is the opposite and is deliberately absent. A single node at 20 Hz
-- across ten channels is two hundred rows a second, and a browser does not want
-- them individually — it wants a summary per channel per second, which is a
-- server-side aggregate rather than a subscription. Adding telemetry here would
-- work in a demo with one simulated node and fall over the day a real grid
-- exists, which is the worst possible time to find out.
--
-- Row-level security still applies to what a subscriber receives, so a
-- simulated node's detections never reach the public stream. That is the same
-- guarantee migration 0005 had to add to the REST surface after it was found
-- missing, and it is asserted below rather than assumed, because "realtime
-- bypasses RLS" is a common and expensive misunderstanding.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table nband.detections;
alter publication supabase_realtime add table nband.events;
alter publication supabase_realtime add table nband.verdicts;
alter publication supabase_realtime add table nband.node_heartbeats;

-- Replica identity full, so an update carries the old row as well as the new.
-- A verdict being superseded is the single most interesting update the platform
-- produces, and a subscriber that only sees the new row cannot tell what
-- changed.
alter table nband.verdicts        replica identity full;
alter table nband.events          replica identity full;
alter table nband.detections      replica identity default;
alter table nband.node_heartbeats replica identity default;

do $$
declare
  streamed text;
  telemetry_present boolean;
begin
  select string_agg(tablename, ', ' order by tablename)
    into streamed
    from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'nband';

  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'nband' and tablename like 'telemetry%'
  ) into telemetry_present;

  if telemetry_present then
    raise exception 'telemetry is in the realtime publication; it must not be (see the comment above)';
  end if;

  -- Every streamed table must still have RLS on. A table published to
  -- subscribers with RLS disabled is a public firehose of everything in it.
  if exists (
    select 1
      from pg_publication_tables p
      join pg_class c on c.relname = p.tablename
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
     where p.pubname = 'supabase_realtime' and p.schemaname = 'nband' and not c.relrowsecurity
  ) then
    raise exception 'a table in the realtime publication has row-level security disabled';
  end if;

  raise notice 'realtime publication: %', streamed;
end $$;
