# Security

## Reporting

Email **wil@atypic.ai**, or open a
[private advisory](https://github.com/Xaxis/nband/security/advisories/new).
Please do not open a public issue for a vulnerability that affects running
nodes or the grid.

## What the threat model actually is

nband publishes an open archive, so most of its data is public by design. The
things worth protecting are narrower, and worth stating plainly:

**Archive integrity.** Anyone able to write telemetry, detections, or verdicts
that appear to come from a node they do not control can fabricate the record.
This is the highest-value target, because the entire point of the project is
producing evidence somebody else can trust.

**Node operator location.** Published coordinates are deliberately fuzzed to the
precision each operator declares, and the true position is never stored. Any
path that reveals a precise position, that allows averaging repeated reads to
recover one, or that allows the offset itself to be reconstructed, is a
vulnerability.

> This one has already failed once. In 0.1.0 the offset was seeded by
> hashing the node's public key — a column on the world-readable `nodes` row —
> and the displacement was always exactly the declared precision, placing every
> node on a known circle. Both halves were recoverable from published data, and
> the true position could be recovered to about five metres. No operator was
> affected: the fix landed before any node enrolled, while the node table was
> still empty and the public feed still served mock data. The offset is now an
> HMAC keyed on a server-only salt, sampled uniformly over the disc, and
> `tools/check-privacy.mjs` measures the resulting distribution on every build.
> It is recorded here rather than quietly patched because a privacy guarantee
> that has failed before deserves more scepticism than one that has not.

**Node identity.** A node's Ed25519 private key is generated on the node and
never leaves it. Anything that would let a third party enrol under an existing
slug, or write on a node's behalf, is a vulnerability.

## What is deliberately public

The anon database key is read-only by row-level-security policy, and the archive
it can read is meant to be read. Reporting that it is embedded in the page is
not a finding.

Simulated nodes, and every row derived from them, are excluded from public reads
by policy. Finding synthetic data presented as measurement **is** a finding.

## Current protections

- Every write is Ed25519-signed over the request path, a timestamp, a nonce, and
  the body. The grid records each nonce, so a signed request is usable once.
  Requests more than five minutes old are refused.
- Writes use the service role exclusively and go through validation at the
  boundary. Row-level security enforces the read/write split independently.
- Enrolling a new node slug requires the grid enrolment secret. Re-enrolment
  requires signing with the key already on record.

## Known gaps

Stated rather than left for someone to discover:

- Ingest endpoints are not rate limited beyond per-batch size caps.
- `/api/contact` is unauthenticated and throttled only by a honeypot field.
- There is no revocation path for a compromised node key beyond editing the
  database directly.
