-- Stop publishing node public keys to the anonymous role.
--
-- The public key is how a node authenticates, so it was stored on the node row
-- and, because the row is world-readable, handed to every visitor. On its own
-- that is close to harmless: an Ed25519 public key verifies signatures and
-- forges nothing. It became a real problem in combination with the position
-- fuzzing, which seeded its offset from that same key. Anyone could read the
-- key, recompute the offset, and subtract it to recover the operator's true
-- coordinates.
--
-- The offset no longer derives from the key (see fuzzPosition in
-- apps/web/lib/grid/ingest.ts, now keyed on a server-only salt), so this is
-- defence in depth rather than the fix. It holds regardless: the browser has
-- never selected the column, and nothing that authenticates a node should be
-- readable by people who are not that node.
--
-- Note on mechanism. A column-level `revoke select (pubkey)` does nothing here,
-- because a table-level SELECT grant already implies every column and outranks
-- it. The only way to withhold one column is to drop the table-level grant and
-- re-grant the columns that should be public, one by one. That is what this
-- does, and it inverts the default in a useful way: a column added later is
-- private until it is named here. New columns will fail visibly in the browser
-- rather than quietly publishing themselves.
--
-- RLS is untouched. Policies choose rows, grants choose columns, and the row
-- itself must stay public. service_role holds its own grants and continues to
-- read pubkey for signature verification.

revoke select on nband.nodes from anon, authenticated;

grant select (
  id, slug, display_name, operator_handle, tier, status,
  lat, lon, elevation_m, location_precision_m, horizon_mask,
  firmware_version, schema_version, timezone, notes,
  is_public, created_at, last_seen_at, is_simulated
) on nband.nodes to anon, authenticated;

-- Assert the outcome rather than trusting the mechanism. This is exactly the
-- check that caught the column-versus-table grant precedence in the first place.
do $$
begin
  if has_column_privilege('anon', 'nband.nodes', 'pubkey', 'select') then
    raise exception 'anon can still select nband.nodes.pubkey';
  end if;
  if not has_column_privilege('anon', 'nband.nodes', 'slug', 'select') then
    raise exception 'anon lost read access to nband.nodes.slug';
  end if;
end $$;
