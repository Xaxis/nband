import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import matter from 'gray-matter'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { PLATFORM_VERSION } from './schema/generated'

/**
 * Flat-file documentation.
 *
 * Content lives in /content at the repository root, beside the firmware and
 * the schema rather than inside the website or in a CMS. That is the whole
 * point: a document describing a build step and the code implementing it are
 * changed in the same commit and reviewed together. Docs that drift from the
 * hardware are worse than no docs, and a CMS makes that drift invisible.
 *
 * Each document declares the platform version it was written against.
 * `tools/check-drift.mjs` fails the build when a document claims a version
 * that no longer exists, so a stale page is a broken build rather than a
 * silent lie.
 */

const CONTENT_DIR = resolve(process.cwd(), '../../content')

export interface DocMeta {
  slug: string
  title: string
  description: string
  /** Platform version this document was written against. */
  version: string
  section: string
  order: number
  updated: string
  audience?: string
}

export interface Doc extends DocMeta {
  html: string
  headings: { depth: number; text: string; id: string }[]
  readingMinutes: number
}

function contentPath(slug: string) {
  return join(CONTENT_DIR, `${slug}.md`)
}

export function listDocSlugs(): string[] {
  if (!existsSync(CONTENT_DIR)) return []
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function getDoc(slug: string): Doc | null {
  const path = contentPath(slug)
  if (!existsSync(path)) return null

  const raw = readFileSync(path, 'utf8')
  const { data, content } = matter(raw)

  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(content)
    .toString()

  const headings = Array.from(content.matchAll(/^(#{2,3})\s+(.+)$/gm)).map((m) => ({
    depth: m[1].length,
    text: m[2].replace(/[*`_]/g, '').trim(),
    id: slugify(m[2].replace(/[*`_]/g, '').trim()),
  }))

  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ''),
    version: String(data.version ?? PLATFORM_VERSION),
    section: String(data.section ?? 'Documentation'),
    order: Number(data.order ?? 100),
    // gray-matter parses an unquoted YAML date into a Date, and String() on it
    // yields "Mon Jul 27 2026 01:00:00 GMT+0100 (British Summer Time)". Format
    // it, or leave it empty rather than printing that on the page.
    updated:
      data.updated instanceof Date
        ? data.updated.toISOString().slice(0, 10)
        : String(data.updated ?? ''),
    audience: data.audience ? String(data.audience) : undefined,
    html,
    headings,
    readingMinutes: Math.max(1, Math.round(content.split(/\s+/).length / 220)),
  }
}

export function listDocs(): DocMeta[] {
  return listDocSlugs()
    .map((s) => getDoc(s))
    .filter((d): d is Doc => d !== null)
    .sort((a, b) => a.order - b.order)
    .map(({ html: _html, headings: _headings, readingMinutes: _r, ...meta }) => meta)
}
