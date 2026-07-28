-- Migration 0005: finish excluding simulated data from public reads.
--
-- Migration 0004 flagged simulated nodes and filtered nodes, telemetry, and
-- detections. It did not touch events, verdicts, catalog_checks, or artifacts,
-- all of which are publicly readable and all of which are derived from the very
-- detections that were being hidden. The archive therefore still exposed
-- synthetic events and synthetic verdicts through the front door while claiming
-- to have excluded them.
--
-- Events reach a node only through event_detections -> detections -> nodes, so
-- the policies below traverse that path rather than assuming a direct column.

begin;

drop policy if exists public_read on nband.events;
create policy public_read on nband.events for select using (
  exists (
    select 1
      from nband.event_detections ed
      join nband.detections d on d.id = ed.detection_id
      join nband.nodes n on n.id = d.node_id
     where ed.event_id = events.id
       and n.is_public
       and not n.is_simulated
  )
);

drop policy if exists public_read on nband.event_detections;
create policy public_read on nband.event_detections for select using (
  exists (
    select 1 from nband.detections d join nband.nodes n on n.id = d.node_id
     where d.id = event_detections.detection_id and n.is_public and not n.is_simulated
  )
);

drop policy if exists public_read on nband.verdicts;
create policy public_read on nband.verdicts for select using (
  exists (select 1 from nband.events e where e.id = verdicts.event_id)
);

drop policy if exists public_read on nband.catalog_checks;
create policy public_read on nband.catalog_checks for select using (
  exists (select 1 from nband.events e where e.id = catalog_checks.event_id)
);

drop policy if exists public_read on nband.artifacts;
create policy public_read on nband.artifacts for select using (
  exists (
    select 1 from nband.nodes n
     where n.id = artifacts.node_id and n.is_public and not n.is_simulated
  )
);

drop policy if exists public_read on nband.node_heartbeats;
create policy public_read on nband.node_heartbeats for select using (
  exists (
    select 1 from nband.nodes n
     where n.id = node_heartbeats.node_id and n.is_public and not n.is_simulated
  )
);

commit;
