-- nband grid schema, migration 0001
-- Generated against schema/bands.json and schema/spec.json at schemaVersion 0.1.0.
-- Enum members are checked against those files by tools/check-drift.mjs; adding a
-- value here without adding it there (or vice versa) fails the build.

begin;

create schema if not exists nband;
set search_path = nband, public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type band as enum (
  'gamma', 'uv', 'vis', 'nir', 'swir', 'lwir', 'mmw', 'rf',
  'elf_vlf', 'acoustic', 'seismic', 'grav', 'env', 'nav'
);

create type tier            as enum ('t1', 't2', 't3', 'tr');
create type node_status     as enum ('provisioning', 'online', 'degraded', 'offline', 'retired');
create type clock_quality   as enum ('gnss_pps', 'gnss_nopps', 'ntp', 'freerun');
create type trigger_reason  as enum ('threshold', 'motion', 'spectral', 'coincidence', 'cross_node', 'scheduled', 'manual');
create type classification  as enum ('instrumental', 'terrestrial_known', 'terrestrial_likely', 'ambiguous', 'anomalous_unresolved');
create type corroboration   as enum ('single_channel', 'multi_channel', 'multi_node');
create type artifact_kind   as enum ('image', 'video', 'iq', 'spectrogram', 'audio', 'pointcloud', 'series');
create type catalog_source  as enum ('adsb', 'tle', 'lightning', 'rfi', 'meteor', 'weather', 'solar', 'airspace');
create type variant_status  as enum ('reference', 'verified', 'submitted', 'unsupported');
create type channel_role    as enum ('detection', 'context');

-- ---------------------------------------------------------------------------
-- Hardware variant registry
-- ---------------------------------------------------------------------------

create table sensor_models (
  id            text primary key,
  band          band,
  category      text        not null,
  vendor        text        not null,
  model         text        not null,
  status        variant_status not null default 'submitted',
  interface     text,
  driver        text,
  price_usd     numeric(10,2),
  price_as_of   date,
  source_url    text,
  key_specs     jsonb       not null default '{}'::jsonb,
  notes         text,
  -- Set when a variant has been run against the conformance suite. A null here
  -- is why 'submitted' data gets flagged rather than silently trusted.
  verified_at   timestamptz,
  submitted_by  text,
  created_at    timestamptz not null default now()
);
comment on table sensor_models is
  'Community hardware-variant registry. Reference parts ship with the firmware; community substitutes are accepted and flagged until they pass conformance.';

-- ---------------------------------------------------------------------------
-- Nodes
-- ---------------------------------------------------------------------------

create table nodes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  display_name          text not null,
  operator_handle       text,
  -- Ed25519 public key, base64url. Every telemetry batch is signed with the
  -- matching private key, which never leaves the node.
  pubkey                text unique not null,
  tier                  tier not null,
  status                node_status not null default 'provisioning',

  -- Published position. Deliberately coarse: operators are running these in
  -- their gardens. location_precision_m records how much fuzz was applied so
  -- that the discriminator can widen its geometry error bars accordingly
  -- rather than treating a fuzzed position as exact.
  lat                   double precision,
  lon                   double precision,
  elevation_m           double precision,
  location_precision_m  integer not null default 1000,

  -- Obstruction profile: azimuth (deg) -> minimum usable elevation (deg).
  -- Without this, a node that simply cannot see below 20 degrees looks like a
  -- node that saw nothing there.
  horizon_mask          jsonb not null default '{}'::jsonb,

  firmware_version      text,
  schema_version        text,
  timezone              text,
  notes                 text,
  is_public             boolean not null default true,
  created_at            timestamptz not null default now(),
  last_seen_at          timestamptz,

  constraint nodes_lat_range check (lat is null or (lat between -90 and 90)),
  constraint nodes_lon_range check (lon is null or (lon between -180 and 180))
);
create index nodes_status_idx    on nodes (status);
create index nodes_last_seen_idx on nodes (last_seen_at desc nulls last);

