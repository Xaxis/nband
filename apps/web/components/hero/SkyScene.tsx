'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { BANDS, THRESHOLDS, type BandId } from '../../lib/schema/generated'
import { SPECTRAL } from '../../lib/spectrum'

/**
 * The instrument, in three dimensions.
 *
 * This is an explanation rather than an ornament. The shells are the real
 * detection ranges from schema/bands.json, log-scaled so that a channel good
 * for 30 metres and one good for 300 kilometres can share a frame. An object
 * crosses the volume; each band lights as the object enters its shell, and when
 * two shells overlap at once the coincidence window fires and a detection is
 * recorded. That is the whole argument for multi-spectral sensing, animated.
 *
 * Everything is disposed on unmount, the loop pauses when the canvas leaves the
 * viewport, and the whole module is dynamically imported so it never blocks
 * first paint.
 */

interface Shell {
  id: BandId
  label: string
  radius: number
  mesh: THREE.Mesh
  ring: THREE.Line
  colour: THREE.Color
  lit: number
}

const MAX_R = 5.2
const MIN_R = 1.15

export default function SkyScene({ expanded = false }: { expanded?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string[]>([])
  const [detections, setDetections] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return // caller renders the static fallback
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dark = !document.documentElement.getAttribute('data-theme')
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : document.documentElement.getAttribute('data-theme') === 'dark'

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const FOV = 42
    const camera = new THREE.PerspectiveCamera(FOV, host.clientWidth / host.clientHeight, 0.1, 200)

    // Frame to the largest shell rather than a hard-coded position. The dome is
    // a hemisphere of radius MAX_R sitting on the ground plane, so the subject
    // is a box roughly 2*MAX_R wide and MAX_R tall centred at half height. A
    // fixed camera clipped the top of it, and clipped it differently at every
    // aspect ratio; as a wide, short hero underlay it clipped worst of all.
    const LOOK_AT = new THREE.Vector3(0, MAX_R * 0.32, 0)
    function frameCamera(aspect: number, pad: number) {
      const vFov = (FOV * Math.PI) / 180
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
      const halfH = MAX_R * 0.62 * pad   // dome height above the look-at point
      const halfW = MAX_R * pad          // dome radius
      // Distance needed to contain the subject on each axis; take the larger.
      return Math.max(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2))
    }

    const disposables: { dispose(): void }[] = []
    const track = <T extends { dispose(): void }>(x: T) => {
      disposables.push(x)
      return x
    }

    // --- ground ------------------------------------------------------------
    const grid = new THREE.GridHelper(
      MAX_R * 2.6,
      18,
      new THREE.Color(dark ? 0x2a3340 : 0xc8d0da),
      new THREE.Color(dark ? 0x1a2029 : 0xdfe4ea),
    )
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = dark ? 0.5 : 0.8
    scene.add(grid)
    track(grid.geometry)
    track(grid.material as THREE.Material)

    // --- detection shells, radii from the real range data ------------------
    // Log scale, because the bands span 30 m to 300 km and a linear plot would
    // collapse eleven of them onto the node.
    const detect = BANDS.filter((b) => b.role === 'detection' && b.profile.typicalRangeM > 0)
    const logs = detect.map((b) => Math.log10(b.profile.typicalRangeM))
    const lo = Math.min(...logs)
    const hi = Math.max(...logs)

    const shells: Shell[] = detect.map((b) => {
      const t = (Math.log10(b.profile.typicalRangeM) - lo) / (hi - lo)
      const radius = MIN_R + t * (MAX_R - MIN_R)
      const colour = new THREE.Color(dark ? SPECTRAL.dark[b.id] : SPECTRAL.light[b.id])

      const geo = track(new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2))
      const mat = track(
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.028,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      )
      const mesh = new THREE.Mesh(geo, mat)
      scene.add(mesh)

      // Ground-plane circle, which is what actually reads as a range ring.
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0.012, Math.sin(a) * radius))
      }
      const rgeo = track(new THREE.BufferGeometry().setFromPoints(pts))
      const rmat = track(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.22 }))
      const ring = new THREE.Line(rgeo, rmat)
      scene.add(ring)

      return { id: b.id, label: b.label, radius, mesh, ring, colour, lit: 0 }
    })

    // --- the node ----------------------------------------------------------
    const nodeGeo = track(new THREE.IcosahedronGeometry(0.16, 1))
    const nodeMat = track(new THREE.MeshBasicMaterial({ color: dark ? 0xeef1f6 : 0x14171d }))
    const node = new THREE.Mesh(nodeGeo, nodeMat)
    node.position.y = 0.16
    scene.add(node)

    const mastGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6))
    const mastMat = track(new THREE.MeshBasicMaterial({ color: dark ? 0x4a5563 : 0x99a2ae }))
    const mast = new THREE.Mesh(mastGeo, mastMat)
    mast.position.y = -0.08
    scene.add(mast)

    // --- the object being observed ----------------------------------------
    const objGeo = track(new THREE.SphereGeometry(0.075, 16, 12))
    const objMat = track(new THREE.MeshBasicMaterial({ color: dark ? 0xffffff : 0x14171d }))
    const target = new THREE.Mesh(objGeo, objMat)
    scene.add(target)

    const haloGeo = track(new THREE.SphereGeometry(0.19, 16, 12))
    const haloMat = track(
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }),
    )
    const halo = new THREE.Mesh(haloGeo, haloMat)
    scene.add(halo)

    // Trail behind the object.
    const TRAIL = 90
    const trailPos = new Float32Array(TRAIL * 3)
    const trailGeo = track(new THREE.BufferGeometry())
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3))
    const trailMat = track(
      new THREE.LineBasicMaterial({
        color: dark ? 0x9fb4c8 : 0x5b6b7d,
        transparent: true,
        opacity: 0.5,
      }),
    )
    const trail = new THREE.Line(trailGeo, trailMat)
    scene.add(trail)

    // Beam drawn from the node to the object while any band holds it.
    const beamGeo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]))
    const beamMat = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }))
    const beam = new THREE.Line(beamGeo, beamMat)
    scene.add(beam)

    // --- animation ---------------------------------------------------------
    const path = (t: number) => {
      // A long shallow arc that dips inside the tighter shells near closest
      // approach, so bands light in sequence rather than all at once.
      const x = Math.sin(t * 0.32) * 6.6
      const z = Math.cos(t * 0.32) * 3.1 - 0.6
      const y = 1.5 + Math.cos(t * 0.32) * 0.85
      return new THREE.Vector3(x, Math.max(y, 0.35), z)
    }

    let raf = 0
    let running = true
    let t = reduced ? 1.9 : 0
    let lastDetection = -99
    let detCount = 0
    const clock = new THREE.Clock()

    const io = new IntersectionObserver(
      ([e]) => {
        running = e.isIntersecting
        if (running && !reduced) clock.getDelta()
      },
      { threshold: 0.01 },
    )
    io.observe(host)

    function frame() {
      raf = requestAnimationFrame(frame)
      if (!running) return

      const dt = Math.min(clock.getDelta(), 0.05)
      if (!reduced) t += dt

      const p = path(t)
      target.position.copy(p)
      halo.position.copy(p)

      // Which shells currently contain the object.
      const targetDist = p.length()
      const nowActive: string[] = []
      for (const s of shells) {
        const inside = targetDist <= s.radius
        s.lit = THREE.MathUtils.damp(s.lit, inside ? 1 : 0, 6, dt || 0.016)
        ;(s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.028 + s.lit * 0.075
        ;(s.ring.material as THREE.LineBasicMaterial).opacity = 0.22 + s.lit * 0.62
        s.ring.scale.setScalar(1 + s.lit * 0.012)
        if (inside) nowActive.push(s.label)
      }

      // Coincidence: two or more bands holding it inside the window.
      const coincident = nowActive.length >= THRESHOLDS.minBandsForUnresolved
      ;(beam.material as THREE.LineBasicMaterial).opacity = THREE.MathUtils.damp(
        (beam.material as THREE.LineBasicMaterial).opacity,
        coincident ? 0.5 : nowActive.length ? 0.16 : 0,
        7,
        dt || 0.016,
      )
      const bp = beamGeo.attributes.position as THREE.BufferAttribute
      bp.setXYZ(0, 0, 0.16, 0)
      bp.setXYZ(1, p.x, p.y, p.z)
      bp.needsUpdate = true

      if (coincident && t - lastDetection > 3.2) {
        lastDetection = t
        detCount += 1
        setDetections(detCount)
      }

      haloMat.opacity = 0.1 + (coincident ? 0.3 : 0.06) * (0.6 + 0.4 * Math.sin(t * 6))
      node.rotation.y += dt * 0.35
      node.rotation.x += dt * 0.14

      // Trail.
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3)
      trailPos[0] = p.x
      trailPos[1] = p.y
      trailPos[2] = p.z
      trailGeo.attributes.position.needsUpdate = true

      // Slow camera drift keeps the volume legible without demanding input.
      // The orbit radius comes from the framing calculation, so the dome stays
      // fully inside the frame at every aspect ratio and in fullscreen.
      const cam = reduced ? 0.3 : t * 0.055
      const camDist = frameCamera(camera.aspect, 1.12)
      const elev = 0.42 + Math.sin(cam * 0.7) * 0.05
      camera.position.x = Math.sin(cam) * camDist * Math.cos(elev)
      camera.position.z = Math.cos(cam) * camDist * Math.cos(elev)
      camera.position.y = LOOK_AT.y + camDist * Math.sin(elev)
      camera.lookAt(LOOK_AT)

      renderer.render(scene, camera)
      setActive((prev) =>
        prev.length === nowActive.length && prev.every((v, i) => v === nowActive[i])
          ? prev
          : nowActive,
      )
    }

    // Prime the trail so it does not streak from the origin on first frame.
    const p0 = path(t)
    for (let i = 0; i < TRAIL; i++) {
      trailPos[i * 3] = p0.x
      trailPos[i * 3 + 1] = p0.y
      trailPos[i * 3 + 2] = p0.z
    }

    frame()

    const onResize = () => {
      if (!host.clientWidth || !host.clientHeight) return
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth, host.clientHeight)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" aria-hidden="true" />

      {/* The scene is decorative to a screen reader; the readout is not. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-end gap-2 p-3 pr-24">
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 ? (
            <span className="num rounded border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_80%,transparent)] px-2 py-1 text-[11px] text-[var(--ink-3)]">
              no band holding contact
            </span>
          ) : (
            active.map((label) => (
              <span
                key={label}
                className="num rounded border border-[var(--line-strong)] bg-[color-mix(in_oklab,var(--surface-1)_80%,transparent)] px-2 py-1 text-[11px] text-[var(--ink)]"
              >
                {label}
              </span>
            ))
          )}
        </div>
        <span className="num rounded border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_80%,transparent)] px-2 py-1 text-[11px] text-[var(--ink-2)]">
          {active.length >= THRESHOLDS.minBandsForUnresolved ? 'coincidence' : 'watching'} ·{' '}
          {detections} detection{detections === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
