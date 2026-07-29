import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TIER } from '../lib/schema/generated'
import { SystemSheet, type SystemSheetEntry } from './boards/SystemSheet'

/**
 * Server half of the architecture panel: read the manifest the build wrote and
 * hand it to the client, so the panel ships its selector and nothing else.
 */

function load(): SystemSheetEntry[] {
  const path = resolve(process.cwd(), 'public/boards/system.json')
  if (!existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { sheets: SystemSheetEntry[] }
  return (parsed.sheets ?? []).map((s) => ({
    ...s,
    label: TIER[s.tier as keyof typeof TIER]?.label ?? s.tier.toUpperCase(),
  }))
}

export function SystemArchitecture() {
  const sheets = load()
  if (sheets.length === 0) return null
  return <SystemSheet sheets={sheets} />
}
