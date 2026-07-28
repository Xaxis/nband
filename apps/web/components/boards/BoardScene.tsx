'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * The generated carrier board, in three dimensions.
 *
 * Loaded only on the client and only when the panel is actually opened, because
 * the GLB files run from 0.7 to 1.1 MB and nobody reading the bill of materials
 * asked for them. Everything the section has to say is in the DOM before this
 * arrives, and the schematic beside it is the artifact that carries the meaning.
 *
 * The camera is fitted to the measured geometry rather than placed at a guessed
 * distance, the same approach the hero scene takes and for the same reason: a
 * hardcoded position clips the moment the geometry changes size, and this
 * geometry is regenerated from the hardware registry every time a part moves.
 */

/**
 * Probed once, before the effect runs, rather than by catching a constructor
 * failure inside it. Setting state synchronously in an effect is a cascading
 * render, and "does this browser do WebGL" is answerable without one.
 */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export default function BoardScene({ src, label }: { src: string; label: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  // ssr is disabled for this component, so document is available here.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    webglAvailable() ? 'loading' : 'error',
  )

  useEffect(() => {
    const host = hostRef.current
    // No WebGL. The download links below the canvas remain the fallback.
    if (!host || !webglAvailable()) return

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'

    // Lit from three directions so the copper, silkscreen and connector bodies
    // read as separate materials. A single light makes a PCB look like a slab.
    scene.add(new THREE.AmbientLight(0xffffff, 1.7))
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(60, 90, 70)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.8)
    fill.position.set(-70, 30, -50)
    scene.add(fill)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    // Below the board is a flat green rectangle; there is nothing to see there.
    controls.maxPolarAngle = Math.PI * 0.52

    const disposables: { dispose(): void }[] = []
    let raf = 0
    let visible = true
    let spin = true

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    new GLTFLoader().load(
      src,
      (gltf) => {
        const root = gltf.scene
        scene.add(root)

        // Ready means the model is in the scene. Everything after this is
        // framing, and it is ordered this way deliberately: the overlay
        // previously cleared only at the end of this callback, so any throw in
        // the camera maths left "Loading model…" sitting on top of a model that
        // had loaded perfectly well. GLTFLoader routes a throwing onLoad to
        // onError, so the failure was not even silent — it was just attributed
        // to the wrong thing.
        setStatus('ready')

        // Centre on the measured geometry, then frame it.
        const box = new THREE.Box3().setFromObject(root)
        const centre = box.getCenter(new THREE.Vector3())
        root.position.sub(centre)

        // Fit the box, not the bounding sphere.
        //
        // A carrier board is a flat 65 x 56 mm rectangle, so its bounding sphere
        // has a radius set by the diagonal and is far larger than the silhouette
        // the camera actually has to cover. Framing to the sphere left the board
        // filling under half the panel. Fitting the box against both the
        // vertical field of view and the horizontal one derived from the aspect
        // ratio gets the real answer, and it stays right when the board changes
        // size — which it does, because the geometry is regenerated whenever a
        // part moves in the hardware registry.
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
        // Clamped, because a host that has not been laid out yet reports a
        // height of zero and an aspect of Infinity, which propagates NaN
        // through the projection matrix and renders nothing.
        const w = host.clientWidth || 800
        const h = host.clientHeight || 500
        const aspect = Math.min(4, Math.max(0.5, w / h))
        const vFov = (camera.fov * Math.PI) / 180
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)

        // Viewed from above at an angle, the silhouette is about the board's
        // footprint with its thickness projected in; half-extents are enough.
        const halfW = Math.max(size.x, size.z) / 2
        const halfH = (Math.max(size.x, size.z) * 0.62 + size.y) / 2
        const dist = Math.max(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2)) * 1.28

        camera.aspect = aspect
        camera.position.set(dist * 0.42, dist * 0.68, dist * 0.6)
        camera.near = Math.max(0.1, dist / 200)
        camera.far = dist * 12
        camera.updateProjectionMatrix()
        controls.target.set(0, 0, 0)
        controls.minDistance = dist * 0.45
        controls.maxDistance = dist * 2.4
        controls.update()

        root.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) {
            if (mesh.geometry) disposables.push(mesh.geometry)
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for (const mat of mats) if (mat) disposables.push(mat)
          }
        })
      },
      undefined,
      (err) => {
        // Named, because "cannot display the 3D view" was previously shown for
        // a WebGL failure, a network failure and a bug in this callback alike.
        console.error('nband: could not load board model', src, err)
        setStatus('error')
      },
    )

    // Idle rotation, stopped the moment anyone touches it: a model that keeps
    // moving while you are trying to look at a connector is an irritation.
    const stopSpin = () => {
      spin = false
    }
    controls.addEventListener('start', stopSpin)

    const clock = new THREE.Clock()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      if (spin && !reduced) {
        const t = clock.getElapsedTime()
        const r = Math.hypot(camera.position.x, camera.position.z)
        camera.position.x = Math.sin(t * 0.16) * r
        camera.position.z = Math.cos(t * 0.16) * r
        camera.lookAt(controls.target)
      }
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    // Stop rendering when scrolled away. A WebGL loop running off-screen is
    // pure battery cost.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
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
      controls.removeEventListener('start', stopSpin)
      controls.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      // dispose() frees three's own objects but leaves the WebGL context alive,
      // and browsers cap simultaneous contexts at around sixteen. Three tiers
      // switched back and forth is enough to hit that.
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [src])

  return (
    <div className="relative h-[420px] w-full sm:h-[520px]">
      <div
        ref={hostRef}
        className="h-full w-full"
        role="img"
        aria-label={`Interactive 3D model of the ${label}. Drag to rotate, scroll to zoom.`}
      />
      {status !== 'ready' && (
        <p className="absolute inset-0 grid place-items-center text-[13px] text-[var(--ink-3)]">
          {status === 'loading' ? 'Loading model…' : 'This browser cannot display the 3D view.'}
        </p>
      )}
      {status === 'ready' && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11.5px] text-[var(--ink-3)]">
          Drag to rotate · scroll to zoom
        </p>
      )}
    </div>
  )
}