create table node_channels (
  id              bigserial primary key,
  node_id         uuid not null references nodes(id) on delete cascade,
  -- Stable slug, unique per node. e.g. 'vis.wide', 'lwir.main', 'rf.sdr0'.
  channel_id      text not null,
  band            band not null,
  role            channel_role not null default 'detection',
  sensor_model_id text references sensor_models(id),
  unit            text not null,
  sample_rate_hz  double precision,
  -- Where this specific sensor points, independent of the node's own heading.
  azimuth_deg     double precision,
  elevation_deg   double precision,
  fov_deg         double precision,
  calibration     jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (node_id, channel_id)
);
create index node_channels_band_idx on node_channels (band);

create table node_heartbeats (
  id              bigserial primary key,
  node_id         uuid not null references nodes(id) on delete cascade,
  t               timestamptz not null,
  clock           clock_quality not null,
  clock_offset_ns bigint,
  uptime_s        bigint,
  cpu_temp_c      double precision,
  load_avg        double precision,
  disk_free_bytes bigint,
  power_w         double precision,
  battery_pct     double precision,
  -- Per-channel health: { "vis.wide": "ok", "lwir.main": "ffc" }
  channel_health  jsonb not null default '{}'::jsonb,
  firmware_version text
);
create index node_heartbeats_node_t_idx on node_heartbeats (node_id, t desc);

-- ---------------------------------------------------------------------------
-- Telemetry (partitioned by month)
-- ---------------------------------------------------------------------------

-- t holds microsecond resolution, which is all timestamptz can carry.
-- t_ns_offset holds the remaining 0-999 ns from the PPS-disciplined clock so
-- that full nanosecond fidelity survives the round trip. Cross-node
-- time-of-arrival work reads both; everything else reads t alone.
create table telemetry (
  node_id     uuid   not null,
  channel_id  text   not null,
  t           timestamptz not null,
  t_ns_offset smallint not null default 0,
  v           double precision,
  vec         real[],
  -- Quality bitfield. bit0 clock degraded, bit1 sensor saturated,
  -- bit2 calibration stale, bit3 self-emission window, bit4 interpolated.
  q           smallint not null default 0,
  constraint telemetry_ns_offset_range check (t_ns_offset between 0 and 999)
) partition by range (t);

create index telemetry_node_channel_t_idx on telemetry (node_id, channel_id, t desc);
create index telemetry_t_brin_idx on telemetry using brin (t) with (pages_per_range = 32);

-- Auto-provision monthly partitions. Called by the ingest path so that a node
-- delivering buffered data from three weeks of downtime lands somewhere real
-- instead of hitting the default partition.
create or replace function ensure_telemetry_partition(for_time timestamptz)
returns void
language plpgsql
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
  end if;
end;
$$;

create table telemetry_default partition of telemetry default;

-- ---------------------------------------------------------------------------
-- Detections, events, verdicts
-- ---------------------------------------------------------------------------

-- A detection is node-local: one unit decided a window of data was worth keeping.
create table detections (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references nodes(id) on delete cascade,
  t_start       timestamptz not null,
  t_end         timestamptz not null,
  bands         band[] not null,
  channel_ids   text[] not null,
  trigger       trigger_reason not null,
  clock         clock_quality not null,

  -- Angular measurement. Range is null unless a radar or a geometric fix
  -- supplied it, and the schema keeps it null rather than inferring it, because
  -- an assumed range silently becomes an assumed size and an assumed speed.
  azimuth_deg   double precision,
  elevation_deg double precision,
  range_m       double precision,
  angular_rate_dps double precision,

  snr_db        double precision,
  peak_metrics  jsonb not null default '{}'::jsonb,
  track         jsonb,
  created_at    timestamptz not null default now(),

  constraint detections_time_order check (t_end >= t_start)
);
create index detections_node_t_idx on detections (node_id, t_start desc);
create index detections_t_idx      on detections (t_start desc);
create index detections_bands_idx  on detections using gin (bands);

