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

const cli = join(root, 'hardware/node_modules/.bin/tsci')
if (!existsSync(cli)) {
  console.error('The tscircuit CLI is not installed. Run `make boards-deps`.')
  process.exit(1)
}

mkdirSync(BUILD, { recursive: true })
mkdirSync(PUBLIC, { recursive: true })

const manifest = JSON.parse(readFileSync(join(BOARDS, 'manifest.json'), 'utf8'))

// The CLI resolves output paths relative to the input file's directory, so
// everything runs from the boards directory with relative paths on both sides.
const exportBoard = (tier, format, out) =>
  execFileSync(cli, ['export', `${tier}.tsx`, '-f', format, '-o', out], {
    cwd: BOARDS,
    stdio: 'pipe',
  })

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
  try {
    exportBoard(b.tier, 'circuit-json', `.build/${b.tier}-circuit.json`)
    const circuit = JSON.parse(readFileSync(join(BOARDS, `.build/${b.tier}-circuit.json`), 'utf8'))
    routed = circuit.filter((e) => e.type === 'pcb_trace').length
    nets = circuit.filter((e) => e.type === 'source_trace').length
    unrouted = circuit.filter((e) => String(e.type).includes('error')).length
  } catch {
    /* reported above */
  }

  built.push({ ...b, artifacts, routing: { routed, nets, unresolved: unrouted } })
  console.log(`  ${b.tier}: schematic, pcb, glb  (${routed}/${nets} nets auto-routed)`)
}

writeFileSync(
  join(PUBLIC, 'manifest.json'),
  JSON.stringify(
    {
      generatedFrom: 'schema/hardware.json',
      // Stated on the artifact itself so it survives being copied out of context.
      status: 'reference-only',
      caveat:
        'Generated from the hardware registry to check the pin assignments. Component ' +
        'placement is machine-generated and the autorouter does not finish; the schematic ' +
        'is authoritative, the PCB and 3D views are a starting point for layout. No board ' +
        'here has been fabricated.',
      boards: built,
    },
    null,
    2,
  ) + '\n',
)

console.log(`\n${built.length} boards rendered into apps/web/public/boards/`)
