-- Migration 0007: artifacts were readable regardless of node visibility.
--
-- Every other table gained a node-scoped policy; artifacts kept `using (true)`
-- from migration 0001, so storage paths, capture times, hashes and metadata
-- were public for nodes whose operators had set is_public = false, and for
-- simulated nodes. The binary objects live behind Storage, but the row tells
-- you they exist and where.

begin;

drop policy if exists public_read on nband.artifacts;
create policy public_read on nband.artifacts for select using (
  exists (
    select 1 from nband.nodes n
     where n.id = artifacts.node_id and n.is_public and not n.is_simulated
  )
);

commit;