-- An event is grid-level: one or more detections fused into a single object.
create table events (
  id              uuid primary key default gen_random_uuid(),
  t_start         timestamptz not null,
  t_end           timestamptz not null,
  node_count      integer not null default 1,
  band_count      integer not null default 1,
  bands           band[] not null,
  corroboration   corroboration not null default 'single_channel',

  -- Populated only when geometry was actually solvable: two or more
  -- PPS-disciplined nodes within the baseline limit.
  fix_lat         double precision,
  fix_lon         double precision,
  fix_altitude_m  double precision,
  fix_error_m     double precision,
  speed_mps       double precision,

  created_at      timestamptz not null default now(),
  constraint events_time_order check (t_end >= t_start)
);
create index events_t_idx on events (t_start desc);

create table event_detections (
  event_id     uuid not null references events(id) on delete cascade,
  detection_id uuid not null references detections(id) on delete cascade,
  primary key (event_id, detection_id)
);

-- The discriminator's output. One row per event per discriminator version, so
-- that re-running an improved discriminator over the archive produces a new
-- verdict alongside the old one rather than quietly rewriting history.
create table verdicts (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events(id) on delete cascade,
  classification        classification not null,
  anomaly_score         numeric(5,2) not null,
  corroboration         corroboration not null,
  -- Ordered hypothesis posteriors: [{id, label, prior, likelihood, posterior}]
  hypotheses            jsonb not null default '[]'::jsonb,
  -- Human-readable chain of reasoning. Every verdict must be able to say why.
  explanation           text not null,
  -- Catalogues that could not be reached at scoring time. A verdict computed
  -- with ADS-B unavailable is not the same claim as one computed with it, and
  -- the schema refuses to let that distinction be lost.
  unavailable_catalogs  catalog_source[] not null default '{}',
  discriminator_version text not null,
  schema_version        text not null,
  computed_at           timestamptz not null default now(),
  is_current            boolean not null default true,

  constraint verdicts_score_range check (anomaly_score between 0 and 100)
);
create index verdicts_event_idx   on verdicts (event_id);
create index verdicts_current_idx on verdicts (classification, anomaly_score desc) where is_current;

-- Audit trail of every catalogue lookup performed for an event, including the
-- ones that found nothing. "We checked ADS-B and found no aircraft" is a
-- materially different statement from "we did not check ADS-B", and both are
-- recorded here explicitly.
create table catalog_checks (
  id           bigserial primary key,
  event_id     uuid not null references events(id) on delete cascade,
  source       catalog_source not null,
  checked_at   timestamptz not null default now(),
  available    boolean not null,
  matched      boolean not null default false,
  object_id    text,
  match_score  numeric(5,2),
  delta_t_s    double precision,
  delta_bearing_deg double precision,
  detail       jsonb not null default '{}'::jsonb
);
create index catalog_checks_event_idx on catalog_checks (event_id);

create table artifacts (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references nodes(id) on delete cascade,
  detection_id uuid references detections(id) on delete cascade,
  kind         artifact_kind not null,
  band         band,
  storage_path text not null,
  bytes        bigint,
  sha256       text not null,
  captured_at  timestamptz not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index artifacts_detection_idx on artifacts (detection_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The archive is public by design. Writes go exclusively through the ingest
-- API using the service role; the anon key can read and can never write.

alter table sensor_models    enable row level security;
alter table nodes            enable row level security;
alter table node_channels    enable row level security;
alter table node_heartbeats  enable row level security;
alter table telemetry        enable row level security;
alter table detections       enable row level security;
alter table events           enable row level security;
alter table event_detections enable row level security;
alter table verdicts         enable row level security;
alter table catalog_checks   enable row level security;
alter table artifacts        enable row level security;

create policy public_read on sensor_models    for select using (true);
create policy public_read on nodes            for select using (is_public);
create policy public_read on node_channels    for select using (
  exists (select 1 from nodes n where n.id = node_channels.node_id and n.is_public)
);
create policy public_read on node_heartbeats  for select using (
  exists (select 1 from nodes n where n.id = node_heartbeats.node_id and n.is_public)
);
create policy public_read on telemetry        for select using (true);
create policy public_read on detections       for select using (true);
create policy public_read on events           for select using (true);
create policy public_read on event_detections for select using (true);
create policy public_read on verdicts         for select using (true);
create policy public_read on catalog_checks   for select using (true);
create policy public_read on artifacts        for select using (true);

commit;
