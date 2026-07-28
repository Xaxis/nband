-- Migration 0004: mark simulated data as simulated.
--
-- A node running the agent with --simulate produces synthetic samples shaped
-- like real instruments. That is exactly what makes it useful for testing the
-- pipeline, and exactly what makes it dangerous in a shared archive: it is
-- indistinguishable from measurement once it lands in the same tables.
--
-- The platform's whole premise is that it never claims more than it measured.
-- An archive containing synthetic data with nothing saying so violates that
-- more seriously than any scoring bug, so the distinction is recorded at the
-- schema level rather than left to whoever remembers.
--
-- Simulated nodes are excluded from the public feed by default and can never
-- contribute to a verdict.

begin;

alter table nband.nodes
  add column if not exists is_simulated boolean not null default false;

comment on column nband.nodes.is_simulated is
  'True when the node agent is running with --simulate. Synthetic data, never a measurement.';

-- Public reads exclude simulated nodes unless deliberately asked for.
drop policy if exists public_read on nband.nodes;
create policy public_read on nband.nodes
  for select using (is_public and not is_simulated);

-- Telemetry, detections, and events inherit the exclusion through their node.
drop policy if exists public_read on nband.telemetry;
create policy public_read on nband.telemetry for select using (
  exists (select 1 from nband.nodes n
           where n.id = telemetry.node_id and n.is_public and not n.is_simulated)
);

drop policy if exists public_read on nband.detections;
create policy public_read on nband.detections for select using (
  exists (select 1 from nband.nodes n
           where n.id = detections.node_id and n.is_public and not n.is_simulated)
);

commit;
