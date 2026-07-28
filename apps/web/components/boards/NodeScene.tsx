'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * The whole node, assembled.
 *
 * The carrier board answers how the thing is wired. This answers what it is:
 * a Raspberry Pi with a carrier on standoffs, breakouts on top of that, USB
 * peripherals on cables beside it, two cameras on ribbon, and a case around
 * the lot. Scale and stacking are the point — whether it fits, what dominates
 * the volume, how big the solar array really is next to the node it feeds.
 *
 * One body is real geometry and the rest are boxes, and the difference is
 * visible rather than hidden. The carrier is the GLB tscircuit generated from
 * the netlist, so the part of this that is a genuine engineering artifact
 * looks like one. Everything else is a massing block sized from the registry,
 * and blocks whose dimensions are approximations are drawn with a visible edge
 * rather than smoothed into looking like CAD. The legend says which is which.
 *
 * That distinction is the whole reason this is allowed to exist. A convincing
 * render of hardware nobody has built is exactly the overclaim this project
 * refuses everywhere else, and the defence is not a disclaimer underneath but
 * making the uncertainty part of what you see.
 */

interface Body {
  id: string
  label: string
  band?: string | null
  hue?: number | null
  mount: string
  parent?: string
  colour?: string
  cylinder?: boolean
  boardOnly?: boolean
  shell?: boolean
  size: [number, number, number]
  pos: [number, number, number]
  sourced: boolean
  note?: string
  glb?: string
  wireframe?: boolean
  remote?: boolean
  interface?: string | null
}

interface Cable {
  id: string
  label: string
  from: [number, number, number]
  to: [number, number, number]
  kind: 'cable' | 'ribbon'
}

export interface Assembly {
  tier: string
  label: string
  bodies: Body[]
  cables?: Cable[]
  counts: { total: number; sourced: number; approximate: number }
}

/**
 * Probed once for the lifetime of the page, and the probe context is released.
 *
 * Creating a canvas and asking it for a WebGL context is not free: each call
 * consumes one of the browser's ~16 simultaneous contexts, and this was called
 * twice per mount. Losing contexts while probing for context availability
 * undoes the point of the forceContextLoss on unmount.
 */
let webglProbe: boolean | null = null
function webglAvailable(): boolean {
  if (webglProbe !== null) return webglProbe
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    webglProbe = !!gl
    ;(gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglProbe = false
  }
  return webglProbe
}

const MOUNT_COLOUR: Record<string, number> = {
  host: 0x1f6f43,
  hat: 0x2f7d55,
  carrier: 0x4e6b8a,
  usb: 0x6b5f8a,
  csi: 0x8a6b4e,
  'enclosure-wall': 0x7a8a6b,
  external: 0x5a5a62,
  enclosure: 0x8a8a94,
}

