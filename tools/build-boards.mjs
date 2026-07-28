#!/usr/bin/env node
/**
 * Render the generated carrier boards into artifacts the site can serve.
 *
 * Three outputs per tier, and they are not equally trustworthy, which is the
 * whole reason this file documents itself rather than just shelling out.
 *
 * The schematic is derived entirely from the netlist and needs no router, so it
 * is exactly as correct as schema/hardware.json is. It is the wiring table
 * drawn, and it is the artifact worth publishing.
 *
 * The PCB layout and the 3D model come from generated component placement and a
 * router that does not finish. They are a starting point for a person doing
 * layout, not a board anybody should fabricate, and the page that shows them
 * has to say so.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOARDS = join(root, 'hardware/boards')
const BUILD = join(BOARDS, '.build')
const PUBLIC = join(root, 'apps/web/public/boards')

const cli = join(root, 'hardware/node_modules/tscircuit/cli.mjs')
const polyfill = join(root, 'hardware/iterator-helpers-polyfill.js')
if (!existsSync(cli)) {
  console.error('The tscircuit CLI is not installed. Run `make boards-deps`.')
  process.exit(1)
}

mkdirSync(BUILD, { recursive: true })
mkdirSync(PUBLIC, { recursive: true })

let manifest = JSON.parse(readFileSync(join(BOARDS, 'manifest.json'), 'utf8'))

/**
 * Widen a board until its copper clearance measures clean.
 *
 * Board size was picked by hand and it did not converge: widening tier 2 to
 * clear a 0.103 mm violation pushed tier 3 back under the limit, and every
 * density constant tried was right for one tier and wrong for another. Routing
 * density is not a function of component count alone, so rather than keep
 * guessing at a formula the build widens, re-routes and re-measures.
 *
 * 0.127 mm edge to edge is the standard minimum the cheap fabricators quote.
 * Below it nobody will build the board, so it is worth several minutes of
 * router time to land above it.
 */
const HARD_MM = 0.127

function worstClearance(circuit) {
  const byTrace = Object.fromEntries(
    circuit.filter((e) => e.type === 'source_trace').map((e) => [e.source_trace_id, e]),
  )
  const segs = []
  for (const t of circuit.filter((e) => e.type === 'pcb_trace')) {
    const net = byTrace[t.source_trace_id]?.subcircuit_connectivity_map_key ?? t.source_trace_id
    const pts = (t.route ?? []).filter((r) => r.route_type === 'wire')
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i].layer !== pts[i + 1].layer) continue
      segs.push({ net, layer: pts[i].layer, a: pts[i], b: pts[i + 1], w: pts[i].width ?? 0.15 })
    }
  }
  const dist = (p1, p2, p3, p4) => {
    const ptSeg = (p, q, r) => {
      const dx = r.x - q.x
      const dy = r.y - q.y
      const L = dx * dx + dy * dy
      if (L === 0) return Math.hypot(p.x - q.x, p.y - q.y)
      const t = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / L))
      return Math.hypot(p.x - (q.x + t * dx), p.y - (q.y + t * dy))
    }
    const ccw = (m, n, o) => (o.y - m.y) * (n.x - m.x) > (n.y - m.y) * (o.x - m.x)
    if (ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)) return 0
    return Math.min(ptSeg(p1, p3, p4), ptSeg(p2, p3, p4), ptSeg(p3, p1, p2), ptSeg(p4, p1, p2))
  }
  let worst = Infinity
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const x = segs[i]
      const y = segs[j]
      if (x.net === y.net || x.layer !== y.layer) continue
      const edge = dist(x.a, x.b, y.a, y.b) - x.w / 2 - y.w / 2
      if (edge < worst) worst = edge
    }
  }
  return worst
}

// The CLI resolves output paths relative to the input file's directory, so
// everything runs from the boards directory with relative paths on both sides.
// Through bun with the Iterator Helpers polyfill preloaded. Without it the
// default autorouter throws and the export still reports success, producing a
// board with no copper. See hardware/iterator-helpers-polyfill.js.
const exportBoard = (tier, format, out) =>
  execFileSync('bun', ['--preload', polyfill, cli, 'export', `${tier}.tsx`, '-f', format, '-o', out], {
    cwd: BOARDS,
    stdio: 'pipe',
  })

