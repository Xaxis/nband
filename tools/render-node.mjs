#!/usr/bin/env node
/**
 * The node assembly, projected to SVG without a browser.
 *
 * NodeScene draws this with three.js, which means the only way to see whether
 * the geometry is right is to open a browser and look. That is a bad loop for
 * fixing geometry and an impossible one in CI, so the same assembly.json is
 * projected here with an orthographic camera and a painter's algorithm. What
 * comes out is not a substitute for the interactive view; it is a way to look
 * at the numbers.
 *
 * It earns its place twice over. The scene needs WebGL and a phone can refuse
 * to give it one, so a static view of the node is worth having on the page
 * regardless, and this one is generated from exactly the data the interactive
 * view reads rather than drawn separately and left to drift.
 *
 * Usage: node tools/render-node.mjs [--tier t3] [--view iso|front|top|side]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The same visibility and colour rules the browser renderer uses. This file
// held its own copy of both, which is how a check ends up inspecting a picture
// that is not the one anybody sees.
import {
  DEFAULT_TOGGLES,
  colourOf,
  visibleBodies,
  visibleCables,
} from '../apps/web/lib/boards/scene.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'apps/web/public/boards')
mkdirSync(OUT, { recursive: true })

const { assemblies } = JSON.parse(readFileSync(join(OUT, 'assembly.json'), 'utf8'))

const VIEWS = {
  iso: { az: -0.62, el: 0.5 },
  front: { az: 0, el: 0.08 },
  top: { az: 0, el: 1.4 },
  side: { az: Math.PI / 2, el: 0.08 },
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const rgbToHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const shade = (hex, k) => rgbToHex(hexToRgb(hex).map((v) => v * k))

/** World point to camera space: rotate about Y, then about X. */
function makeProject({ az, el }) {
  const ca = Math.cos(az)
  const sa = Math.sin(az)
  const ce = Math.cos(el)
  const se = Math.sin(el)
  return ([x, y, z]) => {
    const rx = x * ca - z * sa
    const rz = x * sa + z * ca
    const ry = y * ce - rz * se
    const dz = y * se + rz * ce
    // SVG y grows downward, so the vertical axis is negated once, here.
    return [rx, -ry, dz]
  }
}

/** A body becomes a list of quads in world space, each with an outward normal. */
function faces(body) {
  const [w, h, d] = body.size
  const [cx, cy, cz] = body.pos
  const out = []

  if (body.cylinder) {
    const N = 12
    const r = w / 2
    const ring = (yy) =>
      Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2
        return [cx + Math.cos(a) * r, yy, cz + Math.sin(a) * r]
      })
    const lo = ring(cy - h / 2)
    const hi = ring(cy + h / 2)
    for (let i = 0; i < N; i += 1) {
      const j = (i + 1) % N
      const a = (i / N) * Math.PI * 2 + Math.PI / N
      out.push({ pts: [lo[i], lo[j], hi[j], hi[i]], n: [Math.cos(a), 0, Math.sin(a)] })
    }
    out.push({ pts: hi, n: [0, 1, 0] })
    out.push({ pts: [...lo].reverse(), n: [0, -1, 0] })
    return out
  }

  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const z0 = cz - d / 2
  const z1 = cz + d / 2
  out.push({ pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], n: [0, 1, 0] })
  out.push({ pts: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], n: [0, -1, 0] })
  out.push({ pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], n: [1, 0, 0] })
  out.push({ pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], n: [-1, 0, 0] })
  out.push({ pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: [0, 0, 1] })
  out.push({ pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: [0, 0, -1] })
  return out
}

/** colourOf returns CSS, which here means hex or an hsl() the shader-free
 *  rasteriser has to resolve itself. */