export default function NodeScene({
  assembly,
  showCase,
  showRemote,
}: {
  assembly: Assembly
  showCase: boolean
  showRemote: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // ssr is disabled for this component, so document is available here.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    webglAvailable() ? 'loading' : 'error',
  )
  const [hovered, setHovered] = useState<Body | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !webglAvailable()) return

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 12000)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight || 520)
    host.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const key = new THREE.DirectionalLight(0xffffff, 2.0)
    key.position.set(240, 380, 260)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.7)
    fill.position.set(-280, 140, -200)
    scene.add(fill)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.495

    const disposables: { dispose(): void }[] = []
    const pickable: THREE.Object3D[] = []

    // Share materials and geometry rather than minting one of each per body.
    // A tier 3 node is forty-two bodies plus twelve board features plus cables,
    // and the first version created a MeshStandardMaterial and an EdgesGeometry
    // for every one. That is dozens of draw calls and dozens of shader
    // compilations for a scene of boxes, which a laptop hides and a phone does
    // not.
    const matCache = new Map<string, THREE.MeshStandardMaterial>()
    const material = (key: string, make: () => THREE.MeshStandardMaterial) => {
      let m = matCache.get(key)
      if (!m) {
        m = make()
        matCache.set(key, m)
        disposables.push(m)
      }
      return m
    }
    const group = new THREE.Group()
    scene.add(group)


    const visible = assembly.bodies.filter(
      (b) =>
        (b.mount !== 'enclosure' || showCase) && (!b.remote || showRemote),
    )

    for (const b of visible) {
      if (b.glb) continue // loaded separately below
      // A part drawn as its own detail geometry does not also get drawn as the
      // block that used to stand in for it.
      if (b.shell) continue
      const [w, h, d] = b.size
      // Standoffs are round. Drawing them as cubes made the one thing
      // physically holding the stack together look like more scattered debris.
      const geo = b.cylinder
        ? new THREE.CylinderGeometry(w / 2, w / 2, h, 8)
        : new THREE.BoxGeometry(w, h, d)
      disposables.push(geo)

      const colour = b.colour
        ? new THREE.Color(b.colour)
        : b.hue != null
          ? new THREE.Color(`hsl(${b.hue}, 45%, 52%)`)
          : new THREE.Color(MOUNT_COLOUR[b.mount] ?? 0x5a5a62)
      const mat = material(
        `${colour.getHexString()}-${b.mount}-${b.wireframe ? 'w' : 's'}`,
        () =>
          new THREE.MeshStandardMaterial({
            color: colour,
            roughness: b.mount === 'standoff' ? 0.35 : 0.72,
            metalness: b.mount === 'standoff' ? 0.75 : 0.06,
            transparent: b.wireframe === true,
            opacity: b.wireframe ? 0.06 : 1,
          }),
      )

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...b.pos)
      mesh.userData.body = b
      group.add(mesh)
      if (!b.wireframe) pickable.push(mesh)

      // Approximate bodies get a drawn edge; sourced ones do not, and the
      // difference is meant to be noticed. Skipped on the board's own features
      // and on standoffs, which are small, numerous, and turn into a hairball
      // of outlines that hides the thing they are outlining.
      if (!b.parent && b.mount !== 'standoff') {
        const edges = new THREE.EdgesGeometry(geo)
        disposables.push(edges)
        const lineMat = new THREE.LineBasicMaterial({
          color: b.sourced ? 0xdfe6f2 : 0x93a4bd,
          transparent: true,
          opacity: b.wireframe ? 0.5 : b.sourced ? 0.5 : 0.85,
        })
        disposables.push(lineMat)
        const line = new THREE.LineSegments(edges, lineMat)
        line.position.copy(mesh.position)
        group.add(line)
      }
    }

    // Cables. A node is what plugs into what, and without them every
    // peripheral floated beside a board it had no visible relationship to.
    // Drawn as a sag rather than a straight line, because a straight line
    // between two components reads as a dimension, not a wire.
    for (const c of assembly.cables ?? []) {
      const a = new THREE.Vector3(...c.from)
      const bb = new THREE.Vector3(...c.to)
      const mid = a.clone().lerp(bb, 0.5)
      mid.y -= a.distanceTo(bb) * 0.16
      const curve = new THREE.QuadraticBezierCurve3(a, mid, bb)
      const tube = new THREE.TubeGeometry(curve, 10, c.kind === 'ribbon' ? 1.4 : 0.9, 4, false)
      disposables.push(tube)
      const cmat = material(
        `cable-${c.kind}`,
        () =>
          new THREE.MeshStandardMaterial({
            color: c.kind === 'ribbon' ? 0xd8c79a : 0x2c2f36,
            roughness: 0.85,
            metalness: 0.02,
          }),
      )
      const mesh = new THREE.Mesh(tube, cmat)
      mesh.userData.body = { label: c.label, size: [0, 0, 0], sourced: false, mount: 'cable' }
      group.add(mesh)
    }

    // The real carrier PCB, dropped into the stack.
    const carrier = visible.find((b) => b.glb)
    const finish = () => {
      // Measured before the grid is added, so the camera frames the node rather
      // than the reference plane. A fixed 1200 mm grid made a 100 mm node a
      // speck in the middle of the panel.
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      const centre = box.getCenter(new THREE.Vector3())
      group.position.sub(centre)

      // A bench plane in 50 mm squares, just larger than the parts standing on
      // it. Without a ground reference the bodies read as debris floating in
      // space and there is no way to judge how big any of it is.
      const span = Math.ceil((Math.max(size.x, size.z) * 1.5) / 50) * 50
      const grid = new THREE.GridHelper(span, span / 50, 0x55607a, 0x333b4d)
      grid.position.set(centre.x - centre.x, -centre.y, centre.z - centre.z)
      const gm = grid.material as THREE.Material
      gm.transparent = true
      gm.opacity = 0.3
      disposables.push(grid.geometry, gm)
      group.add(grid)

      const aspect = Math.min(4, Math.max(0.5, (host.clientWidth || 900) / (host.clientHeight || 520)))
      const vFov = (camera.fov * Math.PI) / 180
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
      const halfW = Math.max(size.x, size.z) / 2
      const halfH = (Math.max(size.x, size.z) * 0.55 + size.y) / 2
      const dist = Math.max(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2)) * 1.22

      camera.aspect = aspect
      camera.position.set(dist * 0.5, dist * 0.55, dist * 0.68)
      camera.near = Math.max(1, dist / 300)
      camera.far = dist * 14
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0)
      controls.minDistance = dist * 0.3
      controls.maxDistance = dist * 3
      controls.update()
      setStatus('ready')
    }

    if (carrier?.glb) {
      new GLTFLoader().load(
        carrier.glb,
        (gltf) => {
          const root = gltf.scene
          const bbox = new THREE.Box3().setFromObject(root)
          const c = bbox.getCenter(new THREE.Vector3())
          root.position.set(carrier.pos[0] - c.x, carrier.pos[1] - c.y, carrier.pos[2] - c.z)
          root.userData.body = carrier
          group.add(root)
          root.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh) {
              if (mesh.geometry) disposables.push(mesh.geometry)
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              for (const m of mats) if (m) disposables.push(m)
              pickable.push(mesh)
            }
          })
          finish()
        },
        undefined,
        () => finish(), // the assembly is still worth showing without it
      )
    } else {
      finish()
    }

    // Hover picking, so every block can say what it is. A grey box with no
    // label is decoration; a labelled one is information.
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(pickable, true)[0]
      let obj: THREE.Object3D | null = hit?.object ?? null
      while (obj && !obj.userData.body) obj = obj.parent
      setHovered((obj?.userData.body as Body) ?? null)
    }
    renderer.domElement.addEventListener('pointermove', onMove)

    let raf = 0
    let onScreen = true
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!onScreen) return
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
    })
    io.observe(host)

    const ro = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth, host.clientHeight)
    })
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      controls.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [assembly, showCase, showRemote])

  return (
    <div className="relative h-[460px] w-full sm:h-[580px]">
      <div
        ref={hostRef}
        className="h-full w-full"
        role="img"
        aria-label={`Assembly model of the ${assembly.label} node: ${assembly.counts.total} parts including the Raspberry Pi, the carrier board, sensor breakouts, USB peripherals and cameras. Drag to rotate, scroll to zoom.`}
      />

      {status !== 'ready' && (
        <p className="absolute inset-0 grid place-items-center text-[13px] text-[var(--ink-3)]">
          {status === 'loading' ? 'Assembling node…' : 'This browser cannot display the 3D view.'}
        </p>
      )}

      {hovered && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[46ch] rounded-[8px] border border-[var(--line)] bg-[var(--surface-1)]/95 px-3 py-2 shadow-lg backdrop-blur">
          <p className="text-[13px] font-semibold text-[var(--ink)]">{hovered.label}</p>
          <p className="num mt-0.5 text-[11.5px] text-[var(--ink-2)]">
            {hovered.size[0]} × {hovered.size[2]} × {hovered.size[1]} mm
            {hovered.interface ? ` · ${hovered.interface}` : ''}
            {' · '}
            {hovered.sourced ? 'sourced dimensions' : 'approximate'}
          </p>
          {hovered.note && (
            <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]">{hovered.note}</p>
          )}
        </div>
      )}

      {status === 'ready' && !hovered && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11.5px] text-[var(--ink-3)]">
          Drag to rotate · scroll to zoom · hover a part to identify it
        </p>
      )}
    </div>
  )
}
