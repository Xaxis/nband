/**
 * Types for scene.mjs.
 *
 * The module is plain JavaScript so a build tool can import it without a
 * compile step, which is the same arrangement lib/grid/fuzz.mjs uses. Without
 * this file the browser side loses its types at the boundary and every body
 * becomes `any`, which defeats the point of sharing the rules: a body missing
 * a field would type-check on both sides and be wrong on both.
 */

export interface SceneBody {
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

export interface SceneCable {
  id: string
  label: string
  from: [number, number, number]
  to: [number, number, number]
  kind: 'cable' | 'ribbon'
  remote?: boolean
}

export interface SceneAssembly {
  tier: string
  label: string
  bodies: SceneBody[]
  cables?: SceneCable[]
  counts: { total: number; sourced: number; approximate: number }
}

export interface SceneToggles {
  showCase?: boolean
  showRemote?: boolean
}

export declare const DEFAULT_TOGGLES: { showCase: boolean; showRemote: boolean }
export declare const MOUNT_COLOUR: Record<string, string>
export declare function visibleBodies(a: SceneAssembly, t?: SceneToggles): SceneBody[]
export declare function visibleCables(a: SceneAssembly, t?: SceneToggles): SceneCable[]
export declare function colourOf(b: SceneBody): string
