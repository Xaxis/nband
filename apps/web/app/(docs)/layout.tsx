import { DocsShell } from '../../components/DocsShell'

/**
 * Shared shell for documentation, reference, and live-data pages.
 *
 * This is a route group, so it adds chrome without adding a URL segment:
 * /bands stays /bands. Only the landing page sits outside it.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>
}