// Widen whatever does not clear the fab minimum, then regenerate everything so
// the checked-in sources match what was measured.
const extra = {}
for (let round = 0; round < 6; round++) {
  const tight = []
  for (const b of manifest.boards) {
    try {
      exportBoard(b.tier, 'circuit-json', `.build/${b.tier}-probe.json`)
      const circuit = JSON.parse(readFileSync(join(BOARDS, `.build/${b.tier}-probe.json`), 'utf8'))
      const worst = worstClearance(circuit)
      if (Number.isFinite(worst) && worst < HARD_MM) {
        extra[b.tier] = (extra[b.tier] ?? 0) + 15
        tight.push(`${b.tier} ${worst.toFixed(3)} mm`)
      }
    } catch {
      /* a board that will not export is reported by the check, not here */
    }
  }
  if (tight.length === 0) break
  console.log(`  widening: ${tight.join(', ')} (round ${round + 1})`)
  const env = { ...process.env }
  for (const [t, mm] of Object.entries(extra)) env[`NBAND_BOARD_EXTRA_${t.toUpperCase()}`] = String(mm)
  execFileSync('node', [join(root, 'tools/gen-boards.mjs')], { stdio: 'pipe', env })
  manifest = JSON.parse(readFileSync(join(BOARDS, 'manifest.json'), 'utf8'))
}
if (Object.keys(extra).length) {
  // The widened sources have to be what is checked in, or the next run of
  // gen-boards silently reverts them.
  writeFileSync(
    join(BOARDS, 'width-overrides.json'),
    JSON.stringify(extra, null, 2) + '\n',
  )
  console.log(`  width overrides: ${JSON.stringify(extra)}`)
}

const built = []
for (const b of manifest.boards) {
  const artifacts = {}
  for (const [format, ext] of [
    ['schematic-svg', 'schematic.svg'],
    ['pcb-svg', 'pcb.svg'],
    ['glb', 'board.glb'],
  ]) {
    const rel = `.build/${b.tier}-${ext}`
    try {
      exportBoard(b.tier, format, rel)
      copyFileSync(join(BOARDS, rel), join(PUBLIC, `${b.tier}-${ext}`))
      artifacts[format] = `/boards/${b.tier}-${ext}`
    } catch (err) {
      console.error(`  ${b.tier}: ${format} failed — ${String(err.stderr ?? err).slice(0, 160)}`)
      process.exitCode = 1
    }
  }

  // Routing status, read from the circuit rather than assumed, so the page can
  // state it instead of implying a finished board.
  let routed = 0
  let nets = 0
  let unrouted = 0
  let drc = 0
  let components = 0
  try {
    exportBoard(b.tier, 'circuit-json', `.build/${b.tier}-circuit.json`)
    const circuit = JSON.parse(readFileSync(join(BOARDS, `.build/${b.tier}-circuit.json`), 'utf8'))
    routed = circuit.filter((e) => e.type === 'pcb_trace').length
    nets = circuit.filter((e) => e.type === 'source_trace').length
    // Separated, because they mean different things to a reader. A connection
    // the router gave up on is a hole in the design; a clearance violation is a
    // layout defect on a board that is otherwise complete.
    unrouted = circuit.filter((e) => /could not find a route/i.test(String(e.message ?? ''))).length
    drc =
      circuit.filter((e) => String(e.type).includes('error')).length - unrouted
    components = circuit.filter((e) => e.type === 'pcb_component').length
  } catch {
    /* reported above */
  }

  built.push({ ...b, artifacts, components, routing: { routed, nets, unrouted, drc } })
  console.log(
    `  ${b.tier}: schematic, pcb, glb — ${components} components, ` +
      `${unrouted === 0 ? 'fully routed' : `${unrouted} unrouted`}` +
      `${drc ? `, ${drc} design-rule violation(s)` : ''}`,
  )
}

writeFileSync(
  join(PUBLIC, 'manifest.json'),
  JSON.stringify(
    {
      generatedFrom: 'schema/hardware.json',
      // Stated on the artifact itself so it survives being copied out of context.
      status: 'reference-only',
      caveat:
        'Generated from the hardware registry. The schematic is derived from the netlist ' +
        'and is as correct as the registry is. Component placement is machine-generated, ' +
        'so the layout is a reference rather than a finished board, and no board here has ' +
        'been fabricated or electrically verified.',
      boards: built,
    },
    null,
    2,
  ) + '\n',
)

console.log(`\n${built.length} boards rendered into apps/web/public/boards/`)