function toHex(css) {
  if (css.startsWith('#')) return css
  const m = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(css)
  if (!m) return '#5a5a62'
  const h = Number(m[1])
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

export function renderAssembly(assembly, opts = {}) {
  const {
    view = 'iso',
    width = 1100,
    height = 780,
    showCase = DEFAULT_TOGGLES.showCase,
    showRemote = DEFAULT_TOGGLES.showRemote,
  } = opts
  const project = makeProject(VIEWS[view] ?? VIEWS.iso)

  // The carrier is a real GLB in the interactive scene and there is no mesh
  // loader here, so it is drawn as the board rectangle it is. Leaving it out
  // entirely was worse: every breakout mounted on it floated above the Pi with
  // nothing underneath.
  const bodies = visibleBodies(assembly, { showCase, showRemote }).map((b) =>
    b.glb ? { ...b, colour: '#1b5e3a', glb: undefined } : b,
  )

  // Every face of every body, projected once.
  const quads = []
  for (const b of bodies) {
    const col = toHex(colourOf(b))
    for (const f of faces(b)) {
      const p = f.pts.map(project)
      const nv = project(f.n)
      const n0 = project([0, 0, 0])
      const nz = nv[2] - n0[2]
      if (nz > -0.001) continue // facing away
      // Lambert against a fixed key, so the three visible faces of a box read
      // as three planes rather than one flat silhouette.
      const nx = nv[0] - n0[0]
      const ny = nv[1] - n0[1]
      const lit = 0.55 + 0.45 * Math.max(0, -0.45 * nx - 0.55 * ny - 0.7 * nz)
      quads.push({
        pts: p,
        depth: p.reduce((s, q) => s + q[2], 0) / p.length,
        fill: shade(col, lit),
        wire: b.wireframe === true,
        sourced: b.sourced === true,
      })
    }
  }

  // Extent, from the projected geometry rather than assumed.
  const xs = quads.flatMap((q) => q.pts.map((p) => p[0]))
  const ys = quads.flatMap((q) => q.pts.map((p) => p[1]))
  const cables = visibleCables(assembly, { showRemote }).map((c) => ({
    ...c,
    a: project(c.from),
    b: project(c.to),
  }))
  for (const c of cables) {
    xs.push(c.a[0], c.b[0])
    ys.push(c.a[1], c.b[1])
  }
  const pad = 40
  const spanX = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const spanY = Math.max(1, Math.max(...ys) - Math.min(...ys))
  const k = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  const ox = width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k
  const oy = height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k
  const sx = (p) => (p[0] * k + ox).toFixed(1)
  const sy = (p) => (p[1] * k + oy).toFixed(1)

  quads.sort((a, b) => b.depth - a.depth)

  const svg = []
  svg.push(`<rect width="${width}" height="${height}" fill="#f7f6f3"/>`)
  // Cables first, so a body drawn over one reads as in front of it.
  for (const c of cables) {
    svg.push(
      `<path d="M ${sx(c.a)} ${sy(c.a)} Q ${(Number(sx(c.a)) + Number(sx(c.b))) / 2} ` +
        `${Math.max(Number(sy(c.a)), Number(sy(c.b))) + 18} ${sx(c.b)} ${sy(c.b)}" ` +
        `stroke="${c.kind === 'ribbon' ? '#c8b48a' : '#4a4f56'}" stroke-width="${c.kind === 'ribbon' ? 3 : 1.6}" ` +
        `fill="none" opacity="0.8"/>`,
    )
  }
  for (const q of quads) {
    const d = q.pts.map((p) => `${sx(p)},${sy(p)}`).join(' ')
    svg.push(
      `<polygon points="${d}" fill="${q.wire ? 'none' : q.fill}" ` +
        `stroke="${q.sourced ? 'rgba(20,24,30,0.35)' : 'rgba(20,24,30,0.55)'}" ` +
        `stroke-width="${q.sourced ? 0.5 : 0.7}"${q.wire ? ' stroke-dasharray="4 3"' : ''}/>`,
    )
  }

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" ` +
      `height="${height}" role="img" aria-label="${assembly.label} node, ${view} view, ` +
      `${bodies.length} bodies">${svg.join('')}</svg>`,
    bodies: bodies.length,
    quads: quads.length,
    scale: k,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 ? process.argv[i + 1] : fallback
  }
  const wantTier = arg('tier', null)
  const wantView = arg('view', null)
  const explicit = wantView !== null || process.argv.includes('--case') || process.argv.includes('--remote')

  // The default run writes what the site actually uses: one iso view per tier
  // with the same toggles the interactive scene starts with, so the fallback a
  // reader without WebGL sees is the view everyone else opens on. Anything else
  // is for looking at while fixing geometry.
  const jobs = explicit
    ? [{ view: wantView ?? 'iso', showCase: process.argv.includes('--case'), showRemote: process.argv.includes('--remote') }]
    : [{ view: 'iso', ...DEFAULT_TOGGLES }]

  for (const a of assemblies) {
    if (wantTier && a.tier !== wantTier) continue
    for (const job of jobs) {
      const r = renderAssembly(a, job)
      const suffix = explicit
        ? `-${job.view}${job.showCase ? '-case' : ''}${job.showRemote ? '-remote' : ''}`
        : ''
      const name = `${a.tier}-node${suffix}.svg`
      writeFileSync(join(OUT, name), r.svg)
      console.log(`  ${name}: ${r.bodies} bodies, ${r.quads} faces, ${r.scale.toFixed(2)} px/mm`)
    }
  }
}
