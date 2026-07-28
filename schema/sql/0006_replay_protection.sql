-- Migration 0006: make ingest requests single-use.
--
-- Signatures covered the request body alone. Nothing bound them to a path, a
-- time, or a counter, and nothing recorded that a signature had been seen, so a
-- captured request stayed valid forever and could be replayed to fabricate
-- archive content. Detections replayed into distinct events because each insert
-- generates a fresh uuid, so one real observation could be turned into hundreds
-- and inflate every rate statistic derived from the archive.
--
-- Registration was worse: the enrolment secret is only checked when the slug is
-- new, so replaying a legitimate enrolment needed no secret at all and would
-- reset a live node to 'provisioning' and wipe its channel list.
--
-- A nonce recorded per node makes each signed request usable once. The unique
-- constraint is the enforcement; the timestamp column exists so old rows can be
-- swept without consulting the signature.

begin;

create table if not exists nband.ingest_nonces (
  node_key   text        not null,
  nonce      text        not null,
  seen_at    timestamptz not null default now(),
  primary key (node_key, nonce)
);

create index if not exists ingest_nonces_seen_idx on nband.ingest_nonces (seen_at);

comment on table nband.ingest_nonces is
  'One row per accepted signed request. The primary key is what makes a replay fail.';

-- Nonces older than the accepted clock skew can never be replayed anyway,
-- because the timestamp check rejects them first.
create or replace function nband.sweep_ingest_nonces()
returns integer
language plpgsql
security definer
set search_path = nband, pg_temp
as $$
declare
  removed integer;
begin
  delete from ingest_nonces where seen_at < now() - interval '1 hour';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function nband.sweep_ingest_nonces() from public;
grant execute on function nband.sweep_ingest_nonces() to service_role;

alter table nband.ingest_nonces enable row level security;
-- No public read policy: this table is an internal replay ledger, not archive.
grant all on nband.ingest_nonces to service_role;

commit;
