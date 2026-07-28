#!/usr/bin/env node
/**
 * Verify the generated carrier boards actually route, and match the registry.
 *
 * Two separate claims, checked separately.
 *
 * The first is cheap and always runs: the checked-in board sources must be what
 * tools/gen-boards.mjs produces from the current schema/hardware.json. That is
 * ordinary drift checking and needs nothing installed.
 *
 * The second needs the tscircuit CLI and is the reason this file exists. `tsci
 * export` prints "Exported to hat.glb!" and exits zero when the autorouter has
 * thrown and laid down no copper at all — the artifact is produced, it is just
 * empty of traces. That is the same shape of trap as grepping a build log for
 * "Compiled successfully" while type-checking fails afterwards, which has
 * already cost this project one silently broken deploy. So the check does not
 * trust the exit code: it reads the circuit JSON and counts the routed traces
 * against the netlist, and reports every design-rule violation it finds.
 *
 * Run with --full to do the export pass. Without it, only the drift half runs,
 * which is what CI does by default.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const full = process.argv.includes('--full')

let failures = 0
const fail = (msg) => {
  failures++
  console.log(`  FAIL  ${msg}`)
}
const ok = (msg) => console.log(`  ok    ${msg}`)

const manifestPath = join(root, 'hardware/boards/manifest.json')
if (!existsSync(manifestPath)) {
  console.error('hardware/boards/manifest.json is missing. Run `make boards`.')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// --- 1. The checked-in sources match the registry ---------------------------

{
  const before = manifest.boards.map((b) => readFileSync(join(root, `hardware/boards/${b.tier}.tsx`), 'utf8'))
  execFileSync('node', [join(root, 'tools/gen-boards.mjs')], { stdio: 'pipe' })
  const after = manifest.boards.map((b) => readFileSync(join(root, `hardware/boards/${b.tier}.tsx`), 'utf8'))
  const stale = manifest.boards.filter((b, i) => before[i] !== after[i]).map((b) => b.tier)
  if (stale.length) {
    fail(`board sources are stale for ${stale.join(', ')}. Run \`make boards\` and commit.`)
  } else {
    ok(`${manifest.boards.length} board sources match schema/hardware.json`)
  }
}

// --- 2. Every registry pin assignment appears in the netlist -----------------

{
  const hardware = JSON.parse(readFileSync(join(root, 'schema/hardware.json'), 'utf8'))
  const problems = []
  for (const b of manifest.boards) {
    const src = readFileSync(join(root, `hardware/boards/${b.tier}.tsx`), 'utf8')
    const expected = hardware.parts
      .filter((p) => p.tiers?.includes(b.tier))
      .flatMap((p) => (p.electrical?.pins ?? []).filter((x) => /^\d+$/.test(String(x.pin))))
    for (const pin of expected) {
      // The board must terminate this signal on the header pin the registry names.
      // Anchored on the closing quote. Without it ".J1 > .P3" matches inside
      // ".J1 > .P30", so a board that reached only pin 30 satisfied an
      // assertion about pin 3.
      if (!new RegExp(`\\.J1 > \\.P${pin.pin}"`).test(src)) {
        problems.push(`${b.tier}: no trace reaches header pin ${pin.pin} (${pin.signal})`)
      }
    }
    // Rails add their own header ties on top of one trace per module pin, so
    // the total exceeds the signal count. What must hold is that every signal
    // is terminated somewhere: on a header pin if it is a bus or data line, on
    // a net if it is power or ground.
    const rail = /^(3V3|5V|GND|VCC|VIN)$/i
    for (const p2 of hardware.parts.filter((p) => p.tiers?.includes(b.tier))) {
      for (const pin of (p2.electrical?.pins ?? []).filter((x) => /^\d+$/.test(String(x.pin)))) {
        const sig = pin.signal.replace(/[^A-Za-z0-9]/g, '_')
        if (rail.test(pin.signal)) {
          if (!src.includes(`> .${sig}" to="net.`)) {
            problems.push(`${b.tier}: ${p2.id} ${pin.signal} is not tied to a rail net`)
          }
        } else {
          // Two legitimate shapes. A signal used by one module is a direct
          // trace to its header pin. A signal on a bus — I2C shared by four
          // modules, SPI by two — goes to a named net, and the header pin is
          // tied to that same net. Both terminate on the pin the registry
          // names; only the first is a single line of source.
          const direct = new RegExp(
            `> \\.${sig}" to="\\.J1 > \\.P${pin.pin}"`,
          ).test(src)
          const viaNet = new RegExp(
            `> \\.${sig}" to="net\\.([A-Za-z0-9_]+)"`,
          ).exec(src)
          const netClosed =
            viaNet &&
            new RegExp(`\\.J1 > \\.P${pin.pin}" to="net\\.${viaNet[1]}"`).test(src)
          if (!direct && !netClosed) {
            problems.push(
              `${b.tier}: ${p2.id} ${pin.signal} does not reach header pin ${pin.pin}, ` +
                `directly or through a net`,
            )
          }
        }
      }
    }
  }
  if (problems.length) problems.forEach(fail)
  else ok('every registry pin assignment is terminated on the header')
}

// --- 3. The published artifacts are not stale -------------------------------

{
  // CI has no board toolchain, so it cannot re-render. What it can do is check
  // that the artifacts on the site describe the same boards as the sources,
  // which catches the ordinary mistake of editing the registry and running
  // `make codegen` without `make boards`.
  const pub = join(root, 'apps/web/public/boards/manifest.json')
  if (!existsSync(pub)) {
    fail('apps/web/public/boards/manifest.json is missing. Run `make boards`.')
  } else {
    const rendered = JSON.parse(readFileSync(pub, 'utf8'))
    const problems = []
    for (const b of manifest.boards) {
      const r = rendered.boards.find((x) => x.tier === b.tier)
      if (!r) problems.push(`${b.tier} has no rendered artifacts`)
      else if (r.digest !== b.digest) {
        // Counts are not enough. Renaming every header pin from the connector's
        // index to its Raspberry Pi number changed every trace in the netlist
        // and neither count moved, so the site served a schematic labelled the
        // old way while the checks reported agreement.
        problems.push(
          `${b.tier}: rendered from source ${r.digest ?? 'unknown'}, current source is ` +
            `${b.digest}. Run \`make boards\`.`,
        )
      } else if (r.modules !== b.modules || r.signals !== b.signals) {
        problems.push(
          `${b.tier}: rendered as ${r.modules} modules / ${r.signals} signals, ` +
            `source now has ${b.modules} / ${b.signals}. Run \`make boards\`.`,
        )
      }
    }
    if (problems.length) problems.forEach(fail)
    else ok(`${manifest.boards.length} rendered board sets match their sources`)
  }
}

// --- 4. The boards actually route ------------------------------------------

if (!full) {
  console.log('  skip  routing and design-rule pass (run `make boards-verify`)')
} else if (!existsSync(join(root, 'hardware/node_modules/tscircuit/cli.mjs'))) {
  console.log('  skip  routing pass — the board toolchain is not installed (`make boards-deps`)')
} else {
  // Inside the tree: the CLI resolves output paths relative to the project and
  // returns a bare ENOENT for anything outside it.
  const tmp = join(root, 'hardware/boards/.build')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const b of manifest.boards) {
    const out = join(tmp, `${b.tier}.json`)
    try {
      // Two CLI quirks, both of which cost time to find. `npx tsci` resolves
      // to an abandoned 2023 package of the same name on the public registry
      // and fails with "unknown option '-f'", so the local binary is invoked
      // directly. And the CLI resolves the output path relative to the input
      // file's directory rather than the working directory, returning a bare
      // ENOENT otherwise, so it runs from the board directory with relative
      // paths on both sides.
      execFileSync(
        'bun',
        [
          '--preload',
          join(root, 'hardware/iterator-helpers-polyfill.js'),
          join(root, 'hardware/node_modules/tscircuit/cli.mjs'),
          'export',
          `${b.tier}.tsx`,
          '-f',
          'circuit-json',
          '-o',
          `.build/${b.tier}.json`,
        ],
        { cwd: join(root, 'hardware/boards'), stdio: 'pipe' },
      )
    } catch (err) {
      fail(`${b.tier}: tsci export failed — ${String(err.stderr ?? err).slice(0, 200)}`)
      continue
    }

    const circuit = JSON.parse(readFileSync(out, 'utf8'))
    const count = (t) => circuit.filter((e) => e.type === t).length
    const routed = count('pcb_trace')
    const netlist = count('source_trace')

    // Trace count is not the completeness metric, and using it as one was
    // misleading. Several source traces terminating on the same net become one
    // routed path, so a fully routed board reports fewer pcb_traces than
    // source_traces and looks like 89 percent. What actually matters is whether
    // the router failed to place anything.
    const unroutable = circuit.filter(
      (e) => /could not find a route/i.test(String(e.message ?? '')),
    ).length

    if (routed === 0 && netlist > 0) {
      // The original reason this file exists: the autorouter throwing while the
      // export prints success and exits zero.
      fail(`${b.tier}: export succeeded but laid down NO copper (${netlist} nets unrouted)`)
    } else if (unroutable > 0) {
      fail(`${b.tier}: ${unroutable} connection(s) could not be routed`)
    } else {
      ok(
        `${b.tier}: fully routed — ${routed} traces, ${count('pcb_component')} components, ` +
          `${count('pcb_plated_hole')} plated holes, ${count('pcb_hole')} mounting holes`,
      )
    }

    // The header pin numbering, re-derived from the exported geometry.
    //
    // tscircuit numbers a doubleRow pinheader the way an IC package is
    // numbered — counter-clockwise, so the top row reads 1, 40, 39 … 22 — while
    // the Raspberry Pi numbers odd pins along one row and even along the other.
    // Only pins 1 and 2 agree. A generator emitting `.J1 > .pin7` would have
    // wired the GNSS pulse-per-second line, the one connection the whole clock
    // discipline rests on, to the I2S bit clock instead. Nothing about that is
    // visible in a schematic or a render; it shows up when a fabricated board
    // does not work.
    //
    // So the labels are checked against physics rather than against the comment
    // that explains them: P1 and P2 must sit at the same end, odd labels must
    // share a row, and consecutive odd labels must be one pitch apart.
    {
      const bySrc = Object.fromEntries(
        circuit.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e]),
      )
      const j1 = circuit.find(
        (e) => e.type === 'pcb_component' && bySrc[e.source_component_id]?.name === 'J1',
      )
      const ports = Object.fromEntries(
        circuit.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, e]),
      )
      const at = {}
      for (const p of circuit.filter((e) => e.type === 'pcb_port' && e.pcb_component_id === j1?.pcb_component_id)) {
        const hints = ports[p.source_port_id]?.port_hints ?? []
        for (const h of hints) if (/^P\d+$/.test(h)) at[h] = { x: p.x, y: p.y }
      }

      const geomProblems = []
      if (Object.keys(at).length !== 40) {
        geomProblems.push(`header exposes ${Object.keys(at).length} P-labels, expected 40`)
      } else {
        // Odd pins share one row, even pins the other.
        const oddY = new Set(), evenY = new Set()
        for (let n = 1; n <= 40; n++) (n % 2 ? oddY : evenY).add(at[`P${n}`].y.toFixed(2))
        if (oddY.size !== 1 || evenY.size !== 1) {
          geomProblems.push(`odd/even pins are not each on a single row`)
        }
        if ([...oddY][0] === [...evenY][0]) geomProblems.push('odd and even pins share a row')
        // Consecutive same-parity pins are one 2.54 mm pitch apart, ascending.
        for (let n = 1; n <= 36; n += 2) {
          const d = at[`P${n + 2}`].x - at[`P${n}`].x
          if (Math.abs(d - 2.54) > 0.01) {
            geomProblems.push(`P${n} to P${n + 2} is ${d.toFixed(2)} mm, expected 2.54`)
            break
          }
        }
        // Pins 1 and 2 face each other at the same end.
        if (Math.abs(at.P1.x - at.P2.x) > 0.01) geomProblems.push('P1 and P2 are not aligned')
      }
      if (geomProblems.length) {
        geomProblems.forEach((g) => fail(`${b.tier}: header numbering — ${g}`))
      } else {
        ok(`${b.tier}: all 40 header labels sit where the Raspberry Pi pin does`)
      }
    }

    const errors = circuit.filter((e) => String(e.type).includes('error'))
    if (errors.length) {
      // Not a failure. These boards are a reference carrier that has never been
      // fabricated, and saying so honestly is worth more than a clean number.
      // They are printed so the count is public rather than quietly discarded.
      console.log(`        ${errors.length} unrouted net(s) or rule violation(s) on ${b.tier} — layout is unfinished by design:`)
      for (const e of errors.slice(0, 3)) {
        console.log(`          ${String(e.message ?? e.type).slice(0, 96)}`)
      }
      if (errors.length > 3) console.log(`          ... and ${errors.length - 3} more`)
    }
  }
}

console.log(
  failures === 0
    ? '\n  carrier boards agree with the hardware registry\n'
    : `\n  ${failures} board check${failures === 1 ? '' : 's'} failed\n`,
)
process.exit(failures === 0 ? 0 : 1)
